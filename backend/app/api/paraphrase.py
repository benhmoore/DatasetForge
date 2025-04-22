from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import httpx
import json
import asyncio  # Import asyncio for potential parallelization later if needed
from pydantic import BaseModel, Field

from ..core.security import get_current_user
from ..core.config import settings
from ..api.models import User, Template
from ..api.schemas import SeedData
from ..db import get_session

router = APIRouter()

class SeedData(BaseModel):
    slots: Dict[str, str]

class ParaphraseRequest(BaseModel):
    template_id: int
    seeds: List[SeedData]
    count: Optional[int] = Field(default=3, ge=1, le=20, description="Number of new seeds to generate")
    instructions: Optional[str] = Field(default=None, max_length=500, description="Additional instructions for the AI")

class ParaphraseResponse(BaseModel):
    generated_seeds: List[SeedData]
    
# New models for paraphrasing generation outputs
class TextParaphraseRequest(BaseModel):
    text: str
    count: Optional[int] = Field(default=3, ge=1, le=10, description="Number of paraphrases to generate")
    instructions: Optional[str] = Field(default=None, max_length=500, description="Additional instructions for the AI")
    
class TextParaphraseResponse(BaseModel):
    paraphrases: List[str]

@router.post("/paraphrase", response_model=ParaphraseResponse)
async def paraphrase_seeds(
    request: ParaphraseRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Generate new seeds by paraphrasing existing ones, one request per seed, updating context."""
    if not user.default_para_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set it in the settings."
        )

    if len(request.seeds) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one seed is required for paraphrasing."
        )

    # Fetch the template to get slot names
    template = session.get(Template, request.template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {request.template_id} not found."
        )
    
    slot_names = template.slots
    if not slot_names:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template has no slots defined."
        )

    num_to_generate = request.count
    # Start with the initial seeds provided in the request
    current_seed_pool = [seed.slots for seed in request.seeds]
    generated_seeds_list = [] # Store the SeedData objects for the final response

    # --- Construct the Base System Prompt (asking for ONE seed) --- 
    system_prompt_base = (
        "You are an AI assistant that generates structured data. Your task is to create ONE new seed example based on provided ones. "
        "The seed example MUST be a JSON object containing specific keys (slots). "
        f"The required slots for the object are: {json.dumps(slot_names)}. "
        "You will be given existing examples. Generate ONE new, distinct example that follows the exact same JSON structure and is different from the provided examples. " # Added emphasis on difference
        "Your output MUST be ONLY a single, valid JSON object representing the new seed. Do NOT include any explanatory text, markdown formatting, or anything else before or after the JSON object."
    )

    # Append additional instructions if provided
    system_prompt = system_prompt_base
    if request.instructions:
        system_prompt += f"\n\nAdditional Instructions: {request.instructions}"
    # --- End System Prompt Construction ---

    async with httpx.AsyncClient() as client:
        for i in range(num_to_generate):
            print(f"Requesting seed {i+1} of {num_to_generate}...")
            
            # --- Construct User Prompt dynamically inside the loop --- 
            user_prompt_parts = [
                f"Generate ONE new seed example based on the following {len(current_seed_pool)} examples.",
                "The new example MUST be a JSON object with these slots:",
                f"{json.dumps(slot_names)}",
                "\nExisting Examples (JSON list format):",
                json.dumps(current_seed_pool, indent=2), # Use the current pool of seeds
                "\nOutput ONLY the new example as a single JSON object below:"
            ]
            user_prompt = "\n".join(user_prompt_parts)
            # --- End User Prompt Construction ---
            
            try:
                response = await client.post(
                    f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                    json={
                        "model": user.default_para_model,
                        "temperature": 0.5,
                        "prompt": user_prompt, # Use the dynamically generated user prompt
                        "system": system_prompt,
                        "stream": False,
                        "format": "json"
                    },
                    timeout=settings.OLLAMA_TIMEOUT
                )

                if response.status_code != 200:
                    error_detail = f"Ollama API error on seed {i+1} ({response.status_code})"
                    try:
                        error_detail += f": {response.json().get('error', response.text)}"
                    except json.JSONDecodeError:
                        error_detail += f": {response.text}"
                    print(f"Error generating seed {i+1}: {error_detail}")
                    continue # Skip to the next iteration

                result_text = response.json().get("response", "")
                
                # --- Parse the SINGLE LLM Response --- 
                try:
                    generated_data = json.loads(result_text)
                    
                    if not isinstance(generated_data, dict):
                         raise ValueError(f"LLM response for seed {i+1} is not a JSON object.")

                    # Validate the single object
                    missing_slots = [slot for slot in slot_names if slot not in generated_data]
                    if missing_slots:
                        print(f"Warning: Skipping generated seed {i+1} due to missing slots: {missing_slots}. Item: {generated_data}")
                        continue
                        
                    # Create the seed using only the expected slots, converting values to string
                    seed_slots = {slot: str(generated_data.get(slot, '')) for slot in slot_names}
                    
                    # Add the newly generated slots to the pool for the next iteration
                    current_seed_pool.append(seed_slots)
                    
                    # Store the validated SeedData object for the final response
                    parsed_seed = SeedData(slots=seed_slots)
                    generated_seeds_list.append(parsed_seed)
                    print(f"Successfully generated and parsed seed {i+1}.")
                        
                except (json.JSONDecodeError, ValueError) as e:
                    print(f"Error parsing or validating LLM JSON response for seed {i+1}: {e}\nRaw response: {result_text}")
                    continue 
                # --- End Response Parsing ---

            except httpx.TimeoutException:
                 print(f"Ollama API timed out while generating seed {i+1}. Skipping.")
                 continue
            except Exception as e:
                print(f"Unexpected error generating seed {i+1}: {e}. Skipping.")
                continue

    print(f"Finished generation. Total seeds generated: {len(generated_seeds_list)} out of {num_to_generate} requested.")
    if not generated_seeds_list and num_to_generate > 0:
         raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate any valid seeds after {num_to_generate} attempts. Check backend logs for details."
         )

    return ParaphraseResponse(generated_seeds=generated_seeds_list)
    
@router.post("/paraphrase_text", response_model=TextParaphraseResponse)
async def paraphrase_text(
    request: TextParaphraseRequest,
    user: User = Depends(get_current_user)
):
    """Generate paraphrases of a given text."""
    if not user.default_para_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set it in the settings."
        )
    
    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text to paraphrase cannot be empty."
        )
        
    num_to_generate = request.count
    generated_paraphrases = []
    unique_paraphrases = set()  # Track unique paraphrases
    max_retries = 3  # Maximum retries per paraphrase when duplicates occur
    
    # Construct system prompt
    system_prompt = (
        "You are an AI assistant that specializes in paraphrasing text. "
        "Your task is to produce HIGH-QUALITY, CREATIVE paraphrases of the given text. "
        "Each paraphrase should convey the same meaning but use significantly different wording and structure. "
        "Make the paraphrases diverse in style, vocabulary, and sentence structure. "
        "Your output should be ONLY the paraphrased text without any explanations or formatting."
    )
    
    # Add additional instructions if provided
    if request.instructions:
        system_prompt += f"\n\nAdditional Instructions: {request.instructions}"
        
    async with httpx.AsyncClient() as client:
        for i in range(num_to_generate):
            print(f"Generating paraphrase {i+1} of {num_to_generate}...")
            
            retries = 0
            is_duplicate = True
            result_text = ""
            
            # Keep trying until we get a unique paraphrase or exhaust retries
            while is_duplicate and retries <= max_retries:
                # Adjust prompt based on whether this is a retry due to duplicate
                if retries > 0:
                    enhanced_system_prompt = system_prompt + (
                        f"\n\nIMPORTANT: Your previous paraphrase was too similar to one already "
                        f"generated. Create a COMPLETELY DIFFERENT paraphrase with new vocabulary "
                        f"and sentence structure. Attempt #{retries+1}."
                    )
                    print(f"Retry #{retries} for paraphrase {i+1} due to duplicate.")
                else:
                    enhanced_system_prompt = system_prompt
                
                user_prompt = f"Paraphrase the following text:\n\n{request.text}\n\nProvide only the paraphrased version."
                
                try:
                    response = await client.post(
                        f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                        json={
                            "model": user.default_para_model,
                            "temperature": 1.3 + (0.1 * retries),  # Increase temperature on retries
                            "top_p": 0.95,
                            "prompt": user_prompt,
                            "system": enhanced_system_prompt,
                            "stream": False,
                        },
                        timeout=settings.OLLAMA_TIMEOUT
                    )
                    
                    if response.status_code != 200:
                        error_detail = f"Ollama API error on paraphrase {i+1} ({response.status_code})"
                        try:
                            error_detail += f": {response.json().get('error', response.text)}"
                        except json.JSONDecodeError:
                            error_detail += f": {response.text}"
                        print(f"Error generating paraphrase {i+1}: {error_detail}")
                        break  # Skip to the next paraphrase
                    
                    result_text = response.json().get("response", "").strip()
                    
                    # Check if this is a duplicate
                    if result_text in unique_paraphrases:
                        is_duplicate = True
                        retries += 1
                        print(f"Duplicate detected for paraphrase {i+1}. Retrying ({retries}/{max_retries}).")
                    else:
                        is_duplicate = False
                        
                except (httpx.TimeoutException, Exception) as e:
                    print(f"Error during paraphrase generation {i+1}: {str(e)}")
                    break  # Skip to the next paraphrase
            
            # Only add non-empty, unique paraphrases
            if result_text and not is_duplicate:
                generated_paraphrases.append(result_text)
                unique_paraphrases.add(result_text)
                print(f"Successfully generated unique paraphrase {i+1}.")
                print(f"Paraphrase {i+1}: {result_text}")
    
    print(f"Finished generation. Total unique paraphrases generated: {len(generated_paraphrases)} out of {num_to_generate} requested.")
    if not generated_paraphrases and num_to_generate > 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate any valid paraphrases after {num_to_generate} attempts. Check backend logs for details."
        )
    
    return TextParaphraseResponse(paraphrases=generated_paraphrases)