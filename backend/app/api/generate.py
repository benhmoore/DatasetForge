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
from ..api.schemas import GenerationRequest, GenerationResult, SeedData, ModelParameters, SimpleGenerationRequest

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()


def extract_tool_calls_from_text(text):
    """
    Extract tool calls from a text response.

    This handles multiple formats that LLMs might use when returning tool calls:
    1. OpenAI-style format with function_call
    2. Simplified format with name and parameters directly
    3. Anthropic-style format with tool_use
    4. Raw JSON objects with partial matches
    5. Multiple tool calls in a single response

    Returns a list of standardized tool call objects or None if no valid calls found.
    """
    if not text or not text.strip():
        return None

    # Clean up any markdown code blocks that may wrap the JSON
    text = re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', text.strip())
    
    # Remove surrounding backticks if they exist
    text = text.strip('`').strip()
    
    # Normalize newlines
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    try:
        # First, check for multiple tool calls array
        tool_calls = []
        
        # Try to parse the entire text as a JSON array of tool calls
        if text.strip().startswith('[') and text.strip().endswith(']'):
            try:
                json_array = json.loads(text)
                if isinstance(json_array, list) and len(json_array) > 0:
                    for item in json_array:
                        # Convert each item to standardized format
                        processed_calls = _process_single_tool_call_obj(item)
                        if processed_calls:
                            tool_calls.extend(processed_calls)
                    
                    if tool_calls:
                        logger.info(f"Extracted {len(tool_calls)} tool calls from JSON array")
                        return tool_calls
            except json.JSONDecodeError:
                logger.debug("Failed to parse as JSON array, continuing with other methods")
        
        # Next, try treating the entire text as a single JSON object
        try:
            # Check if this is a valid JSON object
            parsed_text = json.loads(text.strip())
            
            # Process the single object
            processed_calls = _process_single_tool_call_obj(parsed_text)
            if processed_calls:
                return processed_calls
                
        except json.JSONDecodeError:
            # Not a valid JSON document, try extracting embedded JSON
            logger.debug("Input is not valid JSON object, looking for embedded JSON")
        
        # Try fixing common JSON issues like unescaped quotes
        fixed_text = text
        if '"arguments": "{' in text:
            logger.debug("Detected possible escaping issue in arguments field, trying to fix...")
            # This is a common pattern - unescaped nested JSON
            fixed_text = text.replace('"arguments": "{', '"arguments": "{').replace('}"', '}"')
            
            try:
                json_obj = json.loads(fixed_text)
                processed_calls = _process_single_tool_call_obj(json_obj)
                if processed_calls:
                    return processed_calls
            except:
                logger.debug("Failed to parse fixed text")
        
        # Try extracting multiple tool calls from text using code block patterns
        multi_tool_pattern = r"(?:```json)?\s*\[\s*(\{.*?\})\s*(?:,\s*\{.*?\})*\s*\]\s*(?:```)?|(\{.*?\})\s*(?:,\s*\{.*?\})*\s*"
        multi_matches = re.search(multi_tool_pattern, text, re.DOTALL)
        if multi_matches:
            # Try to extract a valid JSON array by reconstructing it
            try:
                # Extract all JSON objects
                obj_pattern = r'\{(?:[^{}]|"[^"]*"|\{(?:[^{}]|"[^"]*")*\})*\}'
                found_objects = re.findall(obj_pattern, text)
                
                if found_objects:
                    all_calls = []
                    for obj_str in found_objects:
                        try:
                            obj = json.loads(obj_str)
                            processed = _process_single_tool_call_obj(obj)
                            if processed:
                                all_calls.extend(processed)
                        except:
                            continue
                    
                    if all_calls:
                        logger.info(f"Extracted {len(all_calls)} tool calls from multiple JSON objects")
                        return all_calls
            except Exception as e:
                logger.debug(f"Failed to extract multiple tool calls: {str(e)}")
        
        # Try to find individual JSON objects in the text if other methods failed
        # Different patterns to try for finding JSON
        patterns = [
            r'\{(?:[^{}]|"[^"]*"|\{(?:[^{}]|"[^"]*")*\})*\}',  # More robust pattern for nested objects
            r"\{[\s\S]*?\}",  # Simple fallback pattern
        ]

        for pattern in patterns:
            json_matches = re.findall(pattern, text)
            logger.debug(f"Found {len(json_matches)} potential JSON matches with pattern")

            all_found_calls = []
            for json_str in json_matches:
                try:
                    # Try to parse this JSON string
                    clean_str = json_str.strip()
                    json_obj = json.loads(clean_str)
                    
                    processed_calls = _process_single_tool_call_obj(json_obj)
                    if processed_calls:
                        all_found_calls.extend(processed_calls)
                except json.JSONDecodeError:
                    # Not valid JSON, try next match
                    continue
                except Exception as e:
                    logger.warning(f"Unexpected error processing potential tool call: {str(e)}")
                    continue
            
            if all_found_calls:
                logger.info(f"Extracted {len(all_found_calls)} tool calls using regex pattern")
                return all_found_calls

        # If we reached here, no valid tool calls were found
        logger.debug("No valid tool calls found in output")
        return None
    except Exception as e:
        logger.warning(f"Error extracting tool calls from text: {str(e)}")
        return None


