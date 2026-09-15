package agent

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/data"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/git"
	"github.com/kendaliai/app/internal/intelligence"
	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/messaging"
	"github.com/kendaliai/app/internal/plugins"
	"github.com/kendaliai/app/internal/reflection"
	"github.com/kendaliai/app/internal/review"
	"github.com/kendaliai/app/internal/scheduler"
	"github.com/kendaliai/app/internal/skills"
	"github.com/kendaliai/app/internal/storage"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

type ToolDef struct {
	Name        string
	Description string
	Signature   string
	Category    string
	Execute     func(ctx context.Context, args map[string]interface{}) string
}

type SkillDef struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Entrypoint  string                 `json:"entrypoint"`
	InputSchema map[string]interface{} `json:"input_schema"`
	Execution   struct {
		Type        string            `json:"type"`
		Command     string            `json:"command"`
		ArgsMapping map[string]string `json:"args_mapping"`
	} `json:"execution"`
	Constraints struct {
		TimeoutMs int  `json:"timeout_ms"`
		Safe      bool `json:"safe"`
	} `json:"constraints"`
	Installed bool `json:"installed"`
}

type SkillConfig struct {
	Skills []SkillDef `json:"skills"`
}

// GetToolRegistry fully implements blueprint Rule 3 (Full Semantic Tooling)
func GetToolRegistry(cfg *config.Config, excludeCmds []string, workspaceRoot string, db *sql.DB) map[string]ToolDef {
	registry := map[string]ToolDef{
		// 📁 FILESYSTEM
		"read_file": {
			Name:        "read_file",
			Description: "Reads a file. Use offset:0 to get the complete file (default 500 lines). Read each file ONCE. Shows total line count so you know if more reads are needed.",
			Signature:   `{"path": "string", "offset": "int", "limit": "int"}`,
			Category:    "Explore",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)

				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}
				if err := CheckFilePermission(path, workspaceRoot, PermRead); err != nil {
					return err.Error()
				}
				b, err := os.ReadFile(path)
				if err != nil {
					return err.Error()
				}
				lines := strings.Split(string(b), "\n")

				offset := 0
				limit := 500

				if o, ok := args["offset"].(float64); ok && o >= 0 {
					offset = int(o)
				}
				if l, ok := args["limit"].(float64); ok && l > 0 {
					limit = int(l)
				}

				if limit > 500 {
					limit = 500
				}

				if offset >= len(lines) {
					return "offset beyond EOF"
				}
				end := offset + limit
				if end > len(lines) {
					end = len(lines)
				}

				content := strings.Join(lines[offset:end], "\n")

				if offset+limit < len(lines) {
					content += fmt.Sprintf("\n\n[Showing lines %d-%d of %d total. Read offset:%d for next chunk.]", offset+1, end, len(lines), end)
				} else if len(lines) > 10 {
					content += fmt.Sprintf("\n\n[All %d lines shown.]", len(lines))
				}

				return content
			},
		},
		"search_files": {
			Name:        "search_files",
			Description: "Search files matching a pattern using standard grep.",
			Signature:   `{"query": "string", "path": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				query, _ := args["query"].(string)
				path, _ := args["path"].(string)

				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}

				timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				defer cancel()

				cmd := exec.CommandContext(timeoutCtx, "grep", "-rnI", query, path)
				out, err := cmd.CombinedOutput()

				if len(out) == 0 {
					return "No matches found."
				}
				if err != nil && len(out) == 0 {
					return err.Error()
				}

				// Truncate massive search responses
				res := string(out)
				if len(res) > 2000 {
					res = res[:2000] + "\n...(truncated)"
				}
				return res
			},
		},

		// 🧠 REPOSITORY INTELLIGENCE
		"analyze_project": {
			Name:        "analyze_project",
			Description: "Analyzes a project directory: detects framework, entrypoints, CSS, routing, and components. Pass 'path' for a subdirectory. ALWAYS use this first — it replaces 20+ exec/search_files/read_file calls.",
			Signature:   `{"path": "string"}`,
			Category:    "Intelligence",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				analysisRoot := workspaceRoot
				if p, ok := args["path"].(string); ok && p != "" {
					analysisRoot = filepath.Join(workspaceRoot, p)
				}

				intelEngine, err := intelligence.NewEngine(analysisRoot)
				if err != nil {
					return fmt.Sprintf("error: %v", err)
				}
				defer intelEngine.Close()

				intelEngine.AnalyzeFull()
				result := intelEngine.FormatAnalysisJSON()

				subdirs := scanSubdirs(workspaceRoot)
				if len(subdirs) > 0 && args["path"] == nil {
					result = result[:len(result)-1] + fmt.Sprintf(`, "available_subdirs": %s}`, subdirs)
				}

				return result
			},
		},
		"resolve_symbol": {
			Name:        "resolve_symbol",
			Description: "Finds the file location of a named symbol using Tree-sitter workspace graph. Returns file path and line number.",
			Signature:   `{"name": "string"}`,
			Category:    "Intelligence",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				name, _ := args["name"].(string)
				if name == "" {
					return "error: 'name' is required"
				}

				core, err := data.NewCore(workspaceRoot)
				if err != nil {
					intelEngine, err2 := intelligence.NewEngine(workspaceRoot)
					if err2 == nil {
						defer intelEngine.Close()
						intelEngine.AnalyzeFull()
						entries := intelEngine.ResolveSymbol(name)
						if len(entries) > 0 {
							b, _ := json.MarshalIndent(entries, "", "  ")
							return string(b)
						}
					}
					return fmt.Sprintf("error: %v", err)
				}
				defer core.Close()

				core.Reindex(ctx)
				results, err := core.ResolveSymbol(ctx, name)
				if err != nil || len(results) == 0 {
					return fmt.Sprintf("Symbol '%s' not found", name)
				}
				b, _ := json.MarshalIndent(results, "", "  ")
				return string(b)
			},
		},
		"search_code": {
			Name:        "search_code",
			Description: "Full-text search across the codebase using Bleve search engine (BM25 ranking). Use this for finding code patterns, function usage, or text across files.",
			Signature:   `{"query": "string", "top_k": "int"}`,
			Category:    "Intelligence",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				query, _ := args["query"].(string)
				if query == "" {
					return "error: 'query' is required"
				}
				topK := 10
				if k, ok := args["top_k"].(float64); ok && k > 0 {
					topK = int(k)
				}

				core, err := data.NewCore(workspaceRoot)
				if err != nil {
					return fmt.Sprintf("error: %v", err)
				}
				defer core.Close()

				core.Reindex(ctx)
				results, err := core.SearchCode(ctx, query, topK)
				if err != nil {
					return fmt.Sprintf("search error: %v", err)
				}
				if len(results) == 0 {
					return "No results found."
				}
				b, _ := json.MarshalIndent(results, "", "  ")
				return string(b)
			},
		},
		"get_imports": {
			Name:        "get_imports",
			Description: "Returns all imports of a file or all files that import it. Use this to understand dependencies between components.",
			Signature:   `{"file": "string", "direction": "string"}`,
			Category:    "Intelligence",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				file, _ := args["file"].(string)
				direction, _ := args["direction"].(string)
				if file == "" {
					return "error: 'file' is required"
				}
				engine, err := intelligence.NewEngine(workspaceRoot)
				if err != nil {
					return fmt.Sprintf("error: %v", err)
				}
				defer engine.Close()

				engine.AnalyzeFull()

				var edges []intelligence.ImportEdge
				if direction == "imported_by" {
					edges = engine.GetRepoDB().GetImportedBy(file)
				} else {
					edges = engine.GetImportsOf(file)
				}

				if len(edges) == 0 {
					return fmt.Sprintf("No imports found for '%s'", file)
				}
				b, _ := json.MarshalIndent(edges, "", "  ")
				return string(b)
			},
		},
		"verify_build": {
			Name:        "verify_build",
			Description: "Runs the verification pipeline: build, lint, and test. Use this after making code changes to confirm everything works.",
			Signature:   `{}`,
			Category:    "Verification",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				engine, err := intelligence.NewEngine(workspaceRoot)
				if err != nil {
					return fmt.Sprintf("error: %v", err)
				}
				defer engine.Close()

				sessionID := fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("verify-%d", time.Now().UnixNano()))))[:16]
				result := engine.Verify(ctx, sessionID)

				vp := intelligence.NewVerificationPipeline(workspaceRoot, engine.AnalyzeProject(), sessionID)
				return vp.FormatResult(result)
			},
		},
		"request_reads": {
			Name:        "request_reads",
			Description: "Request additional file reads when the read budget is exhausted. Must provide a justification.",
			Signature:   `{"justification": "string"}`,
			Category:    "Intelligence",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				justification, _ := args["justification"].(string)
				if justification == "" {
					return "error: justify why you need more reads"
				}
				return fmt.Sprintf("read_budget_extension: justification accepted. 5 additional reads granted.")
			},
		},

		// ✏️ EDITING
		"write_file": {
			Name:        "write_file",
			Description: "Writes or overwrites an entire file with new content. Use this when creating new files or replacing ALL content in a file. Much simpler than apply_patch — no old_str matching needed. Use apply_patch for targeted edits within a file.",
			Signature:   `{"path": "string", "content": "string"}`,
			Category:    "Editing",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				content, _ := args["content"].(string)
				if path == "" {
					return "error: 'path' is required"
				}
				if content == "" {
					return "error: 'content' is required"
				}
				fullPath := filepath.Join(workspaceRoot, path)
				if err := CheckFilePermission(fullPath, workspaceRoot, "write"); err != nil {
					return fmt.Sprintf("Sorry, not allowed: %v", err)
				}
				dir := filepath.Dir(fullPath)
				if err := os.MkdirAll(dir, 0755); err != nil {
					return fmt.Sprintf("error creating directory: %v", err)
				}
				if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
					return fmt.Sprintf("error writing file: %v", err)
				}
				return fmt.Sprintf("file written: %s (%d bytes)", path, len(content))
			},
		},
		"apply_patch": {
			Name:        "apply_patch",
			Description: "Replaces exact target block with new block. old_str must match exactly (copy-paste from read_file output). When old_str is empty, creates a NEW file with new_str content. For full file replacements, prefer write_file.",
			Signature:   `{"path": "string", "old_str": "string", "new_str": "string"}`,
			Category:    "Editing",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}

				oldStr, _ := args["old_str"].(string)
				newStr, _ := args["new_str"].(string)

				op := PermWrite
				if oldStr != "" {
					op = PermUpdate
				}
				if err := CheckFilePermission(path, workspaceRoot, op); err != nil {
					return err.Error()
				}

				if oldStr == "" {
					fullPath := filepath.Join(workspaceRoot, path)
					os.MkdirAll(filepath.Dir(fullPath), 0755)
					_ = os.WriteFile(fullPath, []byte(newStr), 0644)
					return "created_file"
				}

				b, err := os.ReadFile(path)
				if err != nil {
					return err.Error()
				}

				content := string(b)
				if !strings.Contains(content, oldStr) {
					return "old_str not found exactly as formatted"
				}

				content = strings.Replace(content, oldStr, newStr, 1)
				_ = os.WriteFile(path, []byte(content), 0644)
				return "patched successfully"
			},
		},
		"replace_range": {
			Name:        "replace_range",
			Description: "Replaces lines between start and end (inclusive) with new content.",
			Signature:   `{"path": "string", "start": "int", "end": "int", "new_content": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}
				if err := CheckFilePermission(path, workspaceRoot, PermUpdate); err != nil {
					return err.Error()
				}

				startF, _ := args["start"].(float64)
				endF, _ := args["end"].(float64)
				newContent, _ := args["new_content"].(string)

				start := int(startF)
				end := int(endF)

				b, err := os.ReadFile(path)
				if err != nil {
					return err.Error()
				}
				lines := strings.Split(string(b), "\n")

				if start < 1 || start > len(lines) || end < start {
					return "invalid line bounds"
				}
				if end > len(lines) {
					end = len(lines)
				}

				// Lines are 1-indexed for users
				prefix := lines[:start-1]
				suffix := lines[end:]

				final := append(prefix, strings.Split(newContent, "\n")...)
				final = append(final, suffix...)

				_ = os.WriteFile(path, []byte(strings.Join(final, "\n")), 0644)
				return "range replaced safely"
			},
		},

		// ⚡ EXECUTION
		"exec": {
			Name:        "exec",
			Description: "Executes a shell command bounded safely by a context timeout.",
			Signature:   `{"command": "string", "timeout": "int"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				cmdStr, _ := args["command"].(string)
				timeoutVal := 10
				if t, ok := args["timeout"].(float64); ok && t > 0 {
					timeoutVal = int(t)
				}

				for _, ex := range excludeCmds {
					ex = strings.TrimSpace(ex)
					if ex != "" && strings.Contains(cmdStr, ex) {
						return fmt.Sprintf("Security Validation Blocked: pattern '%s'", ex)
					}
				}

				timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutVal)*time.Second)
				defer cancel()

				cmd := exec.CommandContext(timeoutCtx, "bash", "-c", cmdStr)
				out, err := cmd.CombinedOutput()

				if timeoutCtx.Err() == context.DeadlineExceeded {
					return fmt.Sprintf("Timeout Exceeded after %ds.\nOutput: %s", timeoutVal, string(out))
				}
				if err != nil {
					return fmt.Sprintf("Error: %v\nOutput: %s", err, string(out))
				}
				return string(out)
			},
		},

		// 🌿 GIT
		"git_status": {
			Name:        "git_status",
			Description: "Gets git status porcelain.",
			Signature:   `{}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				cmd := exec.CommandContext(ctx, "git", "status", "--porcelain")
				cmd.Dir = workspaceRoot
				out, _ := cmd.CombinedOutput()
				return string(out)
			},
		},
		"git_diff": {
			Name:        "git_diff",
			Description: "Gets git diff.",
			Signature:   `{}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				cmd := exec.CommandContext(ctx, "git", "diff")
				cmd.Dir = workspaceRoot
				out, _ := cmd.CombinedOutput()
				return string(out)
			},
		},
		"git_apply_patch": {
			Name:        "git_apply_patch",
			Description: "Applies a raw git patch string securely.",
			Signature:   `{"patch_str": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				patch, _ := args["patch_str"].(string)

				tmpFile := filepath.Join(os.TempDir(), "kendali_"+fmt.Sprint(time.Now().UnixNano())+".patch")
				os.WriteFile(tmpFile, []byte(patch), 0644)
				defer os.Remove(tmpFile)

				cmd := exec.CommandContext(ctx, "git", "apply", tmpFile)
				cmd.Dir = workspaceRoot
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("Git Apply Failed: %s", string(out))
				}
				return "Patch applied successfully."
			},
		},
		"git_worktree": {
			Name:        "git_worktree",
			Description: "Manages Git Worktrees for isolated parallel branch/folder development. Actions: 'list', 'add', 'remove', 'prune'. Useful for developing websites, features, or tests in parallel without dirtying the main working tree.",
			Signature:   `{"action": "list|add|remove|prune", "path": "string", "branch": "string", "create_branch": "boolean"}`,
			Category:    "Git",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				action, _ := args["action"].(string)
				path, _ := args["path"].(string)
				branch, _ := args["branch"].(string)
				createBranch := false
				if cb, ok := args["create_branch"].(bool); ok {
					createBranch = cb
				}

				switch strings.ToLower(action) {
				case "list", "":
					wtList, err := git.DefaultWorktreeManager.ListWorktrees(ctx, workspaceRoot)
					if err != nil {
						return fmt.Sprintf("Error listing worktrees: %v", err)
					}
					data, _ := json.MarshalIndent(wtList, "", "  ")
					return string(data)

				case "add", "create":
					if path == "" {
						return "error: 'path' is required to add worktree"
					}
					wt, err := git.DefaultWorktreeManager.AddWorktree(ctx, workspaceRoot, path, branch, createBranch)
					if err != nil {
						return fmt.Sprintf("Error adding worktree: %v", err)
					}
					return fmt.Sprintf("✅ Worktree created at %s on branch %s (HEAD: %s)", wt.Path, wt.Branch, wt.HEAD)

				case "remove", "delete":
					if path == "" {
						return "error: 'path' is required to remove worktree"
					}
					err := git.DefaultWorktreeManager.RemoveWorktree(ctx, workspaceRoot, path, true)
					if err != nil {
						return fmt.Sprintf("Error removing worktree: %v", err)
					}
					return fmt.Sprintf("✅ Worktree at %s removed successfully", path)

				case "prune":
					err := git.DefaultWorktreeManager.PruneWorktrees(ctx, workspaceRoot)
					if err != nil {
						return fmt.Sprintf("Error pruning worktrees: %v", err)
					}
					return "✅ Git worktrees pruned successfully"

				default:
					return fmt.Sprintf("Unknown action '%s'. Valid actions: list, add, remove, prune", action)
				}
			},
		},
		"review_code": {
			Name:        "review_code",
			Description: "Inspects code diffs, files, or workspace for security vulnerabilities, secret leaks, bugs, and quality issues. Actions: 'diff' (default), 'file', 'workspace'.",
			Signature:   `{"action": "diff|file|workspace", "path": "string"}`,
			Category:    "Review",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				engine := review.NewReviewEngine()
				action, _ := args["action"].(string)
				path, _ := args["path"].(string)

				switch strings.ToLower(action) {
				case "file":
					if path == "" {
						return "error: 'path' is required for file review"
					}
					fullPath := path
					if !filepath.IsAbs(fullPath) {
						fullPath = filepath.Join(workspaceRoot, path)
					}
					report, err := engine.ReviewFile(fullPath)
					if err != nil {
						return fmt.Sprintf("Error reviewing file: %v", err)
					}
					data, _ := json.MarshalIndent(report, "", "  ")
					return string(data)

				case "workspace":
					target := workspaceRoot
					if path != "" {
						if !filepath.IsAbs(path) {
							target = filepath.Join(workspaceRoot, path)
						} else {
							target = path
						}
					}
					issues, err := engine.Scan(target)
					if err != nil {
						return fmt.Sprintf("Error scanning workspace: %v", err)
					}
					data, _ := json.MarshalIndent(map[string]interface{}{
						"target":     target,
						"issueCount": len(issues),
						"issues":     issues,
					}, "", "  ")
					return string(data)

				default: // "diff"
					report, err := engine.AnalyzeDiff(ctx, workspaceRoot)
					if err != nil {
						return fmt.Sprintf("Error analyzing diff: %v", err)
					}
					data, _ := json.MarshalIndent(report, "", "  ")
					return string(data)
				}
			},
		},

		// ✅ VALIDATION
		"run_tests": {
			Name:        "run_tests",
			Description: "Runs standard Go or NPM test validations.",
			Signature:   `{"framework": "string", "path": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				fw, _ := args["framework"].(string)
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}

				timeoutCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
				defer cancel()

				var cmd *exec.Cmd
				if fw == "go" {
					cmd = exec.CommandContext(timeoutCtx, "go", "test", path)
				} else {
					cmd = exec.CommandContext(timeoutCtx, "npm", "test", "--", path)
				}
				cmd.Dir = workspaceRoot
				out, _ := cmd.CombinedOutput()
				return string(out)
			},
		},
		"validate_syntax": {
			Name:        "validate_syntax",
			Description: "Validates syntax of a file. For .go: go build. For .js/.jsx/.ts/.tsx: runs the project's lint command if available.",
			Signature:   `{"file": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				file, _ := args["file"].(string)
				if err := ValidateSandboxedPath(file, workspaceRoot); err != nil {
					return err.Error()
				}
				if strings.HasSuffix(file, ".go") {
					cmd := exec.CommandContext(ctx, "go", "build", "-o", os.DevNull, file)
					out, err := cmd.CombinedOutput()
					if err != nil {
						return string(out)
					}
					return "Syntax valid."
				}
				if strings.HasSuffix(file, ".js") || strings.HasSuffix(file, ".jsx") ||
					strings.HasSuffix(file, ".ts") || strings.HasSuffix(file, ".tsx") {
					fullPath := filepath.Join(workspaceRoot, file)
					fi, err := os.Stat(fullPath)
					if err != nil {
						return fmt.Sprintf("file not found: %s", file)
					}
					cmd := exec.CommandContext(ctx, "npx", "oxlint", "--quiet", file)
					out, err := cmd.CombinedOutput()
					if err != nil {
						return fmt.Sprintf("lint: %s", string(out))
					}
					return fmt.Sprintf("syntax valid (%d bytes, %d warnings)", fi.Size(), 0)
				}
				return fmt.Sprintf("Syntax validation not available for %s (use verify_build for full project check)", filepath.Ext(file))
			},
		},

		// 🌐 OPTIONAL HIGH VALUE
		"fetch_url": {
			Name:        "fetch_url",
			Description: "Fetches remote data from external URLs. Use this to read web pages, documentation, or any external content requested by the user.",
			Signature:   `{"url": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)

				timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
				defer cancel()

				req, _ := http.NewRequestWithContext(timeoutCtx, http.MethodGet, urlStr, nil)
				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return err.Error()
				}
				defer resp.Body.Close()

				b, _ := io.ReadAll(resp.Body)
				content := string(b)
				if len(content) > 8000 {
					content = content[:8000] + "\n...(truncated)"
				}
				return content
			},
		},

		// 🌐 WEB SEARCH & SCRAPING (Exa / Firecrawl / Fallback)
		"web_search": {
			Name:        "web_search",
			Description: "Search the live web for up-to-date information, documentation, news, facts, or code using Exa neural search or Firecrawl search.",
			Signature:   `{"query": "string"}`,
			Category:    "Web",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				return executeWebSearch(ctx, cfg, db, args)
			},
		},
		"web_scrape": {
			Name:        "web_scrape",
			Description: "Extract clean markdown and readable text content from any web page URL using Firecrawl or Exa web fetch.",
			Signature:   `{"url": "string"}`,
			Category:    "Web",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				return executeWebScrape(ctx, cfg, db, args)
			},
		},

		// ☁️ OBJECT STORAGE
		"upload_object": {
			Name:        "upload_object",
			Description: "Uploads a local file to object storage. Use provider: 'local' (default, always available) or 'r2'/'cloudflare' for remote. Returns object key, URL, checksum, and size.",
			Signature:   `{"path": "string", "session_id": "string", "bucket": "string", "provider": "string"}`,
			Category:    "Storage",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if storage.DefaultManager == nil {
					return "error: storage not configured"
				}
				path, _ := args["path"].(string)
				if path == "" {
					path, _ = args["file"].(string)
				}
				if path == "" {
					return "error: missing required arg 'path'"
				}
				if !filepath.IsAbs(path) {
					path = filepath.Join(workspaceRoot, path)
				}

				if err := CheckFilePermission(path, workspaceRoot, PermRead); err != nil {
					return err.Error()
				}

				f, err := os.Open(path)
				if err != nil {
					return fmt.Sprintf("error opening file: %v", err)
				}
				defer f.Close()

				fi, err := f.Stat()
				if err != nil {
					return fmt.Sprintf("error stat file: %v", err)
				}

				sessionID, _ := args["session_id"].(string)
				bucket, _ := args["bucket"].(string)
				if bucket == "" {
					bucket = "uploads"
				}
				provider, _ := args["provider"].(string)
				if provider == "" {
					provider = "local"
				}
				key := storage.DefaultManager.BuildKey(sessionID, bucket, filepath.Base(path))

				result, err := storage.DefaultManager.Upload(ctx, storage.UploadRequest{
					Key:  key,
					Body: f,
					Size: fi.Size(),
				}, provider)
				if err != nil {
					return fmt.Sprintf("error uploading: %v", err)
				}

				summary := fmt.Sprintf(`{"artifact_id":"%s","url":"%s","checksum":"%s","size":%d,"key":"%s","provider":"%s"}`,
					key, storage.DefaultManager.PublicURL(key, provider), result.Checksum, result.Size, result.Key, provider)
				return summary
			},
		},
		"download_object": {
			Name:        "download_object",
			Description: "Downloads an object from storage to the workspace. Returns the local destination path and size.",
			Signature:   `{"key": "string", "dest": "string"}`,
			Category:    "Storage",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if storage.DefaultManager == nil {
					return "error: storage not configured"
				}
				key, _ := args["key"].(string)
				if key == "" {
					return "error: missing required arg 'key'"
				}
				dest, _ := args["dest"].(string)
				if dest == "" {
					dest, _ = args["path"].(string)
				}
				if dest == "" {
					dest = filepath.Base(key)
				}
				if !filepath.IsAbs(dest) {
					dest = filepath.Join(workspaceRoot, dest)
				}

				reader, err := storage.DefaultManager.Download(ctx, key)
				if err != nil {
					return fmt.Sprintf("error downloading: %v", err)
				}
				defer reader.Close()

				if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
					return fmt.Sprintf("error creating dest dir: %v", err)
				}

				f, err := os.Create(dest)
				if err != nil {
					return fmt.Sprintf("error creating dest file: %v", err)
				}
				defer f.Close()

				written, err := io.Copy(f, reader)
				if err != nil {
					return fmt.Sprintf("error writing file: %v", err)
				}

				return fmt.Sprintf(`{"dest":"%s","size":%d,"key":"%s"}`, dest, written, key)
			},
		},
		"list_objects": {
			Name:        "list_objects",
			Description: "Lists objects in storage with a given prefix.",
			Signature:   `{"prefix": "string"}`,
			Category:    "Storage",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if storage.DefaultManager == nil {
					return "error: storage not configured"
				}
				prefix, _ := args["prefix"].(string)
				objects, err := storage.DefaultManager.List(ctx, prefix)
				if err != nil {
					return fmt.Sprintf("error listing objects: %v", err)
				}
				if len(objects) == 0 {
					return "no objects found"
				}
				var sb strings.Builder
				for _, obj := range objects {
					sb.WriteString(fmt.Sprintf("%s (%d bytes, %s)\n", obj.Key, obj.Size, obj.LastModified.Format(time.RFC3339)))
				}
				return sb.String()
			},
		},
		"delete_object": {
			Name:        "delete_object",
			Description: "Deletes an object from storage by key.",
			Signature:   `{"key": "string"}`,
			Category:    "Storage",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if storage.DefaultManager == nil {
					return "error: storage not configured"
				}
				key, _ := args["key"].(string)
				if key == "" {
					return "error: missing required arg 'key'"
				}
				if err := storage.DefaultManager.Delete(ctx, key); err != nil {
					return fmt.Sprintf("error deleting object: %v", err)
				}
				return fmt.Sprintf("deleted '%s'", key)
			},
		},

		// 🧠 MEMORY (Embedding-backed)
		"store_memory": {
			Name:        "store_memory",
			Description: "Stores a piece of information in long-term memory using embeddings. Use this to remember important facts, decisions, user preferences, or learned knowledge for future retrieval.",
			Signature:   `{"content": "string", "source": "string", "importance": "float"}`,
			Category:    "Memory",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if db == nil {
					return "error: database not available"
				}
				content, _ := args["content"].(string)
				source, _ := args["source"].(string)
				importance := 0.5
				if imp, ok := args["importance"].(float64); ok {
					importance = imp
				}

				if content == "" {
					return "error: content is required"
				}

				client := embedding.NewClient()
				store := embedding.NewStore(db, client)
				id, err := store.Store(ctx, content, source, importance)
				if err != nil {
					return fmt.Sprintf("error storing memory: %v", err)
				}
				return fmt.Sprintf("Memory stored successfully [id=%s]", id)
			},
		},
		"search_memory": {
			Name:        "search_memory",
			Description: "Searches long-term memory using semantic similarity. Returns the most relevant stored memories for a given query. Use this to recall past decisions, facts, or context before answering.",
			Signature:   `{"query": "string", "top_k": "int"}`,
			Category:    "Memory",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if db == nil {
					return "error: database not available"
				}
				query, _ := args["query"].(string)
				topK := 5
				if k, ok := args["top_k"].(float64); ok && k > 0 {
					topK = int(k)
				}

				if query == "" {
					return "error: query is required"
				}

				client := embedding.NewClient()
				store := embedding.NewStore(db, client)
				results, err := store.Search(ctx, query, topK)
				if err != nil {
					return fmt.Sprintf("error searching memory: %v", err)
				}
				if len(results) == 0 {
					return "No relevant memories found."
				}

				var sb strings.Builder
				for i, r := range results {
					sb.WriteString(fmt.Sprintf("%d. [%.2f] %s\n", i+1, r.Score, r.Content))
				}
				return sb.String()
			},
		},
		"remember_timeline": {
			Name:        "remember_timeline",
			Description: "Queries the daily reflection timeline. Use for: 'What did I do yesterday?', 'What was I working on last week?', 'What happened on <date>?'. Accepts: 'yesterday', 'today', 'last week', or a date like '2026-06-20'.",
			Signature:   `{"date": "string"}`,
			Category:    "Memory",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				date, _ := args["date"].(string)
				if date == "" {
					date = "yesterday"
				}

				summary, err := reflection.QueryTimeline(date)
				if err != nil {
					return fmt.Sprintf("No timeline data for '%s'. Reflections are generated daily at midnight.", date)
				}

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("📅 %s\n\n", summary.Date))
				sb.WriteString(fmt.Sprintf("Summary: %s\n\n", summary.Summary))
				if len(summary.Activities) > 0 {
					sb.WriteString("Activities:\n")
					for _, a := range summary.Activities {
						sb.WriteString(fmt.Sprintf("  • %s\n", a))
					}
					sb.WriteString("\n")
				}
				if len(summary.Projects) > 0 {
					sb.WriteString(fmt.Sprintf("Projects: %s\n", strings.Join(summary.Projects, ", ")))
				}
				if len(summary.SkillsCreated) > 0 {
					sb.WriteString(fmt.Sprintf("Skills created: %s\n", strings.Join(summary.SkillsCreated, ", ")))
				}
				if len(summary.TopTopics) > 0 {
					sb.WriteString("Top topics: ")
					for i, t := range summary.TopTopics {
						if i > 0 {
							sb.WriteString(", ")
						}
						sb.WriteString(fmt.Sprintf("%s (x%d)", t.Topic, t.Count))
						if i >= 5 {
							break
						}
					}
					sb.WriteString("\n")
				}
				return sb.String()
			},
		},

		// 🛠️ SKILLS AND MCP
		"create_skill": {
			Name:        "create_skill",
			Description: "Creates a new reusable skill from a description. The skill will be saved with prompt, routing keywords, and examples. The system auto-routes future matching conversations to this skill.",
			Signature:   `{"name": "string", "description": "string", "responsibilities": "string", "research": "boolean"}`,
			Category:    "Skill",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if skills.DefaultManager == nil {
					skills.Init()
				}
				if skills.DefaultManager == nil {
					return "error: skill manager not initialized"
				}
				name, _ := args["name"].(string)
				desc, _ := args["description"].(string)

				if name == "" {
					return "error: 'name' is required"
				}

				var responsibilities []string
				if respSlice, ok := args["responsibilities"].([]interface{}); ok {
					for _, r := range respSlice {
						if s := strings.TrimSpace(fmt.Sprint(r)); s != "" {
							responsibilities = append(responsibilities, s)
						}
					}
				} else if respStr, ok := args["responsibilities"].(string); ok && respStr != "" {
					for _, r := range strings.Split(respStr, ",") {
						if s := strings.TrimSpace(r); s != "" {
							responsibilities = append(responsibilities, s)
						}
					}
				}

				homeDir, _ := os.UserHomeDir()
				workspacesRoot := filepath.Join(homeDir, "workspaces")
				_ = os.MkdirAll(workspacesRoot, 0755)

				gen := skills.NewGenerator(skills.DefaultManager)
				pkg, err := gen.Generate(skills.GenerateRequest{
					Name:             name,
					Description:      desc,
					Responsibilities: responsibilities,
					Research:         false,
					WorkspaceRoot:    workspacesRoot,
				})
				if err != nil {
					return fmt.Sprintf("error creating skill: %v", err)
				}
				RegisterSkillJSON(pkg.Spec.ID, pkg.Spec.Name, pkg.Spec.Description)
				return fmt.Sprintf("✅ Skill '%s' created [%s v%s]. Keywords: %v",
					pkg.Spec.Name, pkg.Spec.ID, pkg.Spec.Version, pkg.Spec.Routing.Keywords[:min(5, len(pkg.Spec.Routing.Keywords))])
			},
		},
		"install_skill": {
			Name:        "install_skill",
			Description: "Installs an external skill from a GitHub URL. Auto-detects skill_id from URL path. For local skills use install_local. ALWAYS use this for URL-based installs — it clones + imports in one call.",
			Signature:   `{"url": "string", "skill_id": "string"}`,
			Category:    "Skill",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if skills.DefaultManager == nil {
					skills.Init()
				}
				if skills.DefaultManager == nil {
					return "error: skill manager not initialized"
				}
				url, _ := args["url"].(string)
				skillID, _ := args["skill_id"].(string)
				if url == "" {
					return "error: 'url' is required (GitHub repo URL)"
				}
				if skillID == "" {
					skillID = extractSkillIDFromURL(url)
				}
				if skillID == "" {
					return "error: could not detect skill_id from URL, pass 'skill_id' explicitly"
				}

				importer := skills.NewImporter(skills.DefaultManager)
				pkg, err := importer.Import(skills.ImportRequest{
					URL:     url,
					SkillID: skillID,
				})
				if err != nil {
					return fmt.Sprintf("error installing skill: %v", err)
				}
				RegisterSkillJSON(pkg.Spec.ID, pkg.Spec.Name, pkg.Spec.Description)
				return fmt.Sprintf("✅ Skill '%s' installed [%s v%s] from %s. Keywords: %v",
					pkg.Spec.Name, pkg.Spec.ID, pkg.Spec.Version, url, pkg.Spec.Routing.Keywords[:min(5, len(pkg.Spec.Routing.Keywords))])
			},
		},
		"list_skills": {
			Name:        "list_skills",
			Description: "Lists all installed generated skills with their IDs, versions, and routing keywords.",
			Signature:   `{}`,
			Category:    "Skill",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if skills.DefaultManager == nil {
					return "error: skill manager not initialized"
				}
				specs, err := skills.DefaultManager.List()
				if err != nil {
					return fmt.Sprintf("error listing skills: %v", err)
				}
				if len(specs) == 0 {
					return "No skills installed. Create one with create_skill."
				}
				var sb strings.Builder
				for _, s := range specs {
					sb.WriteString(fmt.Sprintf("- %s [%s] v%s: %s\n", s.Name, s.ID, s.Version, s.Description))
				}
				return sb.String()
			},
		},
		"delete_skill": {
			Name:        "delete_skill",
			Description: "Deletes a generated skill by ID.",
			Signature:   `{"skill_id": "string"}`,
			Category:    "Skill",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if skills.DefaultManager == nil {
					return "error: skill manager not initialized"
				}
				id, _ := args["skill_id"].(string)
				if id == "" {
					return "error: 'skill_id' is required"
				}
				if err := skills.DefaultManager.Delete(id); err != nil {
					return fmt.Sprintf("error deleting skill: %v", err)
				}
				UnregisterSkillJSON(id)
				return fmt.Sprintf("✅ Deleted skill '%s'", id)
			},
		},
		"install_agent": {
			Name:        "install_agent",
			Description: "Installs an agent manifest YAML file from a remote URL or local path.",
			Signature:   `{"url": "string"}`,
			Category:    "Agent",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				src, _ := args["url"].(string)
				if src == "" {
					return "error: 'url' is required"
				}
				var data []byte
				var err error

				if strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://") {
					resp, err := http.Get(src)
					if err != nil {
						return fmt.Sprintf("error downloading manifest: %v", err)
					}
					defer resp.Body.Close()
					if resp.StatusCode != http.StatusOK {
						return fmt.Sprintf("error downloading manifest: HTTP status %d", resp.StatusCode)
					}
					data, err = io.ReadAll(resp.Body)
					if err != nil {
						return fmt.Sprintf("error reading manifest response: %v", err)
					}
				} else {
					data, err = os.ReadFile(src)
					if err != nil {
						return fmt.Sprintf("error reading local manifest: %v", err)
					}
				}

				var m struct {
					ID           string `yaml:"id"`
					DisplayName  string `yaml:"displayName"`
					SystemPrompt string `yaml:"systemPrompt"`
				}
				if err := yaml.Unmarshal(data, &m); err != nil {
					return fmt.Sprintf("error parsing YAML manifest: %v", err)
				}

				if m.ID == "" {
					return "error: agent manifest requires an 'id'"
				}
				if m.SystemPrompt == "" {
					return fmt.Sprintf("error: agent manifest %q requires a 'systemPrompt'", m.ID)
				}

				homeDir, _ := os.UserHomeDir()
				dir := filepath.Join(homeDir, ".kendaliai", "agents")
				_ = os.MkdirAll(dir, 0755)

				destPath := filepath.Join(dir, m.ID+".yaml")
				if err := os.WriteFile(destPath, data, 0644); err != nil {
					return fmt.Sprintf("error saving manifest: %v", err)
				}

				return fmt.Sprintf("✅ Successfully installed Agent '%s' [id=%s]", m.DisplayName, m.ID)
			},
		},
		"list_agents": {
			Name:        "list_agents",
			Description: "Lists all installed agent manifests.",
			Signature:   `{}`,
			Category:    "Agent",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				homeDir, _ := os.UserHomeDir()
				dir := filepath.Join(homeDir, ".kendaliai", "agents")
				entries, err := os.ReadDir(dir)
				if err != nil {
					return "No agents installed."
				}
				var sb strings.Builder
				count := 0
				for _, entry := range entries {
					if entry.IsDir() || (filepath.Ext(entry.Name()) != ".yaml" && filepath.Ext(entry.Name()) != ".yml") {
						continue
					}
					path := filepath.Join(dir, entry.Name())
					data, err := os.ReadFile(path)
					if err != nil {
						continue
					}
					var m struct {
						ID          string `yaml:"id"`
						DisplayName string `yaml:"displayName"`
						Description string `yaml:"description"`
					}
					if err := yaml.Unmarshal(data, &m); err != nil {
						continue
					}
					sb.WriteString(fmt.Sprintf("- %s [%s]: %s\n", m.DisplayName, m.ID, m.Description))
					count++
				}
				if count == 0 {
					return "No agents installed."
				}
				return sb.String()
			},
		},
		"delete_agent": {
			Name:        "delete_agent",
			Description: "Deletes an installed agent manifest by ID.",
			Signature:   `{"agent_id": "string"}`,
			Category:    "Agent",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				id, _ := args["agent_id"].(string)
				if id == "" {
					return "error: 'agent_id' is required"
				}
				homeDir, _ := os.UserHomeDir()
				path := filepath.Join(homeDir, ".kendaliai", "agents", id+".yaml")
				if _, err := os.Stat(path); err != nil {
					return fmt.Sprintf("agent '%s' not found", id)
				}
				if err := os.Remove(path); err != nil {
					return fmt.Sprintf("error deleting agent: %v", err)
				}
				return fmt.Sprintf("✅ Deleted agent '%s'", id)
			},
		},
		"update_skill": {
			Name:        "update_skill",
			Description: "Updates an existing skill by ID. Preserves the old version (auto-increments). Use this instead of delete+create.",
			Signature:   `{"skill_id": "string", "name": "string", "description": "string", "responsibilities": "string"}`,
			Category:    "Skill",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if skills.DefaultManager == nil {
					return "error: skill manager not initialized"
				}
				id, _ := args["skill_id"].(string)
				if id == "" {
					return "error: 'skill_id' is required"
				}
				name, _ := args["name"].(string)
				desc, _ := args["description"].(string)
				respStr, _ := args["responsibilities"].(string)

				existing, err := skills.DefaultManager.Get(id)
				if err != nil {
					return fmt.Sprintf("skill '%s' not found. Use list_skills to see available skills.", id)
				}

				if name == "" {
					name = existing.Spec.Name
				}
				if desc == "" {
					desc = existing.Spec.Description
				}

				var responsibilities []string
				for _, r := range strings.Split(respStr, ",") {
					r = strings.TrimSpace(r)
					if r != "" {
						responsibilities = append(responsibilities, r)
					}
				}

				gen := skills.NewGenerator(skills.DefaultManager)
				pkg, err := gen.Generate(skills.GenerateRequest{
					Name:             name,
					Description:      desc,
					Responsibilities: responsibilities,
				})
				if err != nil {
					return fmt.Sprintf("error generating updated skill: %v", err)
				}

				pkg.Spec.ID = existing.Spec.ID
				pkg.Spec.Version = bumpVersion(existing.Spec.Version)
				pkg.Spec.PromptFile = existing.Spec.PromptFile

				if err := skills.DefaultManager.Delete(id); err != nil {
					return fmt.Sprintf("error removing old version: %v", err)
				}
				if err := skills.DefaultManager.Create(*pkg); err != nil {
					return fmt.Sprintf("error saving updated skill: %v", err)
				}

				return fmt.Sprintf("✅ Updated '%s' %s → v%s", name, existing.Spec.Version, pkg.Spec.Version)
			},
		},
		"run_skill": {
			Name:        "run_skill",
			Description: "Executes a custom shell script or executable from the ~/.kendaliai/skills directory. Useful for custom workflows.",
			Signature:   `{"skill_name": "string", "args": "string"}`,
			Category:    "Skill",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				skillName, _ := args["skill_name"].(string)
				skillArgs, _ := args["args"].(string)

				homeDir, err := os.UserHomeDir()
				if err != nil {
					homeDir = "."
				}
				skillPath := filepath.Join(homeDir, ".kendaliai", "skills", skillName)

				if _, err := os.Stat(skillPath); os.IsNotExist(err) {
					return fmt.Sprintf("skill '%s' not found at %s", skillName, skillPath)
				}

				cmdStr := fmt.Sprintf("%s %s", skillPath, skillArgs)
				timeoutCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
				defer cancel()

				cmd := exec.CommandContext(timeoutCtx, "bash", "-c", cmdStr)
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Sprintf("Error: %v\nOutput: %s", err, string(out))
				}
				return string(out)
			},
		},
		"create_plugin": {
			Name:        "create_plugin",
			Description: "Creates and registers a new agent plugin. Plugins can provide custom tools, scripts, system prompt instructions, and skills to extend the agent harness.",
			Signature:   `{"id": "string", "name": "string", "description": "string", "scope": "workspace|global", "system_prompt": "string", "tools": "array", "skills": "array", "files": "object"}`,
			Category:    "Plugin",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if plugins.DefaultManager == nil {
					plugins.NewManager(workspaceRoot, nil)
				}

				id, _ := args["id"].(string)
				name, _ := args["name"].(string)
				desc, _ := args["description"].(string)
				scope, _ := args["scope"].(string)
				if scope == "" {
					if sc, ok := args["source"].(string); ok && sc != "" {
						scope = sc
					} else {
						scope = "global"
					}
				}
				sysPrompt, _ := args["system_prompt"].(string)

				if id == "" && name != "" {
					id = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "-"))
				}
				if id == "" {
					return "error: 'id' or 'name' is required (kebab-case identifier)"
				}
				if name == "" {
					name = id
				}

				var rawTools []interface{}
				if rt, ok := args["tools"].([]interface{}); ok {
					rawTools = rt
				} else if str, ok := args["tools"].(string); ok && str != "" {
					_ = json.Unmarshal([]byte(str), &rawTools)
				}

				var toolsList []plugins.PluginToolDef
				for _, rt := range rawTools {
					if m, ok := rt.(map[string]interface{}); ok {
						var hTypeStr string
						if rawHT, exists := m["handler_type"]; exists && rawHT != nil {
							hTypeStr = strings.ToLower(strings.TrimSpace(fmt.Sprint(rawHT)))
						}
						if hTypeStr == "<nil>" || hTypeStr == "null" {
							hTypeStr = ""
						}

						cmdStr := ""
						if c, exists := m["command"]; exists && c != nil && fmt.Sprint(c) != "<nil>" && fmt.Sprint(c) != "null" {
							cmdStr = fmt.Sprint(c)
						}
						scriptStr := ""
						if s, exists := m["script"]; exists && s != nil && fmt.Sprint(s) != "<nil>" && fmt.Sprint(s) != "null" {
							scriptStr = fmt.Sprint(s)
						}

						tDef := plugins.PluginToolDef{
							Name:        fmt.Sprint(m["name"]),
							Description: fmt.Sprint(m["description"]),
							Command:     cmdStr,
							Script:      scriptStr,
							Parameters:  make(map[string]interface{}),
						}
						if rawParams, ok := m["parameters"].(map[string]interface{}); ok && rawParams != nil {
							tDef.Parameters = rawParams
						}
						if hTypeStr == "script" || hTypeStr == "file" || (hTypeStr == "" && scriptStr != "" && cmdStr == "") {
							tDef.HandlerType = plugins.HandlerScript
						} else {
							tDef.HandlerType = plugins.HandlerCommand
						}
						toolsList = append(toolsList, tDef)
					}
				}

				var rawSkills []interface{}
				if rs, ok := args["skills"].([]interface{}); ok {
					rawSkills = rs
				} else if str, ok := args["skills"].(string); ok && str != "" {
					_ = json.Unmarshal([]byte(str), &rawSkills)
				}

				var skillsList []plugins.PluginSkillDef
				for _, rs := range rawSkills {
					if m, ok := rs.(map[string]interface{}); ok {
						skillsList = append(skillsList, plugins.PluginSkillDef{
							Name:        fmt.Sprint(m["name"]),
							Description: fmt.Sprint(m["description"]),
							Body:        fmt.Sprint(m["body"]),
						})
					}
				}

				var rawFiles map[string]interface{}
				if rf, ok := args["files"].(map[string]interface{}); ok {
					rawFiles = rf
				} else if str, ok := args["files"].(string); ok && str != "" {
					_ = json.Unmarshal([]byte(str), &rawFiles)
				}

				filesMap := make(map[string]string)
				for k, v := range rawFiles {
					filesMap[k] = fmt.Sprint(v)
				}

				p, err := plugins.DefaultManager.Create(plugins.CreatePluginRequest{
					ID:           id,
					Name:         name,
					Description:  desc,
					Scope:        scope,
					SystemPrompt: sysPrompt,
					Tools:        toolsList,
					Skills:       skillsList,
					Files:        filesMap,
				})
				if err != nil {
					return fmt.Sprintf("Error creating plugin: %v", err)
				}

				return fmt.Sprintf("✅ Plugin '%s' created successfully at %s with %d tools and %d skills.",
					p.Name, p.Path, len(p.Tools), len(p.Skills))
			},
		},
		"list_plugins": {
			Name:        "list_plugins",
			Description: "Lists all installed agent plugins, their status, source, and exposed tools.",
			Signature:   `{}`,
			Category:    "Plugin",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if plugins.DefaultManager == nil {
					plugins.NewManager(workspaceRoot, nil)
				}
				list := plugins.DefaultManager.List()
				data, _ := json.MarshalIndent(list, "", "  ")
				return string(data)
			},
		},
		"delete_plugin": {
			Name:        "delete_plugin",
			Description: "Deletes an installed agent plugin by ID.",
			Signature:   `{"id": "string"}`,
			Category:    "Plugin",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if plugins.DefaultManager == nil {
					plugins.NewManager(workspaceRoot, nil)
				}
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}
				if err := plugins.DefaultManager.Delete(id); err != nil {
					return fmt.Sprintf("error deleting plugin: %v", err)
				}
				return fmt.Sprintf("✅ Deleted plugin '%s'", id)
			},
		},
		"toggle_plugin": {
			Name:        "toggle_plugin",
			Description: "Enables or disables an agent plugin by ID.",
			Signature:   `{"id": "string", "enabled": "boolean"}`,
			Category:    "Plugin",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if plugins.DefaultManager == nil {
					plugins.NewManager(workspaceRoot, nil)
				}
				id, _ := args["id"].(string)
				enabled := true
				if e, ok := args["enabled"].(bool); ok {
					enabled = e
				}
				p, err := plugins.DefaultManager.Toggle(id, enabled)
				if err != nil {
					return fmt.Sprintf("Error updating plugin: %v", err)
				}
				state := "enabled"
				if !p.Enabled {
					state = "disabled"
				}
				return fmt.Sprintf("✅ Plugin '%s' is now %s.", p.Name, state)
			},
		},
		"schedule_task": {
			Name:        "schedule_task",
			Description: "Schedules a recurring cron job or natural-language routine. Supports two job types: 'notification' (direct alert sent to chat and Telegram without AI overhead) or 'task' (AI agent performs reasoning, commands, or tool execution at scheduled times). Supports cron syntax or human expressions like 'every weekday at 9am', 'every 30 minutes', 'tomorrow at 9am'.",
			Signature:   `{"name": "string", "schedule": "string", "prompt": "string", "job_type": "string (notification|task)", "target_type": "string (agent|group)", "target_id": "string", "deliver_telegram": "boolean"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if scheduler.DefaultDaemon == nil {
					scheduler.NewDaemon(nil)
				}
				name, _ := args["name"].(string)
				scheduleExpr, _ := args["schedule"].(string)
				prompt, _ := args["prompt"].(string)

				jobType, _ := args["job_type"].(string)
				if jobType == "" {
					jobType, _ = args["jobType"].(string)
				}
				if jobType == "" {
					jobType = "notification"
				}

				targetType, _ := args["target_type"].(string)
				if targetType == "" {
					targetType, _ = args["targetType"].(string)
				}
				if targetType == "" {
					targetType = "agent"
				}

				if name == "" {
					name = prompt
					if len(name) > 30 {
						name = name[:30] + "..."
					}
					if name == "" {
						name = "Scheduled Reminder"
					}
				}

				sessionID, _ := ctx.Value("sessionID").(string)
				channel, _ := ctx.Value("channel").(string)
				agentID, _ := ctx.Value("agentID").(string)
				agentName, _ := ctx.Value("agentName").(string)

				targetID, _ := args["target_id"].(string)
				if targetID == "" {
					targetID, _ = args["targetId"].(string)
				}
				if targetID == "" {
					targetID = agentID
				}

				if channel == "" {
					channel = "web"
				}
				deliverTg := channel == "telegram" || strings.HasPrefix(sessionID, "tg-")
				if dt, ok := args["deliver_telegram"].(bool); ok {
					deliverTg = dt
				} else if dt, ok := args["deliverTelegram"].(bool); ok {
					deliverTg = dt
				} else if jobType == "notification" {
					deliverTg = true
				}

				owner := agentName
				if owner == "" {
					owner = agentID
				}
				if owner == "" {
					owner = "Personal Assistant"
				}

				task, err := scheduler.DefaultDaemon.AddRoutineTask(scheduler.ScheduledTask{
					ID:              "",
					Name:            name,
					JobType:         jobType,
					Schedule:        scheduleExpr,
					Prompt:          prompt,
					TargetType:      targetType,
					TargetID:        targetID,
					SessionID:       sessionID,
					Owner:           owner,
					OwnerType:       "agent",
					DeliverTelegram: deliverTg,
					Channel:         channel,
				})
				if err != nil {
					return fmt.Sprintf("Error scheduling task: %v", err)
				}

				typeLabel := "Direct Notification (No AI overhead)"
				if task.JobType == "task" {
					typeLabel = "AI Agent Task Execution"
				}

				return fmt.Sprintf("✅ Scheduled cron [%s] '%s' created (%s). Schedule: '%s'. Next run: %s. Owner: %s. Telegram delivery: %v.",
					task.ID, task.Name, typeLabel, task.Schedule, task.NextRun.Format(time.RFC3339), task.Owner, task.DeliverTelegram)
			},
		},
		"list_schedules": {
			Name:        "list_schedules",
			Description: "Lists all scheduled cron tasks and reminders with their next run times, statuses, and run counts.",
			Signature:   `{}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if scheduler.DefaultDaemon == nil {
					scheduler.NewDaemon(nil)
				}
				tasks := scheduler.DefaultDaemon.ListTasks()
				if len(tasks) == 0 {
					return "No scheduled tasks found."
				}
				data, _ := json.MarshalIndent(tasks, "", "  ")
				return string(data)
			},
		},
		"cancel_schedule": {
			Name:        "cancel_schedule",
			Description: "Cancels and deletes a scheduled task or reminder by ID.",
			Signature:   `{"id": "string"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if scheduler.DefaultDaemon == nil {
					scheduler.NewDaemon(nil)
				}
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}
				err := scheduler.DefaultDaemon.CancelTask(id)
				if err != nil {
					return fmt.Sprintf("Error cancelling schedule: %v", err)
				}
				return fmt.Sprintf("✅ Scheduled task '%s' cancelled.", id)
			},
		},
		"run_schedule_now": {
			Name:        "run_schedule_now",
			Description: "Triggers a scheduled reminder or cron task immediately.",
			Signature:   `{"id": "string"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if scheduler.DefaultDaemon == nil {
					scheduler.NewDaemon(nil)
				}
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}
				err := scheduler.DefaultDaemon.RunNow(ctx, id)
				if err != nil {
					return fmt.Sprintf("Error triggering task: %v", err)
				}
				return fmt.Sprintf("✅ Scheduled task '%s' triggered immediately.", id)
			},
		},
		"mcp_call": {
			Name:        "mcp_call",
			Description: "Calls a tool on an MCP (Model Context Protocol) server. Specify a configured 'server' name (e.g. 'firecrawl', 'exa', 'github') or provide 'server_url'/'server_cmd' directly.",
			Signature:   `{"server": "string", "server_cmd": "string", "server_args": "array", "server_url": "string", "tool_name": "string", "tool_args": "object"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				return executeMCPCall(ctx, cfg, db, args)
			},
		},
		"react_to_message": {
			Name:        "react_to_message",
			Description: "React to a message with an emoji (e.g. 😂, 👍, 🚀, 🔥, ❤️, 🤔, 🫡, 🚨, 🎉). Ideal for group chat interactions, reacting to humor (haha, wkwk, lol), achievements, approvals, or milestone completions.",
			Signature:   `{"message_id": "string", "emoji": "string"}`,
			Category:    "Communication",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				emoji, _ := args["emoji"].(string)
				if emoji == "" {
					emoji = "👍"
				}
				msgID, _ := args["message_id"].(string)
				if db == nil {
					return fmt.Sprintf("✅ Reacted with %s", emoji)
				}
				if msgID == "" || msgID == "last" {
					var lastID string
					row := db.QueryRow("SELECT id FROM session_messages ORDER BY created_at DESC LIMIT 1")
					_ = row.Scan(&lastID)
					msgID = lastID
				}
				if msgID != "" {
					var currentReactionsStr string
					_ = db.QueryRow("SELECT COALESCE(reactions, '[]') FROM session_messages WHERE id = ?", msgID).Scan(&currentReactionsStr)
					type simpleReaction struct {
						Emoji      string `json:"emoji"`
						SenderID   string `json:"senderId"`
						SenderName string `json:"senderName,omitempty"`
					}
					var rList []simpleReaction
					_ = json.Unmarshal([]byte(currentReactionsStr), &rList)
					agentID, _ := ctx.Value("agentID").(string)
					if agentID == "" {
						agentID = "agent"
					}
					agentName, _ := ctx.Value("agentName").(string)
					if agentName == "" {
						agentName = "Agent"
					}
					sessionID, _ := ctx.Value("sessionID").(string)
					channel, _ := ctx.Value("channel").(string)

					exists := false
					for _, r := range rList {
						if r.Emoji == emoji && (r.SenderID == agentID || r.SenderName == agentName) {
							exists = true
							break
						}
					}
					if !exists {
						rList = append(rList, simpleReaction{Emoji: emoji, SenderID: agentID, SenderName: agentName})
						updatedBytes, _ := json.Marshal(rList)
						_, _ = db.Exec("UPDATE session_messages SET reactions = ? WHERE id = ?", string(updatedBytes), msgID)

						if sessionID == "" {
							_ = db.QueryRow("SELECT session_id FROM session_messages WHERE id = ?", msgID).Scan(&sessionID)
						}

						if bus, ok := ctx.Value("eventBus").(*messaging.EventBus); ok && bus != nil {
							bus.Publish(messaging.Event{
								Type:      messaging.EventMessageReaction,
								SessionID: sessionID,
								AgentID:   agentID,
								Channel:   channel,
								Payload: messaging.MessageReactionPayload{
									SessionID:  sessionID,
									MessageID:  msgID,
									Emoji:      emoji,
									SenderID:   agentID,
									SenderName: agentName,
								},
								Timestamp: time.Now(),
							})
						}
					}
				}
				return fmt.Sprintf("✅ Added emoji reaction '%s' to message %s", emoji, msgID)
			},
		},
		"cloudflared_tunnel": {
			Name:        "cloudflared_tunnel",
			Description: "Manage Cloudflare Tunnels for local development and Hermes automation. Supports Option 1 Quick Tunnel (temporary *.trycloudflare.com URL, zero domain/DNS config) and Option 2 Named Tunnel (persistent custom domain). Actions: 'quick' (or 'start'), 'named', 'status', 'stop'.",
			Signature:   `{"action": "string", "port": "int", "tunnel_name": "string", "hostname": "string"}`,
			Category:    "Networking",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				return executeCloudflaredTunnel(ctx, args)
			},
		},
		"vps_monitor": {
			Name:        "vps_monitor",
			Description: "Deterministic VPS & SRE system monitor (zero token waste). Checks CPU, RAM, Disk usage, Docker container status, and HTTP endpoint health against alert thresholds (>90% CPU, >85% RAM, >80% Disk). Returns deterministic alert only when something actually needs attention.",
			Signature:   `{"check_docker": "bool", "url": "string", "threshold_cpu": "int", "threshold_ram": "int", "threshold_disk": "int"}`,
			Category:    "Operations",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				return executeVPSMonitor(ctx, args)
			},
		},
		"remember_decision": {
			Name:        "remember_decision",
			Description: "Record an Architectural Decision Record (ADR) or key technical policy into persistent project memory. Stores title, status, context, decision, and consequences with high recall.",
			Signature:   `{"title": "string", "decision": "string", "context": "string", "status": "string", "consequences": "string"}`,
			Category:    "Memory",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				return executeRememberDecision(ctx, workspaceRoot, db, args)
			},
		},
	}

	// Add pre-configured MCP tools if available
	if cfg != nil && cfg.MCPServers != nil {
		for _, srv := range cfg.MCPServers {
			if srv.Disabled {
				continue
			}
		}
	}

	// Dynamically load installed skills as native tools
	homeDir, _ := os.UserHomeDir()
	if homeDir != "" {
		skillsJsonPath := filepath.Join(homeDir, ".kendaliai", "skills", "skills.json")
		if content, err := os.ReadFile(skillsJsonPath); err == nil {
			var config SkillConfig
			if err := json.Unmarshal(content, &config); err == nil {
				for _, skill := range config.Skills {
					if !skill.Installed {
						continue
					}

					currentSkill := skill // capture loop var
					signatureBytes, _ := json.Marshal(currentSkill.InputSchema)

					registry[currentSkill.ID] = ToolDef{
						Name:        currentSkill.ID,
						Description: currentSkill.Description,
						Signature:   string(signatureBytes),
						Category:    "Skill",
						Execute: func(ctx context.Context, args map[string]interface{}) string {
							skillPath := filepath.Join(homeDir, ".kendaliai", "skills", strings.TrimPrefix(currentSkill.Execution.Command, "./"))

							// Extract args based on input_schema properties
							var cmdArgs []string
							cmdArgs = append(cmdArgs, skillPath)

							// A simple mapping: we just append all matched arg values in order of keys
							// For robust production use, we sort by the args_mapping values if present
							// For now, we'll try to follow the order defined in InputSchema properties
							// but since it's a map, we should probably check args_mapping.
							
							type argMapping struct {
								key string
								pos int
							}
							var mappings []argMapping
							for k, v := range currentSkill.Execution.ArgsMapping {
								var pos int
								fmt.Sscanf(v, "$%d", &pos)
								mappings = append(mappings, argMapping{k, pos})
							}
							// Simple bubble sort for mappings
							for i := 0; i < len(mappings); i++ {
								for j := i + 1; j < len(mappings); j++ {
									if mappings[i].pos > mappings[j].pos {
										mappings[i], mappings[j] = mappings[j], mappings[i]
									}
								}
							}

							for _, m := range mappings {
								if val, exists := args[m.key]; exists {
									cmdArgs = append(cmdArgs, fmt.Sprintf("%v", val))
								}
							}

							cmdStr := strings.Join(cmdArgs, " ")

							timeoutMs := currentSkill.Constraints.TimeoutMs
							if timeoutMs == 0 {
								timeoutMs = 30000
							}

							timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
							defer cancel()

							cmd := exec.CommandContext(timeoutCtx, "bash", "-c", cmdStr)
							out, err := cmd.CombinedOutput()
							if err != nil {
								return fmt.Sprintf("Error: %v\nOutput: %s", err, string(out))
							}
							return string(out)
						},
					}
				}
			}
		}

		// Also load .md files as Instructional Skills
		if entries, err := os.ReadDir(filepath.Join(homeDir, ".kendaliai", "skills")); err == nil {
			for _, e := range entries {
				if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
					path := filepath.Join(homeDir, ".kendaliai", "skills", e.Name())
					if content, err := os.ReadFile(path); err == nil {
						parts := strings.SplitN(string(content), "---", 3)
						if len(parts) >= 3 {
							var name, desc string
							for _, line := range strings.Split(parts[1], "\n") {
								line = strings.TrimSpace(line)
								if strings.HasPrefix(line, "name:") {
									name = strings.TrimSpace(line[5:])
								} else if strings.HasPrefix(line, "description:") {
									desc = strings.TrimSpace(line[12:])
								}
							}
							if name != "" && desc != "" {
								registry[name] = ToolDef{
									Name:        name,
									Description: desc,
									Signature:   "{}",
									Category:    "Skill",
									Execute: func(ctx context.Context, args map[string]interface{}) string {
										return strings.TrimSpace(parts[2])
									},
								}
							}
						}
					}
				}
			}
		}
	}

	// Dynamically register tools from enabled plugins
	if plugins.DefaultManager != nil {
		for _, p := range plugins.DefaultManager.List() {
			if !p.Enabled {
				continue
			}
			for _, t := range p.Tools {
				toolName := t.Name
				pluginID := p.ID
				tSig, _ := json.Marshal(t.Parameters)
				sigStr := string(tSig)
				if sigStr == "" || sigStr == "null" {
					sigStr = "{}"
				}
				registry[toolName] = ToolDef{
					Name:        toolName,
					Description: fmt.Sprintf("[%s Plugin] %s", p.Name, t.Description),
					Signature:   sigStr,
					Category:    "Plugin",
					Execute: func(ctx context.Context, args map[string]interface{}) string {
						res, err := plugins.DefaultManager.ExecuteTool(ctx, pluginID, toolName, args)
						if err != nil {
							return fmt.Sprintf("Plugin execution error: %v", err)
						}
						if res.Stdout != "" {
							return res.Stdout
						}
						if res.Stderr != "" {
							return fmt.Sprintf("Exit code %d: %s", res.ExitCode, res.Stderr)
						}
						return fmt.Sprintf("Tool executed successfully (exit code: %d)", res.ExitCode)
					},
				}
			}
		}
	}

	return registry
}

