#!/bin/bash

FILE="${1:-index.html}"

if [ ! -f "$FILE" ]; then
    echo "❌ File not found: $FILE"
    exit 1
fi

echo "📸 Taking screenshot..."

OUTPUT="${FILE%.html}-preview.png"

if command -v puppeteer &> /dev/null; then
    node -e "
    const puppeteer = require('puppeteer');
    (async () => {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto('file://$(pwd)/$FILE');
      await page.screenshot({ path: '$OUTPUT' });
      await browser.close();
    })();
    "
elif command -v webshot &> /dev/null; then
    webshot "$FILE" "$OUTPUT"
else
    echo "⚠️  No screenshot tool available. Install puppeteer or webshot."
    echo "   Preview available at: $FILE"
fi
