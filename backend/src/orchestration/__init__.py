"""
Minimal orchestration layer for document generation.
Graph-based execution with typed nodes; compatible with existing template/section pipeline.
"""
from .executor import GraphExecutor
from .graphs import get_graph_definition
from .models import (
    ExecutionContext,
    GraphDefinition,
    GraphRun,
    NodeDefinition,
    NodeRun,
)

__all__ = [
    "ExecutionContext",
    "GraphDefinition",
    "GraphExecutor",
    "GraphRun",
    "NodeDefinition",
    "NodeRun",
    "get_graph_definition",
]
