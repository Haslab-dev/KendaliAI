#!/usr/bin/env bash
# Deterministic server health checker - Zero LLM tokens
THRESH_CPU=${THRESH_CPU:-90}
THRESH_RAM=${THRESH_RAM:-85}
THRESH_DISK=${THRESH_DISK:-80}
CHECK_URL="$1"

ALERT=0
REPORT=""

# 1. Disk check
DISK_USAGE=$(df -k / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "$DISK_USAGE" -ge "$THRESH_DISK" ]; then
    ALERT=1
    REPORT="${REPORT}\n• Disk: ${DISK_USAGE}% (threshold: ${THRESH_DISK}%)"
fi

# 2. Memory & CPU check
if command -v ps &>/dev/null; then
    CPU_USAGE=$(ps -A -o %cpu | awk '{s+=$1} END {print int(s)}')
    RAM_USAGE=$(ps -A -o %mem | awk '{s+=$1} END {print int(s)}')
    
    [ "$CPU_USAGE" -gt 100 ] && CPU_USAGE=100
    [ "$RAM_USAGE" -gt 100 ] && RAM_USAGE=100

    if [ "$CPU_USAGE" -ge "$THRESH_CPU" ]; then
        ALERT=1
        REPORT="${REPORT}\n• CPU: ${CPU_USAGE}% (threshold: ${THRESH_CPU}%)"
    fi
    if [ "$RAM_USAGE" -ge "$THRESH_RAM" ]; then
        ALERT=1
        REPORT="${REPORT}\n• RAM: ${RAM_USAGE}% (threshold: ${THRESH_RAM}%)"
        TOP_PROC=$(ps -A -o %mem,comm | sort -nr | head -n 2 | tail -n 1)
        REPORT="${REPORT}\n  Top Process: ${TOP_PROC}"
    fi
fi

# 3. Docker check
if command -v docker &>/dev/null; then
    UNHEALTHY=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null)
    if [ -n "$UNHEALTHY" ]; then
        ALERT=1
        REPORT="${REPORT}\n• Unhealthy Docker Containers: ${UNHEALTHY}"
    fi
fi

# 4. HTTP Check
if [ -n "$CHECK_URL" ] && command -v curl &>/dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$CHECK_URL" || echo "000")
    if [ "$HTTP_CODE" -ge 500 ] || [ "$HTTP_CODE" = "000" ]; then
        ALERT=1
        REPORT="${REPORT}\n• API Health (${CHECK_URL}): HTTP ${HTTP_CODE}"
    fi
fi

if [ "$ALERT" -eq 1 ]; then
    echo "🚨 VPS Alert"
    echo -e "$REPORT"
    echo ""
    echo "CPU: ${CPU_USAGE}% | RAM: ${RAM_USAGE}% | Disk: ${DISK_USAGE}%"
    exit 1
else
    echo "✅ (no alert) All metrics normal (CPU: ${CPU_USAGE}%, RAM: ${RAM_USAGE}%, Disk: ${DISK_USAGE}%)"
    exit 0
fi
