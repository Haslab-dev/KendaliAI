package computer

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"time"
)

// DataDir is where the compiled helper and screenshots live:
// $KENDALIAI_DATA_DIR or ~/.kendaliai/computer.
func DataDir() string {
	if p := os.Getenv("KENDALIAI_DATA_DIR"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = os.TempDir()
	}
	return home + "/.kendaliai/computer"
}

func runtimeGOOS() string { return runtime.GOOS }

// runWithTimeout runs a command and returns trimmed stdout.
func runWithTimeout(name string, timeout time.Duration, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return stdout.String(), err
	}
	return stdout.String(), nil
}

// parseNumber extracts a float argument from the tool args map.
func parseNumber(args map[string]interface{}, key string) (float64, bool) {
	switch v := args[key].(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

func parseString(args map[string]interface{}, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}
