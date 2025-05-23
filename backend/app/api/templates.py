from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..core.security import get_current_user
from ..api.models import User, Template
from ..api.schemas import TemplateCreate, TemplateRead, TemplateUpdate

router = APIRouter()


@router.get("/templates", response_model=List[TemplateRead])
async def get_templates(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get all non-archived templates
    """
    templates = session.exec(
        select(Template).where(Template.archived == False)
    ).all()
    
    return templates


@router.post("/templates", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    template: TemplateCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Create a new template
    """
    db_template = Template.from_orm(template)
    
    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    
    return db_template


@router.get("/templates/{template_id}", response_model=TemplateRead)
async def get_template(
    template_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get a specific template by ID
    """
    template = session.get(Template, template_id)
    
    if not template or template.archived:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return template


@router.put("/templates/{template_id}", response_model=TemplateRead)
async def update_template(
    template_id: int,
    template_update: TemplateUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Update a template
    """
    db_template = session.get(Template, template_id)
    
    if not db_template or db_template.archived:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Update fields if provided
    template_data = template_update.dict(exclude_unset=True)
    
    for key, value in template_data.items():
        setattr(db_template, key, value)
    
    # Explicitly handle None for model_override if provided
    if template_update.model_override is None and 'model_override' in template_update.__fields_set__:
        db_template.model_override = None

    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    
    return db_template


@router.put("/templates/{template_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_template(
    template_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Archive a template (soft delete)
    """
    db_template = session.get(Template, template_id)
    
    if not db_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    db_template.archived = True
    
    session.add(db_template)
    session.commit()
    
    return None


@router.get("/templates/{template_id}/history", response_model=List[str])
async def get_template_history(
    template_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get recent system prompts used with this template (last 10, deduped)
    """
    # Here we would typically fetch examples associated with this template
    # In the current architecture, examples are associated with datasets, not templates
    # So we'll return a placeholder (this would need to be revisited later)
    
    return ["Example system prompt for history"]  # Placeholder