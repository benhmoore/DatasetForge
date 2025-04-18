from typing import List, Dict, AsyncGenerator, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
import httpx
import logging
import json
import re
from pydantic import ValidationError
import asyncio

from ..db import get_session
from ..core.security import get_current_user
from ..core.config import settings
from ..api.models import User, Template
from ..api.schemas import GenerationRequest, GenerationResult, SeedData, ModelParameters

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()


def extract_tool_calls_from_text(text):
    """
    Extract tool calls from a text response.

    This handles different formats that LLMs might use when returning tool calls:
    1. OpenAI-style format with function_call
    2. Simplified format with name and parameters directly

    Returns a list of standardized tool call objects or None if no valid calls found.
    """
    if not text or not text.strip():
        return None

    try:
        # First, try treating the entire text as JSON
        try:
            # Check if this is a valid JSON to begin with
            parsed_text = json.loads(text.strip())

            # Special handling for OpenAI format which has nested JSON strings
            if (
                "function_call" in parsed_text
                and "arguments" in parsed_text["function_call"]
            ):
                # Make sure arguments is a valid JSON string
                arguments = parsed_text["function_call"]["arguments"]

                # If arguments is a string that looks like JSON but has escaped quotes
                if isinstance(arguments, str) and (
                    arguments.startswith("{") or arguments.startswith("[")
                ):
                    try:
                        # Try to parse it as JSON
                        json.loads(arguments)
                    except json.JSONDecodeError:
                        # If it fails, it might have escaped quotes, so clean it up
                        # This is a common pattern in Ollama's outputs
                        fixed_args = arguments.replace('\\"', '"').replace("\\\\", "\\")
                        parsed_text["function_call"]["arguments"] = fixed_args

            # Format it properly for our standard structure
            if "function_call" in parsed_text:
                # Handle OpenAI-style format
                tool_call = {
                    "type": "function",
                    "function": {
                        "name": parsed_text["function_call"].get("name", "unknown"),
                        "arguments": parsed_text["function_call"].get(
                            "arguments", "{}"
                        ),
                    },
                    "_original_json": text,  # Temporary field to help with text cleaning
                }
                logger.info(
                    f"Extracted OpenAI-style tool call from complete JSON: {tool_call['function']['name']}"
                )
                return [tool_call]
            elif "name" in parsed_text and "parameters" in parsed_text:
                # Handle simplified format
                tool_call = {
                    "type": "function",
                    "function": {
                        "name": parsed_text.get("name", "unknown"),
                        "arguments": json.dumps(parsed_text.get("parameters", {})),
                    },
                    "_original_json": text,  # Temporary field to help with text cleaning
                }
                logger.info(
                    f"Extracted simplified-style tool call from complete JSON: {tool_call['function']['name']}"
                )
                return [tool_call]

        except json.JSONDecodeError:
            # Not a valid JSON document, try extracting embedded JSON
            logger.debug("Input is not valid JSON, looking for embedded JSON objects")

        # Try fixing common JSON issues like unescaped quotes
        fixed_text = text
        if '"arguments": "{' in text:
            logger.debug(
                "Detected possible escaping issue in arguments field, trying to fix..."
            )
            # This is a common pattern - unescaped nested JSON
            fixed_text = text.replace('"arguments": "{', '"arguments": "{').replace(
                '}"', '}"'
            )

            try:
                json_obj = json.loads(fixed_text)
                if "function_call" in json_obj:
                    tool_call = {
                        "type": "function",
                        "function": {
                            "name": json_obj["function_call"].get("name", "unknown"),
                            "arguments": json_obj["function_call"].get(
                                "arguments", "{}"
                            ),
                        },
                        "_original_json": text,
                    }
                    logger.info(
                        f"Extracted OpenAI-style tool call after fixing escaping: {tool_call['function']['name']}"
                    )
                    return [tool_call]
            except:
                logger.debug("Failed to parse fixed text")

        # Try to find JSON objects in the text if whole text parsing failed
        # Different patterns to try for finding JSON
        patterns = [
            r'\{(?:[^{}]|"[^"]*"|\{(?:[^{}]|"[^"]*")*\})*\}',  # More robust pattern for nested objects
            r"\{[\s\S]*?\}",  # Simple fallback pattern
        ]

        for pattern in patterns:
            json_matches = re.findall(pattern, text)
            logger.debug(
                f"Found {len(json_matches)} potential JSON matches with pattern"
            )

            for json_str in json_matches:
                try:
                    # Try to parse this JSON string
                    clean_str = json_str.strip()
                    json_obj = json.loads(clean_str)

                    if "function_call" in json_obj:
                        # Handle OpenAI-style format
                        tool_call = {
                            "type": "function",
                            "function": {
                                "name": json_obj["function_call"].get(
                                    "name", "unknown"
                                ),
                                "arguments": json_obj["function_call"].get(
                                    "arguments", "{}"
                                ),
                            },
                            "_original_json": json_str,  # Temporary field to help with text cleaning
                        }
                        logger.info(
                            f"Extracted OpenAI-style tool call from embedded JSON: {tool_call['function']['name']}"
                        )
                        return [tool_call]
                    elif "name" in json_obj and "parameters" in json_obj:
                        # Handle simplified format
                        tool_call = {
                            "type": "function",
                            "function": {
                                "name": json_obj.get("name", "unknown"),
                                "arguments": json.dumps(json_obj.get("parameters", {})),
                            },
                            "_original_json": json_str,  # Temporary field to help with text cleaning
                        }
                        logger.info(
                            f"Extracted simplified-style tool call from embedded JSON: {tool_call['function']['name']}"
                        )
                        return [tool_call]
                except json.JSONDecodeError:
                    # Not valid JSON, try next match
                    continue
                except Exception as e:
                    logger.warning(
                        f"Unexpected error processing potential tool call: {str(e)}"
                    )
                    continue

        # If we reached here, no valid tool calls were found
        logger.debug("No valid tool calls found in output")
        return None
    except Exception as e:
        logger.warning(f"Error extracting tool calls from text: {str(e)}")
        return None


