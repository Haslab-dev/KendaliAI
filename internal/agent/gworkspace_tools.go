package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"database/sql"

	"github.com/kendaliai/app/internal/composio"
)

// googleToolkits are the Composio toolkit slugs that count as a Google account.
var googleToolkits = map[string]bool{
	"googledocs":   true,
	"googlesheets": true,
	"gslides":      true,
	"googledrive":  true,
	"google":       true,
}

func isGoogleToolkit(slug string) bool { return googleToolkits[strings.ToLower(slug)] }

// GoogleWorkspaceTools exposes Google Docs / Sheets / Slides creation through a
// Composio-connected Google account. They complement the local document tools:
// .docx/.xlsx/.pptx stay fully offline, while these write straight into Drive.
//
// Composio action slugs drift across API versions, so each tool resolves the
// concrete action dynamically: list the toolkit's actions, score them by
// keyword overlap with the creation intent, and map arguments onto the
// action's declared parameter schema.
func GoogleWorkspaceTools(db *sql.DB) map[string]ToolDef {
	run := func(ctx context.Context, toolkit string, intents []string, args map[string]interface{}, label string) string {
		client := composioClientFromDB(db)
		if client == nil {
			return "Composio is not configured. Ask the user to add their Composio API key in the Connections page, then connect Google."
		}
		cctx, cancel := context.WithTimeout(ctx, 90*time.Second)
		defer cancel()

		accountID := ""
		accounts, err := client.Accounts(cctx)
		if err == nil {
			for _, acc := range accounts {
				if strings.EqualFold(acc.Status, "active") && isGoogleToolkit(acc.ToolkitSlug) {
					accountID = acc.ID
					break
				}
			}
		}
		if accountID == "" {
			return "No ACTIVE Google connection found. Ask the user to connect Google in the Connections page (Composio) first, then retry."
		}

		action, schema, err := resolveGoogleAction(cctx, client, toolkit, intents)
		if err != nil {
			return "error: " + err.Error()
		}
		payload := mapArgsToSchema(schema, args)
		data, err := client.Execute(cctx, action, accountID, payload)
		if err != nil {
			return fmt.Sprintf("%s failed via Composio action %s: %v", label, action, err)
		}
		return gWorkspaceResult(label, data)
	}

	return map[string]ToolDef{
		"gdocs_create": {
			Name:        "gdocs_create",
			Description: "Creates a Google Docs document in the connected Google account via Composio. Pass markdown-lite content (# headings, - bullets, **bold**); requires an active Google connection.",
			Signature:   `{"title": "string", "content": "string (markdown-lite)"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if strings.TrimSpace(strArg(args, "title")) == "" {
					return "Parameter 'title' is required."
				}
				return run(ctx, "googledocs", []string{"create", "document", "doc"}, args, "Google Doc")
			},
		},
		"gsheet_create": {
			Name:        "gsheet_create",
			Description: "Creates a Google Sheets spreadsheet with data in the connected Google account via Composio. Accepts rows of mixed strings/numbers, either as `data` or multiple named `sheets`.",
			Signature:   `{"title": "string", "data": "array of rows (optional)", "sheets": "array of {name, rows} (optional)"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if strings.TrimSpace(strArg(args, "title")) == "" {
					return "Parameter 'title' is required."
				}
				return run(ctx, "googlesheets", []string{"create", "spreadsheet", "sheet"}, args, "Google Sheet")
			},
		},
		"gslides_create": {
			Name:        "gslides_create",
			Description: "Creates a Google Slides presentation in the connected Google account via Composio from a slide outline ({title, bullets} per slide).",
			Signature:   `{"title": "string", "slides": "array of {title, bullets[]}"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if strings.TrimSpace(strArg(args, "title")) == "" {
					return "Parameter 'title' is required."
				}
				return run(ctx, "gslides", []string{"create", "presentation", "slides", "deck"}, args, "Google Slides")
			},
		},
	}
}

// ---- helpers ---------------------------------------------------------------

func strArg(args map[string]interface{}, key string) string {
	s, _ := args[key].(string)
	return strings.TrimSpace(s)
}

// resolveGoogleAction picks the best creation action for a toolkit.
func resolveGoogleAction(ctx context.Context, client *composio.Client, toolkit string, intents []string) (string, map[string]interface{}, error) {
	tools, err := client.Tools(ctx, toolkit)
	if err != nil {
		return "", nil, fmt.Errorf("failed to list %s actions: %v", toolkit, err)
	}
	if len(tools) == 0 {
		return "", nil, fmt.Errorf("no %s actions available in Composio", toolkit)
	}

	type scored struct {
		slug  string
		score int
		sch   map[string]interface{}
	}
	candidates := make([]scored, 0, len(tools))
	for _, t := range tools {
		lower := strings.ToLower(t.Slug)
		score := 0
		for _, kw := range intents {
			if strings.Contains(lower, kw) {
				score += 2
			}
		}
		// Prefer write/create actions that don't look like reads or listings.
		if strings.Contains(lower, "list") || strings.Contains(lower, "find") || strings.Contains(lower, "get") || strings.Contains(lower, "fetch") {
			score -= 3
		}
		if score > 0 {
			candidates = append(candidates, scored{slug: t.Slug, score: score, sch: t.Parameters})
		}
	}
	if len(candidates) == 0 {
		available := make([]string, 0, len(tools))
		for _, t := range tools {
			available = append(available, t.Slug)
		}
		sort.Strings(available)
		return "", nil, fmt.Errorf("no creation action found for %s; available actions: %s", toolkit, strings.Join(available, ", "))
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		return len(candidates[i].slug) < len(candidates[j].slug)
	})
	best := candidates[0]
	return best.slug, best.sch, nil
}

// mapArgsToSchema copies the caller's arguments onto the action's declared
// parameter names using normalized key matching (spreadsheet_title ≈ title).
func mapArgsToSchema(schema map[string]interface{}, args map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	norm := func(s string) string {
		var b strings.Builder
		for _, r := range strings.ToLower(s) {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				b.WriteRune(r)
			}
		}
		return b.String()
	}

	argKeys := make([]string, 0, len(args))
	for k := range args {
		argKeys = append(argKeys, k)
	}
	sort.Strings(argKeys)

	var paramNames []string
	if props, ok := schema["properties"].(map[string]interface{}); ok {
		for name := range props {
			paramNames = append(paramNames, name)
		}
		sort.Strings(paramNames)
	}
	if len(paramNames) == 0 {
		// Unknown schema — pass through every argument except UI-only keys.
		for _, k := range argKeys {
			if nk := norm(k); nk != "path" && nk != "account" {
				out[k] = args[k]
			}
		}
		return out
	}

	for _, p := range paramNames {
		pn := norm(p)
		for _, k := range argKeys {
			kn := norm(k)
			if kn == "" {
				continue
			}
			if kn == pn || strings.HasSuffix(pn, kn) || strings.HasSuffix(kn, pn) {
				out[p] = args[k]
				break
			}
		}
	}
	return out
}

// gWorkspaceResult formats a creation result, surfacing the document link.
func gWorkspaceResult(label string, data map[string]interface{}) string {
	// Look for a URL anywhere in the first two levels of the payload.
	var findURL func(m map[string]interface{}) string
	findURL = func(m map[string]interface{}) string {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			switch v := m[k].(type) {
			case string:
				if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
					return v
				}
			case map[string]interface{}:
				if u := findURL(v); u != "" {
					return u
				}
			}
		}
		return ""
	}
	url := findURL(data)
	summary, _ := json.MarshalIndent(data, "", "  ")
	if len(summary) > 4000 {
		summary = append(summary[:4000], []byte("\n... (truncated)")...)
	}
	if url != "" {
		return fmt.Sprintf("%s created successfully.\nLink: %s\n\nDetails:\n%s", label, url, string(summary))
	}
	return fmt.Sprintf("%s created successfully.\nDetails:\n%s", label, string(summary))
}
