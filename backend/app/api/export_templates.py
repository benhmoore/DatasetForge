from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select, col
from datetime import datetime, timezone

from ..db import get_session
from ..core.security import get_current_user
from ..api.models import User, ExportTemplate
from ..api.schemas import (
    ExportTemplateCreate,
    ExportTemplateRead,
    ExportTemplateUpdate,
    ExportTemplatePagination
)

router = APIRouter()


@router.get("/export_templates", response_model=ExportTemplatePagination)
async def get_export_templates(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    include_archived: bool = Query(False),
    format_name: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get all export templates (global templates + user's custom templates)
    """
    # Global templates (no owner_id) and user's templates
    query = select(ExportTemplate).where(
        (ExportTemplate.owner_id == None) | (ExportTemplate.owner_id == user.id)
    )
    
    # Filter by archived status if not including archived
    if not include_archived:
        query = query.where(ExportTemplate.archived == False)
    
    # Filter by format_name if provided
    if format_name:
        query = query.where(ExportTemplate.format_name == format_name)
    
    # Count total for pagination
    total_query = select(col(ExportTemplate.id)).where(
        (ExportTemplate.owner_id == None) | (ExportTemplate.owner_id == user.id)
    )
    
    if not include_archived:
        total_query = total_query.where(ExportTemplate.archived == False)
    
    if format_name:
        total_query = total_query.where(ExportTemplate.format_name == format_name)
    
    total = len(session.exec(total_query).all())
    
    # Add pagination
    query = query.offset((page - 1) * size).limit(size)
    
    # Execute query
    templates = session.exec(query).all()
    
    return {
        "items": templates,
        "total": total
    }


@router.post("/export_templates", response_model=ExportTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_export_template(
    template: ExportTemplateCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Create a new export template
    """
    # If marking as default, unmark any other default templates with the same format_name
    if template.is_default:
        existing_defaults = session.exec(
            select(ExportTemplate).where(
                (ExportTemplate.format_name == template.format_name) &
                (ExportTemplate.is_default == True) &
                ((ExportTemplate.owner_id == user.id) | (ExportTemplate.owner_id == None))
            )
        ).all()
        
        for existing in existing_defaults:
            existing.is_default = False
            session.add(existing)
    
    # Create the new template
    db_template = ExportTemplate(
        name=template.name,
        description=template.description,
        format_name=template.format_name,
        template=template.template,
        is_default=template.is_default,
        owner_id=user.id,
        created_at=datetime.now(timezone.utc),
        archived=False
    )
    
    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    
    return db_template


@router.get("/export_templates/{template_id}", response_model=ExportTemplateRead)
async def get_export_template(
    template_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Get a specific export template by ID
    """
    template = session.get(ExportTemplate, template_id)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export template not found"
        )
    
    # Check ownership if not a global template
    if template.owner_id is not None and template.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this template"
        )
    
    return template


@router.put("/export_templates/{template_id}", response_model=ExportTemplateRead)
async def update_export_template(
    template_id: int,
    template_update: ExportTemplateUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Update an export template
    """
    db_template = session.get(ExportTemplate, template_id)
    
    if not db_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export template not found"
        )
    
    # Check ownership - only the owner can update
    if db_template.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this template"
        )
    
    # Update template fields
    update_data = template_update.dict(exclude_unset=True)
    
    # If making this template the default, unmark other defaults with the same format_name
    if update_data.get("is_default") and update_data["is_default"] and not db_template.is_default:
        # Get the format name (either from the update or the existing template)
        format_name = update_data.get("format_name", db_template.format_name)
        
        existing_defaults = session.exec(
            select(ExportTemplate).where(
                (ExportTemplate.format_name == format_name) &
                (ExportTemplate.is_default == True) &
                (ExportTemplate.id != template_id) &
                ((ExportTemplate.owner_id == user.id) | (ExportTemplate.owner_id == None))
            )
        ).all()
        
        for existing in existing_defaults:
            existing.is_default = False
            session.add(existing)
    
    # Update fields
    for key, value in update_data.items():
        setattr(db_template, key, value)
    
    session.add(db_template)
    session.commit()
    session.refresh(db_template)
    
    return db_template


@router.put("/export_templates/{template_id}/archive")
async def archive_export_template(
    template_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Archive (or unarchive) an export template
    """
    template = session.get(ExportTemplate, template_id)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export template not found"
        )
    
    # Check ownership - only the owner can archive/unarchive
    if template.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this template"
        )
    
    # Toggle archive status
    template.archived = not template.archived
    
    # If archiving a default template, unmark it as default
    if template.archived and template.is_default:
        template.is_default = False
    
    session.add(template)
    session.commit()
    
    return {"success": True}