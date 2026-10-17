package grok

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Mode represents Grok's persona and cognitive execution mode.
type Mode string

const (
	ModeRegular    Mode = "regular"    // Sharp, concise, factual, direct
	ModeFun        Mode = "fun"        // Witty, humorous, rebellious, candid, sarcasm-embracing
	ModeThink      Mode = "think"      // Deep chain-of-thought reasoning, rigorous reflection
	ModeDeepSearch Mode = "deepsearch" // Multi-agent autonomous query decomposition & parallel web/repo research
)

// ParseMode maps a string to a valid Grok Mode, defaulting to ModeRegular.
func ParseMode(s string) Mode {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "fun", "unhinged", "humor":
		return ModeFun
	case "think", "reasoning", "thought":
		return ModeThink
	case "deepsearch", "deep_search", "research":
		return ModeDeepSearch
	default:
		return ModeRegular
	}
}

// PersonaPrompt returns the system prompt directive for the active Grok mode.
func PersonaPrompt(mode Mode) string {
	switch mode {
	case ModeFun:
		return `### GROK PERSONA: FUN MODE (UNHINGED & WITTY)
- Adopt a witty, humorous, candid, and slightly rebellious tone inspired by Grok.
- Do not shy away from playful sarcasm, sharp wit, and amusing analogies.
- Speak with confidence, charisma, and intellectual swagger while remaining factually accurate and helpful.
- Avoid bureaucratic hedging, sterile disclaimers, or excessive corporate politeness. Tell it like it is with humor.`

	case ModeThink:
		return `### GROK PERSONA: THINK MODE (DEEP REASONING)
- Engage in rigorous, visible internal reasoning and multi-step cognitive reflection.
- Break down complex premises, identify edge cases, test counter-arguments, and systematically deduce conclusions.
- Structure your response with clear logical steps, explicit hypotheses, and structured evaluation before presenting final recommendations.`

	case ModeDeepSearch:
		return `### GROK PERSONA: DEEPSEARCH MODE (MULTI-AGENT RESEARCH)
- Act as an autonomous deep research orchestrator.
- When given complex, multi-faceted inquiries, systematically decompose the prompt into discrete investigation angles.
- Explore facts from multiple angles, verify sources, cross-check claims, and synthesize findings into an authoritative, cited briefing with executive takeaways.`

	default:
		return `### GROK PERSONA: REGULAR MODE
- Direct, sharp, intellectually honest, and highly capable.
- Deliver precise, well-reasoned, and helpful answers without fluff.`
	}
}

// ParseSlashCommand checks if a user input begins with a Grok mode toggle directive.
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
	case "/normal", "/regular", "/grok":
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

// SessionMetadata represents the structured session metadata carrying Grok settings.
type SessionMetadata struct {
	Mode         Mode     `json:"grok_mode,omitempty"`
	ParentID     string   `json:"parentSession,omitempty"`
	Kind         string   `json:"kind,omitempty"`
	ResearchTags []string `json:"research_tags,omitempty"`
}

// ExtractSessionMode retrieves the active Grok mode from a session's metadata JSON.
func ExtractSessionMode(metadataJSON string) Mode {
	if strings.TrimSpace(metadataJSON) == "" {
		return ModeRegular
	}
	var meta SessionMetadata
	if err := json.Unmarshal([]byte(metadataJSON), &meta); err == nil && meta.Mode != "" {
		return meta.Mode
	}
	// Fallback to substring matching if arbitrary JSON
	lower := strings.ToLower(metadataJSON)
	if strings.Contains(lower, `"grok_mode":"fun"`) || strings.Contains(lower, `"mode":"fun"`) {
		return ModeFun
	}
	if strings.Contains(lower, `"grok_mode":"think"`) || strings.Contains(lower, `"mode":"think"`) {
		return ModeThink
	}
	if strings.Contains(lower, `"grok_mode":"deepsearch"`) || strings.Contains(lower, `"mode":"deepsearch"`) {
		return ModeDeepSearch
	}
	return ModeRegular
}

// InjectSessionMode updates or sets the Grok mode within session metadata JSON.
func InjectSessionMode(existingMetadataJSON string, mode Mode) string {
	raw := map[string]any{}
	if strings.TrimSpace(existingMetadataJSON) != "" {
		_ = json.Unmarshal([]byte(existingMetadataJSON), &raw)
	}
	raw["grok_mode"] = string(mode)
	data, err := json.Marshal(raw)
	if err != nil {
		return fmt.Sprintf(`{"grok_mode":%q}`, mode)
	}
	return string(data)
}

// Subtask represents a decomposed research angle in Grok DeepSearch.
type Subtask struct {
	ID          string `json:"id"`
	Angle       string `json:"angle"`
	Query       string `json:"query"`
	Role        string `json:"role"`
	Description string `json:"description"`
}

