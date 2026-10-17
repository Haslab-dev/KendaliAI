package botmode

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Mode represents the persona and cognitive execution mode.
type Mode string

const (
	ModeRegular    Mode = "regular"    // Sharp, concise, factual, direct
	ModeFun        Mode = "fun"        // Witty, humorous, candid, sarcasm-embracing
	ModeThink      Mode = "think"      // Deep chain-of-thought reasoning, rigorous reflection
	ModeDeepSearch Mode = "deepsearch" // Multi-agent autonomous query decomposition & parallel research
)

// ParseMode maps a string to a valid Mode, defaulting to ModeRegular.
func ParseMode(s string) Mode {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "fun", "unhinged", "humor", "witty":
		return ModeFun
	case "think", "reasoning", "thought", "deep":
		return ModeThink
	case "deepsearch", "deep_search", "research", "search":
		return ModeDeepSearch
	default:
		return ModeRegular
	}
}

// PersonaPrompt returns the system prompt directive for the active persona mode.
func PersonaPrompt(mode Mode) string {
	switch mode {
	case ModeFun:
		return `### PERSONA MODE: FUN (WITTY & UNFILTERED)
- Adopt a witty, humorous, candid, and sharp tone.
- Do not shy away from playful sarcasm, clever humor, and amusing analogies.
- Speak with confidence, charisma, and intellectual swagger while remaining factually accurate and helpful.
- Avoid bureaucratic hedging, sterile disclaimers, or excessive corporate politeness. Tell it like it is with humor.`

	case ModeThink:
		return `### PERSONA MODE: THINK (DEEP REASONING)
- Engage in rigorous, visible internal reasoning and multi-step cognitive reflection.
- Break down complex premises, identify edge cases, test counter-arguments, and systematically deduce conclusions.
- Structure your response with clear logical steps, explicit hypotheses, and structured evaluation before presenting final recommendations.`

	case ModeDeepSearch:
		return `### PERSONA MODE: DEEPSEARCH (MULTI-AGENT RESEARCH)
- Act as an autonomous deep research orchestrator.
- When given complex, multi-faceted inquiries, systematically decompose the prompt into discrete investigation angles.
- Explore facts from multiple angles, verify sources, cross-check claims, and synthesize findings into an authoritative, cited briefing with executive takeaways.`

	default:
		return `### PERSONA MODE: REGULAR
- Direct, sharp, intellectually honest, and highly capable.
- Deliver precise, well-reasoned, and helpful answers without fluff.`
	}
}

// ParseSlashCommand checks if a user input begins with a mode toggle directive.
// E.g.: "/fun tell me a joke" -> mode=ModeFun, remaining="tell me a joke", isCmd=true
// E.g.: "/mode think analyze this" -> mode=ModeThink, remaining="analyze this", isCmd=true
func ParseSlashCommand(input string) (Mode, string, bool) {
	trimmed := strings.TrimSpace(input)
	if !strings.HasPrefix(trimmed, "/") {
		return ModeRegular, input, false
	}

	parts := strings.SplitN(trimmed, " ", 2)
	cmd := strings.ToLower(parts[0])
	remaining := ""
	if len(parts) > 1 {
		remaining = strings.TrimSpace(parts[1])
	}

	switch cmd {
	case "/fun", "/unhinged":
		return ModeFun, remaining, true
	case "/think", "/reason":
		return ModeThink, remaining, true
	case "/deepsearch", "/research":
		return ModeDeepSearch, remaining, true
	case "/normal", "/regular", "/standard":
		return ModeRegular, remaining, true
	case "/mode":
		if remaining == "" {
			return ModeRegular, "", true
		}
		modeParts := strings.SplitN(remaining, " ", 2)
		m := ParseMode(modeParts[0])
		rest := ""
		if len(modeParts) > 1 {
			rest = strings.TrimSpace(modeParts[1])
		}
		return m, rest, true
	default:
		return ModeRegular, input, false
	}
}

// SessionMetadata represents structured session metadata carrying bot mode settings.
type SessionMetadata struct {
	ParentSession string   `json:"parentSession,omitempty"`
	Kind          string   `json:"kind,omitempty"`
	Mode          Mode     `json:"bot_mode,omitempty"`
	ActiveRoles   []string `json:"active_roles,omitempty"`
}

