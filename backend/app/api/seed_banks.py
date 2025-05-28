from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Optional, Any
from sqlmodel import Session, select, func
from ..db import get_session

router = APIRouter()
from ..api.models import SeedBank, Seed, Template
from ..api.schemas import (
    SeedBankCreate, 
    SeedBankRead, 
    SeedBankUpdate, 
    SeedBankWithSeeds,
    SeedBankPagination,
    SeedCreate,
    SeedRead,
    SeedUpdate
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/seed_banks", response_model=SeedBankRead)
def create_seed_bank(seed_bank: SeedBankCreate, session: Session = Depends(get_session)):
    """
    Create a new seed bank.
    """
    # Check if template exists
    template = session.get(Template, seed_bank.template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {seed_bank.template_id} not found"
        )
    
    # Create new seed bank
    db_seed_bank = SeedBank(
        name=seed_bank.name,
        template_id=seed_bank.template_id,
        description=seed_bank.description
    )
    
    session.add(db_seed_bank)
    session.commit()
    session.refresh(db_seed_bank)
    
    return db_seed_bank

@router.get("/seed_banks", response_model=SeedBankPagination)
def get_seed_banks(
    template_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """
    Get all seed banks with pagination.
    Optional filtering by template_id.
    """
    query = select(SeedBank)
    
    # Filter by template if specified
    if template_id:
        query = query.where(SeedBank.template_id == template_id)
    
    # Count total for pagination
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()
    
    # Apply pagination
    offset = (page - 1) * size
    query = query.offset(offset).limit(size)
    
    # Execute query
    seed_banks = session.exec(query).all()
    
    return {
        "items": seed_banks,
        "total": total
    }

@router.get("/seed_banks/{seed_bank_id}", response_model=SeedBankWithSeeds)
def get_seed_bank(
    seed_bank_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session)
):
    """
    Get a specific seed bank with its seeds, paginated.
    """
    seed_bank = session.get(SeedBank, seed_bank_id)
    if not seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Get seeds with pagination
    query = select(Seed).where(Seed.seed_bank_id == seed_bank_id)
    offset = (page - 1) * size
    query = query.offset(offset).limit(size)
    seeds = session.exec(query).all()
    
    # Create response with both seed bank and seeds
    result = SeedBankWithSeeds.from_orm(seed_bank)
    result.seeds = seeds
    
    return result

@router.put("/seed_banks/{seed_bank_id}", response_model=SeedBankRead)
def update_seed_bank(
    seed_bank_id: int,
    seed_bank_update: SeedBankUpdate,
    session: Session = Depends(get_session)
):
    """
    Update a seed bank.
    """
    db_seed_bank = session.get(SeedBank, seed_bank_id)
    if not db_seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Update fields
    for key, value in seed_bank_update.dict(exclude_unset=True).items():
        setattr(db_seed_bank, key, value)
    
    session.add(db_seed_bank)
    session.commit()
    session.refresh(db_seed_bank)
    
    return db_seed_bank

@router.delete("/seed_banks/{seed_bank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seed_bank(seed_bank_id: int, session: Session = Depends(get_session)):
    """
    Delete a seed bank and all its seeds.
    """
    db_seed_bank = session.get(SeedBank, seed_bank_id)
    if not db_seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Delete all seeds in this seed bank
    seeds_query = select(Seed).where(Seed.seed_bank_id == seed_bank_id)
    seeds = session.exec(seeds_query).all()
    for seed in seeds:
        session.delete(seed)
    
    # Delete the seed bank
    session.delete(db_seed_bank)
    session.commit()
    
    return None

# SEED ENDPOINTS

@router.post("/seed_banks/{seed_bank_id}/seeds", response_model=List[SeedRead])
def create_seeds(
    seed_bank_id: int,
    seeds: List[Dict[str, str]],
    session: Session = Depends(get_session)
):
    """
    Add multiple seeds to a seed bank.
    Each seed is a dictionary of slot values.
    """
    # Check if seed bank exists
    seed_bank = session.get(SeedBank, seed_bank_id)
    if not seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Get template to validate slots
    template = session.get(Template, seed_bank.template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {seed_bank.template_id} not found"
        )
    
    # Create seeds
    created_seeds = []
    for seed_slots in seeds:
        # Validate that all required slots are present
        for slot in template.slots:
            if slot not in seed_slots:
                seed_slots[slot] = ""  # Default to empty string for missing slots
        
        # Filter out any slots that aren't in the template
        valid_slots = {k: v for k, v in seed_slots.items() if k in template.slots}
        
        # Create the seed
        db_seed = Seed(
            seed_bank_id=seed_bank_id,
            slots=valid_slots
        )
        
        session.add(db_seed)
        created_seeds.append(db_seed)
    
    session.commit()
    
    # Refresh all seeds to get their IDs
    for seed in created_seeds:
        session.refresh(seed)
    
    return created_seeds

@router.get("/seed_banks/{seed_bank_id}/seeds", response_model=List[SeedRead])
def get_seeds(
    seed_bank_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session)
):
    """
    Get seeds for a specific seed bank with pagination.
    """
    # Check if seed bank exists
    seed_bank = session.get(SeedBank, seed_bank_id)
    if not seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Get seeds with pagination
    query = select(Seed).where(Seed.seed_bank_id == seed_bank_id)
    offset = (page - 1) * size
    query = query.offset(offset).limit(size)
    seeds = session.exec(query).all()
    
    return seeds

@router.put("/seeds/{seed_id}", response_model=SeedRead)
def update_seed(
    seed_id: int,
    seed_update: SeedUpdate,
    session: Session = Depends(get_session)
):
    """
    Update a seed.
    """
    db_seed = session.get(Seed, seed_id)
    if not db_seed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed with ID {seed_id} not found"
        )
    
    # Get seed bank and template to validate slots
    seed_bank = session.get(SeedBank, db_seed.seed_bank_id)
    if not seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {db_seed.seed_bank_id} not found"
        )
    
    template = session.get(Template, seed_bank.template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {seed_bank.template_id} not found"
        )
    
    # Update slots, ensuring they're valid for the template
    if seed_update.slots:
        # Filter out any slots that aren't in the template
        valid_slots = {k: v for k, v in seed_update.slots.items() if k in template.slots}
        
        # Merge with existing slots
        updated_slots = db_seed.slots.copy()
        updated_slots.update(valid_slots)
        
        db_seed.slots = updated_slots
    
    session.add(db_seed)
    session.commit()
    session.refresh(db_seed)
    
    return db_seed

@router.delete("/seeds/{seed_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seed(seed_id: int, session: Session = Depends(get_session)):
    """
    Delete a seed.
    """
    db_seed = session.get(Seed, seed_id)
    if not db_seed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed with ID {seed_id} not found"
        )
    
    session.delete(db_seed)
    session.commit()
    
    return None

@router.delete("/seed_banks/{seed_bank_id}/seeds", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_seeds(seed_bank_id: int, session: Session = Depends(get_session)):
    """
    Delete all seeds in a seed bank.
    """
    # Check if seed bank exists
    seed_bank = session.get(SeedBank, seed_bank_id)
    if not seed_bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seed bank with ID {seed_bank_id} not found"
        )
    
    # Delete all seeds in this seed bank
    seeds_query = select(Seed).where(Seed.seed_bank_id == seed_bank_id)
    seeds = session.exec(seeds_query).all()
    for seed in seeds:
        session.delete(seed)
    
    session.commit()
    
    return None