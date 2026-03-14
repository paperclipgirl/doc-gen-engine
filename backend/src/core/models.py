"""
Backend domain models. All shapes align with the API contract.
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class TemplateSection(BaseModel):
    """One section in a template: id, prompt_path, optional display_name, dependencies, optional progress message, optional section_type (e.g. meta for review passes)."""

    id: str
    prompt_path: str
    display_name: Optional[str] = None
    depends_on: list[str] = Field(default_factory=list, description="Section ids that must complete before this section runs. Empty = no deps. For now execution is still list-ordered; later runner can use this for dependency-based order.")
    progress_message: Optional[str] = None
    section_type: Optional[str] = None  # e.g. "meta" for review/design-review sections


class Template(BaseModel):
    """Document type loaded from templates/{id}.json."""

    id: str
    name: str
    description: Optional[str] = None
    sections: list[TemplateSection] = Field(default_factory=list)


class GenerationRequest(BaseModel):
    """User input for a new run. Body of POST /runs."""

    template_id: str
    structured_input: dict[str, Any] = Field(default_factory=dict)


class GenerationRun(BaseModel):
    """A single generation run. Persisted as run dir + meta.json."""

    run_id: str
    template_id: str
    structured_input: dict[str, Any] = Field(default_factory=dict)
    status: str = "pending"  # pending | running | completed | failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    section_ids: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    current_section_id: Optional[str] = None


class SectionOutput(BaseModel):
    """One section's result. Stored as runs/{run_id}/sections/{section_id}.md."""

    section_id: str
    content: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssembledDocument(BaseModel):
    """Final document for a run. Stored as runs/{run_id}/assembled.md."""

    run_id: str
    content: str
    assembled_at: datetime = Field(default_factory=datetime.utcnow)


class VersionSnapshot(BaseModel):
    """Point-in-time view for run/version history. Used by GET /runs and GET /runs/{id}/versions."""

    run_id: str
    template_id: str
    created_at: datetime
    updated_at: datetime
    section_count: int = 0
    label: Optional[str] = None
