#!/usr/bin/env python3
"""
Section B verification: exercises the storage layer only.
Run from backend directory: python verify_storage.py
"""
import sys

# Ensure backend/src is on path when run from backend/
sys.path.insert(0, ".")

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

TEST_RUN_ID = "verify-section-b-run"


def main():
    errors = []

    # list_templates
    try:
        templates = list_templates()
        assert isinstance(templates, list), "list_templates should return a list"
        assert len(templates) >= 1, "expected at least one template (e.g. contract)"
        print("OK list_templates")
    except Exception as e:
        errors.append(f"list_templates: {e}")
        print("FAIL list_templates:", e)
        return 1

    # get_template
    try:
        t = get_template("contract")
        assert t is not None, "get_template('contract') should return a template"
        assert t.id == "contract"
        assert len(t.sections) >= 2, "contract template should have at least 2 sections"
        print("OK get_template")
    except Exception as e:
        errors.append(f"get_template: {e}")
        print("FAIL get_template:", e)
        return 1

    # create_run
    try:
        run = create_run(TEST_RUN_ID, "contract", {"client": "Acme"}, ["intro", "terms"])
        assert run.run_id == TEST_RUN_ID
        assert run.template_id == "contract"
        print("OK create_run")
    except Exception as e:
        errors.append(f"create_run: {e}")
        print("FAIL create_run:", e)
        return 1

    # list_runs
    try:
        runs = list_runs()
        assert isinstance(runs, list)
        found = any(r.run_id == TEST_RUN_ID for r in runs)
        assert found, f"list_runs should include {TEST_RUN_ID}"
        print("OK list_runs")
    except Exception as e:
        errors.append(f"list_runs: {e}")
        print("FAIL list_runs:", e)
        return 1

    # write_section and read_section
    try:
        write_section(TEST_RUN_ID, "intro", "# Intro content\n\nParagraph.")
        out = read_section(TEST_RUN_ID, "intro")
        assert out is not None
        assert out.section_id == "intro"
        assert "Intro content" in out.content
        print("OK write_section / read_section")
    except Exception as e:
        errors.append(f"write_section/read_section: {e}")
        print("FAIL write_section/read_section:", e)
        return 1

    # write_assembled and read_assembled
    try:
        write_assembled(TEST_RUN_ID, "# Full document\n\nSection 1\n\nSection 2")
        doc = read_assembled(TEST_RUN_ID)
        assert doc is not None
        assert doc.run_id == TEST_RUN_ID
        assert "Full document" in doc.content
        print("OK write_assembled / read_assembled")
    except Exception as e:
        errors.append(f"write_assembled/read_assembled: {e}")
        print("FAIL write_assembled/read_assembled:", e)
        return 1

    # update_run_meta
    try:
        run = get_run(TEST_RUN_ID)
        assert run is not None
        run.status = "completed"
        update_run_meta(run)
        run2 = get_run(TEST_RUN_ID)
        assert run2 is not None and run2.status == "completed"
        print("OK update_run_meta")
    except Exception as e:
        errors.append(f"update_run_meta: {e}")
        print("FAIL update_run_meta:", e)
        return 1

    print("\nAll Section B storage checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
