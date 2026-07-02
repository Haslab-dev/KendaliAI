#!/bin/bash
set -e

echo "🔧 Pre-install: Full Example skill"

if command -v node &> /dev/null; then
    echo "✓ Node.js detected: $(node --version)"
fi

if command -v npm &> /dev/null; then
    echo "✓ npm detected: $(npm --version)"
fi

echo "✅ Pre-install checks complete"
