from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import httpx
import json
import logging
from pydantic import BaseModel, Field

from ..core.security import get_current_user
from ..core.config import settings
from ..api.models import User, Template
from ..api.schemas import SeedData
from ..db import get_session

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()

class ParaphraseRequest(BaseModel):
    template_id: int
    seeds: List[SeedData]
    count: Optional[int] = Field(default=3, ge=1, le=20, description="Number of new seeds to generate")
    instructions: Optional[str] = Field(default=None, max_length=500, description="Additional instructions for the AI")

class ParaphraseResponse(BaseModel):
    generated_seeds: List[SeedData]
    
class TextParaphraseRequest(BaseModel):
    text: str
    count: Optional[int] = Field(default=3, ge=1, le=10, description="Number of paraphrases to generate")
    instructions: Optional[str] = Field(default=None, max_length=500, description="Additional instructions for the AI")
    
class TextParaphraseResponse(BaseModel):
    paraphrases: List[str]


async def call_ollama_api(model: str, system_prompt: str, user_prompt: str, 
                          temperature: float = 0.7, stream: bool = False, 
                          format_json: bool = False) -> Dict[str, Any]:
    """Helper function to call Ollama API with standardized error handling."""
    try:
        payload = {
            "model": model,
            "temperature": temperature,
            "prompt": user_prompt,
            "system": system_prompt,
            "stream": stream
        }
        
        if format_json:
            payload["format"] = "json"
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                json=payload,
                timeout=settings.OLLAMA_TIMEOUT
            )
            
            if response.status_code != 200:
                error_detail = f"Ollama API error ({response.status_code})"
                try:
                    error_detail += f": {response.json().get('error', response.text)}"
                except json.JSONDecodeError:
                    error_detail += f": {response.text}"
                logger.error(error_detail)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=error_detail
                )
                
            return response.json()
            
    except httpx.TimeoutException:
        logger.error("Ollama API request timed out")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama API timed out during generation"
        )
    except Exception as e:
        logger.exception(f"Unexpected error calling Ollama API: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calling Ollama API: {str(e)}"
        )


