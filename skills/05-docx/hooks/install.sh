#!/bin/bash
set -e

echo "📦 Installing DOCX dependencies..."

pip install python-docx mammoth 2>/dev/null || pip3 install python-docx mammoth

if ! command -v libreoffice &> /dev/null; then
    echo "⚠️  LibreOffice not found. Run: brew install --cask libreoffice"
fi

echo "✅ DOCX dependencies ready"
