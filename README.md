# Document Generation Engine (Prototype)

Local, file-based document generation: structured input + template → sequential prompt execution → section outputs → assembled document.

## Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env        # set OPENAI_API_KEY when you add prompt execution
uvicorn src.main:app --reload
```

API: http://localhost:8000  
Docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173 (proxies API to backend)

## Structure

- **backend/prompts/** — One file per section (e.g. `contract/intro.txt`). Placeholders: `{{key}}`.
- **backend/templates/** — JSON per document type: `id`, `name`, `description`, `sections` (ordered).
- **backend/runs/** — One directory per run: `input.json`, `meta.json`, `sections/*.md`, `assembled.md`; `index.json` for list.

## Plan

See `plan.md` for implementation sections and definitions of done.
