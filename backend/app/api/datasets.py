from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import StreamingResponse
import io
import json
from datetime import datetime, timezone
from sqlmodel import Session, select, col

from ..db import get_session
from ..core.security import get_current_user, derive_encryption_key
from ..core.encryption import encrypt_data, decrypt_data, generate_salt
from ..api.models import User, Dataset, Example
from ..api.schemas import (
    DatasetCreate,
    DatasetRead,
    DatasetPagination,
    ExampleCreate,
    ExampleRead,
    ExamplePagination,
)

router = APIRouter()


@router.get("/datasets", response_model=DatasetPagination)
async def get_datasets(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get all datasets owned by the user (paginated)
    """
    # Build and execute query
    query, total = build_datasets_query(session, user.id, include_archived, page, size)
    datasets = session.exec(query).all()

    return {"items": datasets, "total": total}


@router.post(
    "/datasets", response_model=DatasetRead, status_code=status.HTTP_201_CREATED
)
async def create_dataset(
    dataset: DatasetCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new dataset
    """
    # Generate a salt for this dataset's encryption
    salt = generate_salt()

    # Create the dataset
    db_dataset = Dataset(
        name=dataset.name,
        owner_id=user.id,
        salt=salt,
        archived=False,
        created_at=datetime.now(timezone.utc),
    )

    session.add(db_dataset)
    session.commit()
    session.refresh(db_dataset)

    return db_dataset


@router.get(
  "/datasets/{dataset_id}",
  response_model=DatasetRead,
  status_code=status.HTTP_200_OK
)
async def get_dataset(
  dataset_id: int,
  user: User = Depends(get_current_user),
  session: Session = Depends(get_session)
):
    """
    Get a single dataset by ID
    """
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)
    return dataset


@router.put("/datasets/{dataset_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_dataset(
    dataset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Archive a dataset (soft delete)
    """
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)
    
    # Toggle archive status
    dataset.archived = not dataset.archived

    session.add(dataset)
    session.commit()

    return None


@router.get("/datasets/{dataset_id}/examples", response_model=ExamplePagination)
async def get_examples(
    dataset_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(
        None, description="Search term for filtering examples"
    ),
    sort_by: Optional[str] = Query(
        None, description="Field to sort by (id, system_prompt, output, or slot)"
    ),
    sort_direction: Optional[str] = Query(
        "asc", description="Sort direction (asc or desc)"
    ),
    slot_name: Optional[str] = Query(
        None, description="Slot name to sort by when sort_by=slot"
    ),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get examples from a dataset (paginated)
    """
    # Verify dataset exists and user owns it
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)

    # Build query for examples
    query, total, examples = get_examples_with_filters(
        session=session, 
        dataset_id=dataset_id,
        search=search,
        sort_by=sort_by,
        sort_direction=sort_direction,
        slot_name=slot_name,
        page=page,
        size=size
    )

    # Return the examples (not decrypting since encryption is a placeholder)
    return {"items": examples, "total": total}


@router.post("/datasets/{dataset_id}/examples", status_code=status.HTTP_204_NO_CONTENT)
async def add_examples(
    dataset_id: int,
    examples: List[ExampleCreate],
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Add examples to a dataset
    """
    # Verify dataset exists and user owns it
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)

    # Get encryption key (placeholder in current implementation)
    key = derive_encryption_key(
        user_password="",  # Placeholder
        user_salt=dataset.salt,
    )

    # Create and add examples
    db_examples = create_example_objects(dataset_id, examples)
    
    session.add_all(db_examples)
    session.commit()

    return None


@router.put("/datasets/{dataset_id}/examples/{example_id}")
async def update_example(
    dataset_id: int,
    example_id: int,
    example_data: ExampleCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Update an example in a dataset
    """
    # Verify dataset exists and user owns it
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)

    # Find the example
    example = get_example_in_dataset(session, example_id, dataset_id)

    # Update example fields
    update_example_fields(example, example_data)

    session.add(example)
    session.commit()
    session.refresh(example)

    return example


