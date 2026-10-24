package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/composio"
)

// GitHubTools exposes GitHub tools through a Composio-connected GitHub account.
func GitHubTools(db *sql.DB) map[string]ToolDef {
	findAccount := func(ctx context.Context, client *composio.Client) string {
		accounts, err := client.Accounts(ctx)
		if err != nil {
			return ""
		}
		for _, acc := range accounts {
			if strings.EqualFold(acc.Status, "active") && strings.EqualFold(acc.ToolkitSlug, "github") {
				return acc.ID
			}
		}
		return ""
	}

	return map[string]ToolDef{
		"github_list_repos": {
			Name:        "github_list_repos",
			Description: "Lists repositories for the authenticated GitHub user via Composio. Returns recent/active repositories without needing to guess or scrape usernames.",
			Signature:   `{"sort": "string (optional: 'updated', 'created', 'pushed', default 'updated')", "per_page": "int (optional, default 10)"}`,
			Category:    "Development",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured. Ask the user to add their Composio API key in the Connections page."
				}
				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findAccount(cctx, client)
				if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
					return "No ACTIVE GitHub connection found. Ask the user to connect GitHub in the Connections page (Composio) first."
				}

				sortField := "updated"
				if s, ok := args["sort"].(string); ok && strings.TrimSpace(s) != "" {
					sortField = strings.TrimSpace(s)
				}
				perPage := 10
				if pp, ok := args["per_page"].(float64); ok && pp > 0 {
					perPage = int(pp)
				} else if pp, ok := args["per_page"].(int); ok && pp > 0 {
					perPage = pp
				}

				execArgs := map[string]interface{}{
					"sort":      sortField,
					"direction": "desc",
					"per_page":  perPage,
				}

				data, err := client.Execute(cctx, "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", accountID, execArgs)
				if err != nil {
					if strings.Contains(err.Error(), "No active connection") || strings.Contains(err.Error(), "establish a connection") {
						acc, cErr := client.Connect(cctx, "github")
						if cErr == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("GitHub is not connected yet.\nPlease click this link to authorize your GitHub account:\n%s\n\nOnce authorized, retry your request.", acc.RedirectURL)
						}
					}
					return fmt.Sprintf("Failed to list GitHub repositories: %v", err)
				}
				return formatGitHubRepos(data)
			},
		},
		"github_get_user": {
			Name:        "github_get_user",
			Description: "Gets profile information and username for the authenticated GitHub user via Composio.",
			Signature:   `{}`,
			Category:    "Development",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured."
				}
				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findAccount(cctx, client)
				data, err := client.Execute(cctx, "GITHUB_GET_THE_AUTHENTICATED_USER", accountID, map[string]interface{}{})
				if err != nil {
					return fmt.Sprintf("Failed to get GitHub user profile: %v", err)
				}
				login, _ := data["login"].(string)
				name, _ := data["name"].(string)
				htmlURL, _ := data["html_url"].(string)
				bio, _ := data["bio"].(string)
				publicRepos, _ := data["public_repos"].(float64)

				var sb strings.Builder
				sb.WriteString("Authenticated GitHub User Profile:\n")
				sb.WriteString(fmt.Sprintf("- Username: **%s**\n", login))
				if name != "" {
					sb.WriteString(fmt.Sprintf("- Name: %s\n", name))
				}
				if htmlURL != "" {
					sb.WriteString(fmt.Sprintf("- Profile URL: %s\n", htmlURL))
				}
				if bio != "" {
					sb.WriteString(fmt.Sprintf("- Bio: %s\n", bio))
				}
				sb.WriteString(fmt.Sprintf("- Public Repositories: %.0f\n", publicRepos))
				return sb.String()
			},
		},
		"github_create_issue": {
			Name:        "github_create_issue",
			Description: "Creates an issue in a GitHub repository via Composio.",
			Signature:   `{"owner": "string (repo owner or org)", "repo": "string (repository name)", "title": "string (issue title)", "body": "string (optional description)"}`,
			Category:    "Development",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured."
				}
				owner, _ := args["owner"].(string)
				repo, _ := args["repo"].(string)
				title, _ := args["title"].(string)
				body, _ := args["body"].(string)
				if strings.TrimSpace(owner) == "" || strings.TrimSpace(repo) == "" || strings.TrimSpace(title) == "" {
					return "Parameters 'owner', 'repo', and 'title' are required."
				}

				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findAccount(cctx, client)
				execArgs := map[string]interface{}{
					"owner": strings.TrimSpace(owner),
					"repo":  strings.TrimSpace(repo),
					"title": strings.TrimSpace(title),
					"body":  body,
				}
				data, err := client.Execute(cctx, "GITHUB_CREATE_AN_ISSUE", accountID, execArgs)
				if err != nil {
					if strings.Contains(err.Error(), "No active connection") || strings.Contains(err.Error(), "establish a connection") {
						acc, cErr := client.Connect(cctx, "github")
						if cErr == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("GitHub is not connected yet.\nPlease click this link to authorize your GitHub account:\n%s\n\nOnce authorized, retry your request.", acc.RedirectURL)
						}
					}
					return fmt.Sprintf("Failed to create GitHub issue: %v", err)
				}
				issueURL, _ := data["html_url"].(string)
				issueNumber, _ := data["number"].(float64)
				return fmt.Sprintf("GitHub Issue #%.0f created successfully!\nLink: %s", issueNumber, issueURL)
			},
		},
		"github_list_issues": {
			Name:        "github_list_issues",
			Description: "Lists issues for a repository via Composio.",
			Signature:   `{"owner": "string", "repo": "string", "state": "string (optional: 'open', 'closed', 'all', default 'open')"}`,
			Category:    "Development",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured."
				}
				owner, _ := args["owner"].(string)
				repo, _ := args["repo"].(string)
				if strings.TrimSpace(owner) == "" || strings.TrimSpace(repo) == "" {
					return "Parameters 'owner' and 'repo' are required."
				}
				state := "open"
				if s, ok := args["state"].(string); ok && strings.TrimSpace(s) != "" {
					state = strings.TrimSpace(s)
				}

				cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				accountID := findAccount(cctx, client)
				execArgs := map[string]interface{}{
					"owner": strings.TrimSpace(owner),
					"repo":  strings.TrimSpace(repo),
					"state": state,
				}
				data, err := client.Execute(cctx, "GITHUB_LIST_REPOSITORY_ISSUES", accountID, execArgs)
				if err != nil {
					return fmt.Sprintf("Failed to list GitHub issues: %v", err)
				}
				jsonData, _ := json.MarshalIndent(data, "", "  ")
				if len(jsonData) > 3000 {
					jsonData = append(jsonData[:3000], []byte("\n... (truncated)")...)
				}
				return string(jsonData)
			},
		},
	}
}

