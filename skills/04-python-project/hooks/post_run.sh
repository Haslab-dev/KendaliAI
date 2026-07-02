#!/bin/bash

echo "🧹 Post-run: Cleaning up..."

if [ -d "__pycache__" ]; then
    find __pycache__ -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
fi

if [ -d ".pytest_cache" ]; then
    rm -rf .pytest_cache 2>/dev/null || true
fi

if [ -d ".mypy_cache" ]; then
    rm -rf .mypy_cache 2>/dev/null || true
fi

find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true

echo "✓ Cleanup complete"
