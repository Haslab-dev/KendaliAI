#!/usr/bin/env bash
# Check active Cloudflare Tunnels
echo "🔍 Checking active Cloudflare Tunnels..."
ps aux | grep "[c]loudflared tunnel" | while read -r line; do
    pid=$(echo "$line" | awk '{print $2}')
    echo "• PID $pid: $line"
done

for pidfile in /tmp/cloudflared-*.pid; do
    if [ -f "$pidfile" ]; then
        port=$(echo "$pidfile" | grep -o '[0-9]*')
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            logfile="/tmp/cloudflared-${port}.log"
            url=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$logfile" 2>/dev/null | tail -n 1)
            echo "✅ Port ${port} (PID ${pid}) ➔ ${url:-waiting for URL}"
        else
            rm -f "$pidfile"
        fi
    fi
done
