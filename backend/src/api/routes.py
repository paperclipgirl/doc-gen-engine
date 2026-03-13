"""
API routes. Section E: full surface per plan (templates, runs, rerun, versions).
Uses existing storage and runner; no frontend changes.
"""
import uuid

from fastapi import APIRouter, HTTPException

from src.core.models import GenerationRequest
from src.core import assembler, runner, storage

router = APIRouter(prefix="/api", tags=["api"])


def _run_to_json(run):
    """Serialize GenerationRun for JSON (datetime -> iso string)."""
    return run.model_dump(mode="json")


def _snapshot_to_json(snap):
    """Serialize VersionSnapshot for JSON."""
    return snap.model_dump(mode="json")


# --- Templates (already present; keep shape) ---


@router.get("/templates")
def api_list_templates():
    """List all templates. Returns 200 with { templates: [ { id, name, description, section_count } ] }."""
    templates = storage.list_templates()
    return {
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
        "sections": [
            {"id": s.id, "prompt_path": s.prompt_path, "display_name": s.display_name}
            for s in t.sections
        ],
    }


# --- Runs ---


@router.post("/runs")
def api_create_run(body: GenerationRequest):
    """
    Create a run and run the full pipeline (run_all_sections).
    Returns 201 { run_id }. On pipeline failure returns 500 with run.error.
    """
    run_id = str(uuid.uuid4())
    try:
        runner.run_all_sections(run_id, body.structured_input, body.template_id, mock=False)
    except ValueError as e:
        if "Template not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
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

    return {
        **_run_to_json(run),
        "sections": sections,
        "assembled": assembled_json,
    }


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

    template = storage.get_template(run.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    try:
        runner.run_section(run_id, section_id, run.structured_input, template, mock=False)
        assembler.assemble_document(run_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"run_id": run_id, "section_id": section_id}


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
