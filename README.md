# Clio Operate Solution Factory

Generate reusable accelerators and client practice solutions: define solution type, practice area, and output type; then run sequential prompt execution to produce section outputs and an assembled document. File-based storage, optional section feedback, and a review-mode UI.

## Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
uvicorn src.main:app --reload
```

- **API:** http://localhost:8000  
- **Docs:** http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- **App:** http://localhost:5173 (proxies `/api` to backend)

## Environment

- **Backend** (optional): copy `backend/.env.example` to `backend/.env`.
  - **OPENAI_API_KEY** — If set, the API uses the real pipeline. If unset, the API runs in **mock mode** (placeholder section output) so you can verify endpoints without a key.
  - **USE_MOCK_LLM** — Set to `1` to force mock mode even when `OPENAI_API_KEY` is set (e.g. local testing).
  - **CORS_ORIGINS** — Comma-separated list of allowed frontend origins (default: localhost:5173). Set in production to your frontend URL(s).

## Deployment

- **Backend:** Run with a process manager or container. Example: `uvicorn src.main:app --host 0.0.0.0 --port 8000` (no `--reload` in production). Set `OPENAI_API_KEY` and `CORS_ORIGINS` via environment (or `.env`); do not commit secrets.
- **Frontend:** Build with `npm run build`; serve the `dist/` folder with a static server or reverse proxy. Point the app at your backend API (same origin or configure proxy / API base URL).
- **Data:** All state is under `backend/runs/` and `backend/prompts/`, `backend/templates/`. Back up these directories if you need to preserve runs and feedback.

## Security

- **Secrets:** Keep `OPENAI_API_KEY` and any other secrets in environment or a secure secret store; do not commit them.
- **CORS:** Set `CORS_ORIGINS` in production to the exact origin(s) of your frontend to avoid cross-origin abuse.
- **Rate limiting:** Not included; add at the reverse proxy or gateway if the API is exposed to untrusted users.

## Where data is stored

All persistence is file-based under `backend/`:

- **backend/prompts/** — One text file per section (e.g. `implementation_guidance/00_project_instructions.txt`). Supports `{{key}}` substitution: values come from structured input plus `{{previous_sections}}` (prior section content, populated by the runner). For Implementation Guidance, use `{{topic}}`, `{{jurisdiction}}`, `{{context}}`, and `{{previous_sections}}`.
- **backend/templates/** — One JSON file per document type (e.g. `implementation_guidance.json`): `id`, `name`, `description`, `sections` (ordered list with `id`, `prompt_path`, `display_name`).
- **backend/runs/** — One directory per run, named by `run_id`:
  - `input.json` — Template id and structured input for the run.
  - `meta.json` — Run metadata (status, timestamps, section_ids).
  - `sections/*.md` — One file per section output.
  - `assembled.md` — Final assembled document.
  - `index.json` (at `runs/` level) — List of runs for history.

## Plan

See `plan.md` for implementation sections and scope.
