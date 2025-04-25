from sqlmodel import SQLModel, Field, JSON, Column
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any


class Template(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    system_prompt: str
    user_prompt: str
    # New mask fields
    system_prompt_mask: Optional[str] = None
    user_prompt_mask: Optional[str] = None
    slots: List[str] = Field(sa_column=Column(JSON))
    archived: bool = False
    tool_definitions: Optional[List[Dict[str, Any]]] = Field(
        default=None, sa_column=Column(JSON)
    )
    is_tool_calling_template: bool = Field(default=False)
    model_override: Optional[str] = Field(default=None)
    model_parameters: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON)
    )  # Added model parameters


class Dataset(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    archived: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Example(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="dataset.id")
    system_prompt: str
    user_prompt: str  # Store user prompt with slot values replaced
    # New mask fields for examples
    system_prompt_mask: Optional[str] = None
    user_prompt_mask: Optional[str] = None
    slots: Dict[str, str] = Field(sa_column=Column(JSON))
    output: str
    tool_calls: Optional[List[Dict[str, Any]]] = Field(
        default=None, sa_column=Column(JSON)
    )
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ExportTemplate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str
    format_name: str = Field(
        index=True
    )  # e.g., "mlx-chat", "mlx-instruct", "tool-calling"
    template: str  # Jinja2-style template for formatting each example
    is_default: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    archived: bool = False


class Workflow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    description: Optional[str] = None
    data: Dict[str, Any] = Field(sa_column=Column(JSON), default={})
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    version: int = Field(default=1)