func bumpVersion(version string) string {
	parts := strings.Split(version, ".")
	if len(parts) >= 2 {
		minor := 0
		fmt.Sscanf(parts[1], "%d", &minor)
		minor++
		return fmt.Sprintf("%s.%d.%s", parts[0], minor, "0")
	}
	return "1.0.0"
}

type skillRegistryEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Installed   bool   `json:"installed"`
}

type skillRegistry struct {
	Skills []skillRegistryEntry `json:"skills"`
}

func RegisterSkillJSON(id, name, description string) {
	homeDir, _ := os.UserHomeDir()
	path := filepath.Join(homeDir, ".kendaliai", "skills", "skills.json")

	var registry skillRegistry
	data, _ := os.ReadFile(path)
	json.Unmarshal(data, &registry)

	for i, s := range registry.Skills {
		if s.ID == id {
			registry.Skills[i].Installed = true
			registry.Skills[i].Name = name
			registry.Skills[i].Description = description
			b, _ := json.MarshalIndent(registry, "", "  ")
			os.WriteFile(path, b, 0644)
			return
		}
	}

	registry.Skills = append(registry.Skills, skillRegistryEntry{
		ID:          id,
		Name:        name,
		Description: description,
		Installed:   true,
	})
	b, _ := json.MarshalIndent(registry, "", "  ")
	os.WriteFile(path, b, 0644)
}

