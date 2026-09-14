package gateway

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/messaging"
)

// Exact model capacity mapping for prominent foundation models
var exactModelCapacities = map[string]int{
	// 1.05M token models
	"gpt-6-astra":   1050000,
	"gpt-5-6-luna":  1050000,
	"gpt-6":         1050000,
	"gpt-5.6":       1050000,

	// 1M token models
	"deepseek-v4-flash":          1000000,
	"deepseek-v4-1-flash":        1000000,
	"deepseek-v4":                1000000,
	"glm-5-3-flash":              1000000,
	"glm-5":                      1000000,
	"mimo-v2-5":                  1000000,
	"mimo-v2":                    1000000,
	"nemotron-3-super-120b-a12b": 1000000,
	"nemotron-3-ultra-550b-a55b": 1000000,
	"nemotron-3-super":           1000000,
	"nemotron-3-ultra":           1000000,

	// 256K token models
	"gemma-4-31b":      256000,
	"gemma-4":          256000,
	"codestral-latest": 256000,
	"codestral":        256000,

	// 128K token models
	"gpt-oss-120b":                  128000,
	"gpt-oss":                       128000,
	"qwen-3.8-27b":                  128000,
	"qwen3.7-flash-2026-07-15":      128000,
	"minimax-m2.7-highspeed":        128000,
	"nemotron-3.5-lightning-30b-a3b": 128000,
	"nemotron-3-nano-omni-30b-a3b":  128000,
	"nemotron-4-340b-instruct":      128000,
	"mistral-small-latest":          128000,
	"phi-3.5-moe-instruct":          128000,
	"deepseek-r1-distill-llama-70b": 128000,
	"laguna-s-2.1":                  128000,
	"laguna-xs-2.1":                 128000,
	"ling-3.0-flash-fin":            128000,
	"north-mini-code":               128000,
	"muse-spark-1.3-contributor":    128000,
	"kira-3.5-flash":                128000,
	"agnes-2-5-flash":               128000,
}

// ModelContextCapacity maps models to their maximum input token limits
func ModelContextCapacity(modelName string) int {
	m := strings.ToLower(strings.TrimSpace(modelName))
	if m == "" {
		return 32768
	}

	// 1. Direct exact match check
	if cap, ok := exactModelCapacities[m]; ok {
		return cap
	}

	// 2. Family pattern matching - 1.05M & 1M models
	if strings.Contains(m, "gpt-6") || strings.Contains(m, "gpt-5-6") || strings.Contains(m, "gpt-5.6") || strings.Contains(m, "astra") || strings.Contains(m, "luna") {
		return 1050000
	}
	if strings.Contains(m, "deepseek-v4") || strings.Contains(m, "glm-5") || strings.Contains(m, "mimo-v2") ||
		strings.Contains(m, "nemotron-3-super") || strings.Contains(m, "nemotron-3-ultra") ||
		strings.Contains(m, "gemini") {
		return 1000000
	}

	// 3. Family pattern matching - 256K models
	if strings.Contains(m, "gemma-4") || strings.Contains(m, "codestral") {
		return 256000
	}

	// 4. Family pattern matching - 200K models
	if strings.Contains(m, "claude-3") || strings.Contains(m, "claude-3-7") || strings.Contains(m, "claude-3-5") {
		return 200000
	}

	// 5. Family pattern matching - 128K models
	if strings.Contains(m, "gpt-oss") ||
		strings.Contains(m, "qwen-3") || strings.Contains(m, "qwen3") ||
		strings.Contains(m, "minimax") ||
		strings.Contains(m, "nemotron-3.5") || strings.Contains(m, "nemotron-3-nano") || strings.Contains(m, "nemotron-4") ||
		strings.Contains(m, "mistral-small") || strings.Contains(m, "mistral-large") ||
		strings.Contains(m, "phi-3.5") || strings.Contains(m, "phi-4") ||
		strings.Contains(m, "deepseek-r1") ||
		strings.Contains(m, "laguna") || strings.Contains(m, "ling-3") || strings.Contains(m, "north-mini") ||
		strings.Contains(m, "muse-spark") || strings.Contains(m, "kira-3") || strings.Contains(m, "agnes-2") ||
		strings.Contains(m, "gpt-4o") || strings.Contains(m, "gpt-4-turbo") || strings.Contains(m, "o1") || strings.Contains(m, "o3") {
		return 128000
	}

	// 6. 64K token models
	if strings.Contains(m, "deepseek") {
		return 64000
	}

	// 7. Standard open-weights & local models (32K)
	if strings.Contains(m, "qwen") || strings.Contains(m, "llama") || strings.Contains(m, "mistral") {
		return 32768
	}

	// Default safe fallback
	return 32768
}

