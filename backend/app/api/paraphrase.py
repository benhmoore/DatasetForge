from typing import List, Dict, Any, Optional, Tuple
import random
import re
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
import httpx
import json
import asyncio  # Import asyncio for potential parallelization later if needed
from pydantic import BaseModel, Field

from ..core.config import settings
from ..api.models import Template
from ..api.schemas import SeedData
from ..db import get_session

router = APIRouter()


class SeedData(BaseModel):
    slots: Dict[str, str]


class ParaphraseRequest(BaseModel):
    template_id: int
    seeds: List[SeedData]
    count: Optional[int] = Field(
        default=3, ge=1, le=20, description="Number of new seeds to generate"
    )
    instructions: Optional[str] = Field(
        default=None, max_length=500, description="Additional instructions for the AI"
    )


class ParaphraseResponse(BaseModel):
    generated_seeds: List[SeedData]


# New models for paraphrasing generation outputs
class TextParaphraseRequest(BaseModel):
    text: str
    count: Optional[int] = Field(
        default=3, ge=1, le=10, description="Number of paraphrases to generate"
    )
    instructions: Optional[str] = Field(
        default=None, max_length=500, description="Additional instructions for the AI"
    )


class TextParaphraseResponse(BaseModel):
    paraphrases: List[str]


@router.post("/paraphrase", response_model=ParaphraseResponse)
async def paraphrase_seeds(
    request: ParaphraseRequest, session: Session = Depends(get_session)
):
    """Generate new seeds by paraphrasing existing ones, one request per seed, updating context."""
    if not settings.DEFAULT_PARA_MODEL:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set DEFAULT_PARA_MODEL in the .env file.",
        )

    if len(request.seeds) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one seed is required for paraphrasing.",
        )

    # Fetch the template to get slot names
    template = session.get(Template, request.template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with id {request.template_id} not found.",
        )

    slot_names = template.slots
    if not slot_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template has no slots defined.",
        )

    num_to_generate = request.count
    # Start with the initial seeds provided in the request
    current_seed_pool = [seed.slots for seed in request.seeds]
    generated_seeds_list = []  # Store the SeedData objects for the final response

    # --- Construct the Base System Prompt (asking for ONE seed) ---
    system_prompt_base = (
        "You are an AI assistant that generates structured data. Your task is to create ONE new seed example based on provided ones. "
        "The seed example MUST be a JSON object containing specific keys (slots). "
        f"The required slots for the object are: {json.dumps(slot_names)}. "
        "You will be given existing examples. Generate ONE new, distinct example that follows the exact same JSON structure and is different from the provided examples. "  # Added emphasis on difference
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
                json.dumps(
                    current_seed_pool, indent=2
                ),  # Use the current pool of seeds
                "\nOutput ONLY the new example as a single JSON object below:",
            ]
            user_prompt = "\n".join(user_prompt_parts)
            # --- End User Prompt Construction ---

            try:
                response = await client.post(
                    f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                    json={
                        "model": settings.DEFAULT_PARA_MODEL,
                        "temperature": 0.5,
                        "prompt": user_prompt,  # Use the dynamically generated user prompt
                        "system": system_prompt,
                        "stream": False,
                        "format": "json",
                    },
                    timeout=settings.OLLAMA_TIMEOUT,
                )

                if response.status_code != 200:
                    error_detail = (
                        f"Ollama API error on seed {i+1} ({response.status_code})"
                    )
                    try:
                        error_detail += (
                            f": {response.json().get('error', response.text)}"
                        )
                    except json.JSONDecodeError:
                        error_detail += f": {response.text}"
                    print(f"Error generating seed {i+1}: {error_detail}")
                    continue  # Skip to the next iteration

                result_text = response.json().get("response", "")

                # --- Parse the SINGLE LLM Response ---
                try:
                    generated_data = json.loads(result_text)

                    if not isinstance(generated_data, dict):
                        raise ValueError(
                            f"LLM response for seed {i+1} is not a JSON object."
                        )

                    # Validate the single object
                    missing_slots = [
                        slot for slot in slot_names if slot not in generated_data
                    ]
                    if missing_slots:
                        print(
                            f"Warning: Skipping generated seed {i+1} due to missing slots: {missing_slots}. Item: {generated_data}"
                        )
                        continue

                    # Create the seed using only the expected slots, converting values to string
                    seed_slots = {
                        slot: str(generated_data.get(slot, "")) for slot in slot_names
                    }

                    # Add the newly generated slots to the pool for the next iteration
                    current_seed_pool.append(seed_slots)

                    # Store the validated SeedData object for the final response
                    parsed_seed = SeedData(slots=seed_slots)
                    generated_seeds_list.append(parsed_seed)
                    print(f"Successfully generated and parsed seed {i+1}.")

                except (json.JSONDecodeError, ValueError) as e:
                    print(
                        f"Error parsing or validating LLM JSON response for seed {i+1}: {e}\nRaw response: {result_text}"
                    )
                    continue
                # --- End Response Parsing ---

            except httpx.TimeoutException:
                print(f"Ollama API timed out while generating seed {i+1}. Skipping.")
                continue
            except Exception as e:
                print(f"Unexpected error generating seed {i+1}: {e}. Skipping.")
                continue

    print(
        f"Finished generation. Total seeds generated: {len(generated_seeds_list)} out of {num_to_generate} requested."
    )
    if not generated_seeds_list and num_to_generate > 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate any valid seeds after {num_to_generate} attempts. Check backend logs for details.",
        )

    return ParaphraseResponse(generated_seeds=generated_seeds_list)


