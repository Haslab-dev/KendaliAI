package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func (tr *ToolRegistry) BrowserTools() map[string]ToolDef {
	return map[string]ToolDef{
		"browser_open": {
			Name:        "browser_open",
			Description: "Opens a URL in the default browser.",
			Signature:   `{"url": "string"}`,
			Category:    "Browser",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				if urlStr == "" {
					return "error: 'url' is required"
				}

				cmd := exec.Command("open", urlStr)
				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("error opening browser: %v", err)
				}

				return fmt.Sprintf(`{"status":"opened","url":"%s"}`, urlStr)
			},
		},

		"browser_screenshot": {
			Name:        "browser_screenshot",
			Description: "Takes a screenshot of a URL.",
			Signature:   `{"url": "string", "dest": "string"}`,
			Category:    "Browser",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				dest, _ := args["dest"].(string)

				if urlStr == "" {
					return "error: 'url' is required"
				}
				if dest == "" {
					dest = fmt.Sprintf("screenshot-%d.png", time.Now().Unix())
				}

				if !filepath.IsAbs(dest) {
					dest = filepath.Join(tr.workspaceRoot, dest)
				}

				if _, err := exec.LookPath("puppeteer"); err != nil {
					cmd := exec.Command("curl", "-s", "-o", dest, urlStr)
					cmd.Run()
					return fmt.Sprintf(`{"status":"saved","dest":"%s","note":"curl fallback"}`, dest)
				}

				script := fmt.Sprintf(`
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('%s');
  await page.screenshot({ path: '%s' });
  await browser.close();
})();
`, urlStr, dest)

				tmpFile := filepath.Join(os.TempDir(), "screenshot.js")
				os.WriteFile(tmpFile, []byte(script), 0644)
				defer os.Remove(tmpFile)

				cmd := exec.Command("node", tmpFile)
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("screenshot failed: %v (%s)", err, string(out))
				}

				return fmt.Sprintf(`{"status":"captured","dest":"%s"}`, dest)
			},
		},

		"browser_extract": {
			Name:        "browser_extract",
			Description: "Extracts data from a URL using CSS selectors.",
			Signature:   `{"url": "string", "selector": "string"}`,
			Category:    "Browser",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				selector, _ := args["selector"].(string)

				if urlStr == "" || selector == "" {
					return "error: 'url' and 'selector' are required"
				}

				if _, err := exec.LookPath("puppeteer"); err != nil {
					return "error: puppeteer not installed"
				}

				script := fmt.Sprintf(`
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('%s');
  const data = await page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    return Array.from(els).map(el => el.textContent.trim());
  }, '%s');
  console.log(JSON.stringify(data));
  await browser.close();
})();
`, urlStr, selector)

				tmpFile := filepath.Join(os.TempDir(), "extract.js")
				os.WriteFile(tmpFile, []byte(script), 0644)
				defer os.Remove(tmpFile)

				cmd := exec.Command("node", tmpFile)
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("extract failed: %v", err)
				}

				var results []string
				json.Unmarshal(out, &results)
				b, _ := json.MarshalIndent(results, "", "  ")
				return string(b)
			},
		},

		"browser_pdf": {
			Name:        "browser_pdf",
			Description: "Generates a PDF from a URL.",
			Signature:   `{"url": "string", "dest": "string"}`,
			Category:    "Browser",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				dest, _ := args["dest"].(string)

				if urlStr == "" {
					return "error: 'url' is required"
				}
				if dest == "" {
					dest = fmt.Sprintf("page-%d.pdf", time.Now().Unix())
				}

				if !filepath.IsAbs(dest) {
					dest = filepath.Join(tr.workspaceRoot, dest)
				}

				script := fmt.Sprintf(`
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('%s');
  await page.pdf({ path: '%s' });
  await browser.close();
})();
`, urlStr, dest)

				tmpFile := filepath.Join(os.TempDir(), "pdf.js")
				os.WriteFile(tmpFile, []byte(script), 0644)
				defer os.Remove(tmpFile)

				cmd := exec.Command("node", tmpFile)
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("pdf failed: %v (%s)", err, string(out))
				}

				return fmt.Sprintf(`{"status":"created","dest":"%s"}`, dest)
			},
		},

		"browser_markdown": {
			Name:        "browser_markdown",
			Description: "Converts a web page to markdown using pandoc.",
			Signature:   `{"url": "string"}`,
			Category:    "Browser",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				if urlStr == "" {
					return "error: 'url' is required"
				}

				if _, err := exec.LookPath("pandoc"); err != nil {
					return "error: pandoc not installed. Run: brew install pandoc"
				}

				tmpHTML := filepath.Join(os.TempDir(), "temp.html")
				tmpMD := filepath.Join(os.TempDir(), "temp.md")

				cmd := exec.Command("curl", "-s", "-o", tmpHTML, urlStr)
				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("fetch error: %v", err)
				}

				cmd = exec.Command("pandoc", "-f", "html", "-t", "markdown", "-o", tmpMD, tmpHTML)
				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("convert error: %v", err)
				}

				md, _ := os.ReadFile(tmpMD)
				os.Remove(tmpHTML)
				os.Remove(tmpMD)

				content := string(md)
				if len(content) > 8000 {
					content = content[:8000] + "\n...(truncated)"
				}

				return content
			},
		},
	}
}
