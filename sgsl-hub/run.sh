#!/usr/bin/env bash
# SgSL Hub — Start the server
# Usage: ./run.sh

set -e

cd "$(dirname "$0")/backend"

echo "=== SgSL Hub ==="
echo "Installing dependencies..."
pip install -q -r requirements.txt

echo ""
echo "Starting server at http://localhost:8000"
echo "Press Ctrl+C to stop."
echo ""

uvicorn app:app --reload --port 8000 --host 0.0.0.0
