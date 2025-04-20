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


class ToolCallExtractor:
    """Handles extraction of tool calls from text responses in different formats."""
    
    @staticmethod
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
        text = ToolCallExtractor._clean_text(text)
        
        try:
            # First, try parsing the entire text as a JSON array of tool calls
            tool_calls = ToolCallExtractor._try_parse_json_array(text)
            if tool_calls:
                return tool_calls
            
            # Next, try treating the entire text as a single JSON object
            tool_calls = ToolCallExtractor._try_parse_json_object(text)
            if tool_calls:
                return tool_calls
            
            # Try fixing common JSON issues
            tool_calls = ToolCallExtractor._try_fix_common_json_issues(text)
            if tool_calls:
                return tool_calls
            
            # Try extracting multiple tool calls from text using code block patterns
            tool_calls = ToolCallExtractor._try_extract_multi_tool_calls(text)
            if tool_calls:
                return tool_calls
            
            # Try to find individual JSON objects in the text if other methods failed
            tool_calls = ToolCallExtractor._try_extract_individual_json_objects(text)
            if tool_calls:
                return tool_calls

            # If we reached here, no valid tool calls were found
            logger.debug("No valid tool calls found in output")
            return None
        except Exception as e:
            logger.warning(f"Error extracting tool calls from text: {str(e)}")
            return None
    
    @staticmethod
    def _clean_text(text):
        """Clean up the text by removing markdown code blocks and surrounding backticks."""
        text = re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', text.strip())
        text = text.strip('`').strip()
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        return text
    
    @staticmethod
    def _try_parse_json_array(text):
        """Try to parse the text as a JSON array of tool calls."""
        if text.strip().startswith('[') and text.strip().endswith(']'):
            try:
                json_array = json.loads(text)
                if isinstance(json_array, list) and len(json_array) > 0:
                    tool_calls = []
                    for item in json_array:
                        # Convert each item to standardized format
                        processed_calls = ToolCallExtractor._process_single_tool_call_obj(item)
                        if processed_calls:
                            tool_calls.extend(processed_calls)
                    
                    if tool_calls:
                        logger.info(f"Extracted {len(tool_calls)} tool calls from JSON array")
                        return tool_calls
            except json.JSONDecodeError:
                logger.debug("Failed to parse as JSON array, continuing with other methods")
        return None
    
    @staticmethod
    def _try_parse_json_object(text):
        """Try to parse the text as a single JSON object."""
        try:
            # Check if this is a valid JSON object
            parsed_text = json.loads(text.strip())
            
            # Process the single object
            processed_calls = ToolCallExtractor._process_single_tool_call_obj(parsed_text)
            if processed_calls:
                return processed_calls
        except json.JSONDecodeError:
            # Not a valid JSON document, try extracting embedded JSON
            logger.debug("Input is not valid JSON object, looking for embedded JSON")
        return None
    
    @staticmethod
    def _try_fix_common_json_issues(text):
        """Try to fix common JSON issues like unescaped quotes."""
        if '"arguments": "{' in text:
            logger.debug("Detected possible escaping issue in arguments field, trying to fix...")
            # This is a common pattern - unescaped nested JSON
            fixed_text = text.replace('"arguments": "{', '"arguments": "{').replace('}"', '}"')
            
            try:
                json_obj = json.loads(fixed_text)
                processed_calls = ToolCallExtractor._process_single_tool_call_obj(json_obj)
                if processed_calls:
                    return processed_calls
            except:
                logger.debug("Failed to parse fixed text")
        return None
    
    @staticmethod
    def _try_extract_multi_tool_calls(text):
        """Try to extract multiple tool calls using code block patterns."""
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
                            processed = ToolCallExtractor._process_single_tool_call_obj(obj)
                            if processed:
                                all_calls.extend(processed)
                        except:
                            continue
                    
                    if all_calls:
                        logger.info(f"Extracted {len(all_calls)} tool calls from multiple JSON objects")
                        return all_calls
            except Exception as e:
                logger.debug(f"Failed to extract multiple tool calls: {str(e)}")
        return None
    
    @staticmethod
    def _try_extract_individual_json_objects(text):
        """Try to find individual JSON objects in the text."""
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
                    
                    processed_calls = ToolCallExtractor._process_single_tool_call_obj(json_obj)
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
        return None
    
    @staticmethod
    def _process_single_tool_call_obj(json_obj):
        """
        Helper function to process a single JSON object into standardized tool call format.
        Returns a list of standardized tool calls or None if not valid.
        """
        if not isinstance(json_obj, dict):
            return None
        
        tool_calls = []
        
        # Handle OpenAI-style format with function_call
        if "function_call" in json_obj:
            tool_calls.append(ToolCallExtractor._process_openai_format(json_obj))
        
        # Handle Anthropic-style format with tool_use
        elif "tool_use" in json_obj:
            tool_calls.append(ToolCallExtractor._process_anthropic_format(json_obj))
        
        # Handle simplified format with name and parameters
        elif "name" in json_obj and ("parameters" in json_obj or "arguments" in json_obj):
            tool_calls.append(ToolCallExtractor._process_simplified_format(json_obj))
        
        # Handle case with multiple tool_calls array
        elif "tool_calls" in json_obj and isinstance(json_obj["tool_calls"], list):
            for call in json_obj["tool_calls"]:
                if isinstance(call, dict):
                    # Process each tool call
                    result = ToolCallExtractor._process_single_tool_call_obj(call)
                    if result:
                        tool_calls.extend(result)
        
        return tool_calls if tool_calls else None
    
    @staticmethod
    def _process_openai_format(json_obj):
        """Process OpenAI-style tool call format."""
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
        return tool_call
    
    @staticmethod
    def _process_anthropic_format(json_obj):
        """Process Anthropic-style tool call format."""
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
        return tool_call
    
    @staticmethod
    def _process_simplified_format(json_obj):
        """Process simplified tool call format with name and parameters."""
        parameters = json_obj.get("parameters", json_obj.get("arguments", {}))
        tool_call = {
            "type": "function",
            "function": {
                "name": json_obj.get("name", "unknown"),
                "arguments": json.dumps(parameters) if isinstance(parameters, dict) else parameters
            }
        }
        logger.info(f"Extracted simplified-style tool call: {tool_call['function']['name']}")
        return tool_call