async def call_ollama_generate(
    model: str,
    system_prompt: Optional[str],
    user_prompt: str,
    template_params: Optional[ModelParameters],  # Accept template params
    user_prefs: Dict[str, Any],  # Accept user prefs (containing default model params)
    is_tool_calling: bool = False,
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Calls the Ollama API with merged parameters."""

    # --- Parameter Merging Logic ---
    final_options = {}

    # Start with Ollama defaults (or your base defaults if any)
    base_defaults = {
        "temperature": 1.0,
        "top_p": 1.0,
    }
    final_options.update(base_defaults)

    # Layer 2: Template-specific parameters (highest priority if set)
    if template_params:
        if template_params.temperature is not None:
            final_options["temperature"] = template_params.temperature
        if template_params.top_p is not None:
            final_options["top_p"] = template_params.top_p
        if template_params.max_tokens is not None:
            final_options["num_predict"] = template_params.max_tokens

    # --- End Parameter Merging ---

    payload = {
        "model": model,
        "prompt": user_prompt,
        "stream": False,
        "options": final_options,  # Use the merged options
    }
    if system_prompt:
        payload["system"] = system_prompt

    if is_tool_calling and tools:
        payload["tools"] = tools

    api_url = f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate"
    logger.debug(f"Ollama Request Payload: {json.dumps(payload, indent=2)}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                api_url, json=payload, timeout=settings.OLLAMA_TIMEOUT
            )
            response.raise_for_status()
            logger.debug(f"Ollama Raw Response: {response.text}")
            return response.json()
    except httpx.TimeoutException:
        logger.error(f"Ollama API request timed out to {api_url}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama API timed out during generation.",
        )
    except httpx.RequestError as e:
        logger.error(f"Error requesting Ollama API: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not connect to Ollama API: {e}",
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"Ollama API returned error {e.response.status_code}: {e.response.text}")
        detail = f"Ollama API error: {e.response.status_code}"
        try:
            error_body = e.response.json()
            detail += f" - {error_body.get('error', e.response.text)}"
        except json.JSONDecodeError:
            detail += f" - {e.response.text}"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        )
    except Exception as e:
        logger.exception("Unexpected error calling Ollama API")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while communicating with Ollama: {str(e)}",
        )


@router.get("/models", response_model=List[str])
async def list_models(user: User = Depends(get_current_user)):
    """
    List available models from Ollama
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/tags",
                timeout=settings.OLLAMA_TIMEOUT,
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to get models from Ollama: {response.text}",
                )

            # Extract model names from response
            models = [model["name"] for model in response.json().get("models", [])]
            return models

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama API timed out while fetching models",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get models: {str(e)}",
        )


