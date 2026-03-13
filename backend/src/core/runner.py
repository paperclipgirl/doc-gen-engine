"""
Section D: Sequential multi-section runner. Runs each template section via one model call, saves output, then assembly.
"""
import os
from datetime import datetime
from typing import Optional

from . import assembler, prompt_loader, storage
from .models import Template

# Model from env; default for prototype
DEFAULT_MODEL = "gpt-4o-mini"


def _get_model() -> str:
    return os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)


def _call_llm(prompt_text: str, model: str) -> str:
    """Call OpenAI chat completion; returns content. Raises on API error."""
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required for runner; pip install openai")
    client = OpenAI()
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt_text}],
    )
    choice = response.choices and response.choices[0]
    if not choice or not choice.message:
        raise RuntimeError("Empty response from model")
    return choice.message.content or ""


def run_section(
    run_id: str,
    section_id: str,
    structured_input: dict,
    template: Template,
    model: Optional[str] = None,
    mock: bool = False,
) -> str:
    """
    Load prompt for section, substitute structured_input, call model, save to sections/{section_id}.md.
    If mock=True, write placeholder content instead of calling the API (for tests).
    Returns section content.
    """
    section = next((s for s in template.sections if s.id == section_id), None)
    if section is None:
        raise ValueError("Section not found: %s" % section_id)

    prompt_text = prompt_loader.load_prompt(section.prompt_path, structured_input)

    if mock:
        content = "# Section: %s\n\n(Placeholder output; MOCK_LLM=1)\n\nPrompt length: %d chars." % (
            section_id,
            len(prompt_text),
        )
    else:
        content = _call_llm(prompt_text, model or _get_model())

    storage.write_section(run_id, section_id, content)
    run = storage.get_run(run_id)
    if run is not None:
        run.updated_at = datetime.utcnow()
        storage.update_run_meta(run)

    return content


def run_all_sections(
    run_id: str,
    structured_input: dict,
    template_id: str,
    model: Optional[str] = None,
    mock: bool = False,
) -> str:
    """
    Create run, run each template section in order, assemble document.
    Returns assembled document content. On failure sets run status to failed and raises.
    """
    template = storage.get_template(template_id)
    if template is None:
        raise ValueError("Template not found: %s" % template_id)

    section_ids = [s.id for s in template.sections]
    run = storage.create_run(run_id, template_id, structured_input, section_ids)
    run.status = "running"
    storage.update_run_meta(run)

    try:
        for section_id in section_ids:
            run_section(run_id, section_id, structured_input, template, model=model, mock=mock)

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
