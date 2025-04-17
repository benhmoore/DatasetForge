from pydantic import BaseModel, Field
from typing import List, Dict, Optional
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
    variation_prompt: str
    slots: Dict[str, str]
    output: str


class ExampleCreate(ExampleBase):
    pass


class ExampleRead(ExampleBase):
    id: int
    dataset_id: int
    timestamp: datetime


class ExamplePagination(BaseModel):
    items: List[ExampleRead]
    total: int


# Generation schemas
class GenerationRequest(BaseModel):
    template_id: int
    slots: Dict[str, str]
    count: int = Field(default=3, ge=1, le=10)


class GenerationResult(BaseModel):
    variation: str
    output: str
    slots: Dict[str, str]


# Paraphrase schemas
class ParaphraseRequest(BaseModel):
    text: str
    count: int = Field(default=3, ge=1, le=10)