#!/usr/bin/env python3
"""
Section D verification: create run -> run all sections -> write section files -> write assembled.md.
Uses MOCK_LLM=1 by default so no OPENAI_API_KEY is required; set MOCK_LLM=0 to call the real API.
Run from backend directory: python run_full_pipeline.py
"""
import os
import sys

sys.path.insert(0, ".")

from src.core.runner import run_all_sections
from src.core import storage

RUN_ID = "section-d-pipeline-run"
TEMPLATE_ID = "implementation_guidance"
STRUCTURED_INPUT = {"topic": "Document pipeline", "jurisdiction": "Contract Law", "context": "Sample run"}


def main():
    mock = os.environ.get("MOCK_LLM", "1") == "1"
    if mock:
        print("Using MOCK_LLM=1 (placeholder section content; no API key required)")
    else:
        print("Using real API (OPENAI_API_KEY required)")

    # Run full pipeline
    run_all_sections(RUN_ID, STRUCTURED_INPUT, TEMPLATE_ID, mock=mock)

    # Verify: section files exist
    run = storage.get_run(RUN_ID)
    if run is None:
        print("FAIL: Run not found after pipeline")
        return 1
    if run.status != "completed":
        print("FAIL: Run status is %s (expected completed)" % run.status)
        return 1

    for section_id in run.section_ids:
        out = storage.read_section(RUN_ID, section_id)
        if out is None:
            print("FAIL: Section %s not found" % section_id)
            return 1
        print("OK section: %s (%d chars)" % (section_id, len(out.content)))

    # Verify: assembled.md exists and contains all section content in order
    doc = storage.read_assembled(RUN_ID)
    if doc is None:
        print("FAIL: assembled.md not found")
        return 1
    print("OK assembled.md (%d chars)" % len(doc.content))

    for section_id in run.section_ids:
        out = storage.read_section(RUN_ID, section_id)
        if out and out.content.strip() not in doc.content:
            print("FAIL: Section %s content not in assembled doc" % section_id)
            return 1
    print("OK assembled doc contains all section content in order")

    print("\nSection D verification passed: create run -> multi-section run -> section files -> assembled.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
