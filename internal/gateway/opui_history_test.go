package gateway

import (
	"strings"
	"testing"
)

func TestSanitizeOpuiHistory_ReplacesLegacyBlock(t *testing.T) {
	// Real legacy block a model produced with the old prompt grammar.
	msg := "Here is the summary:\n\n```opui\nroot = Card(title: \"Fact Verification Summary\", children: [\n  (Stack direction: \"vertical\" children: [\n    (Heading content: \"Final Result\", level: 2),\n    (Table headers: [\"Category\", \"Fact\"], rows: [[\"Champion\", \"Spain\"]])\n  ])\n])\n```\n\nSources checked."

	got := sanitizeOpuiHistory(msg)
	if strings.Contains(got, "title:") || strings.Contains(got, "children: [") {
		t.Fatalf("legacy grammar survived sanitization:\n%s", got)
	}
	if !strings.Contains(got, "```opui\nroot = Card(") {
		t.Fatalf("expected replacement with valid placeholder block:\n%s", got)
	}
	if !strings.Contains(got, "Sources checked.") {
		t.Fatalf("prose outside the block must be preserved:\n%s", got)
	}
}

func TestSanitizeOpuiHistory_KeepsCompliantBlock(t *testing.T) {
	msg := "Recap:\n\n```opui\nroot = Card([champ], \"Final\")\nchamp = Metric(\"Champion\", \"Spain\", \"up\")\n```"
	got := sanitizeOpuiHistory(msg)
	if got != msg {
		t.Fatalf("compliant block must pass through untouched, got:\n%s", got)
	}
}

func TestSanitizeOpuiHistory_QuotedColonsNotFlagged(t *testing.T) {
	// "Sources: FIFA" inside a quoted string must not look like a named prop.
	msg := "```opui\nroot = Card([Text(\"Sources: FIFA, BBC\"), Table([\"A\"], [[\"1\"]])], \"Card\")\n```"
	got := sanitizeOpuiHistory(msg)
	if got != msg {
		t.Fatalf("quoted colons must not trigger sanitization, got:\n%s", got)
	}
}

func TestSanitizeOpuiHistory_UnclosedStreamingBlock(t *testing.T) {
	msg := "Drafting:\n```opui\nroot = Card(title: \"Partial\", children: ["
	got := sanitizeOpuiHistory(msg)
	if strings.Contains(got, "children: [") {
		t.Fatalf("unclosed legacy block must also be neutralized:\n%s", got)
	}
}