async def call_ollama_generate(
    model: str,
    system_prompt: Optional[str],
    user_prompt: str,
    template_params: Optional[ModelParameters] = None,
    template: Optional[Template] = None,
    user_prefs: Dict[str, Any] = None,
    is_tool_calling: bool = False,
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Calls the Ollama API with merged parameters."""
    
    # Build final options by merging parameters
    final_options = merge_model_parameters(template_params, user_prefs)
    
    # Prepare payload for Ollama API
    payload = build_ollama_payload(model, system_prompt, user_prompt, final_options, is_tool_calling, tools, template)
    
    # Call Ollama API with proper error handling
    return await make_ollama_api_call(payload)


def merge_model_parameters(template_params: Optional[ModelParameters], user_prefs: Dict[str, Any]) -> Dict[str, Any]:
    """Merge model parameters from different sources with proper precedence."""
    # Start with Ollama defaults
    final_options = {
        "temperature": 1.0,
        "top_p": 1.0,
    }
    
    # Layer 2: Template-specific parameters (highest priority if set)
    if template_params:
        if template_params.temperature is not None:
            final_options["temperature"] = template_params.temperature
        if template_params.top_p is not None:
            final_options["top_p"] = template_params.top_p
        if template_params.max_tokens is not None:
            final_options["num_predict"] = template_params.max_tokens
    
    return final_options


def build_ollama_payload(
    model: str, 
    system_prompt: Optional[str], 
    user_prompt: str, 
    options: Dict[str, Any],
    is_tool_calling: bool = False,
    tools: Optional[List[Dict[str, Any]]] = None,
    template: Optional[Template] = None
) -> Dict[str, Any]:
    """Build the payload for the Ollama API call."""
    payload = {
        "model": model,
        "prompt": user_prompt,
        "stream": False,
        "options": options,
    }
    
    if system_prompt:
        payload["system"] = system_prompt
    
    if is_tool_calling and tools and template:
        # Normalize the tool definition format
        normalized_tools = normalize_tool_definitions(template.tool_definitions)
        payload["tools"] = normalized_tools
        
        # Enhance system prompt with tool instructions
        payload["system"] = enhance_system_prompt_with_tools(system_prompt, normalized_tools)
    
    return payload


def normalize_tool_definitions(tool_definitions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize tool definitions to ensure consistent format."""
    normalized_tools = []
    for tool in tool_definitions:
        if "type" not in tool and "function" in tool:
            normalized_tool = {"type": "function", "function": tool["function"]}
        else:
            normalized_tool = tool.copy()
        
        if "function" in normalized_tool and "parameters" not in normalized_tool["function"]:
            normalized_tool["function"]["parameters"] = {"type": "object", "properties": {}}
        
        normalized_tools.append(normalized_tool)
    
    return normalized_tools


def enhance_system_prompt_with_tools(system_prompt: str, normalized_tools: List[Dict[str, Any]]) -> str:
    """Enhance the system prompt with tool definitions and instructions."""
    # Convert normalized tools to a JSON string
    tools_json_string = json.dumps(normalized_tools, indent=2)
    
    # Tool instruction header and footer
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
    if tool_instruction_header not in system_prompt:
        enhanced_prompt = system_prompt + full_tool_instructions
    else:
        enhanced_prompt = system_prompt
    
    return enhanced_prompt


async def make_ollama_api_call(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Make an API call to Ollama with consistent error handling."""
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
        api_url = f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/tags"
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, timeout=settings.OLLAMA_TIMEOUT)
            
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
    logger.info(f"🔄 Generation request received: {request.dict()}")
    instruction = getattr(request, "instruction", None)
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
    
    # Validate that all required slots are provided for each seed
    validate_seeds_slots(request.seeds, template)
    
    # Determine the model to use
    generation_model = template.model_override or user.default_gen_model
    if not generation_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No generation model specified. Set a default model in settings or override it in the template.",
        )
    
    # Extract template-specific model parameters
    template_model_params = extract_template_model_params(template)
    
    # Return the streaming response
    return StreamingResponse(
        stream_generation_results(
            request, template, generation_model, template_model_params
        ),
        media_type="application/x-ndjson"
    )


def validate_seeds_slots(seeds: List[SeedData], template: Template):
    """Validate that all required slots are provided for each seed."""
    for seed_index, seed_data in enumerate(seeds):
        for slot in template.slots:
            if slot not in seed_data.slots:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing value for slot '{slot}' in seed {seed_index + 1}",
                )


def extract_template_model_params(template: Template) -> Optional[ModelParameters]:
    """Extract model parameters from template."""
    if not template.model_parameters:
        return None
    
    try:
        return ModelParameters.parse_obj(template.model_parameters)
    except Exception as e:
        logger.warning(f"Failed to parse model_parameters for template {template.id}: {e}. Using defaults.")
        return None


async def stream_generation_results(
    request: GenerationRequest,
    template: Template,
    generation_model: str,
    template_model_params: Optional[ModelParameters]
) -> AsyncGenerator[str, None]:
    """Generate and stream results for the given request."""
    for seed_index, seed_data in enumerate(request.seeds):
        current_slots = seed_data.slots
        
        # Replace slots in the template
        user_prompt = replace_template_slots(template.user_prompt, current_slots)
        
        # Generate variations for the current seed
        for variation_index in range(request.count):
            variation_label = f"Seed {seed_index + 1} / Variation {variation_index + 1}"
            
            try:
                # Process system prompt with instruction if provided
                system_prompt = process_system_prompt(template.system_prompt, getattr(request, "instruction", None))
                
                # Call Ollama API
                ollama_response = await call_ollama_generate(
                    model=generation_model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    template=template,
                    template_params=template_model_params,
                    user_prefs={},
                    is_tool_calling=template.is_tool_calling_template,
                    tools=template.tool_definitions if template.is_tool_calling_template else None,
                )
                
                # Process response
                result = process_generation_result(
                    ollama_response, 
                    seed_index, 
                    variation_index, 
                    variation_label,
                    request.template_id,
                    current_slots,
                    user_prompt,
                    system_prompt,
                    template
                )
                
            except httpx.TimeoutException:
                # Handle timeout error
                error_detail = "Ollama API timed out. Please try again."
                logger.error(f"{variation_label}: {error_detail}")
                result = create_error_result(
                    error_detail, 
                    seed_index, 
                    variation_index, 
                    variation_label,
                    request.template_id,
                    current_slots,
                    user_prompt,
                    system_prompt,
                    template
                )
                
            except Exception as e:
                # Handle general error
                error_detail = f"Error generating variation: {str(e)}"
                logger.exception(f"{variation_label}: {error_detail}")
                result = create_error_result(
                    f"Error: {error_detail}",
                    seed_index, 
                    variation_index, 
                    variation_label,
                    request.template_id,
                    current_slots,
                    user_prompt,
                    system_prompt,
                    template
                )
            
            # Yield the result as a JSON string followed by a newline
            yield result.json() + "\n"
            await asyncio.sleep(0.01)  # Small sleep to allow context switching


def replace_template_slots(template_text: str, slots: Dict[str, str]) -> str:
    """Replace slot placeholders in template text with values."""
    result = template_text
    for slot, value in slots.items():
        pattern = "{" + slot + "}"
        result = result.replace(pattern, value)
    return result


def process_system_prompt(base_prompt: str, instruction: Optional[str]) -> str:
    """Process system prompt with optional instruction."""
    if not instruction or not instruction.strip():
        return base_prompt
    
    clean_instruction = instruction.strip()
    if "Additional instruction:" not in base_prompt:
        logger.info(f"⚠️ Adding global instruction to system prompt: '{clean_instruction}'")
        return f"{base_prompt}\n\nAdditional instruction: {clean_instruction}"
    
    return base_prompt


def process_generation_result(
    ollama_response: Dict[str, Any],
    seed_index: int,
    variation_index: int,
    variation_label: str,
    template_id: int,
    current_slots: Dict[str, str],
    user_prompt: str,
    system_prompt: str,
    template: Template
) -> GenerationResult:
    """Process the Ollama API response into a GenerationResult."""
    output = ollama_response.get("response", "").strip()
    tool_calls = extract_tool_calls(ollama_response, output, variation_label, template)
    
    return GenerationResult(
        template_id=template_id,
        seed_index=seed_index,
        variation_index=variation_index,
        variation=variation_label,
        output=output,
        slots=current_slots,
        processed_prompt=user_prompt,
        tool_calls=tool_calls,
        system_prompt=system_prompt,
        system_prompt_mask=template.system_prompt_mask,
        user_prompt_mask=template.user_prompt_mask,
    )


def extract_tool_calls(
    ollama_response: Dict[str, Any],
    output: str,
    variation_label: str,
    template: Template
) -> Optional[List[Dict[str, Any]]]:
    """Extract tool calls from Ollama response or output text."""
    if not template.is_tool_calling_template:
        return None
    
    # 1. Check for structured tool calls from Ollama response first
    structured_tool_calls = ollama_response.get("tool_calls")
    if structured_tool_calls and isinstance(structured_tool_calls, list) and len(structured_tool_calls) > 0:
        logger.info(f"Using structured tool_calls directly from Ollama response for {variation_label}")
        return structured_tool_calls
    
    # 2. If no structured calls, try extracting from the text response
    logger.info(f"No structured tool_calls found in Ollama response for {variation_label}. Attempting to extract from text.")
    extracted_calls = ToolCallExtractor.extract_tool_calls_from_text(output)
    if extracted_calls:
        logger.info(f"Successfully extracted tool calls from text response for {variation_label}")
        return extracted_calls
    
    logger.warning(f"Could not extract tool calls from text response for {variation_label}")
    return None


def create_error_result(
    error_message: str,
    seed_index: int,
    variation_index: int,
    variation_label: str,
    template_id: int,
    current_slots: Dict[str, str],
    user_prompt: str,
    system_prompt: str,
    template: Template
) -> GenerationResult:
    """Create a GenerationResult for an error case."""
    return GenerationResult(
        template_id=template_id,
        seed_index=seed_index,
        variation_index=variation_index,
        variation=variation_label,
        output=f"[{error_message}]",
        slots=current_slots,
        processed_prompt=user_prompt,
        system_prompt=system_prompt,
        system_prompt_mask=template.system_prompt_mask,
        user_prompt_mask=template.user_prompt_mask,
    )