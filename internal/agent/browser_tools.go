package agent

import (
	"context"
	"strings"

	"github.com/kendaliai/app/internal/browser"
)

// BrowserTools returns the browser-use tool set driven through chromedp.
// The agent works in a snapshot → act loop: browser_navigate/snapshot lists
// interactive elements with indexes; click/type act on those indexes.
func BrowserTools() map[string]ToolDef {
	tools := map[string]ToolDef{}

	tools["browser_navigate"] = ToolDef{
		Name: "browser_navigate",
		Description: "Opens a URL in the agent's Chromium browser (persistent profile, real browser) and returns the page's interactive elements as an indexed list. " +
			"Always the first step for any web task; use browser_click/browser_type on the returned indexes afterwards.",
		Signature: `{"url": "string"}`,
		Category:  "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			url := strings.TrimSpace(str(args, "url"))
			if url == "" {
				return "error: 'url' is required"
			}
			out, err := browser.Navigate(url)
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_snapshot"] = ToolDef{
		Name:  "browser_snapshot",
		Description: "Lists the current page's interactive elements (buttons, links, inputs) with indexes. " +
			"Call this again whenever the page changed or an index is stale.",
		Signature: `{}`,
		Category:  "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			out, err := browser.Snapshot()
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_click"] = ToolDef{
		Name:  "browser_click",
		Description: "Clicks an element from the last snapshot by its index and returns a fresh snapshot of the resulting page. " +
			"Use count:2 for double-click.",
		Signature: `{"index": "int", "count": "int"}`,
		Category:  "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			index, ok := numArg(args, "index")
			if !ok {
				return "error: 'index' is required (from browser_snapshot)"
			}
			count := 1
			if c, ok := numArg(args, "count"); ok && int(c) > 1 {
				count = int(c)
			}
			out, err := browser.Click(int(index), count)
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_type"] = ToolDef{
		Name:  "browser_type",
		Description: "Types text into an input element from the last snapshot by its index. Set clear:true to empty the field first. " +
			"After typing into a search box, follow with browser_key Enter or click the submit button.",
		Signature: `{"index": "int", "text": "string", "clear": "boolean"}`,
		Category:  "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			index, ok := numArg(args, "index")
			if !ok {
				return "error: 'index' is required (from browser_snapshot)"
			}
			text := str(args, "text")
			if text == "" {
				return "error: 'text' is required"
			}
			clear := false
			if c, ok := args["clear"].(bool); ok {
				clear = c
			}
			out, err := browser.Type(int(index), text, clear)
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_key"] = ToolDef{
		Name:        "browser_key",
		Description: "Presses a special key in the focused element: Enter, Tab, Escape, Backspace, Delete, ArrowUp/Down/Left/Right, PageUp, PageDown, Home, End, Space.",
		Signature:   `{"key": "string"}`,
		Category:    "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			key := strings.TrimSpace(str(args, "key"))
			if key == "" {
				return "error: 'key' is required"
			}
			out, err := browser.Key(key)
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_scroll"] = ToolDef{
		Name:        "browser_scroll",
		Description: "Scrolls the page up or down (amount in px, default 600) and returns a fresh snapshot with newly revealed elements.",
		Signature:   `{"direction": "string", "amount": "int"}`,
		Category:    "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			dir := strings.TrimSpace(str(args, "direction"))
			if dir == "" {
				dir = "down"
			}
			amount := 600
			if a, ok := numArg(args, "amount"); ok && int(a) > 0 {
				amount = int(a)
			}
			out, err := browser.Scroll(dir, amount)
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_extract_text"] = ToolDef{
		Name:  "browser_extract_text",
		Description: "Reads the current page's visible text (up to ~6000 chars) with title and URL. " +
			"Use for reading articles, search results, or any content you need verbatim.",
		Signature: `{}`,
		Category:  "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			out, err := browser.ExtractText()
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_screenshot"] = ToolDef{
		Name:  "browser_screenshot",
		Description: "Captures the current browser page as a PNG image (shown inline in the chat UI). " +
			"Useful for visually verifying a page state that the text snapshot can't convey.",
		Signature: `{"dest": "string"}`,
		Category:  "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			out, err := browser.Screenshot(strings.TrimSpace(str(args, "dest")))
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_tabs"] = ToolDef{
		Name:  "browser_tabs",
		Description: "Lists open browser tabs with indexes. Provide switch:<n> to focus that tab (e.g. switch:1).",
		Signature:   `{"switch": "int"}`,
		Category:    "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			switchIdx := -1
			if s, ok := numArg(args, "switch"); ok && s >= 0 {
				switchIdx = int(s)
			}
			out, err := browser.Tabs(switchIdx)
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	tools["browser_close"] = ToolDef{
		Name:        "browser_close",
		Description: "Closes the agent's browser when the task is done.",
		Signature:   `{}`,
		Category:    "Browser",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			out, err := browser.Close()
			if err != nil {
				return "error: " + err.Error()
			}
			return out
		},
	}

	return tools
}
