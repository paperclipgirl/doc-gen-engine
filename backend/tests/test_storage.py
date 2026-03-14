"""Tests for storage layer (templates, runs, sections, assembled)."""
import pytest

from src.core.storage import (
    list_templates,
    get_template,
    create_run,
    get_run,
    list_runs,
    write_section,
    read_section,
    write_assembled,
    read_assembled,
    update_run_meta,
)

TEST_RUN_ID = "pytest-storage-run"


def test_list_templates():
    templates = list_templates()
    assert isinstance(templates, list)
    assert len(templates) >= 1


def test_get_template():
    t = get_template("implementation_guidance")
    assert t is not None
    assert t.id == "implementation_guidance"
    assert len(t.sections) >= 2


def test_get_template_not_found():
    assert get_template("nonexistent_template_id") is None


def test_create_run():
    run = create_run(
        TEST_RUN_ID,
        "implementation_guidance",
        {"topic": "Test"},
        ["project_instructions", "guidance_title"],
    )
    assert run.run_id == TEST_RUN_ID
    assert run.template_id == "implementation_guidance"


def test_list_runs_includes_created():
    runs = list_runs()
    assert isinstance(runs, list)
    assert any(r.run_id == TEST_RUN_ID for r in runs)


def test_write_section_read_section():
    write_section(TEST_RUN_ID, "project_instructions", "# Project instructions\n\nParagraph.")
    out = read_section(TEST_RUN_ID, "project_instructions")
    assert out is not None
    assert out.section_id == "project_instructions"
    assert "Project instructions" in out.content


def test_write_assembled_read_assembled():
    write_assembled(TEST_RUN_ID, "# Full document\n\nSection 1\n\nSection 2")
    doc = read_assembled(TEST_RUN_ID)
    assert doc is not None
    assert doc.run_id == TEST_RUN_ID
    assert "Full document" in doc.content


def test_update_run_meta():
    run = get_run(TEST_RUN_ID)
    assert run is not None
    run.status = "completed"
    update_run_meta(run)
    run2 = get_run(TEST_RUN_ID)
    assert run2 is not None
    assert run2.status == "completed"
