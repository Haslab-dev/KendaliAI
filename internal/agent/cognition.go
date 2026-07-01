package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/skills"
)

type Provider interface {
	ChatCompletion(ctx context.Context, msgs []Message) (*Response, error)
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Response struct {
	Content      string `json:"content"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
}

type CognitionLoop struct {
	Provider   Provider
	MaxSteps   int
	Config     *config.Config
	DB         *sql.DB
	OnTool     func(toolName string, category string, args map[string]interface{})
	OnResponse func(content string)
	OnStats    func(totalInput, totalOutput int)
}

func NewCognitionLoop(p Provider, maxSteps int, cfg *config.Config) *CognitionLoop {
	return &CognitionLoop{
		Provider: p,
		MaxSteps: maxSteps,
		Config:   cfg,
	}
}

func NewCognitionLoopWithDB(p Provider, maxSteps int, cfg *config.Config, db *sql.DB) *CognitionLoop {
	return &CognitionLoop{
		Provider: p,
		MaxSteps: maxSteps,
		Config:   cfg,
		DB:       db,
	}
}

const baseSystemPrompt = `You are an autonomous, production-grade AI Software Engineer operating inside a controlled execution runtime.

Your role is to PLAN, VALIDATE, and EXECUTE tasks using available tools with high precision and minimal resource usage.

---

## SYSTEM CONTRACT

You operate in discrete cycles:

1. PLAN → decide what to do
2. VALIDATE → ensure actions are safe and necessary
3. EXECUTE → call tools (if needed)
4. COMPLETE → return final answer when no further actions are required

---

## AVAILABLE TOOLS

{tool_list_repr}

---

## OUTPUT FORMAT (STRICT)

You MUST follow one of these two modes:

### 1. TOOL EXECUTION MODE

If any action is required, output ONLY tool calls:

tool: TOOL_NAME({"arg": "value"})
tool: SKILL_NAME({})

Rules:
- One tool per line
- ALWAYS start with "tool:" prefix
- ALWAYS include parentheses with JSON args (use {} if no args)
- No explanations, no extra text
- Multiple tools = executed in PARALLEL
- Only call tools that are necessary

---

### 2. FINAL RESPONSE MODE

If the task is complete and NO tools are needed:

- Output ONLY the final answer
- No tool lines
- No planning text

---

## EXECUTION RULES

1. MINIMIZE OPERATIONS
   - Do not call tools unless required
   - Avoid redundant reads or repeated actions

2. NO BULK SCANS
   - NEVER scan entire directories blindly
   - ALWAYS prefer "search_files" before accessing files

3. TARGETED FILE ACCESS
   - Use "read_file_chunked" instead of full reads
   - Only access relevant sections

4. CONTROLLED SHELL USAGE
   - "exec" is a fallback tool, not primary
   - Avoid chaining shell commands unnecessarily

5. GIT TOOL RESTRICTION
   - DO NOT use git tools unless explicitly requested

6. GOAL PRESERVATION (CRITICAL)
   - Your ACTIVE GOAL is injected at the start. NEVER deviate from it.
   - Do NOT install unrelated packages, libraries, or tools.
   - Do NOT explore tangents, start new topics, or research unrelated things.
   - If a step fails, try an ALTERNATIVE approach that still serves the SAME goal.
   - After every tool call, verify: does this serve my ACTIVE GOAL?

7. TOOL ROUTING & CAPABILITY RANKING
   - Documentation tasks: Context7 (resolve-library-id → query-docs) → Exa → fetch_url
   - Latest news/search: Exa → fetch_url (GitHub API, direct URLs)
   - Known URLs: fetch_url only
   - Local files: read_file → search_files → exec
   - Shell commands: exec
   - MCP servers MUST be called via: mcp_call({"server": "context7", "tool": "resolve-library-id", ...})
   - NEVER call MCP tool names as direct tools (web_search_exa, query-docs, etc. are NOT standalone)
   - Context7 args: resolve-library-id takes "libraryName" (string), query-docs takes "libraryId" and "query"
   - Exa args: web_search_exa takes "query" (string), web_fetch_exa takes "url" (string)
   - If an MCP tool returns validation error, retry ONCE with corrected args. Then fall back.
   - If Exa returns "authorization required", immediately fall back to fetch_url. Do NOT retry Exa.

8. INTERACTIVE COMMANDS
   - NEVER run commands that require user input (stdin prompts).
   - Add --yes, -y, --no-prompt, or non-interactive flags.
   - Add "2>&1" to silence prompts. Pipe "yes |" or "</dev/null" if needed.
   - If a tool requests input, ABORT and report the error.

9. BOUNDED REASONING
   - If a read_file or search_files returns an error 3 times in a row, STOP and report the limitation.
   - Do NOT retry the same failing operation endlessly.
   - If permissions block a read 3 times, ask the user to adjust permissions.
   - Maximum 3 MCP retries per server per task.

10. CLEAN SLATE
   - Each conversation ISOLATED. Do NOT reference previous chat turns unless explicitly asked.
   - Start fresh with only the ACTIVE GOAL as context.

---

## CONTEXT-AWARE SHORT-CIRCUIT

The system may preload high-level context (e.g. README.md, REFACTORING_NOTES.md).

If the user asks:
- “what is this project?”
- “explain the codebase”
- or similar high-level questions

THEN:
- DO NOT call any tools
- Answer immediately using provided context

---

## SAFETY & VALIDATION

Before executing tools, ensure:

- The action directly contributes to the task
- The scope is minimal and precise
- The command is safe and non-destructive

NEVER:
- execute destructive commands blindly
- modify unknown files without reading context first

---

## FILE ACCESS RESTRICTIONS

The system enforces file access permissions. You are STRICTLY PROHIBITED from:

1. Reading, writing, or disclosing configuration files (config.yaml, config.json, .env, etc.)
2. Accessing secrets, keys, tokens, or credentials of any kind
3. Accessing .git/config, .ssh/, or any private key files

If a user asks to show, read, or share any restricted file:
- Reply: "Sorry, not allowed"
- Do NOT attempt to access the file
- Do NOT use exec or any workaround to bypass restrictions

---

## OBJECT STORAGE

Local storage is ALWAYS auto-available. Store files, artifacts, and generated content here.

Cloudflare R2 / S3 storage is an OPTIONAL additional layer (configured by admin).

Use upload_object with:
- provider: "local" → local filesystem (default, always works)
- provider: "r2" → remote cloud storage (if configured)
- provider: "both" → uploads to both

Uploaded HTML files are served with a public URL when remote storage is configured.

---

## DECISION HEURISTICS

Prefer:

- search → read → edit → validate

- fetch_url → Use this for standard websites. NEVER use this for MCP server URLs (e.g. mcp.exa.ai).
- mcp_call → Use this for all MCP servers listed in the CONFIGURED MCP SERVERS section.

Avoid:

- read → read → read (without narrowing scope)
- exec for simple file operations
- large context expansion

---

## IDENTITY

{persona_text}

---

## FINAL DIRECTIVE

Be precise, efficient, and deterministic.

Do not over-explore.
Do not over-execute.
Stop immediately when the task is complete.
`

// (Tools are now extracted into tools.go)

func (c *CognitionLoop) Run(ctx context.Context, initialQuery string) (string, error) {
	logger.Info("Agent", "🧠 Cognition Loop started")

	personaText, activeToolNames, excludeCmds := c.loadPersonaConfig()

	cwd, _ := os.Getwd()
	homeDir, _ := os.UserHomeDir()
	if homeDir == "" {
		homeDir = "."
	}
	skillsJsonPath := filepath.Join(homeDir, ".kendaliai", "skills", "skills.json")
	if content, err := os.ReadFile(skillsJsonPath); err == nil {
		var config SkillConfig
		if err := json.Unmarshal(content, &config); err == nil {
			for _, skill := range config.Skills {
				if skill.Installed {
					activeToolNames = append(activeToolNames, skill.ID)
				}
			}
		}
	}

	reg := GetToolRegistry(c.Config, excludeCmds, cwd, c.DB)

	if c.DB != nil {
		activeToolNames = append(activeToolNames, "store_memory", "search_memory")
	}

	effectiveBasePrompt := baseSystemPrompt

	// Inject Markdown Skills (System Instructions)
	if entries, err := os.ReadDir(filepath.Join(homeDir, ".kendaliai", "skills")); err == nil {
		mdSkills := "\nAVAILABLE SPECIALIZED SKILLS (Call the tool to load full guidelines):\n"
		hasMd := false
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
				if content, err := os.ReadFile(filepath.Join(homeDir, ".kendaliai", "skills", e.Name())); err == nil {
					parts := strings.SplitN(string(content), "---", 3)
					skillName := e.Name()
					skillDesc := "Expert guidelines and principles."
					if len(parts) >= 3 {
						// Extract name and description from frontmatter
						for _, line := range strings.Split(parts[1], "\n") {
							line = strings.TrimSpace(line)
							if strings.HasPrefix(line, "name:") {
								skillName = strings.TrimSpace(line[5:])
							} else if strings.HasPrefix(line, "description:") {
								skillDesc = strings.TrimSpace(line[12:])
							}
						}
					}
					mdSkills += fmt.Sprintf("- %s: %s\n", skillName, skillDesc)
					activeToolNames = append(activeToolNames, skillName)
					hasMd = true
				}
			}
		}
		if hasMd {
			effectiveBasePrompt += "\n" + mdSkills
		}
	}

	repStr := ""
	for _, tName := range activeToolNames {
		tName = strings.TrimSpace(tName)
		if tool, ok := reg[tName]; ok {
			repStr += "TOOL\n===\n"
			repStr += fmt.Sprintf("Name: %s\nDescription: %s\nSignature: %s\n\n", tool.Name, tool.Description, tool.Signature)
		}
	}
	sysPrompt := strings.Replace(effectiveBasePrompt, "{tool_list_repr}", repStr, 1)
	sysPrompt = strings.Replace(sysPrompt, "{persona_text}", personaText, 1)

	// Inject structural workspace context dynamically (INTERNAL PRE-READ)
	extContext := ""
	for _, fn := range []string{"README.md", "Kendali.md", "Agent.md"} {
		if content, err := os.ReadFile(filepath.Join(cwd, fn)); err == nil {
			str := string(content)
			if len(str) > 1500 {
				str = str[:1500] + "\n...(truncated)"
			}
			extContext += fmt.Sprintf("\n--- Context %s ---\n%s\n", fn, str)
		}
	}

	if extContext != "" {
		sysPrompt += "\nWORKSPACE CONTEXT AUTO-LOADED (Internal Read):\n" + extContext
	} else {
		sysPrompt += "\nWORKSPACE CONTEXT AUTO-LOADED: None found natively. You must manually utilize 'list_files' or 'search_files' to map context if needed."
	}

	if c.Config != nil && len(c.Config.MCPServers) > 0 {
		mcpDesc := "\nCONFIGURED MCP SERVERS (Use 'mcp_call' to invoke tools from these servers):\n"
		for name, srv := range c.Config.MCPServers {
			if srv.Disabled {
				continue
			}
			if srv.ServerURL != "" {
				mcpDesc += fmt.Sprintf("- %s: (SSE) %s\n", name, srv.ServerURL)
			} else {
				mcpDesc += fmt.Sprintf("- %s: (Stdio) %s %v\n", name, srv.Command, srv.Args)
			}
		}
		sysPrompt += mcpDesc
	}

	messages := []Message{{Role: "system", Content: sysPrompt}}

	goal := ExtractGoal(initialQuery)
	messages = append(messages, Message{Role: "system", Content: goal.Prompt()})
	logger.Info("Agent", fmt.Sprintf("🎯 Goal: %s", goal.Summary))

	if c.DB != nil {
		memContext := c.retrieveMemories(ctx, initialQuery)
		if memContext != "" {
			messages = append(messages, Message{Role: "system", Content: memContext})
		}
	}

	if skills.DefaultRouter != nil {
		if matchedSpec, score, _ := skills.DefaultRouter.Match(ctx, initialQuery); matchedSpec != nil && score > 0.6 {
			pkg, err := skills.DefaultManager.Get(matchedSpec.ID)
			if err == nil && pkg.Prompt != "" {
				skillMsg := fmt.Sprintf("🎯 Auto-routed to skill: %s (confidence: %.2f)\n\n%s", matchedSpec.Name, score, pkg.Prompt)
				messages = append([]Message{{Role: "system", Content: skillMsg}}, messages...)
				if pkg.Examples != "" {
					messages = append(messages, Message{Role: "system", Content: "Skill examples:\n" + pkg.Examples})
				}
				logger.Info("Agent", fmt.Sprintf("🎯 Routed to skill: %s (%.2f)", matchedSpec.Name, score))
			}
		}
	}

	messages = append(messages, Message{Role: "user", Content: initialQuery})

	engine := NewExecutionEngine(5, reg)

	totalInput := 0
	totalOutput := 0

	for i := 0; i < c.MaxSteps; i++ {
		messages = OptimizeContext(messages, 20000)

		response, err := c.Provider.ChatCompletion(ctx, messages)
		if err != nil {
			return "", fmt.Errorf("provider err: %v", err)
		}

		totalInput += response.InputTokens
		totalOutput += response.OutputTokens
		if c.OnStats != nil {
			c.OnStats(totalInput, totalOutput)
		}

		truncated := response.Content
		if len(truncated) > 100 {
			truncated = truncated[:100] + "..."
		}
		logger.Info("Agent", fmt.Sprintf("🤖 Response: %s", strings.ReplaceAll(truncated, "\n", " ")))

		messages = append(messages, Message{Role: "assistant", Content: response.Content})

		if c.OnResponse != nil {
			c.OnResponse(response.Content)
		}

		reqs := ParseActionPlan(response.Content)
		if len(reqs) == 0 {
			logger.Info("Agent", "✅ Cognition Loop completed")
			c.autoStore(ctx, initialQuery, response.Content)
			return response.Content, nil
		}

		var validReqs []ToolRequest
		for _, req := range reqs {
			cat := "Ran"
			if t, ok := reg[req.Name]; ok {
				cat = t.Category
			}
			if c.OnTool != nil {
				c.OnTool(req.Name, cat, req.Args)
			}

			if allowed, reason := goal.VerifyAction(req.Name, req.Args); !allowed {
				logger.Info("Agent", fmt.Sprintf("🛑 Goal violation: %s", reason))
				messages = append(messages, Message{Role: "user", Content: fmt.Sprintf("GOAL VIOLATION: %s\n%s", reason, goal.Prompt())})
				continue
			}

			logger.Info("Agent", fmt.Sprintf("⚙️ Scheduling %s args: %v", req.Name, req.Args))
			validReqs = append(validReqs, req)
		}

		if len(validReqs) == 0 {
			continue
		}

		results := engine.ExecuteParallel(ctx, validReqs)

			// State Sync / Re-feed
		for _, res := range results {
			truncResult := res.Output
			if len(truncResult) > 200 {
				truncResult = truncResult[:200] + "...(truncated)"
			}
			logger.Info("Agent", fmt.Sprintf("📦 Tool result [%s]: %s", res.Name, strings.ReplaceAll(truncResult, "\n", " ")))
			feedback := fmt.Sprintf("tool_result(%s):\n%s\n\nReminder: %s", res.Name, res.Output, goal.Prompt())
			messages = append(messages, Message{Role: "user", Content: feedback})
		}
	}
	return "I hit my maximum reasoning steps limits.", nil
}

func (c *CognitionLoop) loadPersonaConfig() (string, []string, []string) {
	homeDir, _ := os.UserHomeDir()
	content, err := os.ReadFile(homeDir + "/.kendaliai/Persona.md")
	if err != nil {
		return "", []string{"exec", "read_file", "list_files", "search_files",
			"apply_patch", "replace_range",
			"upload_object", "download_object", "list_objects", "delete_object",
			"create_skill", "list_skills", "delete_skill", "update_skill",
			"remember_timeline",
			"git_status", "git_diff", "git_apply_patch",
			"run_tests", "validate_syntax", "fetch_url"}, nil
	}

	personaTxt := string(content)
	tools := []string{
		"exec", "read_file", "list_files", "search_files",
		"apply_patch", "replace_range",
		"upload_object", "download_object", "list_objects", "delete_object",
		"git_status", "git_diff", "git_apply_patch",
		"run_tests", "validate_syntax", "fetch_url",
	}
	excludes := []string{}

	lines := strings.Split(personaTxt, "\n")
	var cleaned []string
	for _, l := range lines {
		if strings.HasPrefix(l, "tools:") {
			tools = strings.Split(strings.TrimSpace(l[6:]), ",")
		} else if strings.HasPrefix(l, "exclude_cmd:") {
			excludes = strings.Split(strings.TrimSpace(l[12:]), ",")
		} else {
			cleaned = append(cleaned, l)
		}
	}
	return strings.Join(cleaned, "\n"), tools, excludes
}

func (c *CognitionLoop) retrieveMemories(ctx context.Context, query string) string {
	if c.DB == nil || config.Cfg == nil || config.Cfg.Embedding.APIKey == "" {
		return ""
	}

	client := embedding.NewClient()
	store := embedding.NewStore(c.DB, client)

	results, err := store.Search(ctx, query, 5)
	if err != nil || len(results) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("RELEVANT MEMORIES (auto-retrieved, always consider these before answering):\n")
	for _, r := range results {
		if r.Score < 0.3 {
			continue
		}
		sb.WriteString(fmt.Sprintf("- [%.2f] %s\n", r.Score, r.Content))
	}

	text := sb.String()
	if text == "RELEVANT MEMORIES (auto-retrieved, always consider these before answering):\n" {
		return ""
	}
	return text
}

func (c *CognitionLoop) autoStore(ctx context.Context, query, response string) {
	if c.DB == nil || config.Cfg == nil || config.Cfg.Embedding.APIKey == "" {
		return
	}

	lowerQ := strings.ToLower(query)
	skip := []string{"what is the weather", "hello", "hi ", "thanks", "thank you", "ok", "yes", "no"}
	for _, s := range skip {
		if strings.HasPrefix(lowerQ, s) && len(query) < 30 {
			return
		}
	}

	content := fmt.Sprintf("Q: %s\nA: %s", query, response)
	if len(content) > 2000 {
		content = content[:2000]
	}

	client := embedding.NewClient()
	store := embedding.NewStore(c.DB, client)

	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if _, err := store.Store(bgCtx, content, "auto", 0.3); err != nil {
			logger.Info("Memory", fmt.Sprintf("auto-store skipped: %v", err))
		}
	}()
}
