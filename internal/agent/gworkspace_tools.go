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
	"googlesuper":     true,
	"googledocs":      true,
	"googlesheets":    true,
	"gslides":         true,
	"googledrive":     true,
	"googlecalendar":  true,
	"calendar":        true,
	"gmail":           true,
	"google":          true,
	"googleworkspace": true,
}

func isGoogleToolkit(slug string) bool { return googleToolkits[strings.ToLower(slug)] }

// findGoogleAccount finds an active Google connection for the toolkit.
func findGoogleAccount(ctx context.Context, client *composio.Client, preferredToolkit string) string {
	accounts, err := client.Accounts(ctx)
	if err != nil {
		return ""
	}
	// Prefer exact toolkit match
	for _, acc := range accounts {
		if strings.EqualFold(acc.Status, "active") && strings.EqualFold(acc.ToolkitSlug, preferredToolkit) {
			return acc.ID
		}
	}
	// Fallback to any active Google suite account
	for _, acc := range accounts {
		if strings.EqualFold(acc.Status, "active") && isGoogleToolkit(acc.ToolkitSlug) {
			return acc.ID
		}
	}
	return ""
}

// GoogleWorkspaceTools exposes Google Calendar, Docs, Sheets, and Slides
// through a Composio-connected Google account.
func GoogleWorkspaceTools(db *sql.DB) map[string]ToolDef {
	run := func(ctx context.Context, toolkit string, intents []string, args map[string]interface{}, label string) string {
		client := composioClientFromDB(db)
		if client == nil {
			return "Composio is not configured. Ask the user to add their Composio API key in the Connections page, then connect Google."
		}
		cctx, cancel := context.WithTimeout(ctx, 90*time.Second)
		defer cancel()

		accountID := findGoogleAccount(cctx, client, toolkit)
		if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
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

	tools := map[string]ToolDef{
		"gcalendar_list_events": {
			Name:        "gcalendar_list_events",
			Description: "Lists upcoming events and meetings from Google Calendar for the connected account via Composio. Supports filtering by query text, time_min, time_max, and max_results.",
			Signature:   `{"query": "string (optional keyword filter)", "time_min": "string (optional RFC3339 timestamp; defaults to start of today)", "time_max": "string (optional RFC3339 timestamp)", "max_results": "int (optional, default 10)"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured. Ask the user to add their Composio API key in the Connections page, then connect Google Calendar."
				}
				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findGoogleAccount(cctx, client, "googlecalendar")
				if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
					return "No ACTIVE Google Calendar connection found. Ask the user to connect Google Calendar in the Connections page first."
				}

				execArgs := map[string]interface{}{
					"calendarId":   "primary",
					"singleEvents": true,
					"orderBy":      "startTime",
				}

				if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
					execArgs["q"] = strings.TrimSpace(q)
				}
				if tMin, ok := args["time_min"].(string); ok && strings.TrimSpace(tMin) != "" {
					if strings.ToLower(tMin) != "all" && strings.ToLower(tMin) != "none" {
						execArgs["timeMin"] = strings.TrimSpace(tMin)
					}
				} else {
					// Default to beginning of today in current timezone
					startOfToday := time.Now().Truncate(24 * time.Hour)
					execArgs["timeMin"] = startOfToday.Format(time.RFC3339)
				}

				if tMax, ok := args["time_max"].(string); ok && strings.TrimSpace(tMax) != "" {
					execArgs["timeMax"] = strings.TrimSpace(tMax)
				}

				maxResults := 10
				if mr, ok := args["max_results"].(float64); ok && mr > 0 {
					maxResults = int(mr)
				} else if mr, ok := args["max_results"].(int); ok && mr > 0 {
					maxResults = mr
				}
				execArgs["maxResults"] = maxResults

				data, err := client.Execute(cctx, "GOOGLECALENDAR_EVENTS_LIST", accountID, execArgs)
				if err != nil {
					if strings.Contains(err.Error(), "No active connection") || strings.Contains(err.Error(), "establish a connection") {
						acc, cErr := client.Connect(cctx, "googlecalendar")
						if cErr == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("Google Calendar is not connected yet.\nPlease open this link to authorize your Google Calendar:\n%s\n\nOnce authorized, retry your request.", acc.RedirectURL)
						}
					}
					return fmt.Sprintf("Failed to list Google Calendar events: %v", err)
				}
				return formatCalendarEvents(data)
			},
		},
		"gcalendar_create_event": {
			Name:        "gcalendar_create_event",
			Description: "Creates a new event or meeting on Google Calendar for the connected account via Composio.",
			Signature:   `{"summary": "string (event title)", "start_time": "string (RFC3339/ISO timestamp or date)", "end_time": "string (RFC3339/ISO timestamp or date)", "description": "string (optional)", "location": "string (optional)", "attendees": "array of email strings (optional)"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured. Ask the user to add their Composio API key in the Connections page."
				}
				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findGoogleAccount(cctx, client, "googlecalendar")
				if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
					return "No ACTIVE Google Calendar connection found. Ask the user to connect Google Calendar in the Connections page first."
				}

				summary, _ := args["summary"].(string)
				if strings.TrimSpace(summary) == "" {
					return "Parameter 'summary' (event title) is required."
				}
				startTime, _ := args["start_time"].(string)
				if strings.TrimSpace(startTime) == "" {
					return "Parameter 'start_time' (RFC3339 or ISO timestamp, e.g. '2026-10-25T14:00:00+07:00') is required."
				}

				execArgs := map[string]interface{}{
					"calendar_id":    "primary",
					"calendarId":     "primary",
					"summary":        strings.TrimSpace(summary),
					"start_datetime": strings.TrimSpace(startTime),
				}
				if endTime, ok := args["end_time"].(string); ok && strings.TrimSpace(endTime) != "" {
					execArgs["end_datetime"] = strings.TrimSpace(endTime)
				}
				if desc, ok := args["description"].(string); ok && strings.TrimSpace(desc) != "" {
					execArgs["description"] = strings.TrimSpace(desc)
				}
				if loc, ok := args["location"].(string); ok && strings.TrimSpace(loc) != "" {
					execArgs["location"] = strings.TrimSpace(loc)
				}
				if att, ok := args["attendees"].([]interface{}); ok && len(att) > 0 {
					execArgs["attendees"] = att
				}

				data, err := client.Execute(cctx, "GOOGLECALENDAR_CREATE_EVENT", accountID, execArgs)
				if err != nil {
					return fmt.Sprintf("Failed to create Google Calendar event: %v", err)
				}
				return formatCalendarEventCreated(data)
			},
		},
		"gcalendar_find_event": {
			Name:        "gcalendar_find_event",
			Description: "Searches for events matching a specific keyword or query in Google Calendar.",
			Signature:   `{"query": "string (search query)"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured."
				}
				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findGoogleAccount(cctx, client, "googlecalendar")
				q, _ := args["query"].(string)
				execArgs := map[string]interface{}{
					"calendarId":   "primary",
					"q":            strings.TrimSpace(q),
					"singleEvents": true,
					"maxResults":   10,
				}
				data, err := client.Execute(cctx, "GOOGLECALENDAR_EVENTS_LIST", accountID, execArgs)
				if err != nil {
					return fmt.Sprintf("Failed to search Google Calendar: %v", err)
				}
				return formatCalendarEvents(data)
			},
		},
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
		"gmail_list_messages": {
			Name:        "gmail_list_messages",
			Description: "Lists recent emails from Gmail in the connected account via Composio. Supports filtering by advanced search query (e.g. 'is:unread', 'from:boss', 'subject:meeting').",
			Signature:   `{"query": "string (optional search filter)", "max_results": "int (optional, default 10)"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured."
				}
				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findGoogleAccount(cctx, client, "gmail")
				if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
					return "No ACTIVE Gmail connection found. Ask the user to connect Gmail in the Connections page first."
				}

				execArgs := map[string]interface{}{
					"max_results": 10,
				}
				if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
					execArgs["query"] = strings.TrimSpace(q)
				}
				if mr, ok := args["max_results"].(float64); ok && mr > 0 {
					execArgs["max_results"] = int(mr)
				}

				data, err := client.Execute(cctx, "GMAIL_FETCH_EMAILS", accountID, execArgs)
				if err != nil {
					if strings.Contains(err.Error(), "No active connection") || strings.Contains(err.Error(), "establish a connection") {
						acc, cErr := client.Connect(cctx, "gmail")
						if cErr == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("Gmail is not connected yet.\nPlease click this link to authorize your Gmail account:\n%s\n\nOnce authorized, ask me again and I will fetch your emails.", acc.RedirectURL)
						}
					}
					return fmt.Sprintf("Failed to list Gmail messages: %v", err)
				}
				return formatGmailMessages(data)
			},
		},
		"gmail_send_message": {
			Name:        "gmail_send_message",
			Description: "Sends an email message via Gmail in the connected account via Composio.",
			Signature:   `{"recipient_email": "string", "subject": "string", "body": "string"}`,
			Category:    "Google",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured."
				}
				to, _ := args["recipient_email"].(string)
				subject, _ := args["subject"].(string)
				body, _ := args["body"].(string)
				if strings.TrimSpace(to) == "" || strings.TrimSpace(subject) == "" {
					return "Parameters 'recipient_email' and 'subject' are required."
				}

				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findGoogleAccount(cctx, client, "gmail")
				if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
					return "No ACTIVE Gmail connection found. Ask the user to connect Gmail in the Connections page first."
				}

				execArgs := map[string]interface{}{
					"recipient_email": strings.TrimSpace(to),
					"subject":         strings.TrimSpace(subject),
					"body":            body,
				}

				_, err := client.Execute(cctx, "GMAIL_SEND_EMAIL", accountID, execArgs)
				if err != nil {
					if strings.Contains(err.Error(), "No active connection") || strings.Contains(err.Error(), "establish a connection") {
						acc, cErr := client.Connect(cctx, "gmail")
						if cErr == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("Gmail is not connected yet.\nPlease click this link to authorize your Gmail account:\n%s\n\nOnce authorized, ask me again to send the email.", acc.RedirectURL)
						}
					}
					return fmt.Sprintf("Failed to send email via Gmail: %v", err)
				}
				return fmt.Sprintf("Email sent successfully to %s with subject %q.", to, subject)
			},
		},
	}

	return tools
}

