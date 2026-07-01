package review

import (
	"bytes"
	"fmt"
	"os"
)

type Issue struct {
	File     string `json:"file"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

type ReviewEngine struct {
	analyzers []func(path string) ([]Issue, error)
}

func NewReviewEngine() *ReviewEngine {
	re := &ReviewEngine{}
	re.analyzers = append(re.analyzers, func(path string) ([]Issue, error) {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}

		var issues []Issue
		if bytes.Contains(data, []byte("api_key")) || bytes.Contains(data, []byte("password")) {
			issues = append(issues, Issue{
				File:     path,
				Message:  "Potential secret leak: hardcoded credential pattern found",
				Severity: "high",
			})
		}
		return issues, nil
	})
	return re
}

func (re *ReviewEngine) Scan(path string) ([]Issue, error) {
	var allIssues []Issue
	for _, analyzer := range re.analyzers {
		issues, err := analyzer(path)
		if err != nil {
			return nil, fmt.Errorf("analyzer failed: %w", err)
		}
		allIssues = append(allIssues, issues...)
	}
	return allIssues, nil
}
