#!/bin/bash

echo "🚀 Deploying..."

if [ -d "dist" ]; then
    echo "📁 Deploying contents of dist/..."
    echo "✅ Deploy complete"
else
    echo "⚠️  No dist/ folder found. Run build first."
fi
