package browser

import (
	"fmt"
	"strings"
	"testing"
)

// TestSmoke drives example.com headless: navigate → snapshot → screenshot.
// Run with: go test ./internal/browser/ -run TestSmoke -v
func TestSmoke(t *testing.T) {
	headless := true
	Configure(Config{Headless: &headless})
	defer Close()

	out, err := Navigate("example.com")
	if err != nil {
		t.Fatalf("navigate: %v", err)
	}
	fmt.Println(out)
	if !strings.Contains(out, "Example") {
		t.Errorf("snapshot missing 'Example' heading; got:\n%s", out)
	}

	// Click the outbound link by its snapshot index.
	idx := -1
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "Learn more") || strings.Contains(line, "More information") {
			fmt.Sscanf(line, "[%d]", &idx)
			break
		}
	}
	if idx < 0 {
		t.Fatal("link not found in snapshot")
	}
	out, err = Click(idx, 1)
	if err != nil {
		t.Fatalf("click: %v", err)
	}
	fmt.Println(out)
	if !strings.Contains(out, "iana.org") && !strings.Contains(out, "IANA") {
		t.Errorf("expected navigation to iana.org; got:\n%s", out)
	}

	shot, err := Screenshot("")
	fmt.Println("SHOT:", shot, err)
	if err != nil || !strings.Contains(shot, `"url"`) {
		t.Errorf("screenshot failed: %v", err)
	}
}
