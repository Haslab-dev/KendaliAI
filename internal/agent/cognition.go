package agent

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/data"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/intelligence"
	"github.com/kendaliai/app/internal/logger"
	"github.com/kendaliai/app/internal/skills"
)

type Provider interface {
	ChatCompletion(ctx context.Context, msgs []Message) (*Response, error)
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	// Native tool-calling extensions. Empty for plain user/assistant/system
	// messages, so text-protocol callers and persisted history are unaffected.
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// ToolCall is a single native function call requested by the model.
type ToolCall struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Args is the parsed arguments object used for execution.
	Args map[string]interface{} `json:"args,omitempty"`
	// ArgsJSON preserves the provider's raw arguments JSON; used verbatim when
	// echoing the call back to the provider, even if Args failed to parse.
	ArgsJSON string `json:"args_json,omitempty"`
}

// Arguments returns the arguments as a JSON string for provider serialization.
func (tc ToolCall) Arguments() string {
	if tc.ArgsJSON != "" {
		return tc.ArgsJSON
	}
	if tc.Args == nil {
		return "{}"
	}
	b, err := json.Marshal(tc.Args)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// ToRequest adapts the call for the ExecutionEngine / registry dispatch.
func (tc ToolCall) ToRequest() ToolRequest {
	return ToolRequest{Name: tc.Name, Args: tc.Args}
}

type Response struct {
	Content      string `json:"content"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
	// Native tool-calling extension: tool calls requested instead of a final
	// answer. Empty on text-protocol responses.
	ToolCalls    []ToolCall `json:"tool_calls,omitempty"`
	FinishReason string     `json:"finish_reason,omitempty"`
}

type CognitionLoop struct {
	Provider       Provider
	MaxSteps       int
	Config         *config.Config
	DB             *sql.DB
	OnTool         func(toolName string, category string, args map[string]interface{})
	OnResponse     func(content string)
	OnStats        func(totalInput, totalOutput int)
	intelEngine    *intelligence.Engine
	dataLayer      *data.Core
	stateMachine   *intelligence.StateMachine
	readBudget     int
	readCount      int
	sessionID      string
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

func NewCognitionLoopWithDataLayer(p Provider, maxSteps int, cfg *config.Config, core *data.Core) *CognitionLoop {
	return &CognitionLoop{
		Provider:  p,
		MaxSteps:  maxSteps,
		Config:    cfg,
		dataLayer: core,
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

0. URL-BASED SKILL INSTALLS (MUST DO FIRST)
   - If the user message contains any GitHub URL: call install_skill in ONE step
   - tool: install_skill({"url": "<the exact URL from the user>"})
   - DO NOT call fetch_url, list_skills, read_file, or any other tool first
   - DO NOT browse or explore the URL — install_skill handles everything automatically
   - Use the EXACT URL the user provided as the 'url' parameter

1. ANALYZE FIRST — ALWAYS
   - For ANY coding task, your FIRST and ONLY first call MUST be:
     tool: analyze_project({"path": "<subdirectory>"})
   - If the task mentions "projects/sample-app", call analyze_project({"path":"projects/sample-app"})
   - If no subdirectory is specified, call analyze_project({})
   - This returns framework, entrypoints, components, CSS, routing — in ONE call
   - You now know EXACTLY which files matter. No more guessing.

2. PINPOINT — read only target files, ONCE
   - After analyze_project, you know every source file with exact paths
   - Read ONLY the 1-3 files you plan to edit. Full file, one call each
   - DO NOT crawl with offset/limit. Read offset=0, limit=500 to get the whole file
   - DO NOT re-read files after writing them — use verify_build instead
   - Copy-paste file paths EXACTLY from analyze_project's source_files

3. NEVER WANDER
   - DO NOT use exec("ls") or exec("find") to explore directories
   - DO NOT use search_files to list files (use the entrypoints from analyze_project)
   - DO NOT re-read the same file twice. Read it once, then edit it.
   - DO NOT read files you don't plan to edit
   - DO NOT call analyze_project more than once per request

4. SMART EDITS
   - Use "write_file" to overwrite ENTIRE files (no old_str matching — much simpler)
   - Use "apply_patch" ONLY for small targeted edits (< 10 lines of old_str)
   - If apply_patch fails with "old_str not found": retry once with a smaller unique anchor (like "function App() {")
   - NEVER use apply_patch with the entire file as old_str — it will fail due to whitespace differences
   - After editing, call verify_build to check

5. CONTROLLED SHELL USAGE
   - "exec" is a fallback tool, not primary
   - Avoid chaining shell commands unnecessarily

6. GIT TOOL RESTRICTION
   - DO NOT use git tools unless explicitly requested

7. GOAL PRESERVATION (CRITICAL)
   - Your ACTIVE GOAL is injected at the start. NEVER deviate from it.
   - Do NOT install unrelated packages, libraries, or tools.
   - Do NOT explore tangents, start new topics, or research unrelated things.
   - If a step fails, try an ALTERNATIVE approach that still serves the SAME goal.
   - After every tool call, verify: does this serve my ACTIVE GOAL?

7. TOOL ROUTING & CAPABILITY RANKING
   - Documentation tasks: Context7 (resolve-library-id → query-docs) → Exa → fetch_url
   - Latest news/search: Exa → fetch_url (GitHub API, direct URLs)
   - Known URLs: fetch_url only
   - Local files: analyze_project → resolve_symbol → read_file → search_files
   - Shell commands: exec
   - MCP servers MUST be called via: mcp_call({"server": "context7", "tool": "resolve-library-id", ...})
   - NEVER call MCP tool names as direct tools (web_search_exa, query-docs, etc. are NOT standalone)
   - Context7 args: resolve-library-id takes "libraryName" (string), query-docs takes "libraryId" and "query"
   - Exa args: web_search_exa takes "query" (string), web_fetch_exa takes "url" (string)
   - If an MCP tool returns validation error, retry ONCE with corrected args. Then fall back.
   - If Exa returns "authorization required", immediately fall back to fetch_url. Do NOT retry Exa.

8. READ BUDGET
   - You have a limited number of reads per task
   - The working set provides pre-cached context — use it
   - Only read files you will actually edit
   - Do NOT browse or explore files unnecessarily

8. SKILL INSTALLS (HIGHEST PRIORITY)
   - SKIP analyze_project for skill installs. Go directly to install_skill.
   - For ANY GitHub URL or skill URL: immediately call install_skill({"url": "..."})  
   - install_skill handles clone/fetch + import + install in ONE call
   - NEVER fetch_url individual files from GitHub for skill installs
   - Never call list_skills to check if installed — install_skill handles duplicates
   - skill_id is auto-detected. Example: install_skill({"url":"https://github.com/user/repo/tree/main/skills/my-skill"})

9. INTERACTIVE COMMANDS
   - NEVER run commands that require user input (stdin prompts).
   - Add --yes, -y, --no-prompt, or non-interactive flags.
   - Add "2>&1" to silence prompts. Pipe "yes |" or "</dev/null" if needed.
   - If a tool requests input, ABORT and report the error.

10. BOUNDED REASONING
   - If a read_file or search_files returns an error 3 times in a row, STOP and report the limitation.
   - Do NOT retry the same failing operation endlessly.
   - If permissions block a read 3 times, ask the user to adjust permissions.
   - Maximum 3 MCP retries per server per task.

11. CLEAN SLATE
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

	cwd, _ := os.Getwd()
	c.sessionID = fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("%s-%d", initialQuery, time.Now().UnixNano()))))[:16]

	c.initIntelEngine(cwd)

	if c.intelEngine != nil && c.intelEngine.GetRepoDB() != nil {
		c.intelEngine.GetRepoDB().InvalidatePromptCache()
	}

	personaText, activeToolNames, excludeCmds := c.loadPersonaConfig()

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

	workingSetContext := ""
	if c.intelEngine != nil && c.intelEngine.IsIndexed() {
		c.intelEngine.CheckAndInvalidateStaleCaches()

		ws := c.intelEngine.BuildWorkingSet(c.sessionID, initialQuery)
		c.stateMachine.WorkingSet = ws

		if len(ws.Files) > 0 {
			contents := c.intelEngine.GetFileContents(ws.Files)
			workingSetContext = c.intelEngine.FormatWorkingSetForPrompt()

			fileCtx := c.intelEngine.FormatFilesForContext(ws.Files, contents)
			compiledCtx := c.intelEngine.CompileContext(initialQuery, ws, contents)
			c.appendIntelContext(&effectiveBasePrompt, workingSetContext, fileCtx, c.intelEngine.AnalyzeProject())
			effectiveBasePrompt += "\n\nCOMPILED CONTEXT:\n" + compiledCtx
		}
		c.stateMachine.Transition(intelligence.PhaseBuildWorkingSet)
		c.stateMachine.Transition(intelligence.PhasePlan)
	}

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

	if extContext != "" && workingSetContext == "" {
		sysPrompt += "\nWORKSPACE CONTEXT AUTO-LOADED (Internal Read):\n" + extContext
	} else if workingSetContext == "" {
		sysPrompt += "\nWORKSPACE CONTEXT AUTO-LOADED: None found natively. Use analyze_project FIRST to map the codebase."
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

	sessionHash := c.computeSessionHash(sysPrompt, initialQuery, workingSetContext)
	if cached := c.checkSemanticCache(sessionHash); cached != "" {
		logger.Info("Agent", "⚡ Semantic cache hit, returning cached response")
		return cached, nil
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
		matchSpec, matchScore, _ := skills.DefaultRouter.Match(ctx, initialQuery)
		logger.Info("Agent", fmt.Sprintf("🔍 Router check: spec=%v score=%.2f", matchSpec, matchScore))
		if matchSpec != nil && matchScore > 0.6 {
			pkg, err := skills.DefaultManager.Get(matchSpec.ID)
			if err == nil && pkg.Prompt != "" {
				identityOverride := fmt.Sprintf("🎯 ROUTED TO SKILL: %s (confidence: %.2f)\n\n⚠️ YOUR PRIMARY IDENTITY IS NOW: %s\n\nIMPORTANT: You are NO LONGER a Software Engineer. Do NOT search files, read code, or use engineering tools. Act as a %s using ONLY your knowledge and the tools listed below.\n\n%s",
					matchSpec.Name, matchScore, matchSpec.Name, matchSpec.Name, pkg.Prompt)
				messages[0] = Message{Role: "system", Content: identityOverride + "\n\n---\nBASE CAPABILITIES (use only if relevant to your role):\n" + messages[0].Content}
				messages = append(messages, Message{Role: "system", Content: fmt.Sprintf("SKILL BEHAVIOR: You are a %s. Respond as a %s would. Do NOT search files, list directories, read code, or run shell commands unless essential to %s tasks.", matchSpec.Name, matchSpec.Name, matchSpec.Name)})
				if pkg.Examples != "" {
					messages = append(messages, Message{Role: "system", Content: "SKILL EXAMPLES:\n" + pkg.Examples})
				}
				logger.Info("Agent", fmt.Sprintf("🎯 Routed to skill: %s (%.2f)", matchSpec.Name, matchScore))
			}
		}
	}

	phasePrompt := ""
	if c.stateMachine != nil {
		phasePrompt = c.stateMachine.PhasePrompt()
		if phasePrompt != "" {
			messages = append(messages, Message{Role: "system", Content: phasePrompt})
		}
	}

	messages = append(messages, Message{Role: "user", Content: initialQuery})

	engine := NewExecutionEngine(5, reg)

	totalInput := 0
	totalOutput := 0
	var toolSequence []string

	for i := 0; i < c.MaxSteps; i++ {
		if c.readCount > 0 && c.readCount%5 == 0 && c.stateMachine != nil {
			messages = append(messages, Message{Role: "system", Content: fmt.Sprintf("READ BUDGET: %d/%d reads used. Prefer working set cache when possible.", c.readCount, c.readBudget)})
		}

		messages = OptimizeContext(messages, 20000)

		response, err := c.Provider.ChatCompletion(ctx, messages)
		if err != nil {
			return "", fmt.Errorf("provider err: %v", err)
		}

		response.Content = sanitizeModelOutput(response.Content)

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
			c.storeSemanticCache(sessionHash, sysPrompt, response.Content, toolSequence)
			c.storePlanAndExecution(initialQuery, response.Content, toolSequence)
			return response.Content, nil
		}

		reqs = c.enforceReadBudget(ctx, reqs, &messages, goal)

		var validReqs []ToolRequest
		for _, req := range reqs {
			c.recordToolRead(req)

			if req.Name == "request_reads" {
				justification, _ := req.Args["justification"].(string)
				c.stateMachine.RequestAdditionalReads(justification)
				logger.Info("Agent", fmt.Sprintf("📊 Read budget extended: %s (%d/%d)", justification, c.stateMachine.ReadCount, c.stateMachine.MaxReads))
				messages = append(messages, Message{Role: "user", Content: fmt.Sprintf("Read budget extended. %d reads remaining.", c.stateMachine.MaxReads-c.stateMachine.ReadCount)})
				continue
			}

			toolSequence = append(toolSequence, req.Name)

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

		for _, res := range results {
			truncResult := res.Output
			if len(truncResult) > 200 {
				truncResult = truncResult[:200] + "...(truncated)"
			}
			logger.Info("Agent", fmt.Sprintf("📦 Tool result [%s]: %s", res.Name, strings.ReplaceAll(truncResult, "\n", " ")))

			reminder := goal.Prompt()
			if c.stateMachine != nil {
				reminder += "\n" + c.stateMachine.PhasePrompt()
			}
			feedback := fmt.Sprintf("tool_result(%s):\n%s\n\nReminder: %s", res.Name, res.Output, reminder)
			messages = append(messages, Message{Role: "user", Content: feedback})
		}

		if c.stateMachine != nil && c.stateMachine.CurrentPhase() == intelligence.PhasePlan {
			for _, req := range validReqs {
				if req.Name == "apply_patch" || req.Name == "replace_range" {
					c.stateMachine.Transition(intelligence.PhaseGenerateDiff)
					c.stateMachine.Transition(intelligence.PhaseApplyPatch)
					break
				}
			}
		}

		if c.stateMachine != nil && c.stateMachine.CurrentPhase() == intelligence.PhaseApplyPatch {
			c.stateMachine.Transition(intelligence.PhaseVerifyBuild)
		}
	}

	c.storeSemanticCache(sessionHash, sysPrompt, "I hit my maximum reasoning steps limits.", toolSequence)
	return "I hit my maximum reasoning steps limits.", nil
}

func (c *CognitionLoop) initIntelEngine(cwd string) {
	c.readBudget = 10
	c.readCount = 0
	c.stateMachine = intelligence.NewStateMachine(c.readBudget)

	if c.dataLayer != nil {
		logger.Info("Agent", "📊 Using IntelligenceLayer (WorkspaceGraph + Recipes + Search)")

		go func() {
			ctx := context.Background()
			if err := c.dataLayer.Intelligence.Reindex(ctx); err != nil {
				logger.Info("Agent", fmt.Sprintf("⚠️ Index: %v", err))
				return
			}
			logger.Info("Agent", fmt.Sprintf("📊 Workspace indexed: %d files, %d symbols",
				c.dataLayer.Intelligence.Graph.FileCount(), c.dataLayer.Intelligence.Graph.SymbolCount()))
		}()
		c.stateMachine.Transition(intelligence.PhaseAnalyzeProject)
		return
	}

	engine, err := intelligence.NewEngine(cwd)
	if err != nil {
		logger.Info("Agent", fmt.Sprintf("⚠️ Intelligence engine init skipped: %v", err))
		return
	}
	c.intelEngine = engine

	if !engine.IsIndexed() {
		logger.Info("Agent", "📊 Indexing repository (first run)...")
		go func() {
			symbols, imports := engine.AnalyzeFull()
			logger.Info("Agent", fmt.Sprintf("📊 Repository indexed: %d symbols, %d imports", len(symbols), len(imports)))

			files := engine.AnalyzeProject().Entrypoints
			if len(files) > 0 {
				engine.CacheFiles(files)
			}
		}()
	}

	c.stateMachine.Transition(intelligence.PhaseAnalyzeProject)
}

func (c *CognitionLoop) appendIntelContext(basePrompt *string, wsContext, fileContext string, info *intelligence.ProjectInfo) {
	*basePrompt += "\n## REPOSITORY INTELLIGENCE (pre-indexed)\n"
	*basePrompt += fmt.Sprintf("Framework: %s | Language: %s | CSS: %s | Build: %s\n",
		info.Framework, info.Language, info.CSS, info.BuildTool)
	if len(info.Entrypoints) > 0 {
		*basePrompt += fmt.Sprintf("Entrypoints: %s\n", strings.Join(info.Entrypoints, ", "))
	}
	*basePrompt += fmt.Sprintf("\n%s\n", wsContext)
	if fileContext != "" {
		*basePrompt += fileContext
	}
}

func (c *CognitionLoop) enforceReadBudget(ctx context.Context, reqs []ToolRequest, messages *[]Message, goal *ActiveGoal) []ToolRequest {
	var allowed []ToolRequest
	var blocked []string
	pending := 0

	for _, req := range reqs {
		if req.Name == "read_file" || req.Name == "search_files" {
			canRead, msg := c.stateMachine.CanRead()
			effective := c.stateMachine.ReadCount + pending
			if !canRead || effective >= c.stateMachine.MaxReads {
				path, _ := req.Args["path"].(string)
				if path == "" {
					path, _ = req.Args["query"].(string)
				}
				blocked = append(blocked, fmt.Sprintf("%s (%s)", req.Name, path))
				logger.Info("Agent", fmt.Sprintf("📊 Read budget exhausted blocking %s: %s", req.Name, msg))
				continue
			}
			pending++
		}
		allowed = append(allowed, req)
	}

	if len(blocked) > 0 {
		*messages = append(*messages, Message{Role: "user", Content: fmt.Sprintf(
			"READ BUDGET EXHAUSTED (%d/%d). Blocked: %s\n\nUse working set cache or request additional reads with justification: tool: request_reads({\"justification\": \"why you need more file reads\"})",
			c.stateMachine.ReadCount, c.stateMachine.MaxReads, strings.Join(blocked, ", "))})
	}

	return allowed
}

func (c *CognitionLoop) recordToolRead(req ToolRequest) {
	if req.Name == "read_file" || req.Name == "search_files" {
		path, _ := req.Args["path"].(string)
		if path == "" {
			path, _ = req.Args["query"].(string)
		}
		c.readCount++
		c.stateMachine.RecordRead(path)
	}
}

func (c *CognitionLoop) computeSessionHash(sysPrompt, query, wsContext string) string {
	h := sha256.New()
	h.Write([]byte(sysPrompt))
	h.Write([]byte(query))
	h.Write([]byte(wsContext))
	return hex.EncodeToString(h.Sum(nil))
}

func (c *CognitionLoop) checkSemanticCache(hash string) string {
	if c.intelEngine == nil {
		return ""
	}
	entry := c.intelEngine.GetSemanticCache().Lookup(hash)
	if entry != nil {
		return entry.Response
	}
	return ""
}

func (c *CognitionLoop) storeSemanticCache(hash, prompt, response string, toolSequence []string) {
	if c.intelEngine == nil || len(toolSequence) == 0 {
		return
	}
	sc := c.intelEngine.GetSemanticCache()
	if sc != nil {
		sc.Store(hash, prompt, response, toolSequence)
	}
}

func (c *CognitionLoop) storePlanAndExecution(goal, response string, toolSequence []string) {
	if c.intelEngine == nil {
		return
	}
	dag := strings.Join(toolSequence, " → ")
	c.intelEngine.StorePlan(goal, dag, strings.Join(toolSequence, ","), response)

	execEntry := &intelligence.ExecutionCacheEntry{
		SessionID:   c.sessionID,
		Goal:        goal,
		Phases:      c.stateMachine.CurrentPhase().String(),
		ToolTrace:   strings.Join(toolSequence, ","),
		FilesEdited: strings.Join(c.stateMachine.FilesReadSlice(), ","),
		Success:     true,
	}
	c.intelEngine.StoreExecution(execEntry)
}

func sanitizeModelOutput(content string) string {
	stripTags := []string{"ClaudeThought", "AlignedMCPAnalyze", "environment_details", "ClaudeAnswer", "function_debug", "function", "thinking", "invoke", "tool_calls", "parameter"}
	for _, tag := range stripTags {
		re := regexp.MustCompile(`(?s)<` + tag + `[^>]*>.*?</` + tag + `>`)
		content = re.ReplaceAllString(content, "")
		content = strings.ReplaceAll(content, "<"+tag+">", "")
		content = strings.ReplaceAll(content, "</"+tag+">", "")
		content = strings.ReplaceAll(content, "<"+tag+"/>", "")
	}
	lines := strings.Split(content, "\n")
	var cleaned []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "<") && strings.HasSuffix(line, "/>") && !strings.HasPrefix(line, "tool:") {
			continue
		}
		cleaned = append(cleaned, line)
	}
	return strings.Join(cleaned, "\n")
}

func (c *CognitionLoop) loadPersonaConfig() (string, []string, []string) {
	homeDir, _ := os.UserHomeDir()
	content, err := os.ReadFile(homeDir + "/.kendaliai/Persona.md")
	if err != nil {
		return "", []string{"exec", "read_file", "list_files", "search_files",
			"apply_patch", "replace_range", "write_file",
			"upload_object", "download_object", "list_objects", "delete_object",
			"create_skill", "list_skills", "delete_skill", "update_skill",
			"remember_timeline",
			"git_status", "git_diff", "git_apply_patch",
			"run_tests", "validate_syntax", "fetch_url",
			"analyze_project", "resolve_symbol", "get_imports", "verify_build"}, nil
	}

	personaTxt := string(content)
	tools := []string{
		"exec", "read_file", "list_files", "search_files",
		"apply_patch", "replace_range", "write_file",
		"upload_object", "download_object", "list_objects", "delete_object",
		"git_status", "git_diff", "git_apply_patch",
		"run_tests", "validate_syntax", "fetch_url",
		"analyze_project", "resolve_symbol", "get_imports", "verify_build",
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
