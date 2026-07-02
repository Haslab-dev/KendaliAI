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
	"strings"
	"time"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/data"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/intelligence"
	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/reflection"
	"github.com/kendaliai/app/internal/skills"
	"github.com/kendaliai/app/internal/storage"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
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
					_ = os.WriteFile(path, []byte(newStr), 0644)
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
					cwd, _ := os.Getwd()
					cmd := exec.CommandContext(ctx, "npx", "oxlint", file)
					cmd.Dir = cwd
					out, err := cmd.CombinedOutput()
					if err != nil {
						return fmt.Sprintf("lint errors:\n%s", string(out))
					}
					if len(out) == 0 {
						return "Syntax valid, no lint errors."
					}
					return fmt.Sprintf("lint output:\n%s", string(out))
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
					return "error: skill manager not initialized"
				}
				name, _ := args["name"].(string)
				desc, _ := args["description"].(string)
				respStr, _ := args["responsibilities"].(string)

				if name == "" {
					return "error: 'name' is required"
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
					Research:         false,
					WorkspaceRoot:    workspaceRoot,
				})
				if err != nil {
					return fmt.Sprintf("error creating skill: %v", err)
				}
				registerSkillJSON(pkg.Spec.ID, pkg.Spec.Name, pkg.Spec.Description)
				return fmt.Sprintf("✅ Skill '%s' created [%s v%s]. Keywords: %v",
					pkg.Spec.Name, pkg.Spec.ID, pkg.Spec.Version, pkg.Spec.Routing.Keywords[:min(5, len(pkg.Spec.Routing.Keywords))])
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
				return fmt.Sprintf("✅ Deleted skill '%s'", id)
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
		"mcp_call": {
			Name:        "mcp_call",
			Description: "Calls a tool on an MCP (Model Context Protocol) server. You can specify a configured 'server' name (e.g. 'exa') or provide 'server_url'/'server_cmd' directly.",
			Signature:   `{"server": "string", "server_cmd": "string", "server_args": "array", "server_url": "string", "tool_name": "string", "tool_args": "object"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
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

				// Lookup server config if name provided
				if serverName != "" && cfg != nil && cfg.MCPServers != nil {
					if srv, ok := cfg.MCPServers[serverName]; ok {
						logger.Info("MCP", fmt.Sprintf("found config for server: %s", serverName))
						if srv.ServerURL != "" {
							serverURL = srv.ServerURL
						} else {
							serverCmd = srv.Command
							serverArgs = srv.Args
						}
					} else {
						logger.Info("MCP", fmt.Sprintf("server config NOT found: %s", serverName))
					}
				}

				if serverURL == "" && serverCmd == "" {
					return "error: no server name, url or command provided"
				}

				var mcpClient *client.Client
				var err error

				if serverURL != "" {
					// Streamable HTTP Client (Modern remote MCP transport)
					c, err := client.NewStreamableHttpClient(serverURL)
					if err != nil {
						return fmt.Sprintf("failed to create Streamable HTTP MCP client: %v", err)
					}
					defer c.Close()
					if err := c.Start(ctx); err != nil {
						return fmt.Sprintf("failed to start SSE MCP client: %v", err)
					}

					initReq := mcp.InitializeRequest{}
					initReq.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
					initReq.Params.ClientInfo = mcp.Implementation{Name: "kendaliai", Version: "1.0.0"}
					if _, err := c.Initialize(ctx, initReq); err != nil {
						return fmt.Sprintf("failed to initialize SSE MCP client: %v", err)
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
					logger.Info("MCP", fmt.Sprintf("call success: %s", strings.ReplaceAll(string(b), "\n", " ")[:100]))
					return string(b)
				} else {
					// Stdio Client
					mcpClient, err = client.NewStdioMCPClient(serverCmd, os.Environ(), serverArgs...)
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
					return string(b)
				}
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

func registerSkillJSON(id, name, description string) {
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
