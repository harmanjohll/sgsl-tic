"""
SgSL Hub — Backend Server.

FastAPI application that serves the frontend and provides REST API
for sign language contribution, recognition, and library browsing.

Run: uvicorn app:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pathlib import Path
import os
import sys
import traceback

sys.path.insert(0, str(Path(__file__).parent))

from db.database import (
    save_sign, get_all_labels, get_sign_by_label,
    get_all_signs_with_features, update_sign_status, get_pending_signs,
    delete_sign_by_label,
)
from ml.recognizer import (
    extract_sequence_features,
    recognize_dtw,
    classifier,
)

app = FastAPI(title="SgSL Hub", version="2.0")

FRONTEND = Path(__file__).parent.parent / "frontend"


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return JSON for all unhandled errors (DB connection failures, etc.)."""
    print(f"[ERROR] {request.method} {request.url.path}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {type(exc).__name__}: {exc}"},
    )

# Allowed email domains for contributors (comma-separated env var)
ALLOWED_DOMAINS = [
    d.strip() for d in os.environ.get("ALLOWED_DOMAINS", "btyss.moe.edu.sg").split(",") if d.strip()
]


# --- Pydantic models ---
class ContributeRequest(BaseModel):
    label: str
    landmarks: list
    contributor: str | None = None


class RecognizeRequest(BaseModel):
    landmarks: list


class LoginRequest(BaseModel):
    email: str


class VerifyRequest(BaseModel):
    status: str
    verified_by: str | None = None


# --- Auth ---
@app.post("/api/auth/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "Invalid email address")
    domain = email.split("@", 1)[1]
    if domain not in ALLOWED_DOMAINS:
        raise HTTPException(403, "Only emails from approved school domains can contribute")
    return {"status": "ok", "email": email, "role": "contributor"}


# --- API routes ---
@app.get("/api/signs")
def list_signs():
    return get_all_labels()


@app.get("/api/sign/{label}")
def get_sign(label: str):
    results = get_sign_by_label(label, limit=1)
    if not results:
        raise HTTPException(404, f'No sign found for "{label}"')
    return results[0]


@app.delete("/api/sign/{label}")
def delete_sign(label: str):
    count = delete_sign_by_label(label)
    if count == 0:
        raise HTTPException(404, f'No sign found for "{label}"')
    _retrain_classifier()
    return {"status": "ok", "deleted": count}


@app.post("/api/contribute")
def contribute(req: ContributeRequest):
    label = req.label.strip().lower()
    if not label:
        raise HTTPException(400, "Label is required")
    if not req.landmarks or len(req.landmarks) < 3:
        raise HTTPException(400, "Recording too short — need at least 3 frames")

    # Validate contributor email domain
    if not req.contributor:
        raise HTTPException(401, "Sign in with your school email to contribute")
    contributor = req.contributor.strip().lower()
    domain = contributor.split("@", 1)[1] if "@" in contributor else ""
    if domain not in ALLOWED_DOMAINS:
        raise HTTPException(403, "Only approved school email domains can contribute signs")

    features = extract_sequence_features(req.landmarks)
    save_sign(label, req.landmarks, features, contributor)

    _retrain_classifier()

    return {"status": "ok", "label": label, "frames": len(req.landmarks), "features": len(features)}


@app.post("/api/recognize")
def recognize(req: RecognizeRequest):
    if not req.landmarks or len(req.landmarks) < 3:
        raise HTTPException(400, "Recording too short — need at least 3 frames")

    query_features = extract_sequence_features(req.landmarks)
    if not query_features:
        raise HTTPException(400, "Could not extract features — no valid hand poses detected")

    library = get_all_signs_with_features()
    if not library:
        raise HTTPException(404, "Sign library is empty — contribute some signs first")

    dtw_results = recognize_dtw(query_features, library)

    knn_results = []
    if classifier.is_trained:
        knn_results = classifier.predict(query_features)

    return {
        "dtw": dtw_results,
        "knn": knn_results,
        "method": "dtw+knn" if knn_results else "dtw",
    }


@app.post("/api/retrain")
def retrain():
    _retrain_classifier()
    return {"status": "ok", "trained": classifier.is_trained}


def _retrain_classifier():
    library = get_all_signs_with_features()
    classifier.train(library)


# --- Admin endpoints (sign verification) ---
@app.get("/api/admin/pending")
def list_pending():
    return get_pending_signs()


@app.post("/api/admin/verify/{sign_id}")
def verify_sign(sign_id: int, req: VerifyRequest):
    if req.status not in ("verified", "rejected", "pending"):
        raise HTTPException(400, "Status must be 'verified', 'rejected', or 'pending'")
    update_sign_status(sign_id, req.status, req.verified_by)
    return {"status": "ok"}


# --- Serve frontend ---
for static_dir in ("css", "js", "assets"):
    dir_path = FRONTEND / static_dir
    if dir_path.is_dir():
        app.mount(f"/{static_dir}", StaticFiles(directory=str(dir_path)), name=static_dir)


@app.get("/")
def serve_index():
    return FileResponse(str(FRONTEND / "index.html"))


# Train classifier on startup
@app.on_event("startup")
def startup():
    try:
        _retrain_classifier()
        print("[STARTUP] Classifier trained successfully")
    except Exception as e:
        print(f"[STARTUP] WARNING: Could not train classifier on startup: {e}")
        print("[STARTUP] The app will still work — classifier will train on first contribution")