def _process_single_tool_call_obj(json_obj):
    """Helper function to process a single JSON object into standardized tool call format.
    Returns a list of standardized tool calls or None if not valid.
    """
    if not isinstance(json_obj, dict):
        return None
    
    tool_calls = []
    
    # Handle OpenAI-style format with function_call
    if "function_call" in json_obj:
        # Handle arguments field properly - could be string or object
        arguments = json_obj["function_call"].get("arguments", "{}")
        if isinstance(arguments, str) and (arguments.startswith("{") or arguments.startswith("[")):
            try:
                # Try to parse it as JSON if it's a string
                json.loads(arguments)
            except json.JSONDecodeError:
                # Fix escaped quotes if needed
                arguments = arguments.replace('\\"', '"').replace("\\\\", "\\")
        
        tool_call = {
            "type": "function",
            "function": {
                "name": json_obj["function_call"].get("name", "unknown"),
                "arguments": arguments if isinstance(arguments, str) else json.dumps(arguments)
            }
        }
        logger.info(f"Extracted OpenAI-style tool call: {tool_call['function']['name']}")
        tool_calls.append(tool_call)
    
    # Handle Anthropic-style format with tool_use
    elif "tool_use" in json_obj:
        tool_use = json_obj["tool_use"]
        
        # Extract the tool details
        tool_name = tool_use.get("name", "unknown")
        parameters = tool_use.get("parameters", {})
        
        tool_call = {
            "type": "function",
            "function": {
                "name": tool_name,
                "arguments": json.dumps(parameters)
            }
        }
        logger.info(f"Extracted Anthropic-style tool call: {tool_call['function']['name']}")
        tool_calls.append(tool_call)
    
    # Handle simplified format with name and parameters
    elif "name" in json_obj and ("parameters" in json_obj or "arguments" in json_obj):
        parameters = json_obj.get("parameters", json_obj.get("arguments", {}))
        tool_call = {
            "type": "function",
            "function": {
                "name": json_obj.get("name", "unknown"),
                "arguments": json.dumps(parameters) if isinstance(parameters, dict) else parameters
            }
        }
        logger.info(f"Extracted simplified-style tool call: {tool_call['function']['name']}")
        tool_calls.append(tool_call)
    
    # Handle case with multiple tool_calls array
    elif "tool_calls" in json_obj and isinstance(json_obj["tool_calls"], list):
        for call in json_obj["tool_calls"]:
            if isinstance(call, dict):
                # Process each tool call
                result = _process_single_tool_call_obj(call)
                if result:
                    tool_calls.extend(result)
    
    return tool_calls if tool_calls else None


