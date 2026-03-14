# Document Generation Engine — Plan

## Implementation sections (complete)

- **Section A: Project setup** — Repo, backend (FastAPI + CORS), frontend (Vite + React + proxy). Done when uvicorn and frontend run; GET /templates returns 200. **Complete.**
- **Section B: Domain models and storage** — Models in `backend/src/core/models.py`; storage in `storage.py`; one template with ≥2 sections; placeholder prompts. Done when templates load and storage can create run, read/write sections and assembled, list runs. **Complete.**
- **Section C: Prompt loading and substitution** — `prompt_loader.py`: load by path, substitute `{{key}}`. **Complete.**
- **Section D: First vertical slice** — Multi-section run and assembly: `run_section`, `run_all_sections`, `assemble_document`. One template, multiple sections, persisted outputs, assembled.md. **Complete.**
- **Section E: API surface** — GET /templates, GET /templates/{id}, POST /runs, GET /runs, GET /runs/{id}, POST rerun, GET /runs/{id}/versions. Mock mode when OPENAI_API_KEY unset. **Complete.**
- **Section F: React UI** — Generation form, template selection, run status, section outputs, assembled document. **Complete.**
- **Section G: Rerun and history** — Per-section Rerun, run history list, open run, version history. **Complete.**
- **Section H: Polish and scope lock** — README, plan consistency, no new features. **Complete.**

## First vertical slice (Section D)

One template, multiple ordered sections; persisted section outputs; final assembled document. Then API (E), then UI (F–G).

## Scope lock

Prototype scope is complete. No new product features; documentation and cleanup only for Section H. Ideas for later (e.g. graph nodes per section, evaluation workflows) remain out of scope and are not implemented.

## Post–Section H enhancements (done)

- **Implementation Guidance template** — Added `implementation_guidance.json`; template loader logs when a template is skipped; sections include `depends_on` so `GET /api/templates` returns both templates.
- **Implementation Guidance UI** — When Implementation Guidance is selected, form shows topic (required), jurisdiction (required), context (optional); `structured_input` is `{ topic, jurisdiction, context }`.
- **Previous sections in runner** — Runner and rerun pass `previous_sections` (concatenated prior section content) into each prompt so prompts can use `{{previous_sections}}`.

## Next: Real Implementation Guidance prompts — Complete

All 13 prompts in `backend/prompts/implementation_guidance/*.txt` now use `{{topic}}`, `{{jurisdiction}}`, and `{{context}}` for user input; sections 02–12 also use `{{previous_sections}}`. Placeholder `{{structured_input}}` was removed; the runner and UI supply the correct structured input.
