"""
SgSL Avatar — Backend Server.

Lightweight FastAPI server that:
1. Serves the frontend static files
2. Provides REST API for sign data (reads from data/signs/*.json)

Run: uvicorn app:app --reload --port 8001
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="SgSL Avatar", version="1.0")

PROJECT_DIR = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
SIGNS_DIR = PROJECT_DIR / "data" / "signs"


def _load_manifest():
    """Load the sign manifest (list of available signs)."""
    manifest_path = SIGNS_DIR / "_manifest.json"
    if manifest_path.exists():
        with open(manifest_path) as f:
            return json.load(f)
    # Fallback: scan directory
    signs = []
    if SIGNS_DIR.exists():
        for fp in sorted(SIGNS_DIR.glob("*.json")):
            if fp.name.startswith("_"):
                continue
            with open(fp) as f:
                data = json.load(f)
            signs.append({"label": data["label"], "frames": len(data.get("landmarks", []))})
    return signs


@app.get("/api/signs")
async def list_signs():
    """List all available sign labels."""
    manifest = _load_manifest()
    return JSONResponse(content=manifest)


@app.get("/api/sign/{label}")
async def get_sign(label: str):
    """Get landmark data for a specific sign."""
    sign_path = SIGNS_DIR / f"{label}.json"
    if not sign_path.exists():
        raise HTTPException(status_code=404, detail=f"Sign '{label}' not found")
    with open(sign_path) as f:
        data = json.load(f)
    return JSONResponse(content=data)


# Serve frontend static files
@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


# Mount static directories
if (FRONTEND_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
if (FRONTEND_DIR / "css").exists():
    app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
if (FRONTEND_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
