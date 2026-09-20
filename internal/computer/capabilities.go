// Package computer implements the macOS Computer Use layer: mouse/keyboard
// control via a compiled CGEvent helper, app control via AppleScript, and
// screen capture. It is the Go port of the x-agent prototype's
// src/computer/{capabilities,MacRuntime}.swift layer.
package computer

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

//go:embed bpclick.swift
var bpclickSource string

// Capabilities describes what the local machine allows the agent to do.
type Capabilities struct {
	OSascript     bool   `json:"osascript"`
	Screencapture bool   `json:"screencapture"`
	Clicker       string `json:"clicker"`        // path to a CGEvent mouse CLI, or ""
	ClickerBuilt  bool   `json:"clickerBuilt"`   // we compiled bpclick ourselves
	ClickerTrust  bool   `json:"clickerTrust"`   // AXIsProcessTrusted() at the helper
	Accessibility bool   `json:"accessibility"`  // System Events reachable
	Swiftc        bool   `json:"swiftc"`
	Platform      string `json:"platform"`
}

var (
	capsOnce  sync.Once
	capsValue *Capabilities
	capsErr   error
)

// Detect probes the machine once and caches the result. It never fatal-errors:
// a missing capability is reported as false so tools can degrade gracefully.
func Detect() (*Capabilities, error) {
	capsOnce.Do(func() {
		c := &Capabilities{Platform: runtimeGOOS()}
		if c.Platform != "darwin" {
			capsValue, capsErr = c, fmt.Errorf("computer use requires macOS (got %s)", c.Platform)
			return
		}

		for _, b := range []string{"osascript", "screencapture"} {
			if _, err := exec.LookPath(b); err == nil {
				switch b {
				case "osascript":
					c.OSascript = true
				case "screencapture":
					c.Screencapture = true
				}
			}
		}
		if _, err := exec.LookPath("swiftc"); err == nil {
			c.Swiftc = true
		}

		// Prefer an existing cliclick; else compile bpclick once into the
		// data dir.
		if cl := findCliclick(); cl != "" {
			c.Clicker = cl
		} else {
			bp := filepath.Join(DataDir(), "bpclick")
			if _, err := os.Stat(bp); os.IsNotExist(err) && c.Swiftc {
				if err := buildBpclick(bp); err != nil {
					logWarn("bpclick compile failed: %v", err)
				}
			}
			if _, err := os.Stat(bp); err == nil {
				c.Clicker, c.ClickerBuilt = bp, true
			}
		}

		if c.Clicker != "" {
			out, err := runWithTimeout(c.Clicker, 4*time.Second, "check")
			c.ClickerTrust = err == nil && strings.Contains(out, "trusted:true")
		}

		// System Events reachability implies the process (or the parent
		// terminal/app) has Accessibility permission.
		if c.OSascript {
			_, err := runWithTimeout("/usr/bin/osascript", 6*time.Second,
				"-e", `tell application "System Events" to get name of first application process whose frontmost is true`)
			c.Accessibility = err == nil
		}

		capsValue = c
	})
	return capsValue, capsErr
}

// buildBpclick compiles the embedded Swift helper. First run can take ~20-40s.
func buildBpclick(dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	src := dest + ".swift"
	if err := os.WriteFile(src, []byte(bpclickSource), 0o644); err != nil {
		return err
	}
	defer os.Remove(src)

	cmd := exec.Command("swiftc", "-O", "-o", dest, src)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, firstLine(string(out)))
	}
	return nil
}

func findCliclick() string {
	for _, p := range []string{"cliclick", "/opt/homebrew/bin/cliclick", "/usr/local/bin/cliclick"} {
		if strings.HasPrefix(p, "/") {
			if fi, err := os.Stat(p); err == nil && fi.Mode().IsRegular() {
				return p
			}
			continue
		}
		if resolved, err := exec.LookPath(p); err == nil {
			return resolved
		}
	}
	return ""
}

// helper for tools: human-readable readiness report.
func (c *Capabilities) Report() string {
	if c == nil {
		return "computer use: unavailable (not probed)"
	}
	parts := []string{
		fmt.Sprintf("platform=%s", c.Platform),
		fmt.Sprintf("osascript=%v", c.OSascript),
		fmt.Sprintf("screencapture=%v", c.Screencapture),
	}
	if c.Clicker != "" {
		parts = append(parts, fmt.Sprintf("clicker=%s trusted=%v", c.Clicker, c.ClickerTrust))
	} else {
		parts = append(parts, "clicker=none")
	}
	parts = append(parts, fmt.Sprintf("accessibility=%v", c.Accessibility))
	return "computer use: " + strings.Join(parts, " ")
}

// Ready reports whether the minimum set for GUI control is present.
func (c *Capabilities) Ready() bool {
	return c != nil && c.OSascript && c.Clicker != "" && c.ClickerTrust && c.Accessibility
}

func firstLine(s string) string {
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		return s[:i]
	}
	return s
}

func logWarn(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "[computer] "+format+"\n", args...)
}