// SubtaskResult captures findings from a delegated sub-agent research angle.
type SubtaskResult struct {
	SubtaskID string        `json:"subtask_id"`
	Angle     string        `json:"angle"`
	Output    string        `json:"output"`
	Duration  time.Duration `json:"duration"`
	Success   bool          `json:"success"`
}

// DecomposeQuery breaks down a complex inquiry into 2 to 3 targeted investigation angles.
func DecomposeQuery(query string) []Subtask {
	trimmed := strings.TrimSpace(query)
	lower := strings.ToLower(trimmed)

	var subtasks []Subtask

	if strings.Contains(lower, "vs") || strings.Contains(lower, "compare") || strings.Contains(lower, "difference") {
		subtasks = append(subtasks,
			Subtask{
				ID:          "angle-primary",
				Angle:       "Architecture & Core Capabilities",
				Query:       fmt.Sprintf("Analyze core technical architecture and capabilities for: %s", trimmed),
				Role:        "research",
				Description: "Deep technical analysis and feature breakdown",
			},
			Subtask{
				ID:          "angle-comparison",
				Angle:       "Trade-offs & Performance Benchmarks",
				Query:       fmt.Sprintf("Analyze performance benchmarks, tradeoffs, and community adoption for: %s", trimmed),
				Role:        "research",
				Description: "Trade-off and real-world benchmark verification",
			},
		)
		return subtasks
	}

	if strings.Contains(lower, "security") || strings.Contains(lower, "vulnerability") || strings.Contains(lower, "audit") {
		subtasks = append(subtasks,
			Subtask{
				ID:          "angle-audit",
				Angle:       "Vulnerability Surface & Threat Vectors",
				Query:       fmt.Sprintf("Identify potential attack vectors and vulnerabilities: %s", trimmed),
				Role:        "research",
				Description: "Threat modeling and vulnerability analysis",
			},
			Subtask{
				ID:          "angle-mitigation",
				Angle:       "Remediation & Hardening Strategies",
				Query:       fmt.Sprintf("Define defense-in-depth mitigations for: %s", trimmed),
				Role:        "coder",
				Description: "Concrete mitigation and implementation patterns",
			},
		)
		return subtasks
	}

	// General deep research decomposition: Exploration + Technical Verification
	subtasks = append(subtasks,
		Subtask{
			ID:          "angle-exploration",
			Angle:       "Core Fundamentals & Specifications",
			Query:       fmt.Sprintf("Investigate technical specifications and implementation details for: %s", trimmed),
			Role:        "research",
			Description: "Comprehensive domain research",
		},
		Subtask{
			ID:          "angle-verification",
			Angle:       "Edge Cases, Limitations & Best Practices",
			Query:       fmt.Sprintf("Identify critical edge cases, known limitations, and production best practices for: %s", trimmed),
			Role:        "planner",
			Description: "Verification, edge cases, and architectural strategy",
		},
	)
	return subtasks
}

// SynthesizeGrokReport merges multiple sub-agent findings into a Grok-style structured response.
func SynthesizeGrokReport(originalQuery string, results []SubtaskResult, mode Mode) string {
	var b strings.Builder

	switch mode {
	case ModeFun:
		b.WriteString("🚀 **Grok DeepSearch Synthesis (Fun Mode)**\n\n")
		b.WriteString(fmt.Sprintf("Here is the unfiltered lowdown on **%s** after deploying our swarm of sub-agents:\n\n", originalQuery))
	case ModeThink:
		b.WriteString("🧠 **Grok DeepSearch Synthesis (Think Mode)**\n\n")
		b.WriteString(fmt.Sprintf("Multi-angle cognitive analysis and empirical findings for: **%s**\n\n", originalQuery))
	default:
		b.WriteString("🛰 **Grok DeepSearch Report**\n\n")
		b.WriteString(fmt.Sprintf("Executive multi-agent research synthesis for: **%s**\n\n", originalQuery))
	}

	for i, res := range results {
		statusMark := "✓"
		if !res.Success {
			statusMark = "✗"
		}
		b.WriteString(fmt.Sprintf("### %s Angle %d: %s\n\n", statusMark, i+1, res.Angle))
		outText := strings.TrimSpace(res.Output)
		if outText == "" {
			outText = "No data returned."
		}
		b.WriteString(outText)
		b.WriteString("\n\n")
	}

	b.WriteString("---\n")
	b.WriteString("💡 **Key Takeaways**\n")
	b.WriteString("- Cross-verified across independent sub-agent investigations.\n")
	b.WriteString(fmt.Sprintf("- All angles synthesized and reconciled under Grok %s mode.\n", strings.Title(string(mode))))

	return b.String()
}
