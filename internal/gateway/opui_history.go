package gateway

import (
	"regexp"
	"strings"
)

// opuiFenceRe matches ```opui / ```openui fenced blocks (closed or streaming).
var opuiFenceRe = regexp.MustCompile("(?s)```(?:opui|openui)[ \\t]*\\n(.*?)(\\n```|\\z)")

// legacyNamedPropRe detects the invalid named-prop grammar
// (`(Card title: "..." children: [...])`) that earlier gateway versions
// taught the model. Quoted strings are stripped before matching so prose
// like "Sources: FIFA" cannot trigger it.
var legacyNamedPropRe = regexp.MustCompile(
	`\b(title|subtitle|children|content|label|value|trend|tone|direction|gap|level|headers|rows|items|url|alt|action)\s*:`)

// sanitizeOpuiHistory neutralizes legacy-grammar opui blocks inside
// conversation history before it is sent back to the model. The model imitates
// opui examples it sees in history, so one stale block would keep teaching it
// the invalid format even after the system prompt was fixed. Compliant blocks
// pass through untouched; legacy blocks are replaced with a minimal valid
// program that preserves the fact a card was shown.
func sanitizeOpuiHistory(content string) string {
	if !strings.Contains(content, "```opui") && !strings.Contains(content, "```openui") {
		return content
	}
	return opuiFenceRe.ReplaceAllStringFunc(content, func(match string) string {
		body := opuiFenceRe.ReplaceAllString(match, "$1")
		if !isLegacyOpui(body) {
			return match
		}
		closing := ""
		if strings.HasSuffix(match, "```") {
			closing = "\n```"
		}
		return "```opui\nroot = Card([Text(\"An opui card was shown here earlier; its content is summarized in the surrounding text.\")], \"[Earlier card]\")" + closing
	})
}

// isLegacyOpui reports whether an opui block body uses the invalid named-prop
// s-expression grammar instead of the positional OpenUI Lang grammar.
func isLegacyOpui(body string) bool {
	stripped := stripQuotedStrings(body)
	return legacyNamedPropRe.MatchString(stripped)
}

// stripQuotedStrings removes double-quoted string literals (best effort,
// handling \" escapes) so their contents cannot influence detection.
func stripQuotedStrings(s string) string {
	var b strings.Builder
	inString := false
	escaped := false
	for _, r := range s {
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if r == '\\' {
				escaped = true
				continue
			}
			if r == '"' {
				inString = false
			}
			continue
		}
		if r == '"' {
			inString = true
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
