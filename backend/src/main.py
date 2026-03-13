"""
FastAPI app: CORS enabled, API routes mounted.
Run from backend directory: uvicorn src.main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router as api_router

app = FastAPI(title="Document Generation Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {"service": "Document Generation Engine", "docs": "/docs"}