func UnregisterSkillJSON(id string) {
	homeDir, _ := os.UserHomeDir()
	path := filepath.Join(homeDir, ".kendaliai", "skills", "skills.json")

	var registry skillRegistry
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	if err := json.Unmarshal(data, &registry); err != nil {
		return
	}

	var updated []skillRegistryEntry
	for _, s := range registry.Skills {
		if s.ID != id {
			updated = append(updated, s)
		}
	}
	registry.Skills = updated
	b, _ := json.MarshalIndent(registry, "", "  ")
	os.WriteFile(path, b, 0644)
}

func scanSubdirs(root string) string {
	dirs := []string{"projects", "apps", "services", "packages"}
	var results []string
	for _, d := range dirs {
		full := filepath.Join(root, d)
		entries, err := os.ReadDir(full)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				subPath := filepath.Join(d, e.Name())
				info := intelligence.DetectProject(filepath.Join(root, subPath))
				if info != nil && info.Framework != "Unknown" {
					results = append(results, fmt.Sprintf(`"%s": "%s"`, subPath, info.Framework))
				} else {
					results = append(results, fmt.Sprintf(`"%s": "unknown"`, subPath))
				}
			}
		}
	}
	b, _ := json.Marshal(results)
	return string(b)
}

func extractSkillIDFromURL(url string) string {
	url = strings.TrimSuffix(url, "/")
	if idx := strings.Index(url, "/tree/"); idx >= 0 {
		after := url[idx+len("/tree/"):]
		slash := strings.Index(after, "/")
		if slash >= 0 {
			after = after[slash+1:]
		}
		parts := strings.Split(after, "/")
		for i := len(parts) - 1; i >= 0; i-- {
			if parts[i] != "" && parts[i] != "skills" && parts[i] != "main" {
				return parts[i]
			}
		}
	}
	parts := strings.Split(url, "/")
	for i := len(parts) - 1; i >= 0; i-- {
		p := parts[i]
		if p != "" && p != "skills" && p != "tree" && p != "main" && !strings.HasPrefix(p, "ref=") {
			return p
		}
	}
	return ""
}

