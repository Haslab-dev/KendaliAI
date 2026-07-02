#!/bin/bash
set -e

OUTPUT="${1:-index.html}"

echo "🔨 Building landing page..."

cat > "$OUTPUT" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; line-height: 1.6; }
    section { padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; }
    .hero { text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .hero h1 { font-size: 3rem; margin-bottom: 1rem; }
    .hero button { padding: 1rem 2rem; font-size: 1.2rem; background: white; color: #667eea; border: none; border-radius: 8px; cursor: pointer; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; }
    .feature { text-align: center; padding: 2rem; background: #f8f9fa; border-radius: 12px; }
    .pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; }
    .plan { text-align: center; padding: 2rem; border: 2px solid #e9ecef; border-radius: 12px; }
    .cta { text-align: center; background: #f8f9fa; }
    .cta button { padding: 1rem 2rem; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
EOF

for f in components/*.html; do
    [ -f "$f" ] && cat "$f" >> "$OUTPUT"
done

echo "</body></html>" >> "$OUTPUT"

echo "✅ Built: $OUTPUT"
