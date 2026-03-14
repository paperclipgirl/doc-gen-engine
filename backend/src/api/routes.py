"""
API routes. Section E: full surface per plan (templates, runs, rerun, versions).
Uses existing storage and runner; no frontend changes.
Mock mode: when OPENAI_API_KEY is not set, or USE_MOCK_LLM=1, pipeline uses placeholder output (no API key required).

Orchestration (execute_run, execute_single_node) is imported lazily inside the routes that need it
so that GET /api/templates and GET /api/runs do not load executor/graph code and cannot hang on it.
"""
import logging
import os
import uuid
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException

from src.core.models import GenerationRequest
from src.core import assembler, prompt_loader, runner, storage

router = APIRouter(prefix="/api", tags=["api"])
logger = logging.getLogger(__name__)


def _get_vector_store_id() -> str:
    """Vector store ID for retrieval during real generation. Empty if not configured."""
    return os.environ.get("OPENAI_VECTOR_STORE_ID", "").strip()


def _resolve_generation_mode(
    requested_mode: Optional[str],
) -> Tuple[bool, Optional[str]]:
    """
    Resolve (use_mock, vector_store_id for real mode).
    - requested_mode: 'mock' | 'real' from request (default 'mock').
    - use_mock: True to use placeholder output.
    - vector_store_id: non-empty only when real mode and configured; None or empty to skip retrieval.
    """
    mode = (requested_mode or "mock").strip().lower()
    use_mock_llm_env = os.environ.get("USE_MOCK_LLM", "").strip().lower() in ("1", "true", "yes")
    has_key = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    vector_store_id = _get_vector_store_id() or None

    if mode == "real":
        if use_mock_llm_env:
            logger.info("generation_mode: requested=real, actual=mock (USE_MOCK_LLM=1)")
            return True, None
        if not has_key:
            logger.warning("generation_mode: requested=real, actual=mock (OPENAI_API_KEY not set)")
            return True, None
        logger.info("generation_mode: requested=real, actual=real; vector_store_attached=%s", bool(vector_store_id))
        return False, vector_store_id if vector_store_id else None
    # mock requested or unknown
    logger.info("generation_mode: requested=%s, actual=mock", mode or "mock")
    return True, None


def _use_mock_llm() -> bool:
    """True if pipeline should use mock (placeholder) output: no API key required for local verification."""
    if os.environ.get("USE_MOCK_LLM", "").strip().lower() in ("1", "true", "yes"):
        return True
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    return not bool(key)


def _run_to_json(run):
    """Serialize GenerationRun for JSON (datetime -> iso string)."""
    return run.model_dump(mode="json")


def _snapshot_to_json(snap):
    """Serialize VersionSnapshot for JSON."""
    return snap.model_dump(mode="json")


# --- Templates (already present; keep shape) ---


@router.get("/templates")
def api_list_templates():
    """List all templates. Returns 200 with { templates: [ { id, name, description, section_count } ] }.
    Always returns a dict with a 'templates' key that is a list (never null or another shape)."""
    logger.info("GET /api/templates: entry")
    templates = storage.list_templates()
    logger.info("GET /api/templates: storage.list_templates() returned %d templates", len(templates))
    if not isinstance(templates, list):
        templates = []
    payload = {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "section_count": len(t.sections),
            }
            for t in templates
        ]
    }
    logger.info("GET /api/templates: responding with payload length %d", len(str(payload)))
    return payload


@router.get("/templates/{template_id}")
def api_get_template(template_id: str):
    """Get one template by id. Returns 404 if not found."""
    t = storage.get_template(template_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "sections": [s.model_dump(mode="json") for s in t.sections],
    }


# --- Runs ---


@router.post("/runs", status_code=201)
def api_create_run(body: GenerationRequest):
    """
    Create a run and run the full pipeline.
    Request can specify generation_mode: 'mock' (default) or 'real'.
    Returns 201 { run_id }. On pipeline failure returns 500 with run.error.
    """
    from src.orchestration.executor import execute_run

    run_id = str(uuid.uuid4())
    structured_input = body.structured_input if body.structured_input is not None else {}
    use_mock, vector_store_id = _resolve_generation_mode(body.generation_mode)
    try:
        execute_run(
            run_id,
            body.template_id,
            structured_input,
            mock=use_mock,
            vector_store_id=vector_store_id,
        )
    except ValueError as e:
        if "Template not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("execute_run failed: %s", e)
        run = storage.get_run(run_id)
        detail = run.error if run and run.error else str(e)
        raise HTTPException(status_code=500, detail=detail)
    return {"run_id": run_id}


