"""
Orchestration domain models: node definition, graph definition, node run, graph run, execution context.
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# Node types (extensible; only section_generator and assembler are executed in Phase 1)
NODE_TYPE_CONTEXT = "context"
NODE_TYPE_SECTION_GENERATOR = "section_generator"
NODE_TYPE_ASSEMBLER = "assembler"
NODE_TYPE_EVALUATION = "evaluation"
NODE_TYPE_TRANSFORM = "transform"
NODE_TYPE_VALIDATION = "validation"
NODE_TYPE_COMPONENT_CONTEXT = "component_context"
NODE_TYPE_RETRIEVAL = "retrieval"


class NodeDefinition(BaseModel):
    """Reusable node in a graph: id, type, optional prompt_path, dependencies, input/output keys."""

    id: str
    label: Optional[str] = None
    node_type: str = NODE_TYPE_SECTION_GENERATOR
    prompt_path: Optional[str] = None
    depends_on: list[str] = Field(default_factory=list)
    input_keys: list[str] = Field(default_factory=list)
    output_key: Optional[str] = None
    version: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)


class GraphDefinition(BaseModel):
    """Document generation graph: id, template_id, ordered nodes."""

    id: str
    label: Optional[str] = None
    template_id: str
    version: Optional[str] = None
    nodes: list[NodeDefinition] = Field(default_factory=list)


class NodeRun(BaseModel):
    """Execution record for one node: status, timestamps, inputs, output, optional prompt_text."""

    node_id: str
    status: str = "pending"  # pending | running | completed | failed
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    inputs: dict[str, Any] = Field(default_factory=dict)
    output: Optional[str] = None
    error: Optional[str] = None
    prompt_text: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphRun(BaseModel):
    """Execution state for a full graph run. Wraps run_id and node runs."""

    graph_id: str
    run_id: str
    node_runs: list[NodeRun] = Field(default_factory=list)
    status: str = "pending"
    assembled_output: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExecutionContext(BaseModel):
    """
    Shared context passed through the graph. Contains user input and prior node outputs.
    to_prompt_dict() produces the dict expected by prompt_loader (topic, jurisdiction, context, previous_sections).
    """

    topic: str = ""
    jurisdiction: str = ""
    context: str = ""
    component: Optional[str] = None
    solution_type: Optional[str] = None
    client_name: Optional[str] = None
    node_outputs: dict[str, str] = Field(default_factory=dict, description="node_id -> content string")

    def to_prompt_dict(self, section_ids: list[str], previous_section_ids: Optional[list[str]] = None) -> dict[str, Any]:
        """
        Build the prompt substitution dict. previous_section_ids is the list of section ids
        that come before the current one (in section_ids order); their outputs are concatenated as previous_sections.
        """
        out: dict[str, Any] = {
            "topic": self.topic,
            "jurisdiction": self.jurisdiction,
            "context": self.context,
        }
        if self.component is not None:
            out["component"] = self.component
        if self.client_name is not None:
            out["client_name"] = self.client_name
        ids_for_prev = previous_section_ids if previous_section_ids is not None else []
        parts = [self.node_outputs.get(nid, "").strip() for nid in ids_for_prev if self.node_outputs.get(nid)]
        out["previous_sections"] = "\n\n".join(parts)
        return out

    @classmethod
    def from_structured_input(cls, structured_input: dict[str, Any]) -> "ExecutionContext":
        """Build context from API structured_input (topic, jurisdiction, context, component, etc.)."""
        return cls(
            topic=structured_input.get("topic", ""),
            jurisdiction=structured_input.get("jurisdiction", ""),
            context=structured_input.get("context", ""),
            component=structured_input.get("component") or None,
            solution_type=structured_input.get("solution_type") or None,
            client_name=structured_input.get("client_name") or None,
        )
