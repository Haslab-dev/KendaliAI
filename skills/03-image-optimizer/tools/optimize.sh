#!/bin/bash
# KSP Tool: optimize-image
# Compresses images using available system tools
set -e

INPUT="$1"
if [ -z "$INPUT" ]; then
  echo "Usage: optimize.sh <image-path>"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "File not found: $INPUT"
  exit 1
fi

SIZE_BEFORE=$(stat -f%z "$INPUT" 2>/dev/null || stat -c%s "$INPUT" 2>/dev/null)
EXT="${INPUT##*.}"

echo "Optimizing: $INPUT (${SIZE_BEFORE} bytes, .$EXT)"

if command -v pngquant &>/dev/null && [ "$EXT" = "png" ]; then
  pngquant --quality=65-80 --force --output "$INPUT" "$INPUT"
elif command -v jpegoptim &>/dev/null && [ "$EXT" = "jpg" -o "$EXT" = "jpeg" ]; then
  jpegoptim --max=80 --strip-all "$INPUT"
elif command -v sips &>/dev/null; then
  sips -s format "$EXT" "$INPUT" --resampleWidth 1200 &>/dev/null
elif command -v convert &>/dev/null; then
  convert "$INPUT" -quality 80 "$INPUT"
else
  echo "No optimization tool available. Install pngquant, jpegoptim, or ImageMagick."
  exit 1
fi

SIZE_AFTER=$(stat -f%z "$INPUT" 2>/dev/null || stat -c%s "$INPUT" 2>/dev/null)
SAVED=$((SIZE_BEFORE - SIZE_AFTER))
PCT=$((SAVED * 100 / SIZE_BEFORE))

echo "Optimized: ${SIZE_AFTER} bytes (saved ${SAVED} bytes, ${PCT}%)"
