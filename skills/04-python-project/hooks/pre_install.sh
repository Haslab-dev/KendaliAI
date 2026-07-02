#!/bin/bash
set -e

echo "🔍 Pre-install: Checking Python environment..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install python3 first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python $PYTHON_VERSION detected"

MIN_VERSION="3.8"
if [[ "$(printf '%s\n' "$MIN_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$MIN_VERSION" ]]; then
    echo "❌ Python version must be >= $MIN_VERSION"
    exit 1
fi

echo "✓ Python version meets requirements"
