#!/usr/bin/env bash
echo "====================================================================="
echo "   KSUMC Safety & Inspection System - Local Runner"
echo "====================================================================="
if command -v node >/dev/null 2>&1; then
    echo "Starting local server at http://localhost:8080 ..."
    node server.js &
    sleep 1
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://localhost:8080
    elif command -v open >/dev/null 2>&1; then
        open http://localhost:8080
    fi
else
    echo "Node.js not detected. Opening index.html directly..."
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open index.html
    elif command -v open >/dev/null 2>&1; then
        open index.html
    fi
fi
