#!/bin/bash
set -e

echo "🔍 Pre-run: Validating environment..."

if [ ! -f "package.json" ]; then
    echo "⚠️  No package.json found"
fi

if [ -d "node_modules" ]; then
    echo "✓ Dependencies installed"
else
    echo "⚠️  Run npm install first"
fi

echo "✅ Pre-run validation complete"