func executeMCPCall(ctx context.Context, cfg *config.Config, db *sql.DB, args map[string]interface{}) string {
	serverName, _ := args["server"].(string)
	if serverName == "" {
		serverName, _ = args["server_name"].(string)
	}
	serverCmd, _ := args["server_cmd"].(string)
	serverURL, _ := args["server_url"].(string)
	var serverArgs []string

	if rawArgs, ok := args["server_args"].([]interface{}); ok {
		for _, a := range rawArgs {
			serverArgs = append(serverArgs, fmt.Sprint(a))
		}
	}

	toolName, _ := args["tool_name"].(string)
	if toolName == "" {
		toolName, _ = args["tool"].(string)
	} // Alias
	toolArgs := args["tool_args"]
	if toolArgs == nil {
		toolArgs = args["args"]
	} // Alias
	if toolArgs == nil {
		toolArgs = args["arguments"]
	} // Alias

	logger.Info("MCP", fmt.Sprintf("mcp_call lookup: serverName=%s, toolName=%s", serverName, toolName))

	// Resolve server config
	var srv *config.MCPServerConfig
	effectiveCfg := cfg
	if effectiveCfg == nil {
		effectiveCfg = config.Cfg
	}

	if serverName != "" {
		// 1. Check SQLite database first (where UI saves configured keys)
		if db != nil {
			var u, cmd, argsStr, envStr sql.NullString
			row := db.QueryRow("SELECT command, args, url, env FROM mcp_servers WHERE LOWER(name) = LOWER(?) OR LOWER(id) = LOWER(?)", serverName, serverName)
			if err := row.Scan(&cmd, &argsStr, &u, &envStr); err == nil {
				srv = &config.MCPServerConfig{
					Command:   cmd.String,
					ServerURL: u.String,
					URL:       u.String,
					Headers:   make(map[string]string),
				}
				if argsStr.Valid && argsStr.String != "" {
					_ = json.Unmarshal([]byte(argsStr.String), &srv.Args)
				}
				if envStr.Valid && envStr.String != "" {
					var envMap map[string]string
					if err := json.Unmarshal([]byte(envStr.String), &envMap); err == nil {
						for ek, ev := range envMap {
							if strings.HasPrefix(ek, "header:") {
								srv.Headers[strings.TrimPrefix(ek, "header:")] = ev
							} else if strings.HasPrefix(strings.ToLower(ek), "auth") || strings.HasPrefix(strings.ToLower(ek), "x-") || strings.Contains(strings.ToLower(ek), "key") {
								srv.Headers[ek] = ev
							}
						}
					}
				}
			}
		}

		// 2. Check loaded config (fallback or merge)
		if effectiveCfg != nil && effectiveCfg.MCPServers != nil {
			for k, v := range effectiveCfg.MCPServers {
				if strings.EqualFold(k, serverName) {
					if srv == nil {
						cp := v
						srv = &cp
					} else {
						if srv.Headers == nil {
							srv.Headers = make(map[string]string)
						}
						for hk, hv := range v.Headers {
							if cur, ok := srv.Headers[hk]; !ok || cur == "" || strings.Contains(cur, "<") || strings.Contains(cur, "YOUR_") {
								srv.Headers[hk] = hv
							}
						}
					}
					break
				}
			}
		}

		// 3. Known default remote MCP presets for firecrawl & exa
		if srv == nil {
			lower := strings.ToLower(serverName)
			if lower == "firecrawl" {
				srv = &config.MCPServerConfig{
					Type:      "http",
					ServerURL: "https://mcp.firecrawl.dev/v2/mcp",
					URL:       "https://mcp.firecrawl.dev/v2/mcp",
					Headers: map[string]string{
						"Authorization": "Bearer " + os.Getenv("FIRECRAWL_API_KEY"),
					},
				}
			} else if lower == "exa" {
				srv = &config.MCPServerConfig{
					Type:      "http",
					ServerURL: "https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run",
					URL:       "https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run",
					Headers: map[string]string{
						"x-api-key": os.Getenv("EXA_API_KEY"),
					},
				}
			}
		}
	}

	if srv != nil {
		if srv.ServerURL != "" {
			serverURL = srv.ServerURL
		} else if srv.URL != "" {
			serverURL = srv.URL
		} else {
			serverCmd = srv.Command
			serverArgs = srv.Args
		}
	}

	if serverURL == "" && serverCmd == "" {
		return "error: no server name, url or command provided"
	}

	effectiveHeaders := make(map[string]string)
	if srv != nil && srv.Headers != nil {
		for hk, hv := range srv.Headers {
			val := os.ExpandEnv(hv)
			if strings.Contains(val, "<FIRECRAWL_API_KEY>") {
				val = strings.ReplaceAll(val, "<FIRECRAWL_API_KEY>", os.Getenv("FIRECRAWL_API_KEY"))
			}
			if strings.Contains(val, "YOUR_EXA_API_KEY") || strings.Contains(val, "<EXA_API_KEY>") || strings.Contains(val, "<YOUR_EXA_API_KEY>") {
				exaKey := os.Getenv("EXA_API_KEY")
				val = strings.ReplaceAll(val, "YOUR_EXA_API_KEY", exaKey)
				val = strings.ReplaceAll(val, "<EXA_API_KEY>", exaKey)
				val = strings.ReplaceAll(val, "<YOUR_EXA_API_KEY>", exaKey)
			}
			effectiveHeaders[hk] = val
		}
	}

	// Validate required keys for firecrawl and exa
	if strings.EqualFold(serverName, "firecrawl") {
		authVal := effectiveHeaders["Authorization"]
		if authVal == "" || authVal == "Bearer " || authVal == "Bearer <FIRECRAWL_API_KEY>" {
			return "error: Firecrawl API key is required. Please set FIRECRAWL_API_KEY in your environment or configure mcpServers.firecrawl.headers.Authorization in config.json"
		}
	} else if strings.EqualFold(serverName, "exa") {
		exaKey := effectiveHeaders["x-api-key"]
		if exaKey == "" || exaKey == "YOUR_EXA_API_KEY" || exaKey == "<YOUR_EXA_API_KEY>" {
			return "error: Exa API key is required. Please set EXA_API_KEY in your environment or configure mcpServers.exa.headers.x-api-key in config.json"
		}
	}

	if serverURL != "" {
		var opts []transport.StreamableHTTPCOption
		if len(effectiveHeaders) > 0 {
			opts = append(opts, transport.WithHTTPHeaders(effectiveHeaders))
		}
		c, err := client.NewStreamableHttpClient(serverURL, opts...)
		if err != nil {
			return fmt.Sprintf("failed to create Streamable HTTP MCP client: %v", err)
		}
		defer c.Close()
		if err := c.Start(ctx); err != nil {
			return fmt.Sprintf("failed to start MCP client: %v", err)
		}

		initReq := mcp.InitializeRequest{}
		initReq.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
		initReq.Params.ClientInfo = mcp.Implementation{Name: "kendaliai", Version: "1.0.0"}
		if _, err := c.Initialize(ctx, initReq); err != nil {
			return fmt.Sprintf("failed to initialize MCP client: %v", err)
		}

		callReq := mcp.CallToolRequest{}
		callReq.Params.Name = toolName
		callReq.Params.Arguments = toolArgs
		res, err := c.CallTool(ctx, callReq)
		if err != nil {
			logger.Error("MCP", fmt.Sprintf("call failed: %v", err))
			return fmt.Sprintf("failed to call MCP tool %s: %v", toolName, err)
		}
		b, _ := json.Marshal(res.Content)
		if res.IsError {
			logger.Error("MCP", fmt.Sprintf("tool returned error: %s", string(b)))
			return fmt.Sprintf("MCP error: %s", string(b))
		}
		logger.Info("MCP", fmt.Sprintf("call success"))
		return string(b)
	}

	// Stdio Client
	mcpClient, err := client.NewStdioMCPClient(serverCmd, os.Environ(), serverArgs...)
	if err != nil {
		return fmt.Sprintf("failed to create Stdio MCP client: %v", err)
	}
	defer mcpClient.Close()
	if err := mcpClient.Start(ctx); err != nil {
		return fmt.Sprintf("failed to start Stdio MCP client: %v", err)
	}

	initReq := mcp.InitializeRequest{}
	initReq.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initReq.Params.ClientInfo = mcp.Implementation{Name: "kendaliai", Version: "1.0.0"}
	if _, err := mcpClient.Initialize(ctx, initReq); err != nil {
		return fmt.Sprintf("failed to initialize Stdio MCP client: %v", err)
	}

	callReq := mcp.CallToolRequest{}
	callReq.Params.Name = toolName
	callReq.Params.Arguments = toolArgs
	res, err := mcpClient.CallTool(ctx, callReq)
	if err != nil {
		return fmt.Sprintf("failed to call MCP tool %s: %v", toolName, err)
	}
	b, _ := json.Marshal(res.Content)
	if res.IsError {
		return fmt.Sprintf("MCP error: %s", string(b))
	}
	return string(b)
}

