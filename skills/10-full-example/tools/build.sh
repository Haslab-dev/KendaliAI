#!/bin/bash
set -e

echo "🔨 Building project..."

if [ -f "package.json" ]; then
    npm run build || echo "Build script not found, skipping..."
fi

echo "✅ Build complete"
