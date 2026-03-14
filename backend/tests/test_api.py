"""Tests for API routes (templates, runs, create run with mock LLM).
Includes regression tests to ensure template listing and run listing work
independently of orchestration (no run creation required).
"""
import os

import pytest
from fastapi.testclient import TestClient

from src.main import app

# Use mock LLM so no OPENAI_API_KEY is required
os.environ["USE_MOCK_LLM"] = "1"

client = TestClient(app)

# Known template IDs from backend/templates/*.json (at least these are expected)
EXPECTED_TEMPLATE_IDS = {"implementation_guidance", "workflow_pattern", "hld"}


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert "service" in data
    assert "docs" in data


def test_api_list_templates():
    """GET /api/templates returns 200 and a non-empty templates list with expected shape."""
    r = client.get("/api/templates")
    assert r.status_code == 200
    data = r.json()
    assert "templates" in data
    assert isinstance(data["templates"], list), "response must have a list under 'templates'"
    assert len(data["templates"]) >= 1, "template list must be non-empty"
    ids = {t["id"] for t in data["templates"]}
    for tid in EXPECTED_TEMPLATE_IDS:
        assert tid in ids, f"expected template id {tid!r} in response"
    for t in data["templates"]:
        assert "id" in t and "name" in t
        assert "section_count" in t


def test_api_list_templates_response_shape():
    """Response is strictly { 'templates': [...] } and never null or other shape."""
    r = client.get("/api/templates")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert list(data.keys()) == ["templates"]
    assert data["templates"] is not None
    assert isinstance(data["templates"], list)


def test_api_list_templates_without_orchestration():
    """GET /api/templates succeeds in isolation; no run created, no executor invoked.
    Regression: template listing must not depend on orchestration execution paths."""
    r = client.get("/api/templates")
    assert r.status_code == 200
    data = r.json()
    assert "templates" in data and isinstance(data["templates"], list)


def test_api_list_runs_without_create():
    """GET /api/runs returns 200 and valid runs array without creating a run first.
    Protects sidebar-loading path from orchestration side effects."""
    r = client.get("/api/runs")
    assert r.status_code == 200
    data = r.json()
    assert "runs" in data
    assert isinstance(data["runs"], list)


def test_api_get_template():
    r = client.get("/api/templates/implementation_guidance")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "implementation_guidance"
    assert "sections" in data


def test_api_get_template_404():
    r = client.get("/api/templates/nonexistent")
    assert r.status_code == 404


def test_api_create_run():
    r = client.post(
        "/api/runs",
        json={
            "template_id": "implementation_guidance",
            "structured_input": {"topic": "Test", "jurisdiction": "Contract Law", "context": ""},
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert "run_id" in data
    run_id = data["run_id"]
    r2 = client.get(f"/api/runs/{run_id}")
    assert r2.status_code == 200
    run_data = r2.json()
    assert run_data["run_id"] == run_id
    assert run_data["status"] == "completed"


def test_api_list_runs():
    r = client.get("/api/runs")
    assert r.status_code == 200
    data = r.json()
    assert "runs" in data
    assert isinstance(data["runs"], list)
    # Response shape is always { "runs": [...] }
    assert data["runs"] is not None


def test_api_get_run_404():
    r = client.get("/api/runs/nonexistent-run-id")
    assert r.status_code == 404


def test_api_feedback():
    # Create a run first
    r = client.post(
        "/api/runs",
        json={
            "template_id": "implementation_guidance",
            "structured_input": {"topic": "T", "jurisdiction": "J", "context": ""},
        },
    )
    assert r.status_code == 201
    run_id = r.json()["run_id"]
    # GET feedback (empty)
    r2 = client.get(f"/api/runs/{run_id}/feedback")
    assert r2.status_code == 200
    assert r2.json()["feedback"] == {}
    # POST feedback
    r3 = client.post(
        f"/api/runs/{run_id}/sections/project_instructions/feedback",
        json={"category": "Formatting or clarity issue", "comment": "Test comment"},
    )
    assert r3.status_code == 200
    # GET feedback again
    r4 = client.get(f"/api/runs/{run_id}/feedback")
    assert r4.status_code == 200
    fb = r4.json()["feedback"]
    assert "project_instructions" in fb
    assert fb["project_instructions"]["category"] == "Formatting or clarity issue"
    assert fb["project_instructions"]["comment"] == "Test comment"
