package review

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Issue represents a discovered code quality, security, or syntax defect.
type Issue struct {
	File        string `json:"file"`
	Line        int    `json:"line,omitempty"`
	Message     string `json:"message"`
	Severity    string `json:"severity"` // "high", "medium", "low", "info"
	Category    string `json:"category"` // "security", "secret", "bug", "style"
	CodeSnippet string `json:"codeSnippet,omitempty"`
	Suggestion  string `json:"suggestion,omitempty"`
}

// ReviewReport contains structured results from a review run.
type ReviewReport struct {
	Target       string    `json:"target"`
	Summary      string    `json:"summary"`
	Issues       []Issue   `json:"issues"`
	HighCount    int       `json:"highCount"`
	MediumCount  int       `json:"mediumCount"`
	LowCount     int       `json:"lowCount"`
	Clean        bool      `json:"clean"`
	ReviewedAt   time.Time `json:"reviewedAt"`
}

// Rule defines an automated check pattern.
type Rule struct {
	ID          string
	Category    string
	Severity    string
	Pattern     *regexp.Regexp
	Message     string
	Suggestion  string
}

// ReviewEngine inspects code diffs and files for security risks, secret leaks, and defects.
type ReviewEngine struct {
	rules []Rule
}

func NewReviewEngine() *ReviewEngine {
	re := &ReviewEngine{}
	re.initRules()
	return re
}

func (re *ReviewEngine) initRules() {
	re.rules = []Rule{
		{
			ID:       "SEC-001",
			Category: "secret",
			Severity: "high",
			Pattern:  regexp.MustCompile(`(?i)(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{12,}["']`),
			Message:  "Potential hardcoded secret or API key detected",
			Suggestion: "Extract secret into environment variables or a secure key store (.env / secret manager).",
		},
		{
			ID:       "SEC-002",
			Category: "secret",
			Severity: "high",
			Pattern:  regexp.MustCompile(`-----BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----`),
			Message:  "Private cryptographic key file or block found in code",
			Suggestion: "Never commit private keys to version control. Add to .gitignore immediately.",
		},
		{
			ID:       "SEC-003",
			Category: "security",
			Severity: "high",
			Pattern:  regexp.MustCompile(`(?i)(exec\.Command\([^,]+,\s*strings\.Split|exec\.Command\("sh",\s*"-c",|exec\.Command\("bash",\s*"-c",)`),
			Message:  "Potential shell command injection via dynamic shell string execution",
			Suggestion: "Pass arguments as explicit slices rather than passing user input to sh -c.",
		},
		{
			ID:       "SEC-004",
			Category: "security",
			Severity: "medium",
			Pattern:  regexp.MustCompile(`(?i)(SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*=.*[\+\$]|db\.Query\(fmt\.Sprintf)`),
			Message:  "Potential SQL Injection: query built with string concatenation or Sprintf",
			Suggestion: "Use parameterized queries ($1, ? or sql.Named) instead of string formatting.",
		},
		{
			ID:       "SEC-005",
			Category: "security",
			Severity: "medium",
			Pattern:  regexp.MustCompile(`(?i)(http\.ListenAndServe\([^,]+,\s*nil\)|CORS.*AllowAllOrigins:\s*true)`),
			Message:  "Potential permissive security configuration",
			Suggestion: "Explicitly specify trusted CORS origins and avoid DefaultServeMux in production.",
		},
		{
			ID:       "BUG-001",
			Category: "bug",
			Severity: "medium",
			Pattern:  regexp.MustCompile(`(?i)TODO|FIXME|XXX`),
			Message:  "Unresolved TODO/FIXME marker found",
			Suggestion: "Resolve remaining tasks or track them in the task manager before finalizing.",
		},
	}
}

