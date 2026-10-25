package gateway

import (
	"context"
	"database/sql"
	"sort"
	"strings"

	"github.com/kendaliai/app/internal/composio"
)

// composioAPIKey returns the configured Composio key if present.
func composioAPIKey(db *sql.DB) string {
	if db == nil {
		return ""
	}
	var key string
	if err := db.QueryRow("SELECT value FROM system_settings WHERE key = 'composio_api_key'").Scan(&key); err != nil {
		return ""
	}
	return strings.TrimSpace(key)
}

// composioActiveApps returns the slugs of apps with an ACTIVE Composio
// connection, for the system prompt. Failures (no key, offline) yield nil.
func composioActiveApps(db *sql.DB) []string {
	if db == nil {
		return nil
	}
	var key string
	if err := db.QueryRow("SELECT value FROM system_settings WHERE key = 'composio_api_key'").Scan(&key); err != nil || strings.TrimSpace(key) == "" {
		return nil
	}
	client := composio.NewClient(strings.TrimSpace(key))
	accounts, err := client.Accounts(context.Background())
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(accounts))
	for _, acc := range accounts {
		if acc.Status == "ACTIVE" && acc.ToolkitSlug != "" && !seen[acc.ToolkitSlug] {
			seen[acc.ToolkitSlug] = true
			out = append(out, acc.ToolkitSlug)
		}
	}
	sort.Strings(out)
	return out
}

// openUISystemPrompt teaches the model the OpenUI Lang subset rendered by the
// web UI for ```opui fenced blocks. Keep the component set in sync with
// ui/src/components/chat/opuiLibrary.tsx.
func openUISystemPrompt() string {
	return `

## RICH UI OUTPUT (OpenUI Lang in ` + "```" + `opui blocks):
The chat UI renders generative UI. You are expected to use it: for recaps,
summaries with stats, comparisons, rankings, status/dashboards, timelines, or
whenever the user asks to visualize something, END your reply with exactly one
fenced block tagged opui containing an OpenUI Lang program. Write 1-2 short
paragraphs of plain text first, then the block. Example:

` + "```" + `opui
root = Card([champ, score, badge, note, act], "FIFA World Cup 2026 Final", "19 July 2026 - MetLife Stadium")
champ = Metric("Champion", "Spain", "up")
score = Metric("Final score", "1-0 after extra time")
badge = Badge("Spains 2nd title", "success")
note = Text("Ferran Torres scored the winner in the 106th minute.")
act = Button("More stats", @send_prompt("Show detailed stats for the final"))
` + "```" + `

Grammar rules (OpenUI Lang) — follow them EXACTLY:
- ONE statement per line, form: name = Expression. The entry statement MUST be
  named root. Build larger UIs by defining helper statements and referencing
  them inside a list, as in the example above.
- Arguments are POSITIONAL, in the component's argument order (see below).
  Strings are double-quoted, numbers and booleans are bare, lists use
  [a, b, c], and null skips an optional argument.
- Nested components go inside a list as a child argument: Card([a, b], "Title")
  or inline: Card([Text("hi"), Badge("ok")], "Title").
- Components (argument order):
  - Card(children, title, subtitle)
  - Stack(children, direction) — direction "vertical" or "horizontal"
  - Text(content) · Heading(content, level) · Divider()
  - Metric(label, value, trend) — trend "up" | "down" | "flat"
  - Badge(text, tone) — tone "default" | "success" | "warning" | "danger"
  - Button(label, action) — action is @send_prompt("text to send back to chat") or @feedback("text to place in the chat input for review")
  - Table(headers, rows) — Table(["Team","Goals"], [["Spain","1"],["Argentina","0"]])
  - List(items) · Image(url, alt)
- Functions start with @. Actions:
  - @send_prompt("...") sends the text immediately as the next user message.
  - @feedback("...") places the text in the chat input box WITHOUT sending, so
    the user can review/edit it. Use it for feedback, corrections, ratings and
    anything the user should confirm before submitting.
- If ANY earlier message in this conversation shows an opui block written
  differently (e.g. "title:"/"children:" named props or "(Component ...)"
  parenthesized calls), that format is INVALID — never imitate it. Only the
  positional grammar above is valid.
- Rules: keep it under ~30 lines; never emit more than one opui block per
  message; the block must parse standalone and come AFTER your prose.
`
}