func formatGitHubRepos(data map[string]interface{}) string {
	rawRepos, _ := data["repositories"].([]interface{})
	if len(rawRepos) == 0 {
		return "No repositories found for the authenticated user."
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("GitHub Repositories (%d latest):\n\n", len(rawRepos)))
	for i, r := range rawRepos {
		repo, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		fullName, _ := repo["full_name"].(string)
		htmlURL, _ := repo["html_url"].(string)
		desc, _ := repo["description"].(string)
		lang, _ := repo["language"].(string)
		updatedAt, _ := repo["updated_at"].(string)
		visibility, _ := repo["visibility"].(string)
		stars, _ := repo["stargazers_count"].(float64)

		sb.WriteString(fmt.Sprintf("%d. **[%s](%s)** (%s)\n", i+1, fullName, htmlURL, visibility))
		if desc != "" {
			sb.WriteString(fmt.Sprintf("   - %s\n", desc))
		}
		var info []string
		if lang != "" {
			info = append(info, fmt.Sprintf("Language: %s", lang))
		}
		if stars > 0 {
			info = append(info, fmt.Sprintf("Stars: %.0f", stars))
		}
		if updatedAt != "" {
			info = append(info, fmt.Sprintf("Updated: %s", updatedAt))
		}
		if len(info) > 0 {
			sb.WriteString(fmt.Sprintf("   - %s\n", strings.Join(info, " • ")))
		}
		sb.WriteString("\n")
	}

	jsonData, _ := json.MarshalIndent(data, "", "  ")
	if len(jsonData) > 3000 {
		jsonData = append(jsonData[:3000], []byte("\n... (truncated)")...)
	}
	sb.WriteString("<details><summary>Raw Repositories Data</summary>\n\n```json\n")
	sb.WriteString(string(jsonData))
	sb.WriteString("\n```\n</details>")
	return sb.String()
}
