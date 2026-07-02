#!/bin/bash
echo "Creating virtual environment..."
python3 -m venv .venv 2>/dev/null || echo "venv skipped"
