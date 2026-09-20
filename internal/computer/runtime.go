package computer

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Mac drives the GUI: mouse/keyboard via the CGEvent helper, app control via
// AppleScript, screen capture via screencapture.
type Mac struct {
	caps *Capabilities
}

// NewMac returns a runtime backed by the detected capabilities. Call Detect()
// first; a nil caps yields a runtime that fails every op with a clear message.
func NewMac(caps *Capabilities) *Mac {
	return &Mac{caps: caps}
}

var permissionRe = regexp.MustCompile(`(?i)-1743|-25211|not allowed|not authorized|assistive`)

// permissionErr translates raw osascript permission failures into something
// the user can act on.
func permissionErr(err error) string {
	msg := err.Error()
	if permissionRe.MatchString(msg) {
		return "permission denied: grant Accessibility to the process running kendaliai (System Settings → Privacy & Security → Accessibility), then retry"
	}
	return msg
}

// ── Mouse / keyboard (via bpclick or cliclick) ───────────────────────────────

func (m *Mac) dispatch(args ...string) (string, error) {
	if m == nil || m.caps == nil || m.caps.Clicker == "" {
		return "", fmt.Errorf("no CGEvent mouse helper available (swiftc=%v); run `kendaliai doctor`", m.caps != nil && m.caps.Swiftc)
	}
	out, err := runWithTimeout(m.caps.Clicker, 30*time.Second, args...)
	if err != nil && strings.Contains(out, "trusted:false") {
		return out, fmt.Errorf("accessibility permission missing for %s", m.caps.Clicker)
	}
	return out, err
}

// Click performs count clicks at (x, y) in global display points.
func (m *Mac) Click(x, y float64, count int) (string, error) {
	n := 1
	if count > 1 {
		n = count
	}
	return m.dispatch("click", fnum(x), fnum(y), strconv.Itoa(n))
}

func (m *Mac) RightClick(x, y float64) (string, error) {
	return m.dispatch("rclick", fnum(x), fnum(y))
}

func (m *Mac) Move(x, y float64) (string, error) {
	return m.dispatch("move", fnum(x), fnum(y))
}

func (m *Mac) Drag(x1, y1, x2, y2 float64) (string, error) {
	return m.dispatch("drag", fnum(x1), fnum(y1), fnum(x2), fnum(y2))
}

func (m *Mac) Scroll(dx, dy int) (string, error) {
	return m.dispatch("scroll", strconv.Itoa(dx), strconv.Itoa(dy))
}

// Text types a Unicode string through CGEvent.
func (m *Mac) Text(s string) (string, error) {
	return m.dispatch("text", s)
}

// Key presses a virtual key code, optionally with modifiers.
func (m *Mac) Key(code int, modifiers string) (string, error) {
	args := []string{"key", strconv.Itoa(code)}
	if modifiers != "" {
		args = append(args, modifiers)
	}
	return m.dispatch(args...)
}

// ── AppleScript layer (app control + semantic reads) ────────────────────────

// Osascript runs an AppleScript. Use Run for the common -e form.
func (m *Mac) Osascript(script string) (string, error) {
	out, err := runWithTimeout("/usr/bin/osascript", 30*time.Second, "-e", script)
	if err != nil {
		return out, fmt.Errorf("%s", permissionErr(err))
	}
	return strings.TrimSpace(out), nil
}

// Activate brings an app to the front, launching it if needed.
func (m *Mac) Activate(app string) (string, error) {
	return m.Osascript(fmt.Sprintf(`tell application %q to activate`, app))
}

// FrontmostApp returns the bundle/name of the active app.
func (m *Mac) FrontmostApp() (string, error) {
	return m.Osascript(`tell application "System Events" to get name of first application process whose frontmost is true`)
}

// AppRunning reports whether a process by that name is running.
func (m *Mac) AppRunning(app string) bool {
	out, err := m.Osascript(fmt.Sprintf(`tell application "System Events" to get exists (process %q)`, app))
	return err == nil && strings.EqualFold(strings.TrimSpace(out), "true")
}