@router.post("/generate")
async def generate_outputs(
    request: GenerationRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    """
    Generate outputs using a template and Ollama model, streaming results for multiple seeds.
    """
    # Log the incoming request for debugging
    instruction = getattr(request, "instruction", None)

    # Explicitly debug the entire request model for troubleshooting
    logger.info(f"🔄 Generation request received: {request.dict()}")

    if instruction:
        logger.info(f"🔍 Instruction provided: '{instruction}'")
    else:
        logger.info("ℹ️ No instruction provided in the request")

    # Get the template
    template = session.get(Template, request.template_id)

    if not template or template.archived:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    # Validate that all required slots are provided for *each* seed
    for seed_index, seed_data in enumerate(request.seeds):
        for slot in template.slots:
            if slot not in seed_data.slots:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing value for slot '{slot}' in seed {seed_index + 1}",
                )

    # Determine the model to use
    generation_model = template.model_override or user.default_gen_model

    # Check if a model is available
    if not generation_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No generation model specified. Set a default model in settings or override it in the template.",
        )

    # Extract template-specific model parameters
    template_model_params: Optional[ModelParameters] = None
    if template.model_parameters:
        try:
            template_model_params = ModelParameters.parse_obj(template.model_parameters)
        except Exception as e:
            logger.warning(f"Failed to parse model_parameters for template {template.id}: {e}. Using defaults.")

    # Define the async generator function for streaming
    async def stream_results() -> AsyncGenerator[str, None]:
        # Iterate through each seed provided in the request
        for seed_index, seed_data in enumerate(request.seeds):
            current_slots = seed_data.slots
            
            # Replace slots in the template for the current seed
            user_prompt = template.user_prompt
            for slot, value in current_slots.items():
                pattern = "{" + slot + "}"
                user_prompt = user_prompt.replace(pattern, value)

            # Generate 'count' variations for the current seed
            for i in range(request.count):
                variation_index = i
                variation_label = f"Seed {seed_index + 1} / Variation {variation_index + 1}"
                result = None  # Initialize result for this iteration

                try:
                    # Start with the base system prompt
                    system_prompt = template.system_prompt

                    # Safely get global instruction if it exists
                    instruction = getattr(request, "instruction", None)

                    # Add global instruction to system prompt if provided
                    if instruction and instruction.strip():
                        clean_instruction = instruction.strip()
                        if "Additional instruction:" not in system_prompt:
                            logger.info(
                                f"⚠️ Adding global instruction to system prompt for {variation_label}: '{clean_instruction}'"
                            )
                            system_prompt = f"{template.system_prompt}\n\nAdditional instruction: {clean_instruction}"

                    # Prepare API payload
                    ollama_response = await call_ollama_generate(
                        model=generation_model,
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        template_params=template_model_params,
                        user_prefs={},  # Placeholder for user preferences
                        is_tool_calling=template.is_tool_calling_template,
                        tools=template.tool_definitions if template.is_tool_calling_template else None,
                    )

                    output = ollama_response.get("response", "").strip()
                    tool_calls = None
                    if template.is_tool_calling_template and ollama_response.get("tool_calls"):
                        tool_calls = ollama_response["tool_calls"]

                    result = GenerationResult(
                        seed_index=seed_index,
                        variation_index=variation_index,
                        variation=variation_label,
                        output=output,
                        slots=current_slots,
                        processed_prompt=user_prompt,
                        tool_calls=tool_calls if tool_calls else None,
                        # Include template.system_prompt_mask and template.user_prompt_mask in result
                        system_prompt=system_prompt,
                        system_prompt_mask=template.system_prompt_mask,
                        user_prompt_mask=template.user_prompt_mask,
                    )

                except httpx.TimeoutException:
                    error_detail = "Ollama API timed out. Please try again."
                    logger.error(f"{variation_label}: {error_detail}")
                    result = GenerationResult(
                        seed_index=seed_index,
                        variation_index=variation_index,
                        variation=variation_label,
                        output=f"[{error_detail}]",
                        slots=current_slots,
                        processed_prompt=user_prompt,
                        system_prompt=system_prompt,
                        system_prompt_mask=template.system_prompt_mask,
                        user_prompt_mask=template.user_prompt_mask,
                    )

                except Exception as e:
                    error_detail = f"Error generating variation: {str(e)}"
                    logger.exception(f"{variation_label}: {error_detail}")
                    result = GenerationResult(
                        seed_index=seed_index,
                        variation_index=variation_index,
                        variation=variation_label,
                        output=f"[Error: {error_detail}]",
                        slots=current_slots,
                        processed_prompt=user_prompt,
                        system_prompt=system_prompt,
                        system_prompt_mask=template.system_prompt_mask,
                        user_prompt_mask=template.user_prompt_mask,
                    )

                # Yield the result as a JSON string followed by a newline
                yield result.json() + "\n"
                await asyncio.sleep(0.01)  # Small sleep to allow context switching

    # Return the streaming response
    return StreamingResponse(stream_results(), media_type="application/x-ndjson")
