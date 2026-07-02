#!/bin/bash
set -e

if [ ! -f "package.json" ]; then
    echo "❌ No package.json found"
    exit 1
fi

echo "🔨 Building React project..."
npm run build
echo "✅ Build complete"
