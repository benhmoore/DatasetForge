from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import StreamingResponse
import io
import json
from datetime import datetime
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
    ExamplePagination
)

router = APIRouter()


@router.get("/datasets", response_model=DatasetPagination)
async def get_datasets(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get all datasets owned by the user (paginated)
    """
    query = select(Dataset).where(Dataset.owner_id == user.id)
    
    if not include_archived:
        query = query.where(Dataset.archived == False)
    
    # Count total for pagination
    total_query = select(col(Dataset.id)).where(Dataset.owner_id == user.id)
    if not include_archived:
        total_query = total_query.where(Dataset.archived == False)
    
    total = len(session.exec(total_query).all())
    
    # Add pagination
    query = query.offset((page - 1) * size).limit(size)
    
    # Execute query
    datasets = session.exec(query).all()
    
    return {
        "items": datasets,
        "total": total
    }


@router.post("/datasets", response_model=DatasetRead, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    dataset: DatasetCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
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
        created_at=datetime.utcnow()
    )
    
    session.add(db_dataset)
    session.commit()
    session.refresh(db_dataset)
    
    return db_dataset


@router.put("/datasets/{dataset_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_dataset(
    dataset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Archive a dataset (soft delete)
    """
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    # Check ownership
    if dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this dataset"
        )
    
    dataset.archived = not dataset.archived  # Toggle archive status
    
    session.add(dataset)
    session.commit()
    
    return None


@router.get("/datasets/{dataset_id}/examples", response_model=ExamplePagination)
async def get_examples(
    dataset_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get examples from a dataset (paginated)
    """
    # Verify dataset exists and user owns it
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    if dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this dataset"
        )
    
    # Get encryption key for decryption
    key = derive_encryption_key(
        user_password="",  # This would come from the request in a real implementation
        user_salt=dataset.salt
    )
    
    # Query for examples
    query = select(Example).where(Example.dataset_id == dataset_id)
    
    # Count total
    total = len(session.exec(select(col(Example.id)).where(Example.dataset_id == dataset_id)).all())
    
    # Add pagination
    query = query.offset((page - 1) * size).limit(size)
    
    # Execute query
    examples = session.exec(query).all()
    
    # Decrypt examples
    decrypted_examples = []
    for example in examples:
        # In a real implementation, decrypt fields using the key
        # This is a placeholder
        decrypted_examples.append(example)
    
    return {
        "items": decrypted_examples,
        "total": total
    }


@router.post("/datasets/{dataset_id}/examples", status_code=status.HTTP_204_NO_CONTENT)
async def add_examples(
    dataset_id: int,
    examples: List[ExampleCreate],
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Add examples to a dataset
    """
    # Verify dataset exists and user owns it
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    if dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this dataset"
        )
    
    # Get encryption key
    key = derive_encryption_key(
        user_password="",  # This would come from the request in a real implementation
        user_salt=dataset.salt
    )
    
    # Create and add examples
    db_examples = []
    for example_data in examples:
        # In a real implementation, encrypt fields using the key
        # For now, just create the example
        example = Example(
            dataset_id=dataset_id,
            system_prompt=example_data.system_prompt,
            variation_prompt=example_data.variation_prompt,
            slots=example_data.slots,
            output=example_data.output,
            timestamp=datetime.utcnow()
        )
        db_examples.append(example)
    
    session.add_all(db_examples)
    session.commit()
    
    return None


@router.put("/datasets/{dataset_id}/examples/{example_id}")
async def update_example(
    dataset_id: int,
    example_id: int,
    example_data: ExampleCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Update an example in a dataset
    """
    # Verify dataset exists and user owns it
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    if dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this dataset"
        )
    
    # Find the example
    example = session.get(Example, example_id)
    
    if not example or example.dataset_id != dataset_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Example not found in dataset"
        )
    
    # Update example fields
    example.system_prompt = example_data.system_prompt
    example.variation_prompt = example_data.variation_prompt
    example.slots = example_data.slots
    example.output = example_data.output
    
    session.add(example)
    session.commit()
    session.refresh(example)
    
    return example


@router.delete("/datasets/{dataset_id}/examples")
async def delete_examples(
    dataset_id: int,
    example_ids: List[int] = Body(..., embed=True),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Delete examples from a dataset
    """
    # Verify dataset exists and user owns it
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    if dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this dataset"
        )
    
    # Delete examples that match both dataset_id and are in the example_ids list
    deleted_count = 0
    for example_id in example_ids:
        example = session.get(Example, example_id)
        if example and example.dataset_id == dataset_id:
            session.delete(example)
            deleted_count += 1
    
    session.commit()
    
    return {"deleted_count": deleted_count}


@router.get("/datasets/{dataset_id}/export")
async def export_dataset(
    dataset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Export a dataset as JSONL
    """
    # Verify dataset exists and user owns it
    dataset = session.get(Dataset, dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    if dataset.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this dataset"
        )
    
    # Get encryption key
    key = derive_encryption_key(
        user_password="",  # This would come from the request in a real implementation
        user_salt=dataset.salt
    )
    
    # Get all examples in this dataset
    examples = session.exec(
        select(Example).where(Example.dataset_id == dataset_id)
    ).all()
    
    # Create a JSONL stream
    async def generate_jsonl():
        for example in examples:
            # In a real implementation, decrypt fields using the key
            # For now, just output as is
            record = {
                "system_prompt": example.system_prompt,
                "variation_prompt": example.variation_prompt,
                "slots": example.slots,
                "output": example.output,
                "timestamp": example.timestamp.isoformat()
            }
            yield json.dumps(record) + "\n"
    
    # Return streaming response
    return StreamingResponse(
        generate_jsonl(),
        media_type="application/jsonl",
        headers={
            "Content-Disposition": f"attachment; filename=dataset-{dataset_id}.jsonl"
        }
    )