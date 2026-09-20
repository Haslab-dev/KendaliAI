package agent

import (
	"context"
	"fmt"
	"strings"

	"github.com/kendaliai/app/internal/computer"
)

// macRuntime lazily resolves capabilities per call (Detect caches internally),
// so the first use pays the one-time bpclick compile.
func macRuntime() (*computer.Mac, *computer.Capabilities, string) {
	caps, err := computer.Detect()
	if err != nil {
		return nil, caps, "error: " + err.Error()
	}
	return computer.NewMac(caps), caps, ""
}

// keyNameToCode maps friendly key names to US-layout CGKeyCode values.
var keyNameToCode = map[string]int{
	"a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
	"b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
	"1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26,
	"-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35,
	"return": 36, "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41,
	"backslash": 42, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47,
	"tab": 48, "space": 49, "grave": 50, "delete": 51, "backspace": 51,
	"escape": 53, "esc": 53,
	"f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98,
	"f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
	"left": 123, "right": 124, "down": 125, "up": 126,
}

// ComputerTools returns the macOS computer-use tool set. The empty map on
// non-darwin platforms keeps registration a no-op elsewhere.
func ComputerTools() map[string]ToolDef {
	tools := map[string]ToolDef{}

	tools["computer_status"] = ToolDef{
		Name: "computer_status",
		Description: "Reports whether macOS computer control is available on this machine (accessibility permission, mouse helper, screen capture). " +
			"Call this first when a task needs to control the user's desktop.",
		Signature: `{}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			_, caps, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			return caps.Report()
		},
	}

	tools["computer_open_app"] = ToolDef{
		Name: "computer_open_app",
		Description: "Opens (launches or focuses) a macOS application by name, e.g. 'Calculator', 'Safari', 'Notes'. " +
			"Returns the app's frontmost window titles when available.",
		Signature: `{"app": "string"}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			mac, _, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			app := strings.TrimSpace(str(args, "app"))
			if app == "" {
				return "error: 'app' is required"
			}
			if _, err := mac.Activate(app); err != nil {
				return "error: " + err.Error()
			}
			windows, _ := mac.AppWindows(app)
			out := fmt.Sprintf(`{"status":"opened","app":%q}`, app)
			if len(windows) > 0 {
				out += fmt.Sprintf("\nwindows: %s", strings.Join(windows, ", "))
			}
			return out
		},
	}

	tools["computer_type"] = ToolDef{
		Name:  "computer_type",
		Description: "Types a Unicode string into the frontmost application via synthetic keyboard events. " +
			"Use for typing into any focused app (Calculator, Notes, browsers, forms). Newlines and punctuation are supported.",
		Signature: `{"text": "string"}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			mac, _, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			text := str(args, "text")
			if text == "" {
				return "error: 'text' is required"
			}
			if _, err := mac.Text(text); err != nil {
				return "error: " + err.Error()
			}
			return fmt.Sprintf(`{"status":"typed","chars":%d}`, len([]rune(text)))
		},
	}

	tools["computer_key"] = ToolDef{
		Name: "computer_key",
		Description: "Presses a single key, optionally with modifiers. Key names: letters, digits, return, tab, space, delete, escape, left/right/up/down, f1-f12. " +
			"Modifiers: shift, ctrl, alt, cmd joined with '+', e.g. key='c', modifiers='cmd' for Cmd+C.",
		Signature: `{"key": "string", "modifiers": "string"}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			mac, _, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			name := strings.ToLower(strings.TrimSpace(str(args, "key")))
			if name == "" {
				return "error: 'key' is required"
			}
			code, ok := keyNameToCode[name]
			if !ok {
				return fmt.Sprintf("error: unknown key %q (use letter/digit or: return tab space delete escape left right up down f1-f12)", name)
			}
			mods := strings.TrimSpace(str(args, "modifiers"))
			if _, err := mac.Key(code, mods); err != nil {
				return "error: " + err.Error()
			}
			return fmt.Sprintf(`{"status":"pressed","key":%q,"modifiers":%q}`, name, mods)
		},
	}

	tools["computer_click"] = ToolDef{
		Name: "computer_click",
		Description: "Clicks at screen coordinates (x, y in points from top-left of the main display). " +
			"Use computer_screenshot first to find coordinates. count=2 for double-click; button='right' for right-click.",
		Signature: `{"x": "number", "y": "number", "count": "int", "button": "string"}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			mac, _, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			x, xok := numArg(args, "x")
			y, yok := numArg(args, "y")
			if !xok || !yok {
				return "error: 'x' and 'y' are required numbers"
			}
			count := 1
			if c, ok := numArg(args, "count"); ok && c >= 1 {
				count = int(c)
			}
			var err error
			if strings.EqualFold(str(args, "button"), "right") {
				_, err = mac.RightClick(x, y)
			} else {
				_, err = mac.Click(x, y, count)
			}
			if err != nil {
				return "error: " + err.Error()
			}
			return fmt.Sprintf(`{"status":"clicked","x":%g,"y":%g,"count":%d}`, x, y, count)
		},
	}

	tools["computer_read_screen"] = ToolDef{
		Name: "computer_read_screen",
		Description: "Reads accessible text from an application's front window (accessibility tree). " +
			"Best for reading Calculator results, dialog text, or window contents without a screenshot. Omit 'app' to read the frontmost app.",
		Signature: `{"app": "string"}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			mac, _, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			app := strings.TrimSpace(str(args, "app"))
			if app == "" {
				var err error
				if app, err = mac.FrontmostApp(); err != nil {
					return "error: could not determine frontmost app: " + err.Error()
				}
			}
			out, err := mac.ReadDisplay(app)
			if err != nil || strings.TrimSpace(out) == "" {
				// Fall back to the full element dump for non-standard apps.
				if dump, derr := mac.ListWindowElements(app); derr == nil && strings.TrimSpace(dump) != "" {
					return fmt.Sprintf("app: %s\n(no static text found; AX elements:)\n%s", app, truncateStr(dump, 2000))
				}
				if err != nil {
					return "error: " + err.Error()
				}
				return fmt.Sprintf("app: %s\n(no readable text found — the app may expose no accessibility tree; try computer_screenshot)", app)
			}
			return fmt.Sprintf("app: %s\ntext:\n%s", app, out)
		},
	}

	tools["computer_screenshot"] = ToolDef{
		Name: "computer_screenshot",
		Description: "Captures the screen to a PNG and returns its path plus a URL usable in the web UI. " +
			"Use before computer_click to locate targets by pixel coordinates.",
		Signature: `{"dest": "string"}`,
		Category:  "Computer",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			mac, _, errMsg := macRuntime()
			if errMsg != "" {
				return errMsg
			}
			path, err := mac.Screenshot(strings.TrimSpace(str(args, "dest")))
			if err != nil {
				return "error: " + err.Error()
			}
			return fmt.Sprintf(`{"status":"saved","path":%q,"url":%q}`, path, computer.ShotURL(path))
		},
	}

	return tools
}

// str/numArg are small arg accessors shared by the computer tools.
func str(args map[string]interface{}, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func numArg(args map[string]interface{}, key string) (float64, bool) {
	switch v := args[key].(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case string:
		var f float64
		if _, err := fmt.Sscanf(v, "%g", &f); err == nil {
			return f, true
		}
	}
	return 0, false
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
