"""
Section D: Sequential multi-section runner. Runs each template section via one model call, saves output, then assembly.
"""
import logging
import os
from datetime import datetime
from typing import Optional

from . import assembler, prompt_loader, storage
from .models import Template

logger = logging.getLogger(__name__)

# Model from env; default for prototype
DEFAULT_MODEL = "gpt-4o-mini"


def _get_model() -> str:
    return os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)


def _call_llm(
    prompt_text: str,
    model: str,
    vector_store_id: Optional[str] = None,
) -> str:
    """Call OpenAI chat completion; returns content. Raises on API error.
    When vector_store_id is set, attaches file_search so the model can retrieve from that store.
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package required for runner; pip install openai")
    client = OpenAI()
    system_instruction = (
        "You are a document generator. Your output must be only the requested section content in the specified format. "
        "Never respond with chat support phrases (e.g. 'your message didn't come through', 'How can I assist you today?', "
        "'your message was a placeholder'). If context is missing or sparse, still produce the section using the instructions "
        "and reasonable assumptions; do not ask the user for clarification."
    )
    messages: list[dict] = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt_text},
    ]
    kwargs: dict = {"model": model, "messages": messages}
    if vector_store_id:
        kwargs["tools"] = [{"type": "file_search", "vector_store_ids": [vector_store_id]}]
    try:
        response = client.chat.completions.create(**kwargs)
    except Exception as e:
        if vector_store_id and "tool" in str(e).lower():
            logger.warning("file_search tool not supported for this endpoint, retrying without retrieval: %s", e)
            kwargs.pop("tools", None)
            response = client.chat.completions.create(**kwargs)
        else:
            raise
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
    previous_sections: Optional[str] = None,
    vector_store_id: Optional[str] = None,
) -> str:
    """
    Load prompt for section, substitute structured_input + previous_sections, call model, save to sections/{section_id}.md.
    If mock=True, write placeholder content instead of calling the API (for tests).
    Returns section content.
    """
    section = next((s for s in template.sections if s.id == section_id), None)
    if section is None:
        raise ValueError("Section not found: %s" % section_id)

    prompt_input = {**structured_input, "previous_sections": previous_sections if previous_sections is not None else ""}
    prompt_text = prompt_loader.load_prompt(section.prompt_path, prompt_input)

    if mock:
        content = "# Section: %s\n\n(Placeholder output; MOCK_LLM=1)\n\nPrompt length: %d chars." % (
            section_id,
            len(prompt_text),
        )
    else:
        content = _call_llm(
            prompt_text,
            model or _get_model(),
            vector_store_id=vector_store_id,
        )

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

    # Execution order: currently list order. Later can be derived from section.depends_on (topological sort).
    section_ids = [s.id for s in template.sections]
    run = storage.create_run(run_id, template_id, structured_input, section_ids)
    run.status = "running"
    storage.update_run_meta(run)

    try:
        previous_parts: list[str] = []
        for section_id in section_ids:
            run = storage.get_run(run_id)
            if run is not None:
                run.current_section_id = section_id
                storage.update_run_meta(run)
            previous_sections_str = "\n\n".join(previous_parts) if previous_parts else ""
            section_content = run_section(
                run_id, section_id, structured_input, template,
                model=model, mock=mock, previous_sections=previous_sections_str,
            )
            previous_parts.append(section_content)

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
