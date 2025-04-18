from pydantic import BaseModel, Field, validator
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


# Model Parameters schema
class ModelParameters(BaseModel):
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    max_tokens: Optional[int] = Field(default=None, ge=1)

    # Add validator to ensure at least one field is not None if the object is provided?
    # Or handle defaults/merging logic in the endpoint/service layer.
    # For now, allow all fields to be optional.


# Template schemas
class TemplateBase(BaseModel):
    name: str
    system_prompt: str
    user_prompt: str
    system_prompt_mask: Optional[str] = None
    user_prompt_mask: Optional[str] = None
    slots: List[str]
    tool_definitions: Optional[List[Dict[str, Any]]] = None
    is_tool_calling_template: bool = False
    model_override: Optional[str] = None
    model_parameters: Optional[ModelParameters] = None  # Added model parameters


class TemplateCreate(TemplateBase):
    pass


class TemplateRead(TemplateBase):
    id: int
    archived: bool


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None
    system_prompt_mask: Optional[str] = None
    user_prompt_mask: Optional[str] = None
    slots: Optional[List[str]] = None
    tool_definitions: Optional[List[Dict[str, Any]]] = None
    is_tool_calling_template: Optional[bool] = None
    model_override: Optional[str] = None
    model_parameters: Optional[ModelParameters] = None  # Added model parameters


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
    user_prompt: str  # Added user prompt with slot values replaced
    system_prompt_mask: Optional[str] = None
    user_prompt_mask: Optional[str] = None
    slots: Dict[str, str]
    output: str
    tool_calls: Optional[List[Dict[str, Any]]] = None


class ExampleCreate(ExampleBase):
    pass


class ExampleRead(ExampleBase):
    id: int
    dataset_id: int
    timestamp: datetime
    created_at: datetime  # Added created_at
    updated_at: datetime  # Added updated_at


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
class SeedData(BaseModel):
    slots: Dict[str, str]
    # Optional instruction per seed could be added later if needed
    # instruction: Optional[str] = None 


class GenerationRequest(BaseModel):
    template_id: int
    seeds: List[SeedData]  # Changed from slots: Dict[str, str]
    count: int = Field(default=3, ge=1, le=10)  # Count per seed
    # Global instruction applied to all seeds in the request
    instruction: Optional[str] = None 


class GenerationResult(BaseModel):
    template_id: int # Add template_id
    seed_index: int  # Index of the seed in the request list
    variation_index: int  # Index of the variation for this seed (0 to count-1)
    variation: str  # Combined identifier (e.g., "Seed 1 / Variation 2")
    output: str
    slots: Dict[str, str]  # Slots used for this specific generation
    processed_prompt: str
    system_prompt: Optional[str] = None
    system_prompt_mask: Optional[str] = None
    user_prompt_mask: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


# Paraphrase schemas
class ParaphraseRequest(BaseModel):
    text: str
    count: int = Field(default=3, ge=1, le=10)


class ParaphraseSeedsRequest(BaseModel):
    template_id: int
    seeds: List[SeedData] # Reuses SeedData from Generation schemas
    # Optional: Add a count for how many new seeds to generate
    # count: int = Field(default=3, ge=1, le=5) 


class ParaphraseSeedsResponse(BaseModel):
    generated_seeds: List[SeedData] # Returns a list of new seeds


# Export schemas
class ExportRequest(BaseModel):
    template_id: Optional[int] = None