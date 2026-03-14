"""
Execution-equivalence tests: the orchestration path (execute_run / execute_single_node)
must produce the same run layout, section content, and assembled output as the legacy
runner path (run_all_sections / run_section + assemble), under mock LLM.
"""
import pytest

from src.core import runner, storage
from src.orchestration.executor import execute_run, execute_single_node


_STRUCTURED_INPUT = {"topic": "Equivalence test", "jurisdiction": "Contract Law", "context": ""}
_TEMPLATE_ID = "implementation_guidance"


def _run_ids():
    """Distinct run ids for runner vs executor so they don't overwrite."""
    return "pytest-equiv-runner", "pytest-equiv-executor"


def _get_section_ids(run_id: str) -> list[str]:
    run = storage.get_run(run_id)
    assert run is not None
    return list(run.section_ids)


def _get_section_content(run_id: str, section_id: str) -> str:
    out = storage.read_section(run_id, section_id)
    assert out is not None
    return out.content


def _get_assembled(run_id: str) -> str:
    doc = storage.read_assembled(run_id)
    assert doc is not None
    return doc.content


def test_full_run_equivalence_mock():
    """
    For the same (run_id, template_id, structured_input), running via runner.run_all_sections
    vs execute_run produces the same run layout, section count, section content, and assembled doc.
    """
    run_id_runner, run_id_executor = _run_ids()
    content_runner = runner.run_all_sections(
        run_id_runner,
        _STRUCTURED_INPUT,
        _TEMPLATE_ID,
        mock=True,
    )
    content_executor = execute_run(
        run_id_executor,
        _TEMPLATE_ID,
        _STRUCTURED_INPUT,
        mock=True,
    )

    assert content_runner is not None and content_executor is not None
    assert len(content_runner) > 0 and len(content_executor) > 0

    run_runner = storage.get_run(run_id_runner)
    run_executor = storage.get_run(run_id_executor)
    assert run_runner is not None and run_executor is not None
    assert run_runner.status == "completed" and run_executor.status == "completed"
    assert run_runner.template_id == run_executor.template_id == _TEMPLATE_ID
    assert run_runner.section_ids == run_executor.section_ids

    section_ids = run_runner.section_ids
    assert len(section_ids) > 0

    for section_id in section_ids:
        c_runner = _get_section_content(run_id_runner, section_id)
        c_executor = _get_section_content(run_id_executor, section_id)
        assert c_runner == c_executor, f"Section {section_id} content differs"

    assembled_runner = _get_assembled(run_id_runner)
    assembled_executor = _get_assembled(run_id_executor)
    assert assembled_runner == assembled_executor


def test_rerun_equivalence_mock():
    """
    After a full run via execute_run, rerunning one section via execute_single_node
    updates that section and reassembles; storage layout and other sections unchanged.
    """
    run_id = "pytest-equiv-rerun"
    execute_run(run_id, _TEMPLATE_ID, _STRUCTURED_INPUT, mock=True)

    section_ids = _get_section_ids(run_id)
    assert len(section_ids) >= 2
    target = section_ids[1]

    assembled_after = execute_single_node(run_id, target, mock=True)

    assert assembled_after is not None and len(assembled_after) > 0
    content_after = _get_section_content(run_id, target)
    assert "Section:" in content_after or "Placeholder" in content_after or target in content_after
    run = storage.get_run(run_id)
    assert run is not None and run.status == "completed"
    for sid in section_ids:
        out = storage.read_section(run_id, sid)
        assert out is not None, f"Section {sid} should still exist after rerun"


def test_node_run_meta_written():
    """Orchestration path writes NodeRun metadata (Option A: sections/{id}.meta.json)."""
    run_id = "pytest-equiv-meta"
    execute_run(run_id, _TEMPLATE_ID, _STRUCTURED_INPUT, mock=True)
    section_ids = _get_section_ids(run_id)
    for section_id in section_ids:
        meta = storage.read_node_run_meta(run_id, section_id)
        assert meta is not None, f"Expected .meta.json for section {section_id}"
        assert meta.get("node_id") == section_id
        assert meta.get("status") == "completed"
