from typing import List, Dict, AsyncGenerator, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
import httpx
import logging
import json
import asyncio
from math import ceil

from ..db import get_session
from ..core.config import settings
from ..api.generate import call_ollama_generate, extract_tool_calls_from_text
from ..api.models import Template, SeedBank, Seed
from ..api.schemas import (
    GenerationRequest,
    GenerationResult,
    SeedData,
    ModelParameters,
    BatchGenerationRequest,
)

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/batch_generate")
async def batch_generate(
    request: BatchGenerationRequest,
    session: Session = Depends(get_session),
) -> StreamingResponse:
    """
    Generate outputs using a template with batched processing for large seed banks.
    Streams results for better memory management.
    """
    # Get the template
    template = session.get(Template, request.template_id)
    if not template or template.archived:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    # Get seeds - check if we should load from seed bank or use provided seeds
    if request.seed_bank_id:
        # Load seeds from the seed bank with pagination
        query = select(Seed).where(Seed.seed_bank_id == request.seed_bank_id)
        
        # Add pagination
        offset = (request.page - 1) * request.batch_size
        limit = request.batch_size
        
        query = query.offset(offset).limit(limit)
        seeds = session.exec(query).all()
        
        # Convert to SeedData format
        seed_data_list = [SeedData(slots=seed.slots) for seed in seeds]
    else:
        # Use provided seed list
        seed_data_list = request.seeds
        
        # Apply pagination if needed
        if request.batch_size > 0:
            start = (request.page - 1) * request.batch_size
            end = start + request.batch_size
            seed_data_list = seed_data_list[start:end]

    # If no seeds at this page, return empty results
    if not seed_data_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"No seeds found for page {request.page} with batch size {request.batch_size}"
        )

    # Determine the model to use
    generation_model = template.model_override or settings.DEFAULT_GEN_MODEL

    # Check if a model is available
    if not generation_model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No generation model specified. Set a default model in .env file or override it in the template.",
        )

    # Extract template-specific model parameters
    template_model_params: Optional[ModelParameters] = None
    if template.model_parameters:
        try:
            template_model_params = ModelParameters.parse_obj(template.model_parameters)
        except Exception as e:
            logger.warning(
                f"Failed to parse model_parameters for template {template.id}: {e}. Using defaults."
            )

    # Define the async generator function for streaming
    async def stream_results() -> AsyncGenerator[str, None]:
        # Iterate through each seed in this batch
        for seed_index, seed_data in enumerate(seed_data_list):
            global_seed_index = ((request.page - 1) * request.batch_size) + seed_index
            current_slots = seed_data.slots

            # Check if all required slots are present
            for slot in template.slots:
                if slot not in current_slots:
                    error_message = f"Missing value for slot '{slot}' in seed {global_seed_index + 1}"
                    logger.warning(error_message)
                    # Send error result
                    for i in range(request.count):
                        error_result = GenerationResult(
                            template_id=request.template_id,
                            seed_index=global_seed_index,
                            variation_index=i,
                            variation=f"Seed {global_seed_index + 1} / Variation {i + 1}",
                            output=f"[Error: {error_message}]",
                            slots=current_slots,
                            processed_prompt="",
                            system_prompt=template.system_prompt,
                            system_prompt_mask=template.system_prompt_mask,
                            user_prompt_mask=template.user_prompt_mask,
                        )
                        yield error_result.json() + "\n"
                    continue

            # Replace slots in the template for the current seed
            user_prompt = template.user_prompt
            for slot, value in current_slots.items():
                pattern = "{" + slot + "}"
                user_prompt = user_prompt.replace(pattern, value)

            # Generate 'count' variations for the current seed
            # Use asyncio.gather to process variations for this seed in parallel
            variation_tasks = []
            for i in range(request.count):
                task = asyncio.create_task(
                    generate_variation(
                        template,
                        generation_model,
                        template_model_params,
                        global_seed_index,
                        i,
                        user_prompt,
                        current_slots,
                        request.instruction
                    )
                )
                variation_tasks.append(task)
            
            # Process variations in parallel
            variation_results = await asyncio.gather(*variation_tasks)
            
            # Stream results
            for result in variation_results:
                yield result.json() + "\n"
                await asyncio.sleep(0.01)  # Small sleep to allow context switching

    # Return the streaming response
    return StreamingResponse(stream_results(), media_type="application/x-ndjson")