@router.get("/runs")
def api_list_runs():
    """Return run history (VersionSnapshot), newest first."""
    runs = storage.list_runs()
    return {"runs": [_snapshot_to_json(s) for s in runs]}


@router.get("/runs/{run_id}")
def api_get_run(run_id: str):
    """
    Return GenerationRun metadata, section outputs, and assembled document (if present).
    404 if run not found.
    """
    run = storage.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    sections = []
    for section_id in run.section_ids:
        out = storage.read_section(run_id, section_id)
        if out is not None:
            sections.append(out.model_dump(mode="json"))

    assembled = storage.read_assembled(run_id)
    assembled_json = assembled.model_dump(mode="json") if assembled else None

    out = {
        **_run_to_json(run),
        "sections": sections,
        "assembled": assembled_json,
    }
    if run.status == "running" and run.current_section_id:
        t = storage.get_template(run.template_id)
        if t is not None:
            sec = next((s for s in t.sections if s.id == run.current_section_id), None)
            if sec is not None and sec.progress_message:
                out["progress_message"] = sec.progress_message
    return out


@router.post("/runs/{run_id}/sections/{section_id}/rerun", status_code=202)
def api_rerun_section(run_id: str, section_id: str):
    """
    Rerun the specified section and reassemble the document.
    Returns 202 { run_id, section_id }. 404 if run/section not found, 400 if section not in run.
    """
    run = storage.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if section_id not in run.section_ids:
        raise HTTPException(status_code=400, detail="Section not in run")

    use_mock, vector_store_id = _resolve_generation_mode(None)
    try:
        from src.orchestration.executor import execute_single_node

        execute_single_node(run_id, section_id, mock=use_mock, vector_store_id=vector_store_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"run_id": run_id, "section_id": section_id}


@router.get("/runs/{run_id}/sections/{section_id}/prompt")
def api_get_section_prompt(run_id: str, section_id: str):
    """
    Return the resolved prompt text used to generate this section.
    404 if run not found, 400 if section not in run.
    """
    run = storage.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if section_id not in run.section_ids:
        raise HTTPException(status_code=400, detail="Section not in run")

    template = storage.get_template(run.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    section = next((s for s in template.sections if s.id == section_id), None)
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")

    prev_ids = run.section_ids[: run.section_ids.index(section_id)]
    previous_parts = []
    for sid in prev_ids:
        out = storage.read_section(run_id, sid)
        if out is not None:
            previous_parts.append(out.content)
    previous_sections_str = "\n\n".join(previous_parts)
    prompt_input = {**run.structured_input, "previous_sections": previous_sections_str}

    try:
        prompt_text = prompt_loader.load_prompt(section.prompt_path, prompt_input)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"prompt_text": prompt_text}


@router.get("/runs/{run_id}/feedback")
def api_get_run_feedback(run_id: str):
    """Return all section feedback for the run. 404 if run not found."""
    run = storage.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    feedback = storage.get_section_feedback(run_id)
    return {"run_id": run_id, "feedback": feedback}


@router.post("/runs/{run_id}/sections/{section_id}/feedback", status_code=200)
def api_submit_section_feedback(run_id: str, section_id: str, body: dict):
    """Persist section feedback. Body: { category, comment? }. 404 if run or section not in run."""
    run = storage.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if section_id not in run.section_ids:
        raise HTTPException(status_code=400, detail="Section not in run")
    category = (body.get("category") or "").strip()
    if not category:
        raise HTTPException(status_code=400, detail="category is required")
    comment = (body.get("comment") or "").strip()
    storage.set_section_feedback(run_id, section_id, category, comment)
    return {"run_id": run_id, "section_id": section_id, "ok": True}


@router.get("/runs/{run_id}/versions")
def api_get_run_versions(run_id: str):
    """
    Return version history for the run. Prototype: one entry (the run itself).
    404 if run not found.
    """
    run = storage.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    from src.core.models import VersionSnapshot

    snap = VersionSnapshot(
        run_id=run.run_id,
        template_id=run.template_id,
        created_at=run.created_at,
        updated_at=run.updated_at,
        section_count=len(run.section_ids),
    )
    return {"run_id": run_id, "versions": [_snapshot_to_json(snap)]}
