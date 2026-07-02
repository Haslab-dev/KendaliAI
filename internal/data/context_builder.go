package data

import (
	"fmt"
	"strings"
)

type ContextLayer int

const (
	LayerGoal ContextLayer = iota
	LayerWorkingSet
	LayerRepoMeta
	LayerSummaries
	LayerCode
	LayerConversation
	LayerMemory
)

type ContextBuilder struct {
	goal          string
	workingSet    []string
	repoMeta      string
	summaries     map[string]string
	codeBlocks    map[string]string
	conversation  []string
	memories      []string
	maxTokens     int
	tokenEstimate int
}

func NewContextBuilder(maxTokens int) *ContextBuilder {
	if maxTokens <= 0 {
		maxTokens = 32000
	}
	return &ContextBuilder{
		maxTokens:    maxTokens,
		summaries:    map[string]string{},
		codeBlocks:   map[string]string{},
	}
}

func (cb *ContextBuilder) SetGoal(goal string) *ContextBuilder {
	cb.goal = goal
	cb.tokenEstimate += estimateTokens(goal)
	return cb
}

func (cb *ContextBuilder) SetWorkingSet(files []string) *ContextBuilder {
	cb.workingSet = files
	for _, f := range files {
		cb.tokenEstimate += estimateTokens(f)
	}
	return cb
}

func (cb *ContextBuilder) SetRepoMeta(meta string) *ContextBuilder {
	cb.repoMeta = meta
	cb.tokenEstimate += estimateTokens(meta)
	return cb
}

func (cb *ContextBuilder) AddSummary(file, summary string) *ContextBuilder {
	cb.summaries[file] = summary
	cb.tokenEstimate += estimateTokens(summary)
	return cb
}

func (cb *ContextBuilder) AddCode(file, code string) *ContextBuilder {
	if cb.tokenEstimate > cb.maxTokens {
		return cb
	}
	cb.codeBlocks[file] = truncateCode(code, cb.maxTokens-cb.tokenEstimate)
	cb.tokenEstimate += estimateTokens(cb.codeBlocks[file])
	return cb
}

func (cb *ContextBuilder) AddConversationTurn(turn string) *ContextBuilder {
	cb.conversation = append(cb.conversation, turn)
	cb.tokenEstimate += estimateTokens(turn)
	return cb
}

func (cb *ContextBuilder) AddMemory(mem string) *ContextBuilder {
	cb.memories = append(cb.memories, mem)
	cb.tokenEstimate += estimateTokens(mem)
	return cb
}

func (cb *ContextBuilder) Budget() (used, max int) {
	return cb.tokenEstimate, cb.maxTokens
}

func (cb *ContextBuilder) Build() string {
	var ctx strings.Builder

	ctx.WriteString(fmt.Sprintf("GOAL: %s\n\n", cb.goal))

	if len(cb.workingSet) > 0 {
		ctx.WriteString(fmt.Sprintf("WORKING SET (%d files):\n", len(cb.workingSet)))
		for _, f := range cb.workingSet {
			ctx.WriteString(fmt.Sprintf("  %s", f))
			if s, ok := cb.summaries[f]; ok {
				ctx.WriteString(fmt.Sprintf(" — %s", s))
			}
			ctx.WriteString("\n")
		}
		ctx.WriteString("\n")
	}

	if cb.repoMeta != "" {
		ctx.WriteString(fmt.Sprintf("REPOSITORY: %s\n\n", cb.repoMeta))
	}

	if len(cb.codeBlocks) > 0 {
		for file, code := range cb.codeBlocks {
			ctx.WriteString(fmt.Sprintf("### %s\n```\n%s\n```\n\n", file, code))
		}
	}

	if len(cb.conversation) > 0 {
		ctx.WriteString("RECENT CONTEXT:\n")
		for _, turn := range cb.conversation {
			ctx.WriteString(turn + "\n")
		}
		ctx.WriteString("\n")
	}

	if len(cb.memories) > 0 {
		ctx.WriteString("MEMORIES:\n")
		for _, mem := range cb.memories {
			ctx.WriteString(fmt.Sprintf("- %s\n", mem))
		}
		ctx.WriteString("\n")
	}

	return ctx.String()
}

func (cb *ContextBuilder) IsOverBudget() bool {
	return cb.tokenEstimate > cb.maxTokens
}

func estimateTokens(s string) int {
	return len(s) / 4
}

func truncateCode(code string, maxTokens int) string {
	maxBytes := maxTokens * 4
	if len(code) <= maxBytes {
		return code
	}
	return code[:maxBytes] + "\n// ...(truncated)"
}
