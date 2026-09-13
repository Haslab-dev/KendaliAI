package gateway

import (
	"testing"
)

func TestCleanSessionTitle(t *testing.T) {
	tests := []struct {
		name     string
		aiTitle  string
		fallback string
		maxRunes int
	}{
		{
			name:     "clean short title",
			aiTitle:  "Create Docker Plugin",
			fallback: "how to create a docker plugin",
			maxRunes: 20,
		},
		{
			name:     "strip quotes and prefixes",
			aiTitle:  `"Title: Smart React Dashboard."`,
			fallback: "build a react dashboard",
			maxRunes: 20,
		},
		{
			name:     "truncate long title nicely",
			aiTitle:  "Super Long Machine Learning Natural Language Processing System",
			fallback: "nlp system",
			maxRunes: 20,
		},
		{
			name:     "fallback when empty",
			aiTitle:  "",
			fallback: "Can you fix the bug in my code?",
			maxRunes: 20,
		},
		{
			name:     "unicode runes respected",
			aiTitle:  "🚀 Deploy App Now!",
			fallback: "deploy",
			maxRunes: 20,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CleanSessionTitle(tc.aiTitle, tc.fallback)
			runes := []rune(got)
			if len(runes) > tc.maxRunes {
				t.Errorf("CleanSessionTitle() returned length %d > %d runes, title: %q", len(runes), tc.maxRunes, got)
			}
			if got == "" {
				t.Errorf("CleanSessionTitle() returned empty title for fallback %q", tc.fallback)
			}
		})
	}
}