@router.post("/paraphrase_text", response_model=TextParaphraseResponse)
async def paraphrase_text(request: TextParaphraseRequest):
    """Generate varied, natural paraphrases of a given text using advanced diversity techniques."""
    if not settings.DEFAULT_PARA_MODEL:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Default paraphrase model is not set. Please set DEFAULT_PARA_MODEL in the .env file.",
        )

    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text to paraphrase cannot be empty.",
        )

    # Define paraphrasing parameters
    num_requested = request.count
    # Generate extra candidates to enable diversity filtering
    num_to_generate = max(num_requested * 2, num_requested + 5)
    max_retries = 3  # Per candidate

    # Helper function to calculate text similarity
    def calculate_similarity(text1: str, text2: str) -> float:
        """Calculate similarity between two texts using word overlap and structure."""
        # Normalize text
        text1 = re.sub(r"[^\w\s]", "", text1.lower())
        text2 = re.sub(r"[^\w\s]", "", text2.lower())

        # Word overlap (Jaccard similarity)
        words1 = set(text1.split())
        words2 = set(text2.split())
        if not words1 or not words2:
            return 1.0 if not words1 and not words2 else 0.0

        overlap = len(words1.intersection(words2))
        total = len(words1.union(words2))
        jaccard = overlap / total if total > 0 else 1.0

        # Length similarity (penalize similar lengths)
        len_ratio = (
            min(len(text1), len(text2)) / max(len(text1), len(text2))
            if max(len(text1), len(text2)) > 0
            else 1.0
        )

        # N-gram similarity for structure
        def get_ngrams(text, n):
            tokens = text.split()
            return [" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]

        # Use bigram similarity to detect similar structure
        bigrams1 = Counter(get_ngrams(text1, 2))
        bigrams2 = Counter(get_ngrams(text2, 2))

        # Calculate cosine similarity of bigram distributions
        common_bigrams = set(bigrams1.keys()) & set(bigrams2.keys())
        dot_product = sum(bigrams1[x] * bigrams2[x] for x in common_bigrams)

        mag1 = sum(val**2 for val in bigrams1.values()) ** 0.5
        mag2 = sum(val**2 for val in bigrams2.values()) ** 0.5

        bigram_sim = dot_product / (mag1 * mag2) if mag1 > 0 and mag2 > 0 else 0

        # Combined similarity score (weighted)
        combined_sim = (jaccard * 0.5) + (len_ratio * 0.2) + (bigram_sim * 0.3)
        return combined_sim

    # Diversity style variations to cycle through
    style_variations = [
        "Make this paraphrase more conversational and informal.",
        "Create a more formal, academic-sounding paraphrase.",
        "Write this paraphrase using more concise, direct language.",
        "Use more expressive, descriptive language in this version.",
        "Restructure the sentence completely while maintaining meaning.",
        "Change the perspective or voice (active/passive) in this paraphrase.",
        "Use more sophisticated vocabulary and complex sentence structures.",
        "Simplify the language while preserving all key information.",
    ]

    # Example text for demonstrating diverse paraphrases
    example_original = "The quick brown fox jumps over the lazy dog."
    example_paraphrases = [
        "A swift auburn-colored fox leaped across the inactive canine.",
        "The dog, quite lazy in nature, had a fast-moving fox jump right over it.",
        "Displaying remarkable speed, a brown fox cleared the idle dog with a single bound.",
        "While the dog was resting lazily, a quick-moving fox with brown fur jumped over it.",
    ]

    # Base system prompt
    base_system_prompt = (
        "You are an AI assistant that specializes in creative paraphrasing. "
        "For each paraphrase request, you should:\n"
        "1. Identify the core meaning and intent of the original text\n"
        "2. Completely restructure the sentence patterns\n"
        "3. Use substantially different vocabulary and expressions\n"
        "4. Vary between formal/informal, active/passive, and simple/complex structures\n"
        "5. Consider altering the perspective or framing while maintaining the meaning\n\n"
        "Your paraphrases should feel natural and human-written, not like simple synonym replacements. "
        "Respond ONLY with the paraphrased text, nothing else."
    )

    # Add additional instructions if provided
    if request.instructions:
        base_system_prompt += f"\n\nAdditional Instructions: {request.instructions}"

    # Create pools for candidates and final selections
    candidates = []
    generated_paraphrases = []
    unique_id_counter = 0  # For tracking candidates

    async with httpx.AsyncClient() as client:
        print(f"PHASE 1: Generating {num_to_generate} candidate paraphrases...")

        # First phase: Generate candidates
        generation_tasks = []

        for i in range(num_to_generate):
            # Create a task for each candidate generation
            task = generate_candidate(
                client=client,
                text=request.text,
                candidate_id=i,
                base_system_prompt=base_system_prompt,
                style_variations=style_variations,
                example_original=example_original,
                example_paraphrases=example_paraphrases,
                max_retries=max_retries,
                settings=settings,
            )
            generation_tasks.append(task)

        # Run all generation tasks concurrently with a 10-second buffer
        candidates_results = await asyncio.gather(
            *generation_tasks, return_exceptions=True
        )

        # Process results, filtering out exceptions
        for result in candidates_results:
            if isinstance(result, tuple) and len(result) == 2:
                candidate_id, candidate_text = result
                if candidate_text and isinstance(candidate_text, str):
                    candidates.append((candidate_id, candidate_text))
                    print(f"Added candidate {candidate_id}: {candidate_text[:50]}...")
            elif isinstance(result, Exception):
                print(f"Generation task failed: {str(result)}")

        print(
            f"Generated {len(candidates)} valid candidates out of {num_to_generate} attempts"
        )

        # Phase 1b: dedupe
        # 1. exact-match removal
        seen_exact = set()
        unique_candidates = []
        for cid, text in candidates:
            t = text.strip()
            if t not in seen_exact:
                seen_exact.add(t)
                unique_candidates.append((cid, t))

        # 2. near-duplicate removal (similarity >= SIM_THRESH)
        SIM_THRESH = 0.9
        pruned = []
        for cid, text in unique_candidates:
            if not any(
                calculate_similarity(text, kept) >= SIM_THRESH for _, kept in pruned
            ):
                pruned.append((cid, text))

        texts = [text for _, text in pruned]
        print(f"After deduplication: {len(texts)} candidates remain")

        # Second phase: Select diverse subset using greedy diversity algorithm
        if texts:  # Check if any candidates remain after deduplication
            print(
                f"PHASE 2: Selecting {num_requested} diverse paraphrases from {len(texts)} candidates..."
            )
            selected_paraphrases = select_diverse_paraphrases(
                candidates=texts,  # Use the deduplicated list
                original_text=request.text,
                num_to_select=num_requested,
                similarity_function=calculate_similarity,
            )

            # Log selections
            for i, paraphrase in enumerate(selected_paraphrases):
                print(f"Selected paraphrase {i+1}: {paraphrase[:50]}...")
                generated_paraphrases.append(paraphrase)
        else:
            print(
                "No candidates remaining after deduplication."
            )  # Handle case where all candidates were duplicates

    print(
        f"Finished generation. Total paraphrases selected: {len(generated_paraphrases)} out of {num_requested} requested."
    )

    if not generated_paraphrases and num_requested > 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate any valid paraphrases. Check backend logs for details.",
        )

    return TextParaphraseResponse(paraphrases=generated_paraphrases)