// EstimateTokens provides a fast, safe character-based token estimation (~4 chars/token)
func EstimateTokens(text string) int {
	if len(text) == 0 {
		return 0
	}
	return (len(text) + 3) / 4
}

// LayeredContextConfig controls context assembly limits
type LayeredContextConfig struct {
	MaxRecentWindow int
	SafeTokenBudget int
	MaxTurnChars    int
}

func ResolveContextConfig(modelName string) LayeredContextConfig {
	cap := ModelContextCapacity(modelName)
	switch {
	case cap >= 1000000:
		return LayeredContextConfig{
			MaxRecentWindow: 80,
			SafeTokenBudget: 750000,
			MaxTurnChars:    320000,
		}
	case cap >= 256000:
		return LayeredContextConfig{
			MaxRecentWindow: 50,
			SafeTokenBudget: 190000,
			MaxTurnChars:    120000,
		}
	case cap >= 200000:
		return LayeredContextConfig{
			MaxRecentWindow: 40,
			SafeTokenBudget: 150000,
			MaxTurnChars:    96000,
		}
	case cap >= 128000:
		return LayeredContextConfig{
			MaxRecentWindow: 30,
			SafeTokenBudget: 90000,
			MaxTurnChars:    64000,
		}
	case cap >= 64000:
		return LayeredContextConfig{
			MaxRecentWindow: 20,
			SafeTokenBudget: 45000,
			MaxTurnChars:    32000,
		}
	default:
		return LayeredContextConfig{
			MaxRecentWindow: 12,
			SafeTokenBudget: 22000,
			MaxTurnChars:    24000,
		}
	}
}

