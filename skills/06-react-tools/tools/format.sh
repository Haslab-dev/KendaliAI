#!/bin/bash

echo "📝 Formatting code with Prettier..."
npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"
echo "✅ Format complete"
