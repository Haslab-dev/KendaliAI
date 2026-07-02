#!/bin/bash
set -e

echo "📦 Post-install: Installing dependencies..."

if [ -f "package.json" ]; then
    npm install
fi

mkdir -p memory resources/templates resources/docs resources/assets

echo "✅ Installation complete"
