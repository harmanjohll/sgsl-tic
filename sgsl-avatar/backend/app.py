"""
SgSL Avatar — Backend Server.

Lightweight FastAPI server that:
1. Serves the frontend static files
2. Provides REST API for sign data (reads from data/signs/*.json)

Run: uvicorn app:app --reload --port 8001
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
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


@app.delete("/api/sign/{label}")
async def delete_sign(label: str):
    """Delete a sign from the library."""
    safe_label = "".join(c for c in label if c.isalnum() or c in ('_', '-')).strip()
    sign_path = SIGNS_DIR / f"{safe_label}.json"
    if not sign_path.exists():
        raise HTTPException(status_code=404, detail=f"Sign '{safe_label}' not found")
    sign_path.unlink()
    _rebuild_manifest()
    print(f"[Delete] Sign '{safe_label}' removed")
    return JSONResponse(content={"status": "ok", "label": safe_label})


def _rebuild_manifest():
    """Rebuild the manifest from all sign JSON files."""
    signs = []
    if SIGNS_DIR.exists():
        for fp in sorted(SIGNS_DIR.glob("*.json")):
            if fp.name.startswith("_"):
                continue
            with open(fp) as f:
                data = json.load(f)
            signs.append({"label": data["label"], "frames": len(data.get("landmarks", []))})
    manifest_path = SIGNS_DIR / "_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(signs, f, indent=2)
    return signs


@app.post("/api/sign")
async def save_sign(request: Request):
    """Save a new sign recording."""
    body = await request.json()
    label = body.get("label", "").strip().lower()
    landmarks = body.get("landmarks", [])
    quality = body.get("quality")

    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    if not landmarks or len(landmarks) < 5:
        raise HTTPException(status_code=400, detail="Too few frames (minimum 5)")

    # Sanitize label for filename
    safe_label = "".join(c for c in label if c.isalnum() or c in ('_', '-')).strip()
    if not safe_label:
        raise HTTPException(status_code=400, detail="Invalid label")

    # Save sign data
    SIGNS_DIR.mkdir(parents=True, exist_ok=True)
    sign_data = {
        "label": safe_label,
        "landmarks": landmarks,
        "quality": quality,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "format": "holistic",
    }

    sign_path = SIGNS_DIR / f"{safe_label}.json"
    with open(sign_path, "w") as f:
        json.dump(sign_data, f)

    # Rebuild manifest
    _rebuild_manifest()

    size_kb = sign_path.stat().st_size / 1024
    print(f"[Save] Sign '{safe_label}': {len(landmarks)} frames, {size_kb:.1f} KB")

    return JSONResponse(content={
        "status": "ok",
        "label": safe_label,
        "frames": len(landmarks),
    })


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