func executeWebSearch(ctx context.Context, cfg *config.Config, db *sql.DB, args map[string]interface{}) string {
	q, _ := args["query"].(string)
	if q == "" {
		q, _ = args["q"].(string)
	}
	if strings.TrimSpace(q) == "" {
		return "error: query parameter is required"
	}

	// 1. Try Exa web_search_exa
	exaRes := executeMCPCall(ctx, cfg, db, map[string]interface{}{
		"server":    "exa",
		"tool":      "web_search_exa",
		"arguments": map[string]interface{}{"query": q},
	})
	if !strings.Contains(exaRes, "API key is required") && !strings.Contains(exaRes, "failed to") && !strings.HasPrefix(exaRes, "error:") {
		return exaRes
	}

	// 2. Try Firecrawl firecrawl_search
	fcRes := executeMCPCall(ctx, cfg, db, map[string]interface{}{
		"server":    "firecrawl",
		"tool":      "firecrawl_search",
		"arguments": map[string]interface{}{"query": q},
	})
	if !strings.Contains(fcRes, "API key is required") && !strings.Contains(fcRes, "failed to") && !strings.HasPrefix(fcRes, "error:") {
		return fcRes
	}

	return fmt.Sprintf("Web search is available via Exa and Firecrawl MCP. To enable live results, configure your API key in config.json under mcpServers.exa or mcpServers.firecrawl (or set EXA_API_KEY / FIRECRAWL_API_KEY in environment).\nDetails: %s", exaRes)
}