async def generate_candidate(
    client: httpx.AsyncClient,
    text: str,
    candidate_id: int,
    base_system_prompt: str,
    style_variations: List[str],
    example_original: str,
    example_paraphrases: List[str],
    max_retries: int,
    settings: Any,
) -> Tuple[int, str]:
    """Generate a single candidate paraphrase with retries."""
    for retry in range(max_retries + 1):
        try:
            # Calculate randomized parameters
            temperature = 0.7 + (0.3 * retry / max_retries) + (random.random() * 0.2)
            top_p = max(0.75, 0.9 - (0.05 * retry))
            frequency_penalty = 0.7 + (0.1 * retry)
            presence_penalty = 0.7 + (0.1 * retry)

            # Select style variation based on candidate and retry
            style_idx = (candidate_id + retry) % len(style_variations)
            style_guidance = style_variations[style_idx]

            # Build enhanced system prompt for this attempt
            enhanced_system_prompt = (
                base_system_prompt
                + f"\n\nFor this specific paraphrase: {style_guidance}"
            )

            # Add examples if this is a retry
            if retry > 0:
                # Select 2 random examples
                example_indices = random.sample(
                    range(len(example_paraphrases)), min(2, len(example_paraphrases))
                )
                example_prompt = (
                    "\n\nHere are examples of diverse paraphrases that show significant variation:\n"
                    f"Original: {example_original}\n"
                )
                for i, idx in enumerate(example_indices):
                    example_prompt += f"Paraphrase {i+1}: {example_paraphrases[idx]}\n"

                example_prompt += (
                    "Your paraphrase should be equally creative and distinct."
                )
                enhanced_system_prompt += example_prompt

                # Add guidance on what to avoid for retries
                enhanced_system_prompt += (
                    f"\n\nIMPORTANT: This is retry #{retry+1}. Your previous attempts were not "
                    f"diverse enough. For this attempt, focus on:\n"
                    f"- Using completely different sentence structures\n"
                    f"- Changing the perspective or order of information\n"
                    f"- Replacing most or all key terms with different expressions\n"
                    f"- {'Using more complex phrasing' if retry % 2 == 0 else 'Using simpler, clearer phrasing'}"
                )

            # User prompt remains simple
            user_prompt = f"Paraphrase the following text:\n\n{text}\n\nProvide only the paraphrased version."

            # Make API request with dynamic parameters
            response = await client.post(
                f"http://{settings.OLLAMA_HOST}:{settings.OLLAMA_PORT}/api/generate",
                json={
                    "model": settings.DEFAULT_PARA_MODEL,
                    "temperature": temperature,
                    "top_p": top_p,
                    "frequency_penalty": frequency_penalty,
                    "presence_penalty": presence_penalty,
                    "prompt": user_prompt,
                    "system": enhanced_system_prompt,
                    "stream": False,
                },
                timeout=settings.OLLAMA_TIMEOUT,
            )

            if response.status_code != 200:
                error_detail = f"Ollama API error on candidate {candidate_id} retry {retry} ({response.status_code})"
                try:
                    error_detail += f": {response.json().get('error', response.text)}"
                except json.JSONDecodeError:
                    error_detail += f": {response.text}"
                print(f"Error: {error_detail}")
                continue

            result_text = response.json().get("response", "").strip()

            # Basic validation
            if not result_text or len(result_text) < 10:
                print(
                    f"Candidate {candidate_id} retry {retry}: Empty or too short result"
                )
                continue

            return (candidate_id, result_text)

        except (httpx.TimeoutException, Exception) as e:
            print(f"Error generating candidate {candidate_id} retry {retry}: {str(e)}")
            continue

    # If all retries failed, return empty string
    return (candidate_id, "")