// AnalyzeDiff runs a review on git uncommitted changes (git diff HEAD).
func (re *ReviewEngine) AnalyzeDiff(ctx context.Context, repoDir string) (*ReviewReport, error) {
	if repoDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		repoDir = cwd
	}

	// 1. Try git diff HEAD
	cmd := exec.CommandContext(ctx, "git", "diff", "HEAD")
	cmd.Dir = repoDir
	out, err := cmd.Output()
	if err != nil {
		// Fallback to git diff
		cmd = exec.CommandContext(ctx, "git", "diff")
		cmd.Dir = repoDir
		out, _ = cmd.Output()
	}

	diffText := string(out)
	var issues []Issue

	if len(diffText) > 0 {
		currentFile := ""
		lines := strings.Split(diffText, "\n")
		lineNum := 0

		for _, line := range lines {
			if strings.HasPrefix(line, "+++ b/") {
				currentFile = strings.TrimPrefix(line, "+++ b/")
				lineNum = 0
				continue
			}
			if strings.HasPrefix(line, "@@") {
				// Hunk header e.g. @@ -1,5 +1,6 @@
				lineNum++
				continue
			}

			// Only inspect added or modified lines
			if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
				lineNum++
				content := strings.TrimPrefix(line, "+")

				for _, rule := range re.rules {
					if rule.Pattern.MatchString(content) {
						issues = append(issues, Issue{
							File:        currentFile,
							Line:        lineNum,
							Message:     rule.Message,
							Severity:    rule.Severity,
							Category:    rule.Category,
							CodeSnippet: strings.TrimSpace(content),
							Suggestion:  rule.Suggestion,
						})
					}
				}
			}
		}
	}

	report := re.buildReport("Git Working Tree Diff", issues)
	return report, nil
}

// ReviewFile scans an individual file for security vulnerabilities and secrets.
func (re *ReviewEngine) ReviewFile(filePath string) (*ReviewReport, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	var issues []Issue
	lines := strings.Split(string(data), "\n")

	for i, line := range lines {
		for _, rule := range re.rules {
			if rule.Pattern.MatchString(line) {
				issues = append(issues, Issue{
					File:        filePath,
					Line:        i + 1,
					Message:     rule.Message,
					Severity:    rule.Severity,
					Category:    rule.Category,
					CodeSnippet: strings.TrimSpace(line),
					Suggestion:  rule.Suggestion,
				})
			}
		}
	}

	return re.buildReport(filePath, issues), nil
}

// Scan scans a path (file or directory).
func (re *ReviewEngine) Scan(path string) ([]Issue, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		rep, err := re.ReviewFile(path)
		if err != nil {
			return nil, err
		}
		return rep.Issues, nil
	}

	var allIssues []Issue
	err = filepath.Walk(path, func(p string, f os.FileInfo, err error) error {
		if err != nil || f == nil || f.IsDir() {
			return nil
		}
		// Skip hidden, git, node_modules, binaries
		name := f.Name()
		if strings.HasPrefix(name, ".") || strings.Contains(p, "node_modules") || strings.Contains(p, "dist") {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext == ".png" || ext == ".jpg" || ext == ".lock" || ext == ".exe" || ext == ".zip" {
			return nil
		}

		rep, err := re.ReviewFile(p)
		if err == nil {
			allIssues = append(allIssues, rep.Issues...)
		}
		return nil
	})

	return allIssues, err
}

func (re *ReviewEngine) buildReport(target string, issues []Issue) *ReviewReport {
	high := 0
	med := 0
	low := 0

	for _, is := range issues {
		switch strings.ToLower(is.Severity) {
		case "high":
			high++
		case "medium":
			med++
		default:
			low++
		}
	}

	summary := ""
	clean := len(issues) == 0
	if clean {
		summary = fmt.Sprintf("✅ Review clean: No security risks or critical issues detected in %s.", target)
	} else {
		summary = fmt.Sprintf("⚠️ Review found %d potential issues (%d high, %d medium, %d low) in %s.",
			len(issues), high, med, low, target)
	}

	return &ReviewReport{
		Target:      target,
		Summary:     summary,
		Issues:      issues,
		HighCount:   high,
		MediumCount: med,
		LowCount:    low,
		Clean:       clean,
		ReviewedAt:  time.Now(),
	}
}