func executeWebScrape(ctx context.Context, cfg *config.Config, db *sql.DB, args map[string]interface{}) string {
	u, _ := args["url"].(string)
	if strings.TrimSpace(u) == "" {
		return "error: url parameter is required"
	}

	// 1. Try Firecrawl firecrawl_scrape
	fcRes := executeMCPCall(ctx, cfg, db, map[string]interface{}{
		"server":    "firecrawl",
		"tool":      "firecrawl_scrape",
		"arguments": map[string]interface{}{"url": u},
	})
	if !strings.Contains(fcRes, "API key is required") && !strings.Contains(fcRes, "failed to") && !strings.HasPrefix(fcRes, "error:") {
		return fcRes
	}

	// 2. Try Exa web_fetch_exa
	exaRes := executeMCPCall(ctx, cfg, db, map[string]interface{}{
		"server":    "exa",
		"tool":      "web_fetch_exa",
		"arguments": map[string]interface{}{"url": u},
	})
	if !strings.Contains(exaRes, "API key is required") && !strings.Contains(exaRes, "failed to") && !strings.HasPrefix(exaRes, "error:") {
		return exaRes
	}

	// 3. Fallback to basic HTTP fetch
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err.Error()
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err.Error()
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	s := string(b)
	if len(s) > 8000 {
		s = s[:8000] + "\n...(truncated)"
	}
	return s
}

