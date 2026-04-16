#!/usr/bin/env bash
# SgSL Avatar — Local development server
# Runs on port 8001 (doesn't conflict with sgsl-hub on 8000)

set -e

cd "$(dirname "$0")"

# Check for sign data
if [ ! -f "data/signs/_manifest.json" ]; then
  echo "[Setup] Extracting sample sign data..."
  python3 backend/extract_signs.py
fi

echo ""
echo "  SgSL Avatar — SMPL-X Sign Language Viewer"
echo "  ─────────────────────────────────────────"
echo "  http://localhost:8001"
echo ""

cd backend
python3 -m uvicorn app:app --reload --port 8001 --host 0.0.0.0
