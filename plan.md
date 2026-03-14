# Clio Operate Solution Factory — Plan

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

## Current state (beyond prototype)

- **Templates:** Implementation Guidance, Workflow Pattern, Micro Solution, HLD; template list from backend.
- **Form:** Template select, Component picker (North America menu: Procedural / Governance / Foundation), Area of Law picker (searchable, grouped), topic/jurisdiction/context for guidance templates.
- **Run flow:** Create run → poll status → section outputs and assembled document; run history sidebar; open run from list.
- **Review mode:** After generation, form collapses to a compact run-context panel; document preview is primary; “Edit inputs” and “New run” available.
- **Section UX:** View prompt, edit section content, reset to generated; per-section feedback (category + comment) for prompt improvement signals; versioning (original / current / suggested) with Accept / Keep current.
- **Branding:** Clio Operate Solution Factory (app title, API title, docs).

## Roadmap / next steps

- **Graph nodes per section** — Implemented as minimal orchestration (see below). Future: run sections in parallel where dependencies allow; topological ordering from `depends_on`.
- **Evaluation workflows** — Regression or quality checks on prompt outputs (fixed inputs, diff or score). For iterating on prompts or models.
- **Section feedback persistence** — Done: GET/POST API, `runs/{run_id}/feedback.json`, frontend loads and submits via API.

## Minimal orchestration node model (implemented)

The backend has a small orchestration layer (`backend/src/orchestration/`) that provides a typed, graph-based execution model while preserving all current behavior.

- **Current template generation is backed by graph definitions.** The registry (`graphs.get_graph_definition(template_id)`) loads the existing template and converts it to a `GraphDefinition`; each template section becomes a typed `NodeDefinition` (e.g. `section_generator`). No duplicate graph JSON; templates remain the source of truth.
- **Sections are modeled as typed nodes.** The graph executor runs nodes in order, delegates prompt+LLM+write to the existing runner and prompt_loader, and records a `NodeRun` per node.
- **Node execution is stored separately from node definition.** NodeRun metadata is stored per section in `runs/{run_id}/sections/{section_id}.meta.json` (Option A). Section content stays in `sections/{section_id}.md`; existing `read_section` and all APIs are unchanged. A shared execution context (`ExecutionContext`) carries user input and prior node outputs into each step.
- **Single entry point.** `POST /runs` and section rerun go through the executor (`execute_run`, `execute_single_node`); the executor uses the existing runner, storage, and assembler. Run history, section rerun, prompt visibility (GET .../prompt), and assembled output behave as before.
- **Execution-equivalence tests** (`tests/test_orchestration_equivalence.py`) assert that under mock LLM, the orchestration path produces the same run layout, section content, and assembled document as the legacy runner path; that rerun via the executor reassembles correctly; and that NodeRun metadata is written per section.

This foundation prepares the system for evaluation workflows, component-aware graphs, dependency-aware execution (topological order), and future node types (evaluation, transform, validation, etc.) without changing the frontend or public API.
