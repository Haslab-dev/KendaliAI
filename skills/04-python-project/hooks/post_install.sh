#!/bin/bash
set -e

echo "✅ Post-install: Setting up Python project..."

if [ -f "requirements.txt" ]; then
    echo "📦 Installing from requirements.txt..."
    python3 -m pip install -r requirements.txt 2>/dev/null || pip3 install -r requirements.txt
else
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "✓ Virtual environment created at .venv"
fi

if [ -f "pyproject.toml" ]; then
    echo "📦 Installing from pyproject.toml..."
    pip install -e . 2>/dev/null || python3 -m pip install -e .
fi

echo "✅ Python project ready"
