#!/usr/bin/env bash
set -e

echo "📦 Installing KendaliAI to system PATH..."

# 1. Detect OS
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "⚠️ Unknown architecture: $ARCH, proceeding with default build..." ;;
esac

# 2. Determine best bin destination
if [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

TARGET="$BIN_DIR/kendaliai"

# 3. Build if in source repo, or check build/kendaliai
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT_DIR/cmd/kendaliai/main.go" ]; then
  echo "🔨 Building KendaliAI from source in $ROOT_DIR..."
  (cd "$ROOT_DIR" && go build -o "$ROOT_DIR/build/kendaliai" ./cmd/kendaliai)
  SRC="$ROOT_DIR/build/kendaliai"
elif [ -f "$ROOT_DIR/build/kendaliai" ]; then
  SRC="$ROOT_DIR/build/kendaliai"
else
  echo "❌ Source binary not found in $ROOT_DIR. Please run from repository."
  exit 1
fi

# 4. Replace old build
if [ -f "$TARGET" ]; then
  echo "🔄 Replacing existing build at $TARGET..."
  rm -f "$TARGET"
fi

# Copy binary and set permissions
cp "$SRC" "$TARGET"
chmod 0755 "$TARGET"

# 5. Ensure ~/.kendaliai directory exists
mkdir -p "$HOME/.kendaliai"

# 6. Verify PATH
IN_PATH=false
IFS=':' read -ra PATH_DIRS <<< "$PATH"
for p in "${PATH_DIRS[@]}"; do
  if [ "$p" = "$BIN_DIR" ]; then
    IN_PATH=true
    break
  fi
done

PROFILE_UPDATED=""
if [ "$IN_PATH" = false ]; then
  EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""
  
  if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    RC="$HOME/.zshrc"
  elif [ -n "$BASH_VERSION" ] || [ -f "$HOME/.bashrc" ]; then
    RC="$HOME/.bashrc"
  else
    RC="$HOME/.profile"
  fi

  if ! grep -qs "$BIN_DIR" "$RC"; then
    echo "" >> "$RC"
    echo "# KendaliAI PATH" >> "$RC"
    echo "$EXPORT_LINE" >> "$RC"
    PROFILE_UPDATED="$RC"
  fi
fi

echo ""
echo "🎉 Successfully installed KendaliAI!"
echo "   • Binary Location: $TARGET"
if [ "$IN_PATH" = true ]; then
  echo "   • PATH Status:     Already in \$PATH ✓"
elif [ -n "$PROFILE_UPDATED" ]; then
  echo "   • PATH Status:     Added to $PROFILE_UPDATED ✓"
  echo "   • Next Step:       Run 'source $PROFILE_UPDATED' or open a new terminal"
fi

echo ""
echo "🚀 Run 'kendaliai --help' to get started."
