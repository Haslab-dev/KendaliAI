#!/usr/bin/env bash
# Named Cloudflare Tunnel runner script
NAME="$1"

if [ -z "$NAME" ]; then
    echo "Usage: $0 <tunnel-name>"
    echo "Example: $0 dev-app"
    exit 1
fi

if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed."
    exit 1
fi

echo "🚀 Starting named tunnel '${NAME}'..."
cloudflared tunnel run "$NAME"
