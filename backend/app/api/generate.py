from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import httpx
import logging
from pydantic import ValidationError

from ..db import get_session
from ..core.security import get_current_user
from ..core.config import settings
from ..api.models import User, Template
from ..api.schemas import GenerationRequest, GenerationResult

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/models", response_model=List[str])
async def list_models(
    user: User = Depends(get_current_user)
):
    """
    List available models from Ollama
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/tags",
                timeout=settings.OLLAMA_TIMEOUT
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to get models from Ollama: {response.text}"
                )
            
            # Extract model names from response
            models = [model["name"] for model in response.json().get("models", [])]
            return models
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ollama API timed out while fetching models"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get models: {str(e)}"
        )


@router.post("/generate", response_model=List[GenerationResult])
async def generate_outputs(
    request: GenerationRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Generate outputs using a template and Ollama model
    """
    # Log the incoming request for debugging
    instruction = getattr(request, 'instruction', None)
    
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Validate that all required slots are provided
    for slot in template.slots:
        if slot not in request.slots:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing value for slot '{slot}'"
            )
    
    # Replace slots in the template
    user_prompt = template.user_prompt
    for slot, value in request.slots.items():
        user_prompt = user_prompt.replace(f"{{{slot}}}", value)
    
    # Check if user has default generation model set
    if not user.default_gen_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default generation model is not set. Please set it in the settings."
        )
    
    # Generate responses
    results = []
    for i in range(request.count):
        variation = f"Variation {i+1}"
        
        try:
            # Start with the base system prompt
            system_prompt = template.system_prompt
            
            # Safely get instruction if it exists
            instruction = getattr(request, 'instruction', None)
            
            # Add instruction to system prompt if provided
            if instruction and instruction.strip():
                clean_instruction = instruction.strip()
                logger.info(f"⚠️ Adding instruction to system prompt: '{clean_instruction}'")
                
                # Format the system prompt with the instruction
                system_prompt = f"{template.system_prompt}\n\nAdditional instruction: {clean_instruction}"
                logger.info(f"✅ Final system prompt: '{system_prompt}'")
            else:
                logger.info(f"ℹ️ Using default system prompt (no instruction)")
            
            # Prepare API payload
            payload = {
                "model": user.default_gen_model,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": False
            }
            
            # Log the request being sent (truncated for readability)
            system_prompt_truncated = payload["system"][:100] + "..." if len(payload["system"]) > 100 else payload["system"]
            user_prompt_truncated = payload["prompt"][:100] + "..." if len(payload["prompt"]) > 100 else payload["prompt"]
            
            logger.info(f"Sending request to Ollama API:")
            logger.info(f"Model: {payload['model']}")
            logger.info(f"System prompt: {system_prompt_truncated}")
            logger.info(f"User prompt: {user_prompt_truncated}")
            
            # Call Ollama API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                    json=payload,
                    timeout=settings.OLLAMA_TIMEOUT
                )
                
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Ollama API returned an error: {response.text}"
                    )
                
                output = response.json().get("response", "")
                
                results.append({
                    "variation": variation,
                    "output": output,
                    "slots": request.slots  # Include the slots in the response
                })
                
        except httpx.TimeoutException:
            # Handle timeout by adding an error message to results
            results.append({
                "variation": variation,
                "output": "[Ollama API timed out. Please try again.]",
                "slots": request.slots  # Include the slots in the response
            })
            
        except Exception as e:
            # Handle other errors similarly
            results.append({
                "variation": variation,
                "output": f"[Error: {str(e)}]",
                "slots": request.slots  # Include the slots in the response
            })
    
    return results