@router.post("/paraphrase", response_model=ParaphraseResponse)
async def paraphrase_seeds(
    request: ParaphraseRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Generate new seeds by paraphrasing existing ones."""
    # Validate user has a paraphrase model set
    if not user.default_para_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set it in the settings."
        )

    # Validate request has seeds
    if len(request.seeds) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one seed is required for paraphrasing."
        )

    # Get template and validate slots
    template = get_template_and_validate_slots(session, request.template_id)
    
    # Generate paraphrased seeds
    generated_seeds = await generate_paraphrased_seeds(
        template=template,
        initial_seeds=request.seeds,
        count=request.count, 
        instructions=request.instructions,
        model=user.default_para_model
    )
    
    return ParaphraseResponse(generated_seeds=generated_seeds)


def get_template_and_validate_slots(session: Session, template_id: int) -> Template:
    """Get template from database and validate it has slots defined."""
    template = session.get(Template, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {template_id} not found."
        )
    
    if not template.slots:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template has no slots defined."
        )
        
    return template


async def generate_paraphrased_seeds(template: Template, initial_seeds: List[SeedData], 
                                    count: int, instructions: Optional[str], 
                                    model: str) -> List[SeedData]:
    """Generate paraphrased seeds based on initial seeds."""
    # Start with the initial seeds provided in the request
    current_seed_pool = [seed.slots for seed in initial_seeds]
    generated_seeds_list = []
    
    # Construct system prompt for seed generation
    system_prompt = construct_seed_generation_prompt(template.slots, instructions)
    
    # Generate each seed
    for i in range(count):
        logger.info(f"Requesting seed {i+1} of {count}...")
        
        # Construct user prompt with current seed pool
        user_prompt = construct_seed_user_prompt(template.slots, current_seed_pool)
        
        try:
            # Call Ollama API
            result = await call_ollama_api(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.5,
                format_json=True
            )
            
            # Parse result
            result_text = result.get("response", "")
            generated_data = parse_seed_result(result_text, template.slots)
            
            if generated_data:
                # Create the seed using only the expected slots, converting values to string
                seed_slots = {slot: str(generated_data.get(slot, '')) for slot in template.slots}
                
                # Add the newly generated slots to the pool for the next iteration
                current_seed_pool.append(seed_slots)
                
                # Store the validated SeedData object for the final response
                parsed_seed = SeedData(slots=seed_slots)
                generated_seeds_list.append(parsed_seed)
                logger.info(f"Successfully generated and parsed seed {i+1}.")
                
        except HTTPException:
            # Error already logged and formatted in call_ollama_api
            continue
        except Exception as e:
            logger.exception(f"Unexpected error generating seed {i+1}: {e}")
            continue
    
    # Check if we generated any seeds
    if not generated_seeds_list and count > 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate any valid seeds after {count} attempts. Check backend logs for details."
        )
        
    return generated_seeds_list


def construct_seed_generation_prompt(slots: List[str], instructions: Optional[str]) -> str:
    """Construct the system prompt for seed generation."""
    system_prompt_base = (
        "You are an AI assistant that generates structured data. Your task is to create ONE new seed example based on provided ones. "
        "The seed example MUST be a JSON object containing specific keys (slots). "
        f"The required slots for the object are: {json.dumps(slots)}. "
        "You will be given existing examples. Generate ONE new, distinct example that follows the exact same JSON structure and is different from the provided examples. "
        "Your output MUST be ONLY a single, valid JSON object representing the new seed. Do NOT include any explanatory text, markdown formatting, or anything else before or after the JSON object."
    )

    # Append additional instructions if provided
    if instructions:
        system_prompt = f"{system_prompt_base}\n\nAdditional Instructions: {instructions}"
    else:
        system_prompt = system_prompt_base
        
    return system_prompt


def construct_seed_user_prompt(slots: List[str], current_seed_pool: List[Dict[str, str]]) -> str:
    """Construct the user prompt for seed generation."""
    user_prompt_parts = [
        f"Generate ONE new seed example based on the following {len(current_seed_pool)} examples.",
        "The new example MUST be a JSON object with these slots:",
        f"{json.dumps(slots)}",
        "\nExisting Examples (JSON list format):",
        json.dumps(current_seed_pool, indent=2),
        "\nOutput ONLY the new example as a single JSON object below:"
    ]
    return "\n".join(user_prompt_parts)


def parse_seed_result(result_text: str, required_slots: List[str]) -> Optional[Dict[str, str]]:
    """Parse and validate the generated seed result."""
    try:
        generated_data = json.loads(result_text)
        
        if not isinstance(generated_data, dict):
            logger.warning(f"LLM response is not a JSON object: {result_text[:100]}...")
            return None

        # Validate the single object
        missing_slots = [slot for slot in required_slots if slot not in generated_data]
        if missing_slots:
            logger.warning(f"Generated seed missing slots: {missing_slots}. Item: {generated_data}")
            return None
            
        return generated_data
        
    except json.JSONDecodeError as e:
        logger.warning(f"Error parsing LLM JSON response: {e}\nRaw response: {result_text[:100]}...")
        return None


@router.post("/paraphrase_text", response_model=TextParaphraseResponse)
async def paraphrase_text(
    request: TextParaphraseRequest,
    user: User = Depends(get_current_user)
):
    """Generate paraphrases of a given text."""
    # Validate user has a paraphrase model set
    if not user.default_para_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set it in the settings."
        )
    
    # Validate request has text
    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text to paraphrase cannot be empty."
        )
    
    # Generate paraphrases
    paraphrases = await generate_text_paraphrases(
        text=request.text,
        count=request.count,
        instructions=request.instructions,
        model=user.default_para_model
    )
    
    return TextParaphraseResponse(paraphrases=paraphrases)


async def generate_text_paraphrases(text: str, count: int, 
                                   instructions: Optional[str], model: str) -> List[str]:
    """Generate paraphrases of the given text."""
    generated_paraphrases = []
    
    # Construct system prompt
    system_prompt = construct_text_paraphrase_prompt(instructions)
    
    # Generate each paraphrase
    for i in range(count):
        logger.info(f"Generating paraphrase {i+1} of {count}...")
        
        # Construct user prompt
        user_prompt = f"Paraphrase the following text:\n\n{text}\n\nProvide only the paraphrased version."
        
        try:
            # Call Ollama API
            result = await call_ollama_api(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.9
            )
            
            # Process result
            result_text = result.get("response", "").strip()
            if result_text:
                generated_paraphrases.append(result_text)
                logger.info(f"Successfully generated paraphrase {i+1}.")
                
        except HTTPException:
            # Error already logged and formatted in call_ollama_api
            continue
        except Exception as e:
            logger.exception(f"Unexpected error generating paraphrase {i+1}: {e}")
            continue
    
    # Check if we generated any paraphrases
    if not generated_paraphrases and count > 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate any valid paraphrases after {count} attempts. Check backend logs for details."
        )
        
    return generated_paraphrases


def construct_text_paraphrase_prompt(instructions: Optional[str]) -> str:
    """Construct the system prompt for text paraphrasing."""
    system_prompt = (
        "You are an AI assistant that specializes in paraphrasing text. "
        "Your task is to produce HIGH-QUALITY, CREATIVE paraphrases of the given text. "
        "Each paraphrase should convey the same meaning but use significantly different wording and structure. "
        "Make the paraphrases diverse in style, vocabulary, and sentence structure. "
        "Your output should be ONLY the paraphrased text without any explanations or formatting."
    )
    
    # Add additional instructions if provided
    if instructions:
        system_prompt += f"\n\nAdditional Instructions: {instructions}"
        
    return system_prompt