#!/bin/bash

if [ ! -f "package.json" ]; then
    echo "❌ No package.json found"
    exit 1
fi

echo "🔍 Running ESLint..."
npm run lint