@router.delete("/datasets/{dataset_id}/examples")
async def delete_examples(
    dataset_id: int,
    example_ids: List[int] = Body(..., embed=True),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Delete examples from a dataset
    """
    # Verify dataset exists and user owns it
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)

    # Delete examples that match both dataset_id and are in the example_ids list
    deleted_count = delete_examples_from_dataset(session, dataset_id, example_ids)

    return {"deleted_count": deleted_count}


@router.get("/datasets/{dataset_id}/export")
async def export_dataset(
    dataset_id: int,
    template_id: Optional[int] = Query(
        None, description="The export template ID to use for formatting"
    ),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Export a dataset as JSONL with optional template formatting
    """
    # Import here to avoid circular imports
    from jinja2 import Template as JinjaTemplate

    # Verify dataset exists and user owns it
    dataset = get_dataset_with_owner_check(session, dataset_id, user.id)

    # Get encryption key (placeholder in current implementation)
    key = derive_encryption_key(
        user_password="",  # Placeholder
        user_salt=dataset.salt,
    )

    # Get all examples in this dataset
    examples = session.exec(
        select(Example).where(Example.dataset_id == dataset_id)
    ).all()

    # Check for export template if ID provided
    export_template = None
    if template_id is not None:
        export_template = get_export_template(session, template_id, user.id)

    # Create a JSONL stream
    return StreamingResponse(
        generate_jsonl_export(dataset, examples, export_template),
        media_type="application/jsonl",
        headers={"Content-Disposition": f"attachment; filename={get_export_filename(dataset, export_template)}.jsonl"},
    )


# Helper Functions

def build_datasets_query(session: Session, user_id: int, include_archived: bool, page: int, size: int):
    """Build query for datasets with pagination"""
    # Base query filtering by owner
    query = select(Dataset).where(Dataset.owner_id == user_id)

    # Add archived filter if needed
    if not include_archived:
        query = query.where(Dataset.archived == False)

    # Count total for pagination
    total_query = select(col(Dataset.id)).where(Dataset.owner_id == user_id)
    if not include_archived:
        total_query = total_query.where(Dataset.archived == False)

    total = len(session.exec(total_query).all())

    # Add pagination
    query = query.offset((page - 1) * size).limit(size)
    
    return query, total


def get_dataset_with_owner_check(session: Session, dataset_id: int, user_id: int) -> Dataset:
    """Get dataset and verify ownership"""
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    if dataset.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this dataset"
        )
        
    return dataset


def get_examples_with_filters(
    session: Session, 
    dataset_id: int, 
    search: Optional[str],
    sort_by: Optional[str],
    sort_direction: Optional[str],
    slot_name: Optional[str],
    page: int,
    size: int
):
    """Get examples with filtering, sorting and pagination"""
    # Base query filtering by dataset
    query = select(Example).where(Example.dataset_id == dataset_id)
    
    # Add search filter if provided
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Example.system_prompt.ilike(search_term))
            | (Example.output.ilike(search_term))
        )
    
    # Count total with search applied for pagination
    count_query = select(col(Example.id)).where(Example.dataset_id == dataset_id)
    if search:
        search_term = f"%{search}%"
        count_query = count_query.where(
            (Example.system_prompt.ilike(search_term))
            | (Example.output.ilike(search_term))
        )
    
    total = len(session.exec(count_query).all())
    
    # Add SQL sorting for standard fields
    if sort_by:
        if sort_by == "id":
            query = query.order_by(Example.id.desc() if sort_direction == "desc" else Example.id)
        elif sort_by == "system_prompt":
            query = query.order_by(Example.system_prompt.desc() if sort_direction == "desc" else Example.system_prompt)
        elif sort_by == "output":
            query = query.order_by(Example.output.desc() if sort_direction == "desc" else Example.output)
        # We'll handle 'slot' sorting after fetching the results
    
    # Add pagination
    query = query.offset((page - 1) * size).limit(size)
    
    # Execute query
    examples = session.exec(query).all()
    
    # Sort by slots if needed (this has to be done in memory)
    if sort_by == "slot" and slot_name:
        examples = sorted(
            examples,
            key=lambda ex: str(ex.slots.get(slot_name, "")).lower(),
            reverse=(sort_direction == "desc")
        )
        
    return query, total, examples


def get_example_in_dataset(session: Session, example_id: int, dataset_id: int) -> Example:
    """Get an example that belongs to a specific dataset"""
    example = session.get(Example, example_id)
    
    if not example or example.dataset_id != dataset_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Example not found in dataset"
        )
        
    return example


