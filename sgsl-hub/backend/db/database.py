"""SQLite database layer for SgSL Hub."""

import sqlite3
import json
import os
from pathlib import Path

DB_PATH = Path(__file__).parent / "sgsl.db"


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS signs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            landmarks TEXT NOT NULL,
            features TEXT,
            contributor TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_signs_label ON signs(label);
    """)
    conn.close()


def save_sign(label: str, landmarks: list, features: list | None = None, contributor: str | None = None):
    conn = get_connection()
    conn.execute(
        "INSERT INTO signs (label, landmarks, features, contributor) VALUES (?, ?, ?, ?)",
        (label, json.dumps(landmarks), json.dumps(features) if features else None, contributor),
    )
    conn.commit()
    conn.close()


def get_all_labels():
    conn = get_connection()
    rows = conn.execute("SELECT label, COUNT(*) as count FROM signs GROUP BY label ORDER BY label").fetchall()
    conn.close()
    return [{"label": r["label"], "count": r["count"]} for r in rows]


def get_sign_by_label(label: str, limit: int = 1):
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, label, landmarks, features, contributor, created_at FROM signs WHERE label = ? LIMIT ?",
        (label, limit),
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        results.append({
            "id": r["id"],
            "label": r["label"],
            "landmarks": json.loads(r["landmarks"]),
            "features": json.loads(r["features"]) if r["features"] else None,
            "contributor": r["contributor"],
        })
    return results


def get_all_signs_with_features():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, label, landmarks, features FROM signs WHERE features IS NOT NULL"
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        results.append({
            "id": r["id"],
            "label": r["label"],
            "landmarks": json.loads(r["landmarks"]),
            "features": json.loads(r["features"]),
        })
    return results


init_db()
