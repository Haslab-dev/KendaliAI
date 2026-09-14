#!/usr/bin/env bash
# Stop specific quick tunnel created by KendaliAI
PORT="$1"

if [ -z "$PORT" ]; then
    echo "⚠️ Target port is required to safely stop a tunnel without affecting the main app or other tunnels."
    echo "Usage: $0 <port>"
    echo "Example: $0 8080"
    echo ""
    echo "Currently tracked KendaliAI temporary quick tunnels:"
    found=0
    for pidfile in /tmp/cloudflared-*.pid; do
        if [ -f "$pidfile" ]; then
            p=$(echo "$pidfile" | grep -o '[0-9]*')
            pid=$(cat "$pidfile" 2>/dev/null)
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                echo "• Port ${p} (PID ${pid})"
                found=1
            fi
        fi
    done
    if [ "$found" -eq 0 ]; then
        echo "• (No active quick tunnels tracked in /tmp)"
    fi
    exit 1
fi

PID_FILE="/tmp/cloudflared-${PORT}.pid"
LOG_FILE="/tmp/cloudflared-${PORT}.log"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "🛑 Stopping KendaliAI quick tunnel on port ${PORT} (PID ${PID})..."
        kill "$PID" 2>/dev/null
        rm -f "$PID_FILE" "$LOG_FILE"
        echo "✅ Stopped quick tunnel on port ${PORT}."
        echo "ℹ️ Main app tunnels and other processes remain unaffected."
        exit 0
    else
        echo "ℹ️ Process ${PID} is not running. Cleaning up stale PID file."
        rm -f "$PID_FILE" "$LOG_FILE"
        exit 0
    fi
else
    echo "ℹ️ No KendaliAI quick tunnel found running for port ${PORT}."
    echo "ℹ️ Main app tunnels and other processes remain unaffected."
fi