// AppWindows lists the window titles of an app.
func (m *Mac) AppWindows(app string) ([]string, error) {
	out, err := m.Osascript(fmt.Sprintf(`tell application "System Events" to tell process %q to get title of windows`, app))
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}
	return strings.Split(out, ", "), nil
}

// ReadDisplay reads the visible text of the frontmost window. On the modern
// SwiftUI Calculator the value is not at static text 1; `entire contents`
// exposes it, so we collect every AXStaticText that has a value. The
// enumeration is assigned to a variable before iterating — iterating the
// `entire contents` expression directly can yield an unrealized tree.
func (m *Mac) ReadDisplay(app string) (string, error) {
	script := fmt.Sprintf(`
tell application "System Events"
  tell process %q
    set out to ""
    set ec to {}
    try
      set ec to (entire contents of window 1)
    end try
    repeat with el in ec
      try
        if (role of el) is "AXStaticText" then
          set v to value of el
          if v is not missing value then set out to out & v & linefeed
        end if
      end try
    end repeat
    return out
  end tell
end tell`, app)
	out, err := m.Osascript(script)
	if err != nil {
		return "", err
	}
	var lines []string
	for _, l := range strings.Split(out, "\n") {
		if s := strings.TrimSpace(l); s != "" {
			lines = append(lines, s)
		}
	}
	// SwiftUI renders numbers with U+200E (left-to-right mark) separators;
	// drop them so the model sees clean digits.
	joined := strings.Join(lines, "\n")
	return strings.NewReplacer("\u200e", "", "\u200f", "").Replace(joined), nil
}

// ListWindowElements dumps a compact map of role=value for the frontmost
// window, useful as a fallback semantic view for arbitrary apps.
func (m *Mac) ListWindowElements(app string) (string, error) {
	script := fmt.Sprintf(`
tell application "System Events"
  tell process %q
    set out to ""
    try
      repeat with el in (entire contents of window 1)
        try
          set r to role of el
          set v to value of el
          if v is missing value then set v to ""
          set out to out & r & "=" & v & linefeed
        end try
      end repeat
    end try
    return out
  end tell
end tell`, app)
	return m.Osascript(script)
}

// Keystroke sends a string through System Events (alternative to CGEvent text;
// useful when the target app is a Swift/ObjC responder chain).
func (m *Mac) Keystroke(s string) (string, error) {
	return m.Osascript(fmt.Sprintf(`tell application "System Events" to keystroke %q`, s))
}

// ── Screen capture ───────────────────────────────────────────────────────────

// Screenshot captures the main display to dest (png). If dest is "" or
// relative, a path under DataDir is generated/coerced so every shot is
// servable through /api/computer/shots/. Returns the absolute path written.
func (m *Mac) Screenshot(dest string) (string, error) {
	if m == nil || m.caps == nil || !m.caps.Screencapture {
		return "", fmt.Errorf("screencapture unavailable")
	}
	if dest == "" {
		dest = "shot-" + time.Now().Format("20060102-150405") + ".png"
	}
	if !filepath.IsAbs(dest) {
		if filepath.Ext(dest) == "" {
			dest += ".png"
		}
		dest = filepath.Join(DataDir(), filepath.Base(dest))
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}
	if _, err := runWithTimeout("/usr/sbin/screencapture", 15*time.Second, "-x", "-t", "png", dest); err != nil {
		return "", err
	}
	return dest, nil
}

// ShotURL maps a screenshot path under DataDir to the server route that
// serves it, so the web UI can display it inside a tool card.
func ShotURL(path string) string {
	base := filepath.Base(path)
	dir := filepath.Dir(path)
	if filepath.Clean(dir) != filepath.Clean(DataDir()) {
		return "" // only shots in the data dir are servable
	}
	return "/api/computer/shots/" + url.PathEscape(base)
}

func fnum(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}
