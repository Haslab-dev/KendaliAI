package intent

import (
	"strings"
)

type Intent string

const (
	IntentPlan     Intent = "PLAN"
	IntentFix      Intent = "FIX"
	IntentContinue Intent = "CONTINUE"
	IntentUndo     Intent = "UNDO"
	IntentReview   Intent = "REVIEW"
	IntentExplain  Intent = "EXPLAIN"
)

type ArtifactRef struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

type Constraint struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type IntentResolution struct {
	Intent                Intent        `json:"intent"`
	GoalID                string        `json:"goalId"`
	Confidence            float64       `json:"confidence"`
	References            []ArtifactRef `json:"references,omitempty"`
	Constraints           []Constraint  `json:"constraints,omitempty"`
	RequiresClarification bool          `json:"requiresClarification"`
	Missing               []string      `json:"missing,omitempty"`
	ResumeWorkflow        string        `json:"resumeWorkflow,omitempty"`
}

type IntentResolver struct{}

func NewIntentResolver() *IntentResolver {
	return &IntentResolver{}
}

func (ir *IntentResolver) Resolve(text string) IntentResolution {
	textLower := strings.ToLower(text)

	res := IntentResolution{
		Confidence: 0.95,
	}

	if strings.Contains(textLower, "revert") || strings.Contains(textLower, "undo") {
		res.Intent = IntentUndo
		res.GoalID = "active-goal"
	} else if strings.Contains(textLower, "fix") || strings.Contains(textLower, "error") {
		res.Intent = IntentFix
		res.GoalID = "active-goal"
		res.Constraints = append(res.Constraints, Constraint{Type: "max_attempts", Value: "3"})
	} else if strings.Contains(textLower, "explain") {
		res.Intent = IntentExplain
	} else if strings.Contains(textLower, "review") {
		res.Intent = IntentReview
	} else if strings.Contains(textLower, "continue") || strings.Contains(textLower, "proceed") {
		res.Intent = IntentContinue
	} else {
		res.Intent = IntentPlan
		if !strings.Contains(textLower, ".") {
			res.RequiresClarification = true
			res.Missing = append(res.Missing, "file_path")
		}
	}

	return res
}