// AssembleLayeredContext constructs a provider/model-aware context window combining:
// 1. System Prompt & Persona
// 2. Conversation Summary & Key Decisions/Memories (from ChatSummary)
// 3. Relevant Historical Retrieval (Keyword-based semantic search across past turns)
// 4. Recent Messages Verbatim (dynamically sized up to the safe token budget)
func AssembleLayeredContext(
	ctx context.Context,
	sessionID string,
	currentPrompt string,
	sysPrompt string,
	modelName string,
	history []SessionMessage,
	store *Store,
	bus *messaging.EventBus,
) []agent.Message {
	cfg := ResolveContextConfig(modelName)
	var conversationMsgs []agent.Message

	sess, _ := store.GetSession(sessionID)
	isGroup := sess != nil && sess.Type == "group"
	rePrefix := regexp.MustCompile(`^\[[^\]]+\]:\s*`)

	// Tier 1: System Prompt
	conversationMsgs = append(conversationMsgs, agent.Message{
		Role:    "system",
		Content: sysPrompt,
	})

	totalHistoryCount := len(history)
	if totalHistoryCount == 0 {
		return conversationMsgs
	}

	// Check if history fits entirely within recent window
	if totalHistoryCount <= cfg.MaxRecentWindow {
		for _, m := range history {
			role := m.Role
			if role == "" {
				role = "user"
			}
			content := m.Content
			// Clean massive raw outputs scaled by model capacity
			if len(content) > cfg.MaxTurnChars {
				half := cfg.MaxTurnChars / 2
				content = content[:half] + "\n\n... [content trimmed for context window] ...\n\n" + content[len(content)-half:]
			}

			// Add sender tag only for group chats
			prefix := ""
			cleanContent := content
			if isGroup {
				if m.SenderName != "" && m.Role == "assistant" && !strings.HasPrefix(content, m.SenderName+":") {
					prefix = fmt.Sprintf("[%s]: ", m.SenderName)
				} else if m.SenderName != "" && m.Role == "user" && m.SenderName != "User" {
					prefix = fmt.Sprintf("[%s]: ", m.SenderName)
				}
			} else {
				cleanContent = rePrefix.ReplaceAllString(cleanContent, "")
			}

			conversationMsgs = append(conversationMsgs, agent.Message{
				Role:    role,
				Content: prefix + cleanContent,
			})
		}
		return conversationMsgs
	}

	// For long conversations: split into Older History vs Recent Window respecting both turn count and safe token budget
	splitIdx := totalHistoryCount - cfg.MaxRecentWindow
	if splitIdx < 0 {
		splitIdx = 0
	}

	// Verify that the tokens in recent window do not exceed SafeTokenBudget
	estimatedTokens := 0
	for i := totalHistoryCount - 1; i >= splitIdx; i-- {
		tLen := EstimateTokens(history[i].Content)
		if estimatedTokens+tLen > cfg.SafeTokenBudget && i < totalHistoryCount-1 {
			splitIdx = i + 1
			break
		}
		estimatedTokens += tLen
	}

	olderTurns := history[:splitIdx]
	recentTurns := history[splitIdx:]

	// Tier 2: Rolling Summary & Key Decisions
	var memoryAnchor strings.Builder
	chatSummary, _ := store.GetChatSummary(sessionID)

	memoryAnchor.WriteString("## [CONVERSATION CONTINUITY & MEMORY ANCHOR]\n")
	memoryAnchor.WriteString("This is a continuous, persistent conversation. Earlier dialogue has been compacted:\n")

	if chatSummary != nil && chatSummary.Summary != "" {
		memoryAnchor.WriteString("### Prior Summary:\n")
		memoryAnchor.WriteString(chatSummary.Summary + "\n\n")
		if len(chatSummary.KeyDecisions) > 0 {
			memoryAnchor.WriteString("### Important Decisions & Preferences:\n")
			for _, kd := range chatSummary.KeyDecisions {
				memoryAnchor.WriteString(fmt.Sprintf("- %s\n", kd))
			}
			memoryAnchor.WriteString("\n")
		}
	} else {
		// Build synthetic anchor from the tail of older turns
		memoryAnchor.WriteString("### Earlier Context Highlights:\n")
		sampleStep := 1
		if len(olderTurns) > 10 {
			sampleStep = len(olderTurns) / 8
		}
		for i := 0; i < len(olderTurns); i += sampleStep {
			ot := olderTurns[i]
			sender := "User"
			if ot.SenderName != "" {
				sender = ot.SenderName
			} else if ot.Role == "assistant" {
				sender = "Assistant"
			}
			c := strings.TrimSpace(ot.Content)
			if len(c) > 200 {
				c = c[:190] + "..."
			}
			memoryAnchor.WriteString(fmt.Sprintf("- [%s]: %s\n", sender, c))
		}
		memoryAnchor.WriteString("\n")
	}

	// Tier 3: Relevant Historical Retrieval
	// Extract keywords from current prompt (words > 4 chars)
	words := strings.Fields(strings.ToLower(currentPrompt))
	var keywords []string
	for _, w := range words {
		w = strings.Trim(w, ",.?!\"':;()[]{}")
		if len(w) >= 4 && !isStopWord(w) {
			keywords = append(keywords, w)
		}
	}

	if len(keywords) > 0 && len(olderTurns) > 0 {
		type ScoredTurn struct {
			msg   SessionMessage
			score int
		}
		var matches []ScoredTurn
		for _, ot := range olderTurns {
			low := strings.ToLower(ot.Content)
			score := 0
			for _, kw := range keywords {
				if strings.Contains(low, kw) {
					score++
				}
			}
			if score > 0 {
				matches = append(matches, ScoredTurn{msg: ot, score: score})
			}
		}

		if len(matches) > 0 {
			// Sort descending by match score
			for i := 0; i < len(matches)-1; i++ {
				for j := i + 1; j < len(matches); j++ {
					if matches[j].score > matches[i].score {
						matches[i], matches[j] = matches[j], matches[i]
					}
				}
			}
			// Top 3 relevant matches
			maxExcerpts := 3
			if len(matches) < maxExcerpts {
				maxExcerpts = len(matches)
			}
			memoryAnchor.WriteString("### Relevant Past Dialogue Excerpts (Retrieved for current query):\n")
			for i := 0; i < maxExcerpts; i++ {
				m := matches[i].msg
				sender := "User"
				if m.SenderName != "" {
					sender = m.SenderName
				} else if m.Role == "assistant" {
					sender = "Assistant"
				}
				snippet := strings.TrimSpace(m.Content)
				if len(snippet) > 300 {
					snippet = snippet[:290] + "..."
				}
				memoryAnchor.WriteString(fmt.Sprintf("- [Historical Turn - %s]: %s\n", sender, snippet))
			}
			memoryAnchor.WriteString("\n")
		}
	}

	memoryAnchor.WriteString("The active, recent conversation follows verbatim below:\n")

	// Inject memory anchor into system messages
	conversationMsgs = append(conversationMsgs, agent.Message{
		Role:    "system",
		Content: memoryAnchor.String(),
	})

	// Tier 4: Recent Turns Verbatim
	for _, m := range recentTurns {
		role := m.Role
		if role == "" {
			role = "user"
		}
		content := m.Content
		if len(content) > cfg.MaxTurnChars {
			half := cfg.MaxTurnChars / 2
			content = content[:half] + "\n\n... [content trimmed for context window] ...\n\n" + content[len(content)-half:]
		}

		prefix := ""
		cleanContent := content
		if isGroup {
			if m.SenderName != "" && m.Role == "assistant" && !strings.HasPrefix(content, m.SenderName+":") {
				prefix = fmt.Sprintf("[%s]: ", m.SenderName)
			} else if m.SenderName != "" && m.Role == "user" && m.SenderName != "User" {
				prefix = fmt.Sprintf("[%s]: ", m.SenderName)
			}
		} else {
			cleanContent = rePrefix.ReplaceAllString(cleanContent, "")
		}

		conversationMsgs = append(conversationMsgs, agent.Message{
			Role:    role,
			Content: prefix + cleanContent,
		})
	}

	// Trigger asynchronous background summarization if chat hasn't been summarized recently
	if len(olderTurns) >= 10 && (chatSummary == nil || olderTurns[len(olderTurns)-1].ID != chatSummary.LastMessageID) {
		go updateChatSummaryAsync(sessionID, olderTurns, store)
	}

	return conversationMsgs
}

