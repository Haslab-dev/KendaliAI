package intelligence

import (
	"testing"
)

func TestClassifyIntent_UI(t *testing.T) {
	tests := []struct {
		query  string
		intent string
	}{
		{"create landing page", "ui_generation"},
		{"Create a hero section", "ui_generation"},
		{"add navbar component", "ui_generation"},
		{"build a pricing page", "ui_generation"},
		{"make a footer", "ui_generation"},
		{"create new header", "ui_generation"},
	}

	for _, tc := range tests {
		got := classifyIntent(tc.query)
		if got != tc.intent {
			t.Errorf("classifyIntent(%q) = %q, want %q", tc.query, got, tc.intent)
		}
	}
}

func TestClassifyIntent_CodeEdit(t *testing.T) {
	tests := []string{
		"edit the App.tsx",
		"fix the bug in login",
		"update the navbar component",
		"change the color scheme",
		"modify the hero section",
		"refactor the auth module",
	}

	for _, query := range tests {
		got := classifyIntent(query)
		if got != "code_edit" {
			t.Errorf("classifyIntent(%q) = %q, want 'code_edit'", query, got)
		}
	}
}

func TestClassifyIntent_Analysis(t *testing.T) {
	tests := []string{
		"explain how the auth works",
		"analyze the codebase",
		"what does this component do",
		"how does the router work",
		"show me all components",
		"list the available routes",
	}

	for _, query := range tests {
		got := classifyIntent(query)
		if got != "analysis" {
			t.Errorf("classifyIntent(%q) = %q, want 'analysis'", query, got)
		}
	}
}

func TestClassifyIntent_Deployment(t *testing.T) {
	tests := []string{
		"deploy to production",
		"build the docker image",
		"publish the package",
	}

	for _, query := range tests {
		got := classifyIntent(query)
		if got != "deployment" {
			t.Errorf("classifyIntent(%q) = %q, want 'deployment'", query, got)
		}
	}
}

func TestDeduplicateFiles(t *testing.T) {
	files := []string{"a.tsx", "b.tsx", "a.tsx", "c.tsx", "b.tsx"}
	result := deduplicateFiles(files)
	if len(result) != 3 {
		t.Errorf("expected 3 files, got %d: %v", len(result), result)
	}
}

func TestEstimateTokens(t *testing.T) {
	content := "hello world, this is a test"
	tokens := estimateTokens(content)
	if tokens == 0 {
		t.Error("expected non-zero token count")
	}
}
