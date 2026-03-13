# Document Generation Engine — Plan

## Implementation sections

- **Section A: Project setup** — Repo, backend (FastAPI + CORS), frontend (Vite + React + proxy). Done when uvicorn and frontend run; GET /templates returns 200.
- **Section B: Domain models and storage** — Models in `backend/src/core/models.py`; storage in `storage.py`; one template with ≥2 sections; placeholder prompts. Done when templates load and storage can create run, read/write sections and assembled, list runs.
- **Section C–H** — To be implemented.

## First vertical slice (Section D)

One template, multiple sections, persisted section outputs, assembled document. Then API (E), then UI (F–G).
