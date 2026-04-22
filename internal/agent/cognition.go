package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/logger"
)

type Provider interface {
	ChatCompletion(ctx context.Context, msgs []Message) (*Response, error)
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Response struct {
	Content string `json:"content"`
}

type CognitionLoop struct {
	Provider Provider
	MaxSteps int
	OnTool   func(toolName string, args map[string]interface{})
}

func NewCognitionLoop(p Provider, maxSteps int) *CognitionLoop {
	return &CognitionLoop{
		Provider: p,
		MaxSteps: maxSteps,
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
tool: TOOL_NAME({"arg": "value"})

Rules:
- One tool per line
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

## DECISION HEURISTICS

Prefer:

- search → read → edit → validate

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
	reg := GetToolRegistry(excludeCmds, cwd)

	repStr := ""
	for _, tName := range activeToolNames {
		tName = strings.TrimSpace(tName)
		if tool, ok := reg[tName]; ok {
			repStr += "TOOL\n===\n"
			repStr += fmt.Sprintf("Name: %s\nDescription: %s\nSignature: %s\n\n", tool.Name, tool.Description, tool.Signature)
		}
	}
	sysPrompt := strings.Replace(baseSystemPrompt, "{tool_list_repr}", repStr, 1)
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

	messages := []Message{{Role: "system", Content: sysPrompt}, {Role: "user", Content: initialQuery}}

	// Spin up a 5-thread worker pool natively executing sandboxed ops
	engine := NewExecutionEngine(5, reg)

	for i := 0; i < c.MaxSteps; i++ {
		// Optimize limits before inference (Sliding window / Chunking enforcement)
		messages = OptimizeContext(messages, 20000)

		response, err := c.Provider.ChatCompletion(ctx, messages)
		if err != nil {
			return "", fmt.Errorf("provider err: %v", err)
		}

		messages = append(messages, Message{Role: "assistant", Content: response.Content})

		// 1. Planning Layer parses parallel commands
		reqs := ParseActionPlan(response.Content)
		if len(reqs) > 0 {
			for _, req := range reqs {
				if c.OnTool != nil {
					c.OnTool(req.Name, req.Args)
				}
				logger.Info("Agent", fmt.Sprintf("⚙️ Scheduling %s args: %v", req.Name, req.Args))
			}

			// 2. Scheduler invokes parallel go-routines execution natively
			results := engine.ExecuteParallel(ctx, reqs)

			// 3. State Sync / Re-feed
			for _, res := range results {
				messages = append(messages, Message{Role: "user", Content: fmt.Sprintf("tool_result(%s):\n%s", res.Name, res.Output)})
			}
			continue
		}

		logger.Info("Agent", "✅ Cognition Loop completed")
		return response.Content, nil
	}
	return "I hit my maximum reasoning steps limits.", nil
}

func (c *CognitionLoop) loadPersonaConfig() (string, []string, []string) {
	homeDir, _ := os.UserHomeDir()
	content, err := os.ReadFile(homeDir + "/.kendaliai/Persona.md")
	if err != nil {
		return "", []string{"exec", "read_file_chunked"}, nil
	}

	personaTxt := string(content)
	// Base required semantic tools expanded to encompass the entire Production 15-system scale
	tools := []string{
		"exec", "read_file", "list_files", "search_files",
		"apply_patch", "replace_range",
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
