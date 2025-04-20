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
    query = build_export_templates_query(user.id, include_archived, format_name)
    total_query = build_export_templates_count_query(user.id, include_archived, format_name)
    
    # Get the total count for pagination
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
    # If marking as default, unmark any other default templates
    if template.is_default:
        unmark_existing_default_templates(session, template.format_name, user.id)
    
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
    db_template = get_template_with_owner_check(session, template_id, user.id)
    
    # Update default status if needed
    update_default_status(session, db_template, template_update)
    
    # Update fields
    update_template_fields(db_template, template_update)
    
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
    template = get_template_with_owner_check(session, template_id, user.id)
    
    # Toggle archive status
    template.archived = not template.archived
    
    # If archiving a default template, unmark it as default
    if template.archived and template.is_default:
        template.is_default = False
    
    session.add(template)
    session.commit()
    
    return {"success": True}


# Helper Functions

def build_export_templates_query(user_id: int, include_archived: bool, format_name: Optional[str]):
    """Build the query for retrieving export templates."""
    # Global templates (no owner_id) and user's templates
    query = select(ExportTemplate).where(
        (ExportTemplate.owner_id == None) | (ExportTemplate.owner_id == user_id)
    )
    
    # Filter by archived status if not including archived
    if not include_archived:
        query = query.where(ExportTemplate.archived == False)
    
    # Filter by format_name if provided
    if format_name:
        query = query.where(ExportTemplate.format_name == format_name)
    
    return query


def build_export_templates_count_query(user_id: int, include_archived: bool, format_name: Optional[str]):
    """Build the query for counting export templates."""
    # Start with the base condition for access control
    count_query = select(col(ExportTemplate.id)).where(
        (ExportTemplate.owner_id == None) | (ExportTemplate.owner_id == user_id)
    )
    
    # Add filters
    if not include_archived:
        count_query = count_query.where(ExportTemplate.archived == False)
    
    if format_name:
        count_query = count_query.where(ExportTemplate.format_name == format_name)
    
    return count_query


def unmark_existing_default_templates(session: Session, format_name: str, user_id: int):
    """Unmark existing default templates with the same format name."""
    existing_defaults = session.exec(
        select(ExportTemplate).where(
            (ExportTemplate.format_name == format_name) &
            (ExportTemplate.is_default == True) &
            ((ExportTemplate.owner_id == user_id) | (ExportTemplate.owner_id == None))
        )
    ).all()
    
    for existing in existing_defaults:
        existing.is_default = False
        session.add(existing)


def get_template_with_owner_check(session: Session, template_id: int, user_id: int) -> ExportTemplate:
    """Get a template and check that the user is the owner."""
    template = session.get(ExportTemplate, template_id)
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export template not found"
        )
    
    # Check ownership - only the owner can update/archive
    if template.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this template"
        )
    
    return template


def update_default_status(session: Session, db_template: ExportTemplate, template_update: ExportTemplateUpdate):
    """Update the default status of a template, handling related templates."""
    update_data = template_update.dict(exclude_unset=True)
    
    # If making this template the default, unmark other defaults with the same format_name
    if update_data.get("is_default") and update_data["is_default"] and not db_template.is_default:
        # Get the format name (either from the update or the existing template)
        format_name = update_data.get("format_name", db_template.format_name)
        
        unmark_other_default_templates(session, format_name, db_template.id, db_template.owner_id)


def unmark_other_default_templates(session: Session, format_name: str, current_id: int, owner_id: int):
    """Unmark other default templates with the same format name."""
    existing_defaults = session.exec(
        select(ExportTemplate).where(
            (ExportTemplate.format_name == format_name) &
            (ExportTemplate.is_default == True) &
            (ExportTemplate.id != current_id) &
            ((ExportTemplate.owner_id == owner_id) | (ExportTemplate.owner_id == None))
        )
    ).all()
    
    for existing in existing_defaults:
        existing.is_default = False
        session.add(existing)


def update_template_fields(db_template: ExportTemplate, template_update: ExportTemplateUpdate):
    """Update template fields from the update request."""
    update_data = template_update.dict(exclude_unset=True)
    
    # Update fields
    for key, value in update_data.items():
        setattr(db_template, key, value)