type tunnelRecord struct {
	Port      int       `json:"port"`
	URL       string    `json:"url"`
	Type      string    `json:"type"`
	PID       int       `json:"pid"`
	StartedAt time.Time `json:"startedAt"`
	cmd       *exec.Cmd
}

var activeTunnels sync.Map // port (int) or name (string) -> *tunnelRecord

func executeCloudflaredTunnel(ctx context.Context, args map[string]interface{}) string {
	action, _ := args["action"].(string)
	if action == "" {
		action = "quick"
	}
	action = strings.ToLower(action)

	port := 8080
	if p, ok := args["port"].(float64); ok && p > 0 {
		port = int(p)
	} else if pStr, ok := args["port"].(string); ok {
		if val, err := strconv.Atoi(pStr); err == nil && val > 0 {
			port = val
		}
	}

	cfPath, err := exec.LookPath("cloudflared")
	if err != nil {
		homeDir, _ := os.UserHomeDir()
		commonPaths := []string{
			"/opt/homebrew/bin/cloudflared",
			"/usr/local/bin/cloudflared",
			filepath.Join(homeDir, "homebrew/bin/cloudflared"),
		}
		for _, cp := range commonPaths {
			if _, statErr := os.Stat(cp); statErr == nil {
				cfPath = cp
				break
			}
		}
	}

	if cfPath == "" {
		return "❌ cloudflared is not installed on your system.\n\n" +
			"To install cloudflared:\n" +
			"• macOS: brew install cloudflared\n" +
			"• Linux: curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | sudo tee /etc/yum.repos.d/cloudflared.repo\n" +
			"  or: wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared-linux-amd64.deb\n" +
			"• Docker: docker run cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:" + strconv.Itoa(port)
	}

	switch action {
	case "stop":
		if port == 0 {
			return "⚠️ Target 'port' is required to stop a specific quick tunnel without affecting other tunnels (e.g. action='stop', port=8080)."
		}
		found := false
		var stopped []string
		activeTunnels.Range(func(key, value interface{}) bool {
			rec := value.(*tunnelRecord)
			if rec.Port == port || key == port || key == strconv.Itoa(port) {
				if rec.cmd != nil && rec.cmd.Process != nil {
					_ = rec.cmd.Process.Kill()
				}
				stopped = append(stopped, fmt.Sprintf("Quick tunnel on port %d (%s, PID: %d)", rec.Port, rec.URL, rec.PID))
				activeTunnels.Delete(key)
				found = true
			}
			return true
		})

		// Also check specific PID file in /tmp/cloudflared-${port}.pid
		pidFile := fmt.Sprintf("/tmp/cloudflared-%d.pid", port)
		if data, err := os.ReadFile(pidFile); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && pid > 0 {
				if proc, err := os.FindProcess(pid); err == nil {
					_ = proc.Kill()
					stopped = append(stopped, fmt.Sprintf("Quick tunnel process (PID %d) for port %d", pid, port))
					found = true
				}
			}
			_ = os.Remove(pidFile)
			_ = os.Remove(fmt.Sprintf("/tmp/cloudflared-%d.log", port))
		}

		if found {
			return fmt.Sprintf("✅ Stopped specific cloudflared quick tunnel on port %d:\n• %s\nℹ️ Main app tunnels and other processes remain unaffected.", port, strings.Join(stopped, "\n• "))
		}
		return fmt.Sprintf("ℹ️ No active cloudflared quick tunnel found running on port %d.\nℹ️ Main app tunnels and other processes remain unaffected.", port)

	case "status", "list":
		var list []string
		activeTunnels.Range(func(key, value interface{}) bool {
			rec := value.(*tunnelRecord)
			list = append(list, fmt.Sprintf("• Port %d ➔ %s (PID: %d, Type: %s, Uptime: %s)",
				rec.Port, rec.URL, rec.PID, rec.Type, time.Since(rec.StartedAt).Round(time.Second)))
			return true
		})
		if len(list) == 0 {
			return "ℹ️ No cloudflared tunnels currently active."
		}
		return "🌐 Active Cloudflare Tunnels:\n" + strings.Join(list, "\n")

	case "named":
		tunnelName, _ := args["tunnel_name"].(string)
		hostname, _ := args["hostname"].(string)
		if tunnelName == "" {
			return "❌ 'tunnel_name' is required for named tunnel (e.g. tunnel_name: 'dev-api').\n\n" +
				"Usage for Named Tunnel:\n" +
				"1. cloudflared tunnel create <name>\n" +
				"2. cloudflared tunnel route dns <name> <hostname>\n" +
				"3. cloudflared tunnel run <name>"
		}
		return fmt.Sprintf("ℹ️ Named Tunnel '%s' requested (hostname: '%s', port: %d).\n"+
			"To run a persistent named tunnel, ensure credentials exist in ~/.cloudflared/ and run:\n"+
			"  cloudflared tunnel run %s", tunnelName, hostname, port, tunnelName)

	default: // "quick", "start"
		// Check if already running on this port
		if val, ok := activeTunnels.Load(port); ok {
			rec := val.(*tunnelRecord)
			return fmt.Sprintf("🌐 Cloudflare Quick Tunnel is ALREADY running on port %d:\n\n"+
				"• Public URL: %s\n"+
				"• Target: http://localhost:%d\n"+
				"• PID: %d\n"+
				"• Uptime: %s", rec.Port, rec.URL, rec.Port, rec.PID, time.Since(rec.StartedAt).Round(time.Second))
		}

		targetURL := fmt.Sprintf("http://localhost:%d", port)
		cmd := exec.Command(cfPath, "tunnel", "--url", targetURL)

		stderrPipe, err := cmd.StderrPipe()
		if err != nil {
			return fmt.Sprintf("❌ Failed to start cloudflared: %v", err)
		}

		if err := cmd.Start(); err != nil {
			return fmt.Sprintf("❌ Failed to launch cloudflared process: %v", err)
		}

		// Read output to capture the trycloudflare.com URL
		urlChan := make(chan string, 1)
		go func() {
			buf := make([]byte, 1024)
			re := regexp.MustCompile(`https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com`)
			var fullOutput strings.Builder
			for {
				n, err := stderrPipe.Read(buf)
				if n > 0 {
					chunk := string(buf[:n])
					fullOutput.WriteString(chunk)
					if match := re.FindString(fullOutput.String()); match != "" {
						urlChan <- match
						return
					}
				}
				if err != nil {
					break
				}
			}
			urlChan <- ""
		}()

		var publicURL string
		select {
		case u := <-urlChan:
			publicURL = u
		case <-time.After(10 * time.Second):
			publicURL = ""
		}

		if publicURL == "" {
			_ = cmd.Process.Kill()
			return fmt.Sprintf("⚠️ cloudflared started but failed to acquire a trycloudflare.com URL within 10s.\nTarget was: %s", targetURL)
		}

		rec := &tunnelRecord{
			Port:      port,
			URL:       publicURL,
			Type:      "quick",
			PID:       cmd.Process.Pid,
			StartedAt: time.Now(),
			cmd:       cmd,
		}
		activeTunnels.Store(port, rec)

		return fmt.Sprintf("🎉 Cloudflare Quick Tunnel active!\n\n"+
			"🔗 Public URL: %s\n"+
			"🎯 Local Target: %s\n"+
			"🆔 PID: %d\n\n"+
			"• Accessible publicly without domain registration or port forwarding.\n"+
			"• To stop: invoke cloudflared_tunnel with action='stop', port=%d", publicURL, targetURL, rec.PID, port)
	}
}

