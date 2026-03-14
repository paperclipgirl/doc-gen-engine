"""Tests for runner (run_section with mock LLM, run_all_sections)."""
import pytest

from src.core import runner, storage


def test_run_section_mock():
    run_id = "pytest-runner-section"
    template = storage.get_template("implementation_guidance")
    assert template is not None
    # Ensure run exists
    storage.create_run(run_id, "implementation_guidance", {"topic": "T", "jurisdiction": "J", "context": ""}, ["project_instructions", "guidance_title"])
    content = runner.run_section(
        run_id,
        "project_instructions",
        {"topic": "T", "jurisdiction": "J", "context": ""},
        template,
        mock=True,
    )
    assert "Section:" in content or "project_instructions" in content
    assert "Placeholder" in content or "MOCK" in content
    out = storage.read_section(run_id, "project_instructions")
    assert out is not None
    assert out.content == content


def test_run_all_sections_mock():
    run_id = "pytest-runner-all"
    content = runner.run_all_sections(
        run_id,
        {"topic": "T", "jurisdiction": "J", "context": ""},
        "implementation_guidance",
        mock=True,
    )
    assert content is not None
    assert len(content) > 0
    run = storage.get_run(run_id)
    assert run is not None
    assert run.status == "completed"
    assembled = storage.read_assembled(run_id)
    assert assembled is not None
