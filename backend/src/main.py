"""
FastAPI app: CORS enabled, API routes mounted.
Run from backend directory: uvicorn src.main:app --reload
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router as api_router

app = FastAPI(title="Clio Operate Solution Factory", version="0.1.0")

# CORS: default to local dev; set CORS_ORIGINS (comma-separated) in production.
_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").strip().split(",")
_origins = [o.strip() for o in _origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {"service": "Clio Operate Solution Factory", "docs": "/docs"}
