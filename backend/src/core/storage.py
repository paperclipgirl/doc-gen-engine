"""
File-based storage for templates, runs, section outputs, and assembled documents.
Paths are relative to the backend directory (parent of src/).
"""
from datetime import datetime
from pathlib import Path
from typing import Optional

from .models import (
    AssembledDocument,
    GenerationRun,
    SectionOutput,
    Template,
    TemplateSection,
    VersionSnapshot,
)

# Backend root: backend/src/core/storage.py -> backend
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_PROMPTS_DIR = _BASE_DIR / "prompts"
_TEMPLATES_DIR = _BASE_DIR / "templates"
_RUNS_DIR = _BASE_DIR / "runs"
_INDEX_FILE = _RUNS_DIR / "index.json"


def _ensure_runs_dir() -> None:
    _RUNS_DIR.mkdir(parents=True, exist_ok=True)


def get_template(template_id: str) -> Optional[Template]:
    """Load a template by id from templates/{template_id}.json."""
    path = _TEMPLATES_DIR / f"{template_id}.json"
    if not path.exists():
        return None
    data = path.read_text(encoding="utf-8")
    import json
    obj = json.loads(data)
    obj["sections"] = [TemplateSection(**s) for s in obj.get("sections", [])]
    return Template(**obj)


def list_templates() -> list[Template]:
    """List all templates from templates/*.json."""
    result = []
    if not _TEMPLATES_DIR.exists():
        return result
    import json
    for path in sorted(_TEMPLATES_DIR.glob("*.json")):
        try:
            data = path.read_text(encoding="utf-8")
            obj = json.loads(data)
            obj["sections"] = [TemplateSection(**s) for s in obj.get("sections", [])]
            result.append(Template(**obj))
        except Exception:
            continue
    return result


def get_run(run_id: str) -> Optional[GenerationRun]:
    """Load run metadata from runs/{run_id}/meta.json."""
    path = _RUNS_DIR / run_id / "meta.json"
    if not path.exists():
        return None
    import json
    data = path.read_text(encoding="utf-8")
    obj = json.loads(data)
    for key in ("created_at", "updated_at"):
        if key in obj and isinstance(obj[key], str):
            obj[key] = datetime.fromisoformat(obj[key].replace("Z", "+00:00"))
    return GenerationRun(**obj)


def list_runs() -> list[VersionSnapshot]:
    """List runs from runs/index.json (newest first). Creates index with [] if missing."""
    _ensure_runs_dir()
    import json
    if not _INDEX_FILE.exists():
        _INDEX_FILE.write_text("[]", encoding="utf-8")
        return []
    data = _INDEX_FILE.read_text(encoding="utf-8")
    try:
        items = json.loads(data)
    except json.JSONDecodeError:
        return []
    result = []
    for item in items:
        for key in ("created_at", "updated_at"):
            if key in item and isinstance(item[key], str):
                item[key] = datetime.fromisoformat(item[key].replace("Z", "+00:00"))
        result.append(VersionSnapshot(**item))
    result.sort(key=lambda v: v.updated_at, reverse=True)
    return result


def create_run(run_id: str, template_id: str, structured_input: dict, section_ids: list[str]) -> GenerationRun:
    """Create run directory, input.json, meta.json, and add to index."""
    _ensure_runs_dir()
    import json
    run_dir = _RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "sections").mkdir(exist_ok=True)

    now = datetime.utcnow()
    (run_dir / "input.json").write_text(
        json.dumps({"template_id": template_id, "structured_input": structured_input}, indent=2),
        encoding="utf-8",
    )
    run = GenerationRun(
        run_id=run_id,
        template_id=template_id,
        structured_input=structured_input,
        status="pending",
        created_at=now,
        updated_at=now,
        section_ids=section_ids,
    )
    meta_path = run_dir / "meta.json"
    _write_run_meta(run, meta_path)

    # Append to index
    index_path = _INDEX_FILE
    if not index_path.exists():
        index_path.write_text("[]", encoding="utf-8")
    index_data = json.loads(index_path.read_text(encoding="utf-8"))
    index_data.append({
        "run_id": run_id,
        "template_id": template_id,
        "created_at": run.created_at.isoformat(),
        "updated_at": run.updated_at.isoformat(),
        "section_count": len(section_ids),
    })
    index_path.write_text(json.dumps(index_data, indent=2), encoding="utf-8")
    return run


def _write_run_meta(run: GenerationRun, path: Path) -> None:
    import json
    # mode="json" serializes datetime to ISO string
    obj = run.model_dump(mode="json")
    path.write_text(json.dumps(obj, indent=2), encoding="utf-8")


def update_run_meta(run: GenerationRun) -> None:
    """Persist run metadata to runs/{run_id}/meta.json."""
    path = _RUNS_DIR / run.run_id / "meta.json"
    if not path.exists():
        return
    _write_run_meta(run, path)

    # Update index entry
    import json
    if not _INDEX_FILE.exists():
        return
    data = json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
    for i, entry in enumerate(data):
        if entry.get("run_id") == run.run_id:
            data[i] = {
                "run_id": run.run_id,
                "template_id": run.template_id,
                "created_at": run.created_at.isoformat(),
                "updated_at": run.updated_at.isoformat(),
                "section_count": len(run.section_ids),
            }
            break
    _INDEX_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def write_section(run_id: str, section_id: str, content: str, updated_at: Optional[datetime] = None) -> None:
    """Write section output to runs/{run_id}/sections/{section_id}.md."""
    path = _RUNS_DIR / run_id / "sections" / f"{section_id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def read_section(run_id: str, section_id: str) -> Optional[SectionOutput]:
    """Read section output from runs/{run_id}/sections/{section_id}.md."""
    path = _RUNS_DIR / run_id / "sections" / f"{section_id}.md"
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    # Use file mtime as updated_at if we don't store it separately
    mtime = datetime.fromtimestamp(path.stat().st_mtime)
    return SectionOutput(section_id=section_id, content=content, updated_at=mtime)


def write_assembled(run_id: str, content: str, assembled_at: Optional[datetime] = None) -> None:
    """Write assembled document to runs/{run_id}/assembled.md."""
    path = _RUNS_DIR / run_id / "assembled.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def read_assembled(run_id: str) -> Optional[AssembledDocument]:
    """Read assembled document from runs/{run_id}/assembled.md."""
    path = _RUNS_DIR / run_id / "assembled.md"
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    mtime = datetime.fromtimestamp(path.stat().st_mtime)
    return AssembledDocument(run_id=run_id, content=content, assembled_at=mtime)


def get_run_dir(run_id: str) -> Optional[Path]:
    """Return path to run directory if it exists."""
    p = _RUNS_DIR / run_id
    return p if p.is_dir() else None


def get_prompt_path(prompt_path: str) -> Path:
    """Resolve prompt file path (relative to prompts/) for loading content later."""
    return _PROMPTS_DIR / prompt_path
