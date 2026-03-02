"""
SgSL Hub — Backend Server.

FastAPI application that serves the frontend and provides REST API
for sign language contribution, recognition, and library browsing.

Run: uvicorn app:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))

from db.database import save_sign, get_all_labels, get_sign_by_label, get_all_signs_with_features
from ml.recognizer import (
    extract_sequence_features,
    recognize_dtw,
    classifier,
)

app = FastAPI(title="SgSL Hub", version="2.0")

FRONTEND = Path(__file__).parent.parent / "frontend"


# --- Pydantic models ---
class ContributeRequest(BaseModel):
    label: str
    landmarks: list
    contributor: str | None = None


class RecognizeRequest(BaseModel):
    landmarks: list


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


@app.post("/api/contribute")
def contribute(req: ContributeRequest):
    label = req.label.strip().lower()
    if not label:
        raise HTTPException(400, "Label is required")
    if not req.landmarks or len(req.landmarks) < 3:
        raise HTTPException(400, "Recording too short — need at least 3 frames")

    features = extract_sequence_features(req.landmarks)
    save_sign(label, req.landmarks, features, req.contributor)

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
    _retrain_classifier()
