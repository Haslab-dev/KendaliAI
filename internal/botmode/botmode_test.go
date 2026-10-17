package botmode

import (
	"strings"
	"testing"
	"time"
)

func TestParseMode(t *testing.T) {
	tests := []struct {
		input    string
		expected Mode
	}{
		{"fun", ModeFun},
		{"unhinged", ModeFun},
		{"humor", ModeFun},
		{"think", ModeThink},
		{"reasoning", ModeThink},
		{"deepsearch", ModeDeepSearch},
		{"research", ModeDeepSearch},
		{"regular", ModeRegular},
		{"unknown", ModeRegular},
		{"", ModeRegular},
	}

	for _, tc := range tests {
		got := ParseMode(tc.input)
		if got != tc.expected {
			t.Errorf("ParseMode(%q) = %q; expected %q", tc.input, got, tc.expected)
		}
	}
}

func TestParseSlashCommand(t *testing.T) {
	tests := []struct {
		input       string
		expectedMod Mode
		expectedRem string
		expectedCmd bool
	}{
		{"/fun tell me a joke", ModeFun, "tell me a joke", true},
		{"/unhinged roasting time", ModeFun, "roasting time", true},
		{"/think solve this riddle", ModeThink, "solve this riddle", true},
		{"/deepsearch quantum computing", ModeDeepSearch, "quantum computing", true},
		{"/mode fun explain monads", ModeFun, "explain monads", true},
		{"/mode think", ModeThink, "", true},
		{"/normal hello", ModeRegular, "hello", true},
		{"/regular", ModeRegular, "", true},
		{"plain prompt without slash", ModeRegular, "plain prompt without slash", false},
	}

	for _, tc := range tests {
		m, rem, isCmd := ParseSlashCommand(tc.input)
		if isCmd != tc.expectedCmd {
			t.Errorf("ParseSlashCommand(%q) isCmd = %v, expected %v", tc.input, isCmd, tc.expectedCmd)
		}
		if isCmd {
			if m != tc.expectedMod {
				t.Errorf("ParseSlashCommand(%q) mode = %q, expected %q", tc.input, m, tc.expectedMod)
			}
			if rem != tc.expectedRem {
				t.Errorf("ParseSlashCommand(%q) remaining = %q, expected %q", tc.input, rem, tc.expectedRem)
			}
		}
	}
}

func TestSessionModeInjectionAndExtraction(t *testing.T) {
	orig := `{"parentSession":"sess-123","kind":"chat"}`
	updated := InjectSessionMode(orig, ModeFun)
	if !strings.Contains(updated, `"bot_mode":"fun"`) {
		t.Fatalf("expected bot_mode:fun in %s", updated)
	}

	extracted := ExtractSessionMode(updated)
	if extracted != ModeFun {
		t.Fatalf("expected ModeFun, got %s", extracted)
	}

	// Test legacy compatibility
	legacyJSON := `{"mode":"think"}`
	if ExtractSessionMode(legacyJSON) != ModeThink {
		t.Fatalf("expected ModeThink for legacy metadata")
	}
}

func TestDecomposeQuery(t *testing.T) {
	subtasks := DecomposeQuery("Explain how quantum teleportation works and its limitations")
	if len(subtasks) != 3 {
		t.Fatalf("expected 3 subtasks, got %d", len(subtasks))
	}

	roles := make(map[string]bool)
	for _, st := range subtasks {
		if st.Query == "" || st.Angle == "" {
			t.Errorf("empty query or angle in subtask: %+v", st)
		}
		roles[st.Role] = true
	}
	if !roles["researcher"] || !roles["coder"] || !roles["reviewer"] {
		t.Errorf("expected researcher, coder, and reviewer roles, got: %+v", roles)
	}
}

func TestSynthesizeReport(t *testing.T) {
	results := []SubtaskResult{
		{
			SubtaskID: "sub-1",
			Angle:     "Core Facts",
			Output:    "Quantum teleportation transfers quantum information, not matter.",
			Duration:  120 * time.Millisecond,
			Success:   true,
		},
		{
			SubtaskID: "sub-2",
			Angle:     "Technical Analysis",
			Output:    "Relies on Bell state measurement and classical channel transmission.",
			Duration:  210 * time.Millisecond,
			Success:   true,
		},
	}

	report := SynthesizeReport("Quantum teleportation", results, ModeFun)
	if !strings.Contains(report, "DeepSearch Synthesis") {
		t.Fatalf("expected DeepSearch title in report: %s", report)
	}
	if !strings.Contains(report, "Core Facts") || !strings.Contains(report, "Technical Analysis") {
		t.Fatalf("expected subtask findings in report: %s", report)
	}
}