def update_example_fields(example: Example, example_data: ExampleCreate):
    """Update example fields from provided data"""
    example.system_prompt = example_data.system_prompt
    example.user_prompt = example_data.user_prompt
    example.system_prompt_mask = example_data.system_prompt_mask
    example.user_prompt_mask = example_data.user_prompt_mask
    example.slots = example_data.slots
    example.output = example_data.output
    example.tool_calls = example_data.tool_calls
    example.updated_at = datetime.now(timezone.utc)


def delete_examples_from_dataset(session: Session, dataset_id: int, example_ids: List[int]) -> int:
    """Delete examples that belong to a dataset"""
    deleted_count = 0
    for example_id in example_ids:
        example = session.get(Example, example_id)
        if example and example.dataset_id == dataset_id:
            session.delete(example)
            deleted_count += 1
    
    session.commit()
    return deleted_count


def create_example_objects(dataset_id: int, examples: List[ExampleCreate]) -> List[Example]:
    """Create Example objects from ExampleCreate schemas"""
    now = datetime.now(timezone.utc)
    db_examples = []
    
    for example_data in examples:
        example = Example(
            dataset_id=dataset_id,
            system_prompt=example_data.system_prompt,
            user_prompt=example_data.user_prompt,
            system_prompt_mask=example_data.system_prompt_mask,
            user_prompt_mask=example_data.user_prompt_mask,
            slots=example_data.slots,
            output=example_data.output,
            tool_calls=example_data.tool_calls,
            timestamp=now,
            created_at=now,
            updated_at=now,
        )
        db_examples.append(example)
        
    return db_examples


def get_export_template(session, template_id: int, user_id: int):
    """Get export template with owner check"""
    from .models import ExportTemplate
    
    export_template = session.get(ExportTemplate, template_id)
    
    if not export_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export template not found",
        )
    
    # Check if user has access to this template
    if export_template.owner_id is not None and export_template.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to use this export template",
        )
        
    return export_template


def get_export_filename(dataset: Dataset, export_template=None):
    """Get export filename based on dataset and optional template"""
    filename = f"dataset-{dataset.id}"
    if export_template:
        # Add format name to filename
        filename += f"-{export_template.format_name}"
    return filename


async def generate_jsonl_export(dataset: Dataset, examples: List[Example], export_template=None):
    """Generate JSONL export with optional template formatting"""
    from jinja2 import Template as JinjaTemplate
    
    for example in examples:
        try:
            if export_template:
                # Use the template for formatting
                try:
                    # Create context with all example fields and additional metadata
                    context = {
                        # Use mask values if available, otherwise use actual prompts
                        "system_prompt": example.system_prompt_mask if example.system_prompt_mask else example.system_prompt,
                        "user_prompt": example.user_prompt_mask if example.user_prompt_mask else example.user_prompt,
                        "slots": example.slots,
                        "output": example.output,
                        "timestamp": example.timestamp.isoformat(),
                        "dataset_name": dataset.name,
                        "dataset_id": dataset.id,
                        "example_id": example.id,
                    }

                    # Include tool calls if present
                    if example.tool_calls:
                        context["tool_calls"] = example.tool_calls

                    # Apply template and yield the formatted line
                    template = JinjaTemplate(export_template.template)
                    rendered = template.render(**context)
                    yield rendered + "\n"

                except Exception as e:
                    # If template rendering fails, yield error information
                    error_record = {
                        "error": f"Template rendering failed: {str(e)}",
                        "example_id": example.id,
                    }
                    yield json.dumps(error_record) + "\n"
            else:
                # Use default format
                record = {
                    "system_prompt": example.system_prompt_mask if example.system_prompt_mask else example.system_prompt,
                    "user_prompt": example.user_prompt_mask if example.user_prompt_mask else example.user_prompt,
                    "slots": example.slots,
                    "output": example.output,
                    "timestamp": example.timestamp.isoformat(),
                }

                # Include tool calls if present
                if example.tool_calls:
                    record["tool_calls"] = example.tool_calls

                yield json.dumps(record) + "\n"
        except Exception as e:
            # Handle any unexpected errors while generating
            error_record = {
                "error": f"Error processing example: {str(e)}",
                "example_id": example.id,
            }
            yield json.dumps(error_record) + "\n"