// ExtractSessionMode retrieves the active mode from a session's metadata JSON.
func ExtractSessionMode(metadataJSON string) Mode {
	if strings.TrimSpace(metadataJSON) == "" {
		return ModeRegular
	}
	lower := strings.ToLower(metadataJSON)
	if strings.Contains(lower, `"bot_mode":"fun"`) || strings.Contains(lower, `"mode":"fun"`) || strings.Contains(lower, `"grok_mode":"fun"`) {
		return ModeFun
	}
	if strings.Contains(lower, `"bot_mode":"think"`) || strings.Contains(lower, `"mode":"think"`) || strings.Contains(lower, `"grok_mode":"think"`) {
		return ModeThink
	}
	if strings.Contains(lower, `"bot_mode":"deepsearch"`) || strings.Contains(lower, `"mode":"deepsearch"`) || strings.Contains(lower, `"grok_mode":"deepsearch"`) {
		return ModeDeepSearch
	}

	var meta map[string]interface{}
	if err := json.Unmarshal([]byte(metadataJSON), &meta); err == nil {
		for _, key := range []string{"bot_mode", "mode", "grok_mode"} {
			if v, ok := meta[key]; ok {
				if s, ok := v.(string); ok {
					return ParseMode(s)
				}
			}
		}
	}
	return ModeRegular
}

// InjectSessionMode updates or sets the mode within session metadata JSON.
func InjectSessionMode(existingJSON string, mode Mode) string {
	raw := make(map[string]interface{})
	if strings.TrimSpace(existingJSON) != "" {
		_ = json.Unmarshal([]byte(existingJSON), &raw)
	}
	raw["bot_mode"] = string(mode)
	delete(raw, "grok_mode") // clean up legacy naming
	bytes, err := json.Marshal(raw)
	if err != nil {
		return fmt.Sprintf(`{"bot_mode":%q}`, mode)
	}
	return string(bytes)
}

// Subtask represents a decomposed research angle for parallel execution.
type Subtask struct {
	ID    string `json:"id"`
	Role  string `json:"role"`
	Angle string `json:"angle"`
	Query string `json:"query"`
}

// SubtaskResult contains the research deliverable from an individual sub-agent.
type SubtaskResult struct {
	SubtaskID string
	Angle     string
	Output    string
	Duration  time.Duration
	Success   bool
}

// DecomposeQuery splits a complex inquiry into orthogonal parallel research subtasks.
func DecomposeQuery(query string) []Subtask {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return nil
	}

	return []Subtask{
		{
			ID:    "sub-fact-check",
			Role:  "researcher",
			Angle: "Core Facts & Verified Timeline",
			Query: fmt.Sprintf("Conduct thorough factual verification on: %q. Identify established facts, primary sources, specifications, and chronological timeline. Be precise.", trimmed),
		},
		{
			ID:    "sub-technical-deepdive",
			Role:  "coder",
			Angle: "Technical & Architectural Analysis",
			Query: fmt.Sprintf("Perform technical analysis on: %q. Examine mechanics, code patterns, benchmarks, trade-offs, and failure modes.", trimmed),
		},
		{
			ID:    "sub-counter-analysis",
			Role:  "reviewer",
			Angle: "Critical Counter-Arguments & Edge Cases",
			Query: fmt.Sprintf("Identify counter-arguments, dissenting perspectives, security implications, and edge cases regarding: %q.", trimmed),
		},
	}
}

// SynthesizeReport merges multiple sub-agent findings into a structured response.
func SynthesizeReport(originalQuery string, results []SubtaskResult, mode Mode) string {
	var b strings.Builder

	switch mode {
	case ModeFun:
		b.WriteString("🚀 **DeepSearch Synthesis (Fun Mode)**\n\n")
		b.WriteString(fmt.Sprintf("Decomposed and investigated **%q** across %d parallel intelligence angles.\n\n", originalQuery, len(results)))
	case ModeThink:
		b.WriteString("🧠 **DeepSearch Synthesis (Think Mode)**\n\n")
		b.WriteString(fmt.Sprintf("Systematic multi-agent decomposition and synthesis for inquiry: **%q**.\n\n", originalQuery))
	default:
		b.WriteString("🛰 **DeepSearch Research Report**\n\n")
		b.WriteString(fmt.Sprintf("Comprehensive investigation report for: **%q**\n\n", originalQuery))
	}

	b.WriteString("### Executive Takeaways\n")
	for i, r := range results {
		status := "✅ Completed"
		if !r.Success {
			status = "⚠️ Partial"
		}
		b.WriteString(fmt.Sprintf("%d. **%s** (%s, %s)\n", i+1, r.Angle, status, r.Duration.Round(time.Millisecond)))
	}
	b.WriteString("\n---\n\n")

	for _, r := range results {
		b.WriteString(fmt.Sprintf("### Angle: %s\n", r.Angle))
		if strings.TrimSpace(r.Output) != "" {
			b.WriteString(strings.TrimSpace(r.Output))
		} else {
			b.WriteString("_No findings returned for this angle._")
		}
		b.WriteString("\n\n")
	}

	b.WriteString("---\n")
	b.WriteString(fmt.Sprintf("_Synthesized across %d autonomous sub-agents in %s mode._\n", len(results), strings.Title(string(mode))))
	return b.String()
}
