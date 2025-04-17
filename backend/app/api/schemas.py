from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime


# User schemas
class UserPreferences(BaseModel):
    name: str
    default_gen_model: str
    default_para_model: str


class UserPreferencesUpdate(BaseModel):
    default_gen_model: str
    default_para_model: str


# Template schemas
class TemplateBase(BaseModel):
    name: str
    system_prompt: str
    user_prompt: str
    slots: List[str]
    tool_definitions: Optional[List[Dict[str, Any]]] = None
    is_tool_calling_template: bool = False


class TemplateCreate(TemplateBase):
    pass


class TemplateRead(TemplateBase):
    id: int
    archived: bool


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None
    slots: Optional[List[str]] = None


# Dataset schemas
class DatasetCreate(BaseModel):
    name: str


class DatasetRead(BaseModel):
    id: int
    name: str
    created_at: datetime
    archived: bool


class DatasetPagination(BaseModel):
    items: List[DatasetRead]
    total: int


# Example schemas
class ExampleBase(BaseModel):
    system_prompt: str
    slots: Dict[str, str]
    output: str
    tool_calls: Optional[List[Dict[str, Any]]] = None


class ExampleCreate(ExampleBase):
    pass


class ExampleRead(ExampleBase):
    id: int
    dataset_id: int
    timestamp: datetime


class ExamplePagination(BaseModel):
    items: List[ExampleRead]
    total: int


# Export Template schemas
class ExportTemplateBase(BaseModel):
    name: str
    description: str
    format_name: str
    template: str
    is_default: bool = False


class ExportTemplateCreate(ExportTemplateBase):
    pass


class ExportTemplateRead(ExportTemplateBase):
    id: int
    owner_id: Optional[int] = None
    created_at: datetime
    archived: bool


class ExportTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    format_name: Optional[str] = None
    template: Optional[str] = None
    is_default: Optional[bool] = None


class ExportTemplatePagination(BaseModel):
    items: List[ExportTemplateRead]
    total: int


# Generation schemas
class GenerationRequest(BaseModel):
    template_id: int
    slots: Dict[str, str]
    count: int = Field(default=3, ge=1, le=10)
    instruction: Optional[str] = None


class GenerationResult(BaseModel):
    variation: str
    output: str
    slots: Dict[str, str]
    processed_prompt: str  # Add this field to include the processed user prompt
    tool_calls: Optional[List[Dict[str, Any]]] = None


# Paraphrase schemas
class ParaphraseRequest(BaseModel):
    text: str
    count: int = Field(default=3, ge=1, le=10)


# Export schemas
class ExportRequest(BaseModel):
    template_id: Optional[int] = None
