package agent

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type ToolDef struct {
	Name        string
	Description string
	Signature   string
	Execute     func(ctx context.Context, args map[string]interface{}) string
}

// GetToolRegistry fully implements blueprint Rule 3 (Full Semantic Tooling)
func GetToolRegistry(excludeCmds []string, workspaceRoot string) map[string]ToolDef {
	return map[string]ToolDef{
		// 📁 FILESYSTEM
		"read_file": {
			Name:        "read_file",
			Description: "Gets the chunked partial content of a file. Use offset and limit. E.g. offset:0 limit:50, then offset:50 limit:50.",
			Signature:   `{"path": "string", "offset": "int", "limit": "int"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil { return err.Error() }

				b, err := os.ReadFile(path)
				if err != nil {
					return err.Error()
				}
				lines := strings.Split(string(b), "\n")

				offset := 0
				limit := 50 // default buffer baseline

				if o, ok := args["offset"].(float64); ok && o >= 0 { offset = int(o) }
				if l, ok := args["limit"].(float64); ok && l > 0 { limit = int(l) }

				// Enforce extreme strict token safeguards across the execution pool
				if limit > 100 { limit = 100 } // Hard-cap override

				// Secondary guard: never dump more than 1/4 of massive file arrays at once unless absolute edge cases
				quarter := len(lines) / 4
				if quarter >= 25 && limit > quarter {
					limit = quarter
				}

				if offset >= len(lines) { return "offset beyond EOF" }
				end := offset + limit
				if end > len(lines) { end = len(lines) }

				return strings.Join(lines[offset:end], "\n")
			},
		},
		"list_files": {
			Name:        "list_files",
			Description: "Lists files safely in a directory.",
			Signature:   `{"path": "string", "depth": "int"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil { return err.Error() }
				
				// Optional depth filter could be added via WalkDir
				entries, err := os.ReadDir(path)
				if err != nil { return err.Error() }
				
				var files []string
				for _, e := range entries {
					t := "file"
					if e.IsDir() { t = "dir" }
					files = append(files, fmt.Sprintf("%s (%s)", e.Name(), t))
				}
				return strings.Join(files, "\n")
			},
		},
		"search_files": {
			Name: "search_files",
			Description: "Search files matching a pattern using standard grep.",
			Signature: `{"query": "string", "path": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				query, _ := args["query"].(string)
				path, _ := args["path"].(string)
				
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil { return err.Error() }

				timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				defer cancel()

				cmd := exec.CommandContext(timeoutCtx, "grep", "-rnI", query, path)
				out, err := cmd.CombinedOutput()
				
				if len(out) == 0 {
					return "No matches found."
				}
				if err != nil && len(out) == 0 { return err.Error() }
				
				// Truncate massive search responses
				res := string(out)
				if len(res) > 2000 { res = res[:2000] + "\n...(truncated)" }
				return res
			},
		},

		// ✏️ EDITING
		"apply_patch": {
			Name:        "apply_patch",
			Description: "Replaces exact target block with new block.",
			Signature:   `{"path": "string", "old_str": "string", "new_str": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil { return err.Error() }
				
				oldStr, _ := args["old_str"].(string)
				newStr, _ := args["new_str"].(string)

				if oldStr == "" {
					_ = os.WriteFile(path, []byte(newStr), 0644)
					return "created_file"
				}

				b, err := os.ReadFile(path)
				if err != nil { return err.Error() }
				
				content := string(b)
				if !strings.Contains(content, oldStr) { return "old_str not found exactly as formatted" }
				
				content = strings.Replace(content, oldStr, newStr, 1)
				_ = os.WriteFile(path, []byte(content), 0644)
				return "patched successfully"
			},
		},
		"replace_range": {
			Name: "replace_range",
			Description: "Replaces lines between start and end (inclusive) with new content.",
			Signature: `{"path": "string", "start": "int", "end": "int", "new_content": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil { return err.Error() }
				
				startF, _ := args["start"].(float64)
				endF, _ := args["end"].(float64)
				newContent, _ := args["new_content"].(string)
				
				start := int(startF)
				end := int(endF)
				
				b, err := os.ReadFile(path)
				if err != nil { return err.Error() }
				lines := strings.Split(string(b), "\n")
				
				if start < 1 || start > len(lines) || end < start { return "invalid line bounds" }
				if end > len(lines) { end = len(lines) }

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
				if t, ok := args["timeout"].(float64); ok && t > 0 { timeoutVal = int(t) }

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
			Name: "git_status",
			Description: "Gets git status porcelain.",
			Signature: `{}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				cmd := exec.CommandContext(ctx, "git", "status", "--porcelain")
				cmd.Dir = workspaceRoot
				out, _ := cmd.CombinedOutput()
				return string(out)
			},
		},
		"git_diff": {
			Name: "git_diff",
			Description: "Gets git diff.",
			Signature: `{}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				cmd := exec.CommandContext(ctx, "git", "diff")
				cmd.Dir = workspaceRoot
				out, _ := cmd.CombinedOutput()
				return string(out)
			},
		},
		"git_apply_patch": {
			Name: "git_apply_patch",
			Description: "Applies a raw git patch string securely.",
			Signature: `{"patch_str": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				patch, _ := args["patch_str"].(string)
				
				tmpFile := filepath.Join(os.TempDir(), "kendali_"+fmt.Sprint(time.Now().UnixNano())+".patch")
				os.WriteFile(tmpFile, []byte(patch), 0644)
				defer os.Remove(tmpFile)

				cmd := exec.CommandContext(ctx, "git", "apply", tmpFile)
				cmd.Dir = workspaceRoot
				out, err := cmd.CombinedOutput()
				if err != nil { return fmt.Sprintf("Git Apply Failed: %s", string(out)) }
				return "Patch applied successfully."
			},
		},

		// ✅ VALIDATION
		"run_tests": {
			Name: "run_tests",
			Description: "Runs standard Go or NPM test validations.",
			Signature: `{"framework": "string", "path": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				fw, _ := args["framework"].(string)
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil { return err.Error() }
				
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
			Name: "validate_syntax",
			Description: "Validates syntax via compilation natively without altering state.",
			Signature: `{"file": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				file, _ := args["file"].(string)
				if err := ValidateSandboxedPath(file, workspaceRoot); err != nil { return err.Error() }
				
				if strings.HasSuffix(file, ".go") {
					cmd := exec.CommandContext(ctx, "go", "build", "-o", "/dev/null", file)
					out, err := cmd.CombinedOutput()
					if err != nil { return string(out) }
					return "Syntax valid."
				}
				return "Unsupported syntax validation format natively."
			},
		},
		
		// 🌐 OPTIONAL HIGH VALUE
		"fetch_url": {
			Name: "fetch_url",
			Description: "Fetches remote data for documentation checks.",
			Signature: `{"url": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				urlStr, _ := args["url"].(string)
				
				timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				defer cancel()

				req, _ := http.NewRequestWithContext(timeoutCtx, http.MethodGet, urlStr, nil)
				resp, err := http.DefaultClient.Do(req)
				if err != nil { return err.Error() }
				defer resp.Body.Close()
				
				b, _ := io.ReadAll(resp.Body)
				content := string(b)
				if len(content) > 2000 { content = content[:2000] + "\n...(truncated)" }
				return content
			},
		},
	}
}
