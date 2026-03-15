"""
Template and prompt validation: ensure prompt files exist, dependency chain is valid,
and sections that need prior context reference {{previous_sections}}.
Run via validate_template_prompts(template_id); also invoked at start of execute_run.
Warnings only—does not fail generation.
"""
import logging
from pathlib import Path

from src.core import storage

logger = logging.getLogger(__name__)

PREVIOUS_SECTIONS_PLACEHOLDER = "{{previous_sections}}"


def validate_template_prompts(template_id: str) -> None:
    """
    Validate a template's prompts for section chaining and dependency correctness.
    - Prompt files exist for each section.
    - Each section's depends_on references valid section ids.
    - Any section that has depends_on or is not the first section references {{previous_sections}}.
    Logs warnings only; does not raise.
    """
    template = storage.get_template(template_id)
    if template is None:
        logger.warning("validate_template_prompts: template not found: %s", template_id)
        return

    section_ids = {s.id for s in template.sections}
    for i, section in enumerate(template.sections):
        path = storage.get_prompt_path(section.prompt_path)
        if not path.exists():
            logger.warning(
                "Prompt validation warning: section %r references missing prompt file: %s",
                section.id,
                section.prompt_path,
            )
            continue

        text = path.read_text(encoding="utf-8")
        has_previous_sections = PREVIOUS_SECTIONS_PLACEHOLDER in text

        for dep in section.depends_on:
            if dep not in section_ids:
                logger.warning(
                    "Prompt validation warning: section %r depends_on unknown section %r",
                    section.id,
                    dep,
                )

        needs_previous = bool(section.depends_on) or (i > 0)
        if needs_previous and not has_previous_sections:
            logger.warning(
                "Prompt validation warning: section %r has dependencies or is not the first section "
                "but does not reference {{previous_sections}}. Section chaining may be broken.",
                section.id,
            )
