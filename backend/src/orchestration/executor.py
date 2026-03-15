"""
Graph executor: load graph, resolve node order, execute nodes (section_generator -> prompt+LLM+write),
write NodeRun metadata per node, then assemble. Single entry point for full run and single-node rerun.

Section chaining: ctx.node_outputs is the authoritative in-memory execution state. Section output
must propagate to later sections via previous_sections (from to_prompt_dict). We never refill
ctx.node_outputs from storage during the main run loop—only the return value of run_section() is used.
Storage is for persistence only, not execution state.
"""
import logging
from datetime import datetime
from typing import Optional

from src.core import assembler, runner, storage
from src.core.models import Template

from .graphs import get_graph_definition
from .models import ExecutionContext, NODE_TYPE_SECTION_GENERATOR, NodeRun
from .prompt_validation import validate_template_prompts

logger = logging.getLogger(__name__)


def execute_run(
    run_id: str,
    template_id: str,
    structured_input: dict,
    model: Optional[str] = None,
    mock: bool = False,
    vector_store_id: Optional[str] = None,
) -> str:
    """
    Execute the graph for the given template_id: create run, run each section node in order,
    write node run metadata per section, assemble. Returns assembled content.
    Uses existing runner.run_section and assembler; adds NodeRun persistence (Option A).
    """
    graph = get_graph_definition(template_id)
    if graph is None:
        raise ValueError("Template not found: %s" % template_id)
    template = storage.get_template(template_id)
    if template is None:
        raise ValueError("Template not found: %s" % template_id)

    # Execution order: list order of graph nodes (later: topological from depends_on)
    node_ids = [n.id for n in graph.nodes]
    run = storage.create_run(run_id, template_id, structured_input, node_ids)
    run.status = "running"
    storage.update_run_meta(run)

    validate_template_prompts(template_id)

    ctx = ExecutionContext.from_structured_input(structured_input)
    try:
        previous_parts: list[str] = []
        for i, node in enumerate(graph.nodes):
            run = storage.get_run(run_id)
            if run is not None:
                run.current_section_id = node.id
                storage.update_run_meta(run)

            if node.node_type != NODE_TYPE_SECTION_GENERATOR:
                # Phase 1: only section_generator is executed; other types no-op
                continue

            # Guardrail: declared dependencies must have produced output before this node runs.
            missing = [d for d in node.depends_on if d not in ctx.node_outputs]
            if missing:
                raise RuntimeError(
                    "Missing dependency outputs for %s: %s. "
                    "Upstream sections must run first and populate ctx.node_outputs."
                    % (node.id, missing)
                )

            started_at = datetime.utcnow()
            prev_ids = [graph.nodes[j].id for j in range(i) if graph.nodes[j].node_type == NODE_TYPE_SECTION_GENERATOR]
            prompt_input = ctx.to_prompt_dict(node_ids, prev_ids)
            previous_sections_str = prompt_input.get("previous_sections", "")
            logger.debug(
                "Running node: %s  Dependencies: %s  previous_sections_length=%s",
                node.id,
                prev_ids,
                len(previous_sections_str),
            )

            node_run: Optional[NodeRun] = None
            try:
                content = runner.run_section(
                    run_id,
                    node.id,
                    prompt_input,
                    template,
                    model=model,
                    mock=mock,
                    previous_sections=previous_sections_str,
                    vector_store_id=vector_store_id,
                )
                previous_parts.append(content)
                # Canonical source: run_section() return value only. Do not refill from storage.
                ctx.node_outputs[node.id] = content
                finished_at = datetime.utcnow()
                node_run = NodeRun(
                    node_id=node.id,
                    status="completed",
                    started_at=started_at,
                    finished_at=finished_at,
                    output=content,
                )
            except Exception as e:
                finished_at = datetime.utcnow()
                node_run = NodeRun(
                    node_id=node.id,
                    status="failed",
                    started_at=started_at,
                    finished_at=finished_at,
                    error=str(e),
                )
                raise
            finally:
                if node_run is not None:
                    storage.write_node_run_meta(
                        run_id,
                        node.id,
                        node_run.model_dump(mode="json"),
                    )

        content = assembler.assemble_document(run_id)
        run = storage.get_run(run_id)
        if run is not None:
            run.status = "completed"
            run.updated_at = datetime.utcnow()
            storage.update_run_meta(run)
        return content
    except Exception as e:
        run = storage.get_run(run_id)
        if run is not None:
            run.status = "failed"
            run.error = str(e)
            run.updated_at = datetime.utcnow()
            storage.update_run_meta(run)
        raise


def execute_single_node(
    run_id: str,
    section_id: str,
    model: Optional[str] = None,
    mock: bool = False,
    vector_store_id: Optional[str] = None,
) -> str:
    """
    Rerun a single section node and reassemble. For rerun, prior sections are not re-executed,
    so we populate ctx.node_outputs from storage (the only source for those outputs).
    Then we call runner.run_section and use its return value for the rerun section.
    """
    run = storage.get_run(run_id)
    if run is None:
        raise ValueError("Run not found: %s" % run_id)
    if section_id not in run.section_ids:
        raise ValueError("Section not in run: %s" % section_id)
    template = storage.get_template(run.template_id)
    if template is None:
        raise ValueError("Template not found: %s" % run.template_id)

    ctx = ExecutionContext.from_structured_input(run.structured_input)
    prev_ids = run.section_ids[: run.section_ids.index(section_id)]
    # Rerun only: prior section content comes from storage (we are not re-running those nodes).
    for sid in prev_ids:
        out = storage.read_section(run_id, sid)
        if out is not None:
            ctx.node_outputs[sid] = out.content
    prompt_input = ctx.to_prompt_dict(run.section_ids, prev_ids)
    previous_sections_str = prompt_input.get("previous_sections", "")
    logger.debug(
        "Rerun node: %s  previous_section_ids: %s  previous_sections_length=%s",
        section_id,
        prev_ids,
        len(previous_sections_str),
    )

    started_at = datetime.utcnow()
    try:
        content = runner.run_section(
            run_id,
            section_id,
            prompt_input,
            template,
            model=model,
            mock=mock,
            previous_sections=previous_sections_str,
            vector_store_id=vector_store_id,
        )
        finished_at = datetime.utcnow()
        node_run = NodeRun(
            node_id=section_id,
            status="completed",
            started_at=started_at,
            finished_at=finished_at,
            output=content,
        )
    except Exception as e:
        finished_at = datetime.utcnow()
        node_run = NodeRun(
            node_id=section_id,
            status="failed",
            started_at=started_at,
            finished_at=finished_at,
            error=str(e),
        )
        storage.write_node_run_meta(run_id, section_id, node_run.model_dump(mode="json"))
        raise
    storage.write_node_run_meta(run_id, section_id, node_run.model_dump(mode="json"))
    return assembler.assemble_document(run_id)