func isStopWord(w string) bool {
	switch w {
	case "this", "that", "with", "from", "have", "here", "what", "when", "where", "which", "will", "would", "about", "there", "their", "please", "could", "should":
		return true
	}
	return false
}

// updateChatSummaryAsync compacts older turns into a structured summary
func updateChatSummaryAsync(sessionID string, turns []SessionMessage, store *Store) {
	if len(turns) == 0 {
		return
	}

	var sb strings.Builder
	sb.WriteString("Discussion highlights from previous turns:\n")
	decisions := make([]string, 0)

	for _, t := range turns {
		c := strings.TrimSpace(t.Content)
		if len(c) == 0 {
			continue
		}
		sender := "User"
		if t.SenderName != "" {
			sender = t.SenderName
		} else if t.Role == "assistant" {
			sender = "Assistant"
		}

		// Detect decisions or agreements
		low := strings.ToLower(c)
		if strings.Contains(low, "we decided") || strings.Contains(low, "let's go with") ||
			strings.Contains(low, "agreed to") || strings.Contains(low, "prefer to") || strings.Contains(low, "requirement:") {
			firstLine := strings.Split(c, "\n")[0]
			if len(firstLine) > 120 {
				firstLine = firstLine[:115] + "..."
			}
			decisions = append(decisions, fmt.Sprintf("[%s]: %s", sender, firstLine))
		}
	}

	// Take the first and last portions of older turns
	maxSamples := 6
	step := 1
	if len(turns) > maxSamples {
		step = len(turns) / maxSamples
	}
	for i := 0; i < len(turns); i += step {
		t := turns[i]
		sender := "User"
		if t.SenderName != "" {
			sender = t.SenderName
		}
		c := strings.TrimSpace(t.Content)
		if len(c) > 150 {
			c = c[:140] + "..."
		}
		sb.WriteString(fmt.Sprintf("- %s stated: %s\n", sender, c))
	}

	lastMsgID := turns[len(turns)-1].ID
	_ = store.SaveChatSummary(ChatSummary{
		ChatID:        sessionID,
		Summary:       sb.String(),
		KeyDecisions:  decisions,
		LastMessageID: lastMsgID,
		UpdatedAt:     time.Now().Unix(),
	})
}
