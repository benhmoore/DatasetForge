from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import httpx
import json

from ..core.security import get_current_user
from ..core.config import settings
from ..api.models import User, Template
from ..api.schemas import ParaphraseRequest, ParaphraseSeedsRequest, ParaphraseSeedsResponse, SeedData
from ..db import get_session

router = APIRouter()


@router.post("/paraphrase", response_model=List[str])
async def generate_paraphrases(
    request: ParaphraseRequest,
    user: User = Depends(get_current_user)
):
    """
    Generate paraphrases for a given text
    """
    if not request.text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty"
        )
    
    # Check if user has default paraphrase model set
    if not user.default_para_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set it in the settings."
        )
    
    # Create a system prompt for paraphrasing
    system_prompt = (
        "You are an AI assistant that specializes in paraphrasing text. "
        "Create variations of the input that keep the same meaning but use different wording."
    )
    
    # Create a user prompt with the text
    user_prompt = f"Generate {request.count} paraphrases of the following text. Output only the paraphrases, one per line, with no additional commentary.\n\nText: {request.text}"
    
    try:
        # Call Ollama API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                json={
                    "model": user.default_para_model,
                    "prompt": user_prompt,
                    "system": system_prompt,
                    "stream": False
                },
                timeout=settings.OLLAMA_TIMEOUT
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Ollama API returned an error: {response.text}"
                )
            
            # Extract paraphrases from the response
            result = response.json().get("response", "")
            
            # Split by newlines and clean up
            paraphrases = [
                line.strip() for line in result.split("\n") 
                if line.strip() and not line.startswith("Paraphrase")
            ]
            
            # Limit to requested count
            paraphrases = paraphrases[:request.count]
            
            # If we didn't get enough paraphrases, add some placeholders
            while len(paraphrases) < request.count:
                paraphrases.append(request.text)
            
            return paraphrases
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama API timed out while generating paraphrases"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate paraphrases: {str(e)}"
        )


@router.post("/paraphrase/seeds", response_model=ParaphraseSeedsResponse)
async def generate_paraphrased_seeds(
    request: ParaphraseSeedsRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Generate new seeds based on existing seeds using paraphrasing.
    """
    if not user.default_para_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set it in the settings."
        )

    if len(request.seeds) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least two seeds are required for paraphrasing."
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

    # --- Construct the Prompt --- 
    # System Prompt: Define the task VERY clearly
    system_prompt = (
        "You are an AI assistant that generates structured data. Your task is to create new seed examples based on provided ones. "
        "Each seed example MUST be a JSON object containing specific keys (slots). "
        f"The required slots for each object are: {json.dumps(slot_names)}. "
        "You will be given existing examples. Generate new, distinct examples that follow the exact same JSON structure. "
        "Your output MUST be ONLY a valid JSON list containing the new seed objects. Do NOT include any explanatory text, markdown formatting, or anything else before or after the JSON list."
    )

    # User Prompt: Provide context and examples
    user_prompt_parts = [
        f"Generate 3 new seed examples based on the following {len(request.seeds)} examples.",
        "Each new example MUST be a JSON object with these slots:",
        f"{json.dumps(slot_names)}",
        "\nExisting Examples (JSON list format):",
        json.dumps([seed.slots for seed in request.seeds], indent=2), # Format existing seeds as JSON
        "\nOutput ONLY the new examples as a single JSON list below:"
    ]
    user_prompt = "\n".join(user_prompt_parts)
    # --- End Prompt Construction ---

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                json={
                    "model": user.default_para_model,
                    "prompt": user_prompt,
                    "system": system_prompt,
                    "stream": False,
                    "format": "json" # Crucial: Request JSON output format
                },
                timeout=settings.OLLAMA_TIMEOUT * 2 
            )

            if response.status_code != 200:
                error_detail = f"Ollama API error ({response.status_code})"
                try:
                    error_detail += f": {response.json().get('error', response.text)}"
                except json.JSONDecodeError:
                    error_detail += f": {response.text}"
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=error_detail
                )

            result_text = response.json().get("response", "")
            
            # --- Parse the LLM Response --- 
            parsed_seeds = []
            try:
                # Attempt to parse the entire response as JSON
                generated_data = json.loads(result_text)
                
                # Handle case where LLM returns a single object instead of a list
                if isinstance(generated_data, dict):
                    potential_seeds = [generated_data] # Wrap the single object in a list
                elif isinstance(generated_data, list):
                    potential_seeds = generated_data
                else:
                    raise ValueError("LLM response is not a JSON list or object.")
                
                # Validate each item in the list
                for index, item in enumerate(potential_seeds):
                    if isinstance(item, dict):
                        # Check if all required slots are present
                        missing_slots = [slot for slot in slot_names if slot not in item]
                        if missing_slots:
                            print(f"Warning: Skipping generated seed at index {index} due to missing slots: {missing_slots}. Item: {item}")
                            continue # Skip this invalid seed
                            
                        # Create the seed using only the expected slots, converting values to string
                        seed_slots = {slot: str(item.get(slot, '')) for slot in slot_names}
                        parsed_seeds.append(SeedData(slots=seed_slots))
                    else:
                        print(f"Warning: Skipping non-dict item in LLM response list at index {index}: {item}")
                        
            except (json.JSONDecodeError, ValueError) as e:
                print(f"Error parsing or validating LLM JSON response: {e}\nRaw response: {result_text}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to parse or validate generated seeds from LLM. Error: {e}. Raw response snippet: {result_text[:100]}..."
                )
            # --- End Response Parsing ---

            if not parsed_seeds:
                 print(f"Warning: LLM generated no valid seeds after parsing and validation. Raw response: {result_text}")
                 # Return empty list instead of erroring, frontend can handle this
                 return ParaphraseSeedsResponse(generated_seeds=[])
                 # Or raise error:
                 # raise HTTPException(
                 #    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                 #    detail="LLM did not generate any valid seeds after parsing and validation."
                 # )

            return ParaphraseSeedsResponse(generated_seeds=parsed_seeds)

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama API timed out while generating paraphrased seeds."
        )
    except HTTPException as e:
        # Re-raise HTTPExceptions directly
        raise e
    except Exception as e:
        print(f"Unexpected error during seed paraphrasing: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}"
        )