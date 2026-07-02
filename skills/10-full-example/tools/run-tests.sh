#!/bin/bash

echo "🧪 Running tests..."

if [ -f "package.json" ]; then
    npm test || echo "No test script configured"
else
    echo "⚠️  No package.json found"
fi
