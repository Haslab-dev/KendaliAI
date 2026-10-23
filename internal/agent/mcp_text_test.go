package agent

import (
	"strings"
	"testing"
)

func TestNormalizeMCPTextOutput(t *testing.T) {
	// MCP content-block array (Exa/Firecrawl style)
	in := `[{"_meta":{"searchTime":1570.8},"type":"text","text":"Title: Spain v Argentina\nURL: https://fifa.com"},{"type":"text","text":"Title: Second result"}]`
	got := normalizeMCPTextOutput(in)
	if !strings.Contains(got, "Title: Spain v Argentina") || !strings.Contains(got, "Title: Second result") {
		t.Fatalf("expected joined block texts, got: %q", got)
	}
	if strings.Contains(got, "_meta") || strings.Contains(got, `"type"`) {
		t.Fatalf("expected raw JSON envelope stripped, got: %q", got)
	}

	// {"content": [...]} shape
	in2 := `{"content":[{"type":"text","text":"hello world"}]}`
	if got := normalizeMCPTextOutput(in2); got != "hello world" {
		t.Fatalf("expected content extraction, got: %q", got)
	}

	// Plain text passes through
	if got := normalizeMCPTextOutput("just text"); got != "just text" {
		t.Fatalf("expected passthrough, got: %q", got)
	}

	// Oversized output is capped
	long := strings.Repeat("x", 20000)
	got = normalizeMCPTextOutput(long)
	if len(got) > 12500 {
		t.Fatalf("expected truncation to ~12k, got %d chars", len(got))
	}
	if !strings.HasSuffix(got, "...(truncated)") {
		t.Fatalf("expected truncation marker, got suffix: %q", got[len(got)-30:])
	}
}
