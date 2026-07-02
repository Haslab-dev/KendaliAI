#!/bin/bash
set -e

echo "🔍 Pre-run: Validating project..."

if [ -f ".python-version" ]; then
    REQUIRED_VERSION=$(cat .python-version)
    CURRENT_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    if [[ "$REQUIRED_VERSION" != "$CURRENT_VERSION" ]]; then
        echo "⚠️  Python version mismatch: required=$REQUIRED_VERSION, current=$CURRENT_VERSION"
    fi
fi

if [ -f "requirements.txt" ]; then
    MISSING=$(python3 -m pip check 2>&1 || true)
    if [ -n "$MISSING" ]; then
        echo "⚠️  Dependency issues detected"
    fi
fi

echo "✓ Pre-run checks passed"
