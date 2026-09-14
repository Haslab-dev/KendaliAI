#!/usr/bin/env bash
# Quick Cloudflare Tunnel script
PORT="${1:-8080}"
LOG_FILE="/tmp/cloudflared-${PORT}.log"
PID_FILE="/tmp/cloudflared-${PORT}.pid"

if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed. Run 'brew install cloudflared' on macOS or install from cloudflare.com."
    exit 1
fi

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "ℹ️ Tunnel already running for port ${PORT} (PID: $(cat "$PID_FILE"))"
    grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_FILE" | tail -n 1
    exit 0
fi

echo "🚀 Starting Quick Tunnel for http://localhost:${PORT}..."
cloudflared tunnel --url "http://localhost:${PORT}" > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

# Wait for URL to appear in log
URL=""
for i in {1..20}; do
    sleep 0.5
    URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_FILE" | tail -n 1)
    if [ -n "$URL" ]; then
        break
    fi
done

if [ -n "$URL" ]; then
    echo "🎉 Public URL: ${URL}"
    echo "Target: http://localhost:${PORT}"
    echo "PID: ${PID}"
else
    echo "⚠️ Started process (PID: ${PID}) but public URL not detected yet. Check log: ${LOG_FILE}"
fi