func executeVPSMonitor(ctx context.Context, args map[string]interface{}) string {
	checkDocker, _ := args["check_docker"].(bool)
	targetURL, _ := args["url"].(string)

	threshCPU := 90
	if c, ok := args["threshold_cpu"].(float64); ok && c > 0 {
		threshCPU = int(c)
	}
	threshRAM := 85
	if r, ok := args["threshold_ram"].(float64); ok && r > 0 {
		threshRAM = int(r)
	}
	threshDisk := 80
	if d, ok := args["threshold_disk"].(float64); ok && d > 0 {
		threshDisk = int(d)
	}

	// 1. Check Disk
	diskUsage := 0
	dfCmd := exec.CommandContext(ctx, "df", "-k", "/")
	if out, err := dfCmd.Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		if len(lines) >= 2 {
			fields := strings.Fields(lines[1])
			if len(fields) >= 5 {
				pctStr := strings.TrimSuffix(fields[4], "%")
				diskUsage, _ = strconv.Atoi(pctStr)
			}
		}
	}

	// 2. Check CPU & RAM
	cpuUsage := 0
	ramUsage := 0
	if out, err := exec.CommandContext(ctx, "ps", "-A", "-o", "%cpu,%mem").Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		var totalCPU, totalMEM float64
		for i := 1; i < len(lines); i++ {
			fields := strings.Fields(lines[i])
			if len(fields) >= 2 {
				c, _ := strconv.ParseFloat(fields[0], 64)
				m, _ := strconv.ParseFloat(fields[1], 64)
				totalCPU += c
				totalMEM += m
			}
		}
		if totalCPU > 100 {
			totalCPU = 100
		}
		if totalMEM > 100 {
			totalMEM = 100
		}
		cpuUsage = int(totalCPU)
		ramUsage = int(totalMEM)
	}

	// 3. Check Docker status
	dockerStatus := "healthy"
	if checkDocker {
		if _, err := exec.LookPath("docker"); err == nil {
			docOut, err := exec.CommandContext(ctx, "docker", "ps", "--format", "{{.Names}}: {{.Status}}").Output()
			if err != nil {
				dockerStatus = "unreachable / daemon stopped"
			} else {
				str := strings.TrimSpace(string(docOut))
				if str == "" {
					dockerStatus = "no containers running"
				} else if strings.Contains(strings.ToLower(str), "unhealthy") || strings.Contains(strings.ToLower(str), "restarting") {
					dockerStatus = "unhealthy containers detected: " + str
				}
			}
		}
	}

	// 4. Check URL health
	apiStatus := "healthy"
	if targetURL != "" {
		client := http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get(targetURL)
		if err != nil {
			apiStatus = fmt.Sprintf("unreachable (%v)", err)
		} else {
			resp.Body.Close()
			if resp.StatusCode >= 500 {
				apiStatus = fmt.Sprintf("HTTP %d (server error)", resp.StatusCode)
			}
		}
	}

	// Deterministic evaluation: alert only if threshold breached!
	isAlert := cpuUsage >= threshCPU || ramUsage >= threshRAM || diskUsage >= threshDisk ||
		strings.Contains(dockerStatus, "unhealthy") || strings.Contains(apiStatus, "unreachable") || strings.Contains(apiStatus, "500")

	if isAlert {
		var recommendations []string
		if ramUsage >= threshRAM {
			recommendations = append(recommendations, "Inspect top memory-consuming processes using `ps aux --sort=-%mem`")
		}
		if cpuUsage >= threshCPU {
			recommendations = append(recommendations, "Investigate runaway CPU threads or infinite loops")
		}
		if diskUsage >= threshDisk {
			recommendations = append(recommendations, "Clear docker logs, temp files, or build caches (`docker system prune`)")
		}
		if strings.Contains(apiStatus, "unreachable") || strings.Contains(apiStatus, "500") {
			recommendations = append(recommendations, fmt.Sprintf("Check backend application logs for service at %s", targetURL))
		}

		recText := strings.Join(recommendations, "\n• ")
		if recText == "" {
			recText = "Check system services and logs."
		}

		return fmt.Sprintf("🚨 VPS Alert Triggered\n\n"+
			"• CPU: %d%% (threshold: %d%%)\n"+
			"• RAM: %d%% (threshold: %d%%)\n"+
			"• Disk: %d%% (threshold: %d%%)\n"+
			"• API Health: %s\n"+
			"• Docker: %s\n\n"+
			"Recommendation:\n• %s",
			cpuUsage, threshCPU, ramUsage, threshRAM, diskUsage, threshDisk, apiStatus, dockerStatus, recText)
	}

	return fmt.Sprintf("✅ (No Alert) All system metrics normal.\n• CPU: %d%% | RAM: %d%% | Disk: %d%% | Docker: %s | API: %s",
		cpuUsage, ramUsage, diskUsage, dockerStatus, apiStatus)
}

func executeRememberDecision(ctx context.Context, workspaceRoot string, db *sql.DB, args map[string]interface{}) string {
	title, _ := args["title"].(string)
	decision, _ := args["decision"].(string)
	contextStr, _ := args["context"].(string)
	status, _ := args["status"].(string)
	if status == "" {
		status = "Accepted"
	}
	consequences, _ := args["consequences"].(string)

	if title == "" || decision == "" {
		return "error: 'title' and 'decision' are required"
	}

	dateStr := time.Now().Format("2006-01-02")
	adrMD := fmt.Sprintf("\n\n## ADR: %s\n\n- **Date:** %s\n- **Status:** %s\n\n### Context\n%s\n\n### Decision\n%s\n\n### Consequences\n%s\n",
		title, dateStr, status, contextStr, decision, consequences)

	// Save to .kendaliai/memory/decisions.md
	homeDir, _ := os.UserHomeDir()
	memDir := filepath.Join(homeDir, ".kendaliai", "memory")
	if workspaceRoot != "" {
		memDir = filepath.Join(workspaceRoot, ".kendaliai", "memory")
	}
	_ = os.MkdirAll(memDir, 0755)
	decisionsFile := filepath.Join(memDir, "decisions.md")

	f, err := os.OpenFile(decisionsFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		_, _ = f.WriteString(adrMD)
		f.Close()
	}

	// Also store in SQLite memories table if db is provided
	if db != nil {
		content := fmt.Sprintf("ADR: %s | Status: %s | Decision: %s | Context: %s", title, status, decision, contextStr)
		now := time.Now().Unix()
		_, _ = db.Exec(`INSERT INTO memories (id, content, scope, tags, created_at, updated_at) VALUES (?, ?, 'project', 'adr,decision,architecture', ?, ?)`,
			uuid.New().String(), content, now, now)
	}

	return fmt.Sprintf("🧠 Architectural Decision Record saved to durable memory!\n• Title: %s\n• Status: %s\n• Saved to: %s", title, status, decisionsFile)
}
