"""
Graph registry: build GraphDefinition from template_id using existing templates.
No hardcoded generation logic; runner asks registry for the graph for the selected template.
"""
from typing import Optional

from src.core import storage
from src.core.models import Template

from .models import GraphDefinition, NodeDefinition, NODE_TYPE_SECTION_GENERATOR


def get_graph_definition(template_id: str) -> Optional[GraphDefinition]:
    """
    Return the graph definition for the given template_id.
    Loads template from storage and converts sections to nodes (one-to-one).
    """
    template = storage.get_template(template_id)
    if template is None:
        return None
    return _template_to_graph(template)


def _template_to_graph(template: Template) -> GraphDefinition:
    """Convert a Template to a GraphDefinition. One section -> one section_generator node."""
    nodes: list[NodeDefinition] = []
    for s in template.sections:
        nodes.append(
            NodeDefinition(
                id=s.id,
                label=s.display_name or s.id,
                node_type=s.section_type or NODE_TYPE_SECTION_GENERATOR,
                prompt_path=s.prompt_path,
                depends_on=list(s.depends_on),
                input_keys=[],  # filled from context in executor
                output_key=s.id,
                config={},
            )
        )
    return GraphDefinition(
        id=template.id,
        label=template.name,
        template_id=template.id,
        nodes=nodes,
    )
