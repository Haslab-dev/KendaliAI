package agent

import (
	"context"
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
	"github.com/kendaliai/app/internal/logger"
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
func GetToolRegistry(cfg *config.Config, excludeCmds []string, workspaceRoot string) map[string]ToolDef {
	registry := map[string]ToolDef{
		// 📁 FILESYSTEM
		"read_file": {
			Name:        "read_file",
			Description: "Gets the chunked partial content of a file. Use offset and limit. E.g. offset:0 limit:50, then offset:50 limit:50.",
			Signature:   `{"path": "string", "offset": "int", "limit": "int"}`,
			Category:    "Explore",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)

				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}

				b, err := os.ReadFile(path)
				if err != nil {
					return err.Error()
				}
				lines := strings.Split(string(b), "\n")

				offset := 0
				limit := 50 // default buffer baseline

				if o, ok := args["offset"].(float64); ok && o >= 0 {
					offset = int(o)
				}
				if l, ok := args["limit"].(float64); ok && l > 0 {
					limit = int(l)
				}

				// Enforce extreme strict token safeguards across the execution pool
				if limit > 100 {
					limit = 100
				} // Hard-cap override

				// Secondary guard: never dump more than 1/4 of massive file arrays at once unless absolute edge cases
				quarter := len(lines) / 4
				if quarter >= 25 && limit > quarter {
					limit = quarter
				}

				if offset >= len(lines) {
					return "offset beyond EOF"
				}
				end := offset + limit
				if end > len(lines) {
					end = len(lines)
				}

				return strings.Join(lines[offset:end], "\n")
			},
		},
		"list_files": {
			Name:        "list_files",
			Description: "Lists files safely in a directory.",
			Signature:   `{"path": "string", "depth": "int"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}

				// Optional depth filter could be added via WalkDir
				entries, err := os.ReadDir(path)
				if err != nil {
					return err.Error()
				}

				var files []string
				for _, e := range entries {
					t := "file"
					if e.IsDir() {
						t = "dir"
					}
					files = append(files, fmt.Sprintf("%s (%s)", e.Name(), t))
				}
				return strings.Join(files, "\n")
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

		// ✏️ EDITING
		"apply_patch": {
			Name:        "apply_patch",
			Description: "Replaces exact target block with new block.",
			Signature:   `{"path": "string", "old_str": "string", "new_str": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if err := ValidateSandboxedPath(path, workspaceRoot); err != nil {
					return err.Error()
				}

				oldStr, _ := args["old_str"].(string)
				newStr, _ := args["new_str"].(string)

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
			Description: "Validates syntax via compilation natively without altering state.",
			Signature:   `{"file": "string"}`,
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				file, _ := args["file"].(string)
				if err := ValidateSandboxedPath(file, workspaceRoot); err != nil {
					return err.Error()
				}

				if strings.HasSuffix(file, ".go") {
					cmd := exec.CommandContext(ctx, "go", "build", "-o", "/dev/null", file)
					out, err := cmd.CombinedOutput()
					if err != nil {
						return string(out)
					}
					return "Syntax valid."
				}
				return "Unsupported syntax validation format natively."
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

		// 🛠️ SKILLS AND MCP
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
