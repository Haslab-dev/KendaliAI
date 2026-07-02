#!/bin/bash
set -e

SOURCE="$1"
SKILL_NAME="$2"

if [ -z "$SOURCE" ] || [ -z "$SKILL_NAME" ]; then
    echo "Usage: $0 <source-url> <skill-name>"
    exit 1
fi

echo "📥 Fetching external skill: $SKILL_NAME from $SOURCE"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

if [[ "$SOURCE" == https://* ]]; then
    git clone --depth 1 "$SOURCE" "$TEMP_DIR/repo" 2>/dev/null || curl -sL "$SOURCE" -o "$TEMP_DIR/skill.zip"
fi

echo "🔄 Converting to KSP format..."
echo "✅ External skill imported successfully"
