"""
Database layer for SgSL Hub.

Uses PostgreSQL (Supabase) when DATABASE_URL is set,
falls back to SQLite for local development.
"""

import json
import os
import re
import socket
from pathlib import Path

DATABASE_URL = os.environ.get("DATABASE_URL", "")
# psycopg requires postgresql:// scheme
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_USE_PG = bool(DATABASE_URL)

if _USE_PG:
    import psycopg
else:
    import sqlite3
    _SQLITE_PATH = str(Path(__file__).parent / "sgsl.db")


# --- IPv4 fix for Render + Supabase ---
# Render cannot reach IPv6 addresses. Supabase hostnames often resolve to
# IPv6 first. We extract the hostname with a regex (NOT urlparse, which
# crashes on Python 3.14 with some URL formats) and resolve it to IPv4.

def _extract_pg_host(url):
    """Extract hostname from a PostgreSQL connection URL using regex."""
    m = re.search(r'@([a-zA-Z0-9._-]+)', url)
    return m.group(1) if m else None


def _resolve_ipv4(hostname):
    """Resolve a hostname to an IPv4 address. Returns None on failure."""
    try:
        infos = socket.getaddrinfo(hostname, None, socket.AF_INET, socket.SOCK_STREAM)
        if infos:
            ipv4 = infos[0][4][0]
            print(f"[DB] Resolved {hostname} -> {ipv4} (IPv4)")
            return ipv4
    except socket.gaierror as e:
        print(f"[DB] WARNING: IPv4 resolution failed for {hostname}: {e}")
    return None


# --- Connection helpers ---

def _conn():
    if _USE_PG:
        # Force IPv4 to avoid Render IPv6 issues
        host = _extract_pg_host(DATABASE_URL)
        ipv4 = _resolve_ipv4(host) if host else None
        if ipv4:
            return psycopg.connect(DATABASE_URL, hostaddr=ipv4)
        return psycopg.connect(DATABASE_URL)
    conn = sqlite3.connect(_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _exec(conn, sql, params=None):
    """Execute SQL, converting ? placeholders to %s for PostgreSQL."""
    if _USE_PG:
        cur = conn.cursor()
        cur.execute(sql.replace("?", "%s"), params)
        return cur
    return conn.execute(sql, params or ())


def _fetchall(cur):
    """Fetch all rows as list of dicts."""
    if _USE_PG:
        if cur.description is None:
            return []
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    return [dict(r) for r in cur.fetchall()]


def _close(conn, cur=None):
    if cur and _USE_PG:
        cur.close()
    conn.close()


def _json_out(val):
    """Deserialize JSON/JSONB column — PostgreSQL returns dicts/lists natively."""
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return val
    return json.loads(val)


# --- Schema ---

def init_db():
    try:
        conn = _conn()
    except Exception as e:
        print(f"[DB] WARNING: Could not connect to database: {e}")
        print(f"[DB] _USE_PG={_USE_PG}, DATABASE_URL set={bool(DATABASE_URL)}")
        return
    try:
        if _USE_PG:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS signs (
                    id SERIAL PRIMARY KEY,
                    label TEXT NOT NULL,
                    landmarks JSONB NOT NULL,
                    features JSONB,
                    contributor TEXT,
                    status TEXT DEFAULT 'pending',
                    verified_by TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_signs_label ON signs(label)")
            conn.commit()

            # Auto-migrate data from old "signLibrary" table if it exists
            _migrate_from_sign_library(conn)

            cur.close()
            print("[DB] PostgreSQL initialized successfully")
        else:
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
            columns = [row["name"] for row in conn.execute("PRAGMA table_info(signs)").fetchall()]
            if "status" not in columns:
                conn.execute("ALTER TABLE signs ADD COLUMN status TEXT DEFAULT 'pending'")
            if "verified_by" not in columns:
                conn.execute("ALTER TABLE signs ADD COLUMN verified_by TEXT")
            conn.commit()
            print("[DB] SQLite initialized successfully")
    except Exception as e:
        print(f"[DB] WARNING: init_db error: {e}")
    finally:
        conn.close()


def _migrate_from_sign_library(conn):
    """Copy data from the old signLibrary table to signs (one-time migration)."""
    try:
        cur = conn.cursor()
        # Check if signLibrary exists
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'signLibrary'
            )
        """)
        if not cur.fetchone()[0]:
            return

        # Check if signs is empty (don't re-migrate)
        cur.execute("SELECT COUNT(*) FROM signs")
        if cur.fetchone()[0] > 0:
            return

        # Copy data
        cur.execute("""
            INSERT INTO signs (label, landmarks, features, status, created_at)
            SELECT label, landmarks, features, 'verified', created_at
            FROM public."signLibrary"
            WHERE landmarks IS NOT NULL
        """)
        conn.commit()
        count = cur.rowcount
        print(f"[DB] Migrated {count} signs from signLibrary to signs table")
        cur.close()
    except Exception as e:
        print(f"[DB] NOTE: signLibrary migration skipped: {e}")


# --- CRUD ---

def save_sign(label: str, landmarks: list, features: list | None = None, contributor: str | None = None):
    conn = _conn()
    cur = _exec(conn,
        "INSERT INTO signs (label, landmarks, features, contributor, status) VALUES (?, ?, ?, ?, ?)",
        (label, json.dumps(landmarks), json.dumps(features) if features else None, contributor, "pending"),
    )
    conn.commit()
    _close(conn, cur)


def get_all_labels():
    conn = _conn()
    cur = _exec(conn, "SELECT label, COUNT(*) as count FROM signs GROUP BY label ORDER BY label")
    rows = _fetchall(cur)
    _close(conn, cur)
    return [{"label": r["label"], "count": r["count"]} for r in rows]


def get_sign_by_label(label: str, limit: int = 1):
    conn = _conn()
    cur = _exec(conn,
        "SELECT id, label, landmarks, features, contributor, created_at FROM signs WHERE label = ? LIMIT ?",
        (label, limit),
    )
    rows = _fetchall(cur)
    _close(conn, cur)
    return [{
        "id": r["id"],
        "label": r["label"],
        "landmarks": _json_out(r["landmarks"]),
        "features": _json_out(r["features"]),
        "contributor": r["contributor"],
    } for r in rows]


def get_all_signs_with_features():
    conn = _conn()
    cur = _exec(conn, "SELECT id, label, landmarks, features FROM signs WHERE features IS NOT NULL")
    rows = _fetchall(cur)
    _close(conn, cur)
    return [{
        "id": r["id"],
        "label": r["label"],
        "landmarks": _json_out(r["landmarks"]),
        "features": _json_out(r["features"]),
    } for r in rows]


def update_sign_status(sign_id: int, status: str, verified_by: str | None = None):
    conn = _conn()
    cur = _exec(conn,
        "UPDATE signs SET status = ?, verified_by = ? WHERE id = ?",
        (status, verified_by, sign_id),
    )
    conn.commit()
    _close(conn, cur)


def get_pending_signs():
    conn = _conn()
    cur = _exec(conn,
        "SELECT id, label, contributor, status, created_at FROM signs WHERE status = 'pending' ORDER BY created_at DESC",
    )
    rows = _fetchall(cur)
    _close(conn, cur)
    return rows


init_db()
