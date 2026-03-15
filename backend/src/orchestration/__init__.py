"""
Minimal orchestration layer for document generation.
Graph-based execution with typed nodes; compatible with existing template/section pipeline.
"""
from .executor import execute_run, execute_single_node
from .graphs import get_graph_definition
from .models import (
    ExecutionContext,
    GraphDefinition,
    GraphRun,
    NodeDefinition,
    NodeRun,
)

from .prompt_validation import validate_template_prompts

__all__ = [
    "ExecutionContext",
    "execute_run",
    "execute_single_node",
    "GraphDefinition",
    "GraphRun",
    "NodeDefinition",
    "NodeRun",
    "get_graph_definition",
    "validate_template_prompts",
]
