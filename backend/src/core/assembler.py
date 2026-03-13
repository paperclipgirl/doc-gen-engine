"""
Section D: Assemble final document from section outputs in template order.
Reads runs/{run_id}/sections/*.md in order, concatenates with separator, writes assembled.md.
"""
from datetime import datetime

from . import storage

SECTION_SEPARATOR = "\n\n---\n\n"


def assemble_document(run_id: str) -> str:
    """
    Read section files for run_id in run's section_ids order, concatenate, write assembled.md.
    Updates run updated_at via update_run_meta. Returns assembled content.
    """
    run = storage.get_run(run_id)
    if run is None:
        raise ValueError("Run not found: %s" % run_id)

    parts = []
    for section_id in run.section_ids:
        out = storage.read_section(run_id, section_id)
        if out is not None:
            parts.append(out.content.strip())
        else:
            parts.append("")

    content = SECTION_SEPARATOR.join(parts)
    storage.write_assembled(run_id, content, assembled_at=datetime.utcnow())

    run.updated_at = datetime.utcnow()
    storage.update_run_meta(run)

    return content
