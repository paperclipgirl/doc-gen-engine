"""Tests for prompt loader (load by path, substitute {{key}})."""
import pytest

from src.core import prompt_loader


def test_load_prompt_substitutes_keys():
    text = prompt_loader.load_prompt(
        "implementation_guidance/00_project_instructions.txt",
        {"topic": "TestTopic", "jurisdiction": "TestJurisdiction", "context": "TestContext"},
    )
    assert "TestTopic" in text
    assert "TestJurisdiction" in text
    assert "TestContext" in text
    assert "{{topic}}" not in text
    assert "{{jurisdiction}}" not in text


def test_load_prompt_missing_key_replaced_with_empty():
    text = prompt_loader.load_prompt(
        "implementation_guidance/00_project_instructions.txt",
        {"topic": "T", "jurisdiction": "J"},
        # context missing
    )
    assert "T" in text
    assert "J" in text
    assert "{{context}}" not in text


def test_load_prompt_file_not_found():
    with pytest.raises(FileNotFoundError):
        prompt_loader.load_prompt("nonexistent/path.txt", {})