def select_diverse_paraphrases(
    candidates: List[str], original_text: str, num_to_select: int, similarity_function
) -> List[str]:
    """Select a diverse subset of paraphrases from candidates using greedy algorithm."""
    if not candidates:
        return []

    if len(candidates) <= num_to_select:
        return candidates

    selected = []
    remaining = candidates.copy()

    # Calculate similarity to original for all candidates
    orig_similarities = [
        (i, similarity_function(original_text, candidate))
        for i, candidate in enumerate(remaining)
    ]

    # Sort by similarity to original (prioritize moderate similarity - not too similar, not too different)
    target_similarity = (
        0.5  # We want paraphrases that are different but maintain meaning
    )
    orig_similarities.sort(key=lambda x: abs(x[1] - target_similarity))

    # Select first candidate (moderately similar to original)
    first_idx = orig_similarities[0][0]
    selected.append(remaining[first_idx])
    del remaining[first_idx]

    # Greedy selection for rest - prioritize maximum diversity from already selected
    while len(selected) < num_to_select and remaining:
        max_min_distance = -1
        best_idx = -1

        # For each remaining candidate
        for i, candidate in enumerate(remaining):
            # Calculate minimum similarity to any already selected paraphrase
            min_similarity = min(
                similarity_function(candidate, sel) for sel in selected
            )

            # Calculate similarity to original (to ensure we don't drift too far)
            orig_sim = similarity_function(candidate, original_text)

            # Combined score: prioritize diversity from selected while maintaining meaning
            # Lower is better for similarity, but we want some relation to original
            # Ideal: low similarity to selected but moderate similarity to original
            diversity_score = min_similarity - (
                0.3 * (1 - abs(orig_sim - target_similarity))
            )

            if best_idx == -1 or diversity_score < max_min_distance:
                max_min_distance = diversity_score
                best_idx = i

        if best_idx != -1:
            selected.append(remaining[best_idx])
            del remaining[best_idx]
        else:
            break

    return selected
