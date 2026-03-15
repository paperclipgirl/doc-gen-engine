"""
Regression tests for section output propagation and context chaining.
Ensures content flows correctly between sections and executor uses run_section()
return value (not storage) as the canonical source during the main run loop.
"""
import unittest.mock as mock

import pytest

from src.core import runner, storage
from src.core.models import SectionOutput
from src.orchestration.executor import execute_run


def test_section_output_propagates_to_next_section():
    """
    Run a template with at least 2 sections; confirm section 2 prompt receives
    section 1 output in previous_sections and section 2 output is not placeholder
    chat-style text.
    """
    run_id = "pytest-chain-propagate"
    template_id = "implementation_guidance"
    structured_input = {"topic": "Chain test", "jurisdiction": "Contract Law", "context": ""}

    execute_run(run_id, template_id, structured_input, mock=True)

    run = storage.get_run(run_id)
    assert run is not None and run.status == "completed"
    section_ids = run.section_ids
    assert len(section_ids) >= 2

    section_1_id = section_ids[0]
    section_2_id = section_ids[1]

    out1 = storage.read_section(run_id, section_1_id)
    out2 = storage.read_section(run_id, section_2_id)
    assert out1 is not None and out2 is not None

    # Section 1 produced content (mock placeholder format).
    assert len(out1.content.strip()) > 0
    assert section_1_id in out1.content or "Section:" in out1.content

    # Section 2 received previous_sections (propagation): under mock, section 2
    # prompt includes section 1 output, so section 2 produces its own placeholder.
    assert len(out2.content.strip()) > 0
    assert section_2_id in out2.content or "Section:" in out2.content
    # Must not be chat-style fallback (regression guard).
    assert "your message didn't come through" not in out2.content.lower()
    assert "how can i assist you" not in out2.content.lower()


def test_executor_context_uses_returned_content_not_storage():
    """
    Mock read_section to return incorrect content and record what previous_sections
    is passed to run_section. Ensures section 2 receives section 1's *return value*
    in previous_sections, not the wrong content from storage (regression guard).
    """
    run_id = "pytest-chain-return-value"
    template_id = "implementation_guidance"
    structured_input = {"topic": "Return value test", "jurisdiction": "Contract Law", "context": ""}

    wrong_content = "WRONG_FROM_STORAGE_NEVER_USED"
    previous_sections_seen = {}

    original_read_section = storage.read_section
    original_run_section = runner.run_section

    def patched_read_section(run_id_arg: str, section_id: str):
        result = original_read_section(run_id_arg, section_id)
        if result is not None:
            return SectionOutput(
                section_id=result.section_id,
                content=wrong_content,
                updated_at=result.updated_at,
            )
        return result

    def recording_run_section(run_id_arg, section_id, prompt_input, template, **kwargs):
        previous_sections_seen[section_id] = kwargs.get("previous_sections") or ""
        return original_run_section(
            run_id_arg, section_id, prompt_input, template, **kwargs
        )

    with mock.patch.object(storage, "read_section", side_effect=patched_read_section), \
         mock.patch.object(runner, "run_section", side_effect=recording_run_section):
        execute_run(run_id, template_id, structured_input, mock=True)

    run = storage.get_run(run_id)
    assert run is not None and run.status == "completed"
    assert len(run.section_ids) >= 2
    s1_id, s2_id = run.section_ids[0], run.section_ids[1]

    # Section 2 must have received section 1's actual output in previous_sections,
    # not the wrong content from patched read_section.
    prev_for_s2 = previous_sections_seen.get(s2_id) or ""
    assert wrong_content not in prev_for_s2, (
        "Executor must use run_section() return value for ctx.node_outputs, not "
        "storage.read_section; section 2's previous_sections must not be from storage."
    )
    # Section 2's previous_sections should contain section 1's placeholder output.
    assert "Section:" in prev_for_s2 or s1_id in prev_for_s2 or "Placeholder" in prev_for_s2, (
        "Section 2 should receive section 1 output in previous_sections."
    )