async def call_ollama_generate(
    model: str,
    system_prompt: Optional[str],
    user_prompt: str,
    template_params: Optional[ModelParameters],  # Accept template params
    template: Optional[Template],  # Accept template
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

        # Normalize the tool definition format to ensure compatibility
        normalized_tools = []
        for tool in template.tool_definitions:
            if "type" not in tool and "function" in tool:
                normalized_tool = {"type": "function", "function": tool["function"]}
            else:
                normalized_tool = tool.copy()
            if "function" in normalized_tool and "parameters" not in normalized_tool["function"]:
                normalized_tool["function"]["parameters"] = {"type": "object", "properties": {}}
            normalized_tools.append(normalized_tool)
        
        payload["tools"] = normalized_tools

        # Convert normalized tools to a JSON string for the system prompt
        tools_json_string = json.dumps(normalized_tools, indent=2)

        # Ensure system prompt includes tool definitions and instructions
        tool_instruction_header = "\n\nAVAILABLE TOOLS:"
        tool_instruction_footer = """

IMPORTANT INSTRUCTIONS FOR USING TOOLS:

1. You MUST use the provided tools when appropriate for the task.
2. Format your tool calls using proper JSON structure as follows:
   {
     "function_call": {
       "name": "tool_name",
       "arguments": {
         "param1": "value1",
         "param2": "value2"
       }
     }
   }

3. When outputting arguments:
   - For simple tools with no parameters, use empty JSON: {"function_call": {"name": "simple_tool", "arguments": {}}}
   - For tools with parameters, include all required parameters
   - Ensure parameter types match the schema (strings, numbers, booleans, etc.)

4. DO NOT EXPLAIN how you would use the tool - actually call the tool directly.
5. If you need to make multiple tool calls, format each one as a separate complete JSON object.
6. Return a complete, valid JSON object with your tool call - do not include any text before or after the JSON.

Example correct tool call:
```json
{
  "function_call": {
    "name": "search_database",
    "arguments": {
      "query": "python tutorial",
      "limit": 5
    }
  }
}
```
"""

        # Construct the full tool instruction block
        full_tool_instructions = f"{tool_instruction_header}\n{tools_json_string}{tool_instruction_footer}"

        # Add the full instructions to the system prompt if not already present
        # (Check specifically for the header to avoid duplicate additions)
        if tool_instruction_header not in system_prompt:
            system_prompt += full_tool_instructions
        payload["system"] = system_prompt # Assign the final system prompt to the payload
        

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
                        template=template,
                        template_params=template_model_params,
                        user_prefs={},  # Placeholder for user preferences
                        is_tool_calling=template.is_tool_calling_template,
                        tools=template.tool_definitions if template.is_tool_calling_template else None,
                    )

                    output = ollama_response.get("response", "").strip()
                    tool_calls = None
                    
                    # --- Tool Call Handling Logic ---
                    if template.is_tool_calling_template:
                        # 1. Check for structured tool calls from Ollama response first
                        structured_tool_calls = ollama_response.get("tool_calls")
                        if structured_tool_calls and isinstance(structured_tool_calls, list) and len(structured_tool_calls) > 0:
                            logger.info(f"Using structured tool_calls directly from Ollama response for {variation_label}")
                            # Ensure the structure matches frontend expectations if necessary
                            # (Assuming Ollama returns the correct [{ "type": "function", "function": {...} }] structure)
                            tool_calls = structured_tool_calls
                        else:
                            # 2. If no structured calls, try extracting from the text response
                            logger.info(f"No structured tool_calls found in Ollama response for {variation_label}. Attempting to extract from text.")
                            extracted_calls = extract_tool_calls_from_text(output)
                            if extracted_calls:
                                logger.info(f"Successfully extracted tool calls from text response for {variation_label}")
                                tool_calls = extracted_calls
                            else:
                                logger.warning(f"Could not extract tool calls from text response for {variation_label}")
                    # --- End Tool Call Handling Logic ---


                    result = GenerationResult(
                        template_id=request.template_id, # Add template_id
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
                        template_id=request.template_id, # Add template_id
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
                        template_id=request.template_id, # Add template_id
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


@router.post("/generate/simple", response_model=Dict[str, str])
async def generate_simple_text(
    request: SimpleGenerationRequest,
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Simple text generation endpoint specifically for the CustomTextInput component.
    Takes a prompt and returns generated text without requiring a template.
    """
    logger.info(f"🔄 Simple generation request received: {request.dict()}")
    
    # Get the user's default model
    generation_model = user.default_gen_model
    
    if not generation_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No generation model specified. Set a default model in user settings."
        )
    
    # Define the async generator function for streaming
    async def stream_results() -> AsyncGenerator[str, None]:
        try:
            # Use provided system prompt or default to a generic one
            system_prompt = request.system_prompt if request.system_prompt else "You are a helpful assistant. Provide useful, concise information."
            
            # Call the Ollama API
            ollama_response = await call_ollama_generate(
                model=generation_model,
                system_prompt=system_prompt,
                user_prompt=request.prompt,
                template=None,  # No template for simple generation
                template_params=None,
                user_prefs={},
                is_tool_calling=False,
                tools=None,
            )
            
            output = ollama_response.get("response", "").strip()
            
            # Create and yield the result
            result = {
                "name": request.name,
                "output": output,
                "prompt": request.prompt
            }
            
            yield json.dumps(result) + "\n"
            
        except Exception as e:
            error_detail = f"Error during simple generation: {str(e)}"
            logger.exception(error_detail)
            
            # Yield an error result
            error_result = {
                "name": request.name,
                "error": error_detail,
                "prompt": request.prompt
            }
            
            yield json.dumps(error_result) + "\n"
    
    # Return the streaming response
    return StreamingResponse(stream_results(), media_type="application/x-ndjson")
