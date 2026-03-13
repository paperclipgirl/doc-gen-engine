# Document Generation Engine (Prototype)

Local, file-based document generation: structured input + template → sequential prompt execution → section outputs → assembled document.

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

## Where data is stored

All persistence is file-based under `backend/`:

- **backend/prompts/** — One text file per section (e.g. `contract/intro.txt`). Supports `{{placeholder}}` substitution from structured input.
- **backend/templates/** — One JSON file per document type (e.g. `contract.json`): `id`, `name`, `description`, `sections` (ordered list with `id`, `prompt_path`, `display_name`).
- **backend/runs/** — One directory per run, named by `run_id`:
  - `input.json` — Template id and structured input for the run.
  - `meta.json` — Run metadata (status, timestamps, section_ids).
  - `sections/*.md` — One file per section output.
  - `assembled.md` — Final assembled document.
  - `index.json` (at `runs/` level) — List of runs for history.

## Plan

See `plan.md` for implementation sections and scope.