async def generate_variation(
    template: Template,
    model: str,
    template_params: Optional[ModelParameters],
    seed_index: int,
    variation_index: int,
    user_prompt: str,
    slots: Dict[str, str],
    instruction: Optional[str] = None
) -> GenerationResult:
    """
    Generate a single variation and return a GenerationResult.
    This function is designed to be used with asyncio.gather to process multiple variations in parallel.
    """
    variation_label = f"Seed {seed_index + 1} / Variation {variation_index + 1}"
    
    try:
        # Start with the base system prompt
        system_prompt = template.system_prompt
        
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
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            template=template,
            template_params=template_params,
            is_tool_calling=template.is_tool_calling_template,
            tools=(
                template.tool_definitions
                if template.is_tool_calling_template
                else None
            ),
        )
        
        output = ollama_response.get("response", "").strip()
        tool_calls = None
        
        # --- Tool Call Handling Logic ---
        if template.is_tool_calling_template:
            # 1. Check for structured tool calls from Ollama response first
            structured_tool_calls = ollama_response.get("tool_calls")
            if (
                structured_tool_calls
                and isinstance(structured_tool_calls, list)
                and len(structured_tool_calls) > 0
            ):
                logger.info(
                    f"Using structured tool_calls directly from Ollama response for {variation_label}"
                )
                tool_calls = structured_tool_calls
            else:
                # 2. If no structured calls, try extracting from the text response
                logger.info(
                    f"No structured tool_calls found in Ollama response for {variation_label}. Attempting to extract from text."
                )
                extracted_calls = extract_tool_calls_from_text(output)
                if extracted_calls:
                    logger.info(
                        f"Successfully extracted tool calls from text response for {variation_label}"
                    )
                    tool_calls = extracted_calls
                else:
                    logger.warning(
                        f"Could not extract tool calls from text response for {variation_label}"
                    )
        # --- End Tool Call Handling Logic ---
        
        result = GenerationResult(
            template_id=template.id,
            seed_index=seed_index,
            variation_index=variation_index,
            variation=variation_label,
            output=output,
            slots=slots,
            processed_prompt=user_prompt,
            tool_calls=tool_calls if tool_calls else None,
            system_prompt=system_prompt,
            system_prompt_mask=template.system_prompt_mask,
            user_prompt_mask=template.user_prompt_mask,
        )
        
        return result
        
    except httpx.TimeoutException:
        error_detail = "Ollama API timed out. Please try again."
        logger.error(f"{variation_label}: {error_detail}")
        return GenerationResult(
            template_id=template.id,
            seed_index=seed_index,
            variation_index=variation_index,
            variation=variation_label,
            output=f"[{error_detail}]",
            slots=slots,
            processed_prompt=user_prompt,
            system_prompt=system_prompt,
            system_prompt_mask=template.system_prompt_mask,
            user_prompt_mask=template.user_prompt_mask,
        )
        
    except Exception as e:
        error_detail = f"Error generating variation: {str(e)}"
        logger.exception(f"{variation_label}: {error_detail}")
        return GenerationResult(
            template_id=template.id,
            seed_index=seed_index,
            variation_index=variation_index,
            variation=variation_label,
            output=f"[Error: {error_detail}]",
            slots=slots,
            processed_prompt=user_prompt,
            system_prompt=system_prompt,
            system_prompt_mask=template.system_prompt_mask,
            user_prompt_mask=template.user_prompt_mask,
        )

@router.get("/get_batch_info/{seed_bank_id}")
async def get_batch_info(
    seed_bank_id: int,
    batch_size: int = 10,
    session: Session = Depends(get_session)
):
    """
    Get information about the number of batches required for a given seed bank.
    """
    # Verify the seed bank exists
    seed_bank = session.get(SeedBank, seed_bank_id)
    if not seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Count total seeds
    count_query = select(Seed).where(Seed.seed_bank_id == seed_bank_id)
    seeds = session.exec(count_query).all()
    total_seeds = len(seeds)
    
    # Calculate batches
    total_batches = ceil(total_seeds / batch_size)
    
    return {
        "seed_bank_id": seed_bank_id,
        "seed_bank_name": seed_bank.name,
        "total_seeds": total_seeds,
        "batch_size": batch_size,
        "total_batches": total_batches,
    }