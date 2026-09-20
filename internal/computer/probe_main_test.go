package computer

import (
	"fmt"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// TestProbe is a manual smoke test of the macOS computer-use layer.
// Run with: make check-computer
func TestProbe(t *testing.T) {
	caps, err := Detect()
	fmt.Println("ERR:", err)
	fmt.Println(caps.Report())
	if !caps.Ready() {
		t.Skip("machine not ready for computer use")
	}

	mac := NewMac(caps)

	// Quit any stale instance so the fresh launch reliably takes focus.
	_ = exec.Command("osascript", "-e", `tell application "Calculator" to quit`).Run()
	time.Sleep(800 * time.Millisecond)
	_ = exec.Command("open", "-a", "Calculator").Run()
	time.Sleep(2 * time.Second)

	if fm, _ := mac.FrontmostApp(); !strings.EqualFold(fm, "Calculator") {
		t.Fatalf("Calculator did not take focus (frontmost=%q)", fm)
	}

	// Esc clears the display.
	if _, err := mac.Key(53, ""); err != nil {
		t.Logf("clear failed: %v", err)
	}
	time.Sleep(400 * time.Millisecond)

	if _, err := mac.Text("3243*3849483="); err != nil {
		t.Fatalf("type failed: %v", err)
	}
	time.Sleep(800 * time.Millisecond)

	got, err := mac.ReadDisplay("Calculator")
	got = strings.TrimSpace(got)
	fmt.Printf("DISPLAY: %q err=%v\n", got, err)

	for _, want := range []string{"3243", "3849483", "12483873369"} {
		if !strings.Contains(got, want) {
			t.Errorf("display missing %q; got %q", want, got)
		}
	}

	shot, err := mac.Screenshot("")
	fmt.Println("SHOT:", shot, err)
	if shot == "" {
		t.Error("empty screenshot path")
	}
}
