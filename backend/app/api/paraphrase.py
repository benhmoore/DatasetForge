from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
import httpx

from ..core.security import get_current_user
from ..core.config import settings
from ..api.models import User
from ..api.schemas import ParaphraseRequest

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