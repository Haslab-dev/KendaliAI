#!/bin/bash

echo "🧹 Post-run: Cleanup and logging..."

LOG_FILE="memory/last-run.log"
mkdir -p memory

echo "[$(date)] Run completed" >> "$LOG_FILE"

echo "✅ Post-run complete"