func formatCalendarEvents(data map[string]interface{}) string {
	summary, _ := data["summary"].(string)
	tz, _ := data["timeZone"].(string)
	rawItems, _ := data["items"].([]interface{})

	if len(rawItems) == 0 {
		if summary != "" {
			return fmt.Sprintf("No upcoming events found on Google Calendar (%s, timezone: %s).", summary, tz)
		}
		return "No upcoming events found in Google Calendar for the requested time range."
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Google Calendar: %s (%s) — Found %d event(s):\n\n", summary, tz, len(rawItems)))

	for i, it := range rawItems {
		itm, ok := it.(map[string]interface{})
		if !ok {
			continue
		}
		title, _ := itm["summary"].(string)
		if title == "" {
			title = "(No Title)"
		}
		status, _ := itm["status"].(string)
		htmlLink, _ := itm["htmlLink"].(string)
		loc, _ := itm["location"].(string)

		startStr := ""
		if sMap, ok := itm["start"].(map[string]interface{}); ok {
			if dt, ok := sMap["dateTime"].(string); ok {
				startStr = dt
			} else if d, ok := sMap["date"].(string); ok {
				startStr = d + " (All day)"
			}
		}

		endStr := ""
		if eMap, ok := itm["end"].(map[string]interface{}); ok {
			if dt, ok := eMap["dateTime"].(string); ok {
				endStr = dt
			} else if d, ok := eMap["date"].(string); ok {
				endStr = d
			}
		}

		sb.WriteString(fmt.Sprintf("%d. **%s**\n", i+1, title))
		if startStr != "" {
			if endStr != "" && endStr != startStr {
				sb.WriteString(fmt.Sprintf("   - When: %s to %s\n", startStr, endStr))
			} else {
				sb.WriteString(fmt.Sprintf("   - When: %s\n", startStr))
			}
		}
		if loc != "" {
			sb.WriteString(fmt.Sprintf("   - Location: %s\n", loc))
		}
		if status != "" && status != "confirmed" {
			sb.WriteString(fmt.Sprintf("   - Status: %s\n", status))
		}
		if htmlLink != "" {
			sb.WriteString(fmt.Sprintf("   - Link: %s\n", htmlLink))
		}
		sb.WriteString("\n")
	}

	jsonData, _ := json.MarshalIndent(data, "", "  ")
	if len(jsonData) > 3000 {
		jsonData = append(jsonData[:3000], []byte("\n... (truncated)")...)
	}
	sb.WriteString("<details><summary>Raw Event Data</summary>\n\n```json\n")
	sb.WriteString(string(jsonData))
	sb.WriteString("\n```\n</details>")

	return sb.String()
}

func formatCalendarEventCreated(data map[string]interface{}) string {
	summary, _ := data["summary"].(string)
	htmlLink, _ := data["htmlLink"].(string)
	status, _ := data["status"].(string)
	if status == "" {
		status = "confirmed"
	}

	startStr := ""
	if sMap, ok := data["start"].(map[string]interface{}); ok {
		if dt, ok := sMap["dateTime"].(string); ok {
			startStr = dt
		} else if d, ok := sMap["date"].(string); ok {
			startStr = d
		}
	}

	var sb strings.Builder
	sb.WriteString("Google Calendar Event Created Successfully!\n")
	sb.WriteString(fmt.Sprintf("- Title: **%s**\n", summary))
	if startStr != "" {
		sb.WriteString(fmt.Sprintf("- Start: %s\n", startStr))
	}
	if htmlLink != "" {
		sb.WriteString(fmt.Sprintf("- Link: %s\n", htmlLink))
	}
	sb.WriteString(fmt.Sprintf("- Status: %s\n", status))

	jsonData, _ := json.MarshalIndent(data, "", "  ")
	if len(jsonData) > 2000 {
		jsonData = append(jsonData[:2000], []byte("\n... (truncated)")...)
	}
	sb.WriteString("\n<details><summary>Event Details</summary>\n\n```json\n")
	sb.WriteString(string(jsonData))
	sb.WriteString("\n```\n</details>")

	return sb.String()
}

func formatGmailMessages(data map[string]interface{}) string {
	rawMessages, _ := data["messages"].([]interface{})
	if len(rawMessages) == 0 {
		return "No emails found matching the specified query."
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Gmail Inbox — Found %d message(s):\n\n", len(rawMessages)))
	for i, m := range rawMessages {
		msg, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		sub, _ := msg["subject"].(string)
		if sub == "" {
			sub = "(No Subject)"
		}
		from, _ := msg["sender"].(string)
		date, _ := msg["date"].(string)
		snippet, _ := msg["snippet"].(string)
		sb.WriteString(fmt.Sprintf("%d. **%s**\n", i+1, sub))
		if from != "" {
			sb.WriteString(fmt.Sprintf("   - From: %s\n", from))
		}
		if date != "" {
			sb.WriteString(fmt.Sprintf("   - Date: %s\n", date))
		}
		if snippet != "" {
			sb.WriteString(fmt.Sprintf("   - Snippet: %s\n", snippet))
		}
		sb.WriteString("\n")
	}

	jsonData, _ := json.MarshalIndent(data, "", "  ")
	if len(jsonData) > 2500 {
		jsonData = append(jsonData[:2500], []byte("\n... (truncated)")...)
	}
	sb.WriteString("<details><summary>Raw Messages Data</summary>\n\n```json\n")
	sb.WriteString(string(jsonData))
	sb.WriteString("\n```\n</details>")

	return sb.String()
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
