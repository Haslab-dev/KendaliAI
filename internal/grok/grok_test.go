package grok

import (
	"strings"
	"testing"
	"time"
)

func TestParseSlashCommand(t *testing.T) {
	tests := []struct {
		input     string
		wantMode  Mode
		wantRest  string
		wantIsCmd bool
	}{
		{"/fun tell me a joke", ModeFun, "tell me a joke", true},
		{"/think solve this problem", ModeThink, "solve this problem", true},
		{"/deepsearch compare go vs rust", ModeDeepSearch, "compare go vs rust", true},
		{"/normal explain quantum", ModeRegular, "explain quantum", true},
		{"/mode fun hello world", ModeFun, "hello world", true},
		{"/mode think", ModeThink, "", true},
		{"just a regular message", ModeRegular, "just a regular message", false},
	}

	for _, tt := range tests {
		m, rest, isCmd := ParseSlashCommand(tt.input)
		if m != tt.wantMode || rest != tt.wantRest || isCmd != tt.wantIsCmd {
			t.Errorf("input %q: got (%s, %q, %v), want (%s, %q, %v)",
				tt.input, m, rest, isCmd, tt.wantMode, tt.wantRest, tt.wantIsCmd)
		}
	}
}

func TestSessionModeMetadata(t *testing.T) {
	initialMeta := `{"parentSession":"s1","kind":"direct"}`
	updated := InjectSessionMode(initialMeta, ModeFun)
	if !strings.Contains(updated, `"grok_mode":"fun"`) {
		t.Fatalf("expected grok_mode:fun in %s", updated)
	}

	extracted := ExtractSessionMode(updated)
	if extracted != ModeFun {
		t.Fatalf("expected ModeFun, got %s", extracted)
	}

	thinkMeta := InjectSessionMode(updated, ModeThink)
	if ExtractSessionMode(thinkMeta) != ModeThink {
		t.Fatalf("expected ModeThink after update, got %s", ExtractSessionMode(thinkMeta))
	}
}

func TestDecomposeQueryAndSynthesize(t *testing.T) {
	subtasks := DecomposeQuery("compare Go vs Rust memory model")
	if len(subtasks) < 2 {
		t.Fatalf("expected at least 2 subtasks, got %d", len(subtasks))
	}

	results := []SubtaskResult{
		{
			SubtaskID: subtasks[0].ID,
			Angle:     subtasks[0].Angle,
			Output:    "Go uses garbage collection with concurrent tri-color marks.",
			Duration:  500 * time.Millisecond,
			Success:   true,
		},
		{
			SubtaskID: subtasks[1].ID,
			Angle:     subtasks[1].Angle,
			Output:    "Rust uses affine type system with borrow checker and zero runtime cost.",
			Duration:  600 * time.Millisecond,
			Success:   true,
		},
	}

	report := SynthesizeGrokReport("Go vs Rust memory model", results, ModeFun)
	if !strings.Contains(report, "Grok DeepSearch") {
		t.Fatalf("missing header in report: %s", report)
	}
	if !strings.Contains(report, "Go uses garbage collection") || !strings.Contains(report, "Rust uses affine type") {
		t.Fatalf("missing subtask outputs in report: %s", report)
	}
}
