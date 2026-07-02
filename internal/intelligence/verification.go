package intelligence

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type VerificationPipeline struct {
	root     string
	info     *ProjectInfo
	sessionID string
}

type VerificationResult struct {
	BuildPassed bool     `json:"build_passed"`
	LintPassed  bool     `json:"lint_passed"`
	TestsPassed bool     `json:"tests_passed"`
	BuildOutput string   `json:"build_output"`
	LintOutput  string   `json:"lint_output"`
	TestOutput  string   `json:"test_output"`
	Errors      []string `json:"errors"`
}

func NewVerificationPipeline(root string, info *ProjectInfo, sessionID string) *VerificationPipeline {
	return &VerificationPipeline{root: root, info: info, sessionID: sessionID}
}

func (vp *VerificationPipeline) Run(ctx context.Context) *VerificationResult {
	result := &VerificationResult{BuildPassed: true, LintPassed: true, TestsPassed: true}

	buildCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	buildOutput, buildErr := vp.runBuild(buildCtx)
	result.BuildOutput = buildOutput
	if buildErr != nil {
		result.BuildPassed = false
		result.Errors = append(result.Errors, fmt.Sprintf("build: %v", buildErr))
	}

	lintCtx, lintCancel := context.WithTimeout(ctx, 30*time.Second)
	defer lintCancel()

	lintOutput, lintErr := vp.runLint(lintCtx)
	result.LintOutput = lintOutput
	if lintErr != nil {
		result.LintPassed = false
		result.Errors = append(result.Errors, fmt.Sprintf("lint: %v", lintErr))
	}

	testCtx, testCancel := context.WithTimeout(ctx, 60*time.Second)
	defer testCancel()

	testOutput, testErr := vp.runTests(testCtx)
	result.TestOutput = testOutput
	if testErr != nil {
		result.TestsPassed = false
		result.Errors = append(result.Errors, fmt.Sprintf("tests: %v", testErr))
	}

	return result
}

func (vp *VerificationPipeline) runBuild(ctx context.Context) (string, error) {
	if vp.info == nil {
		return "", fmt.Errorf("no project info")
	}

	switch vp.info.BuildTool {
	case "Go Modules":
		cmd := exec.CommandContext(ctx, "go", "build", "./...")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Cargo":
		cmd := exec.CommandContext(ctx, "cargo", "build")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Vite":
		cmd := exec.CommandContext(ctx, "npx", "vite", "build")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Next.js":
		cmd := exec.CommandContext(ctx, "npx", "next", "build")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "npm/yarn/build":
		cmd := exec.CommandContext(ctx, "npm", "run", "build")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Flutter":
		cmd := exec.CommandContext(ctx, "flutter", "build")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	default:
		return "", fmt.Errorf("unknown build tool: %s", vp.info.BuildTool)
	}
}

func (vp *VerificationPipeline) runLint(ctx context.Context) (string, error) {
	if vp.info == nil {
		return "", fmt.Errorf("no project info")
	}

	switch vp.info.Language {
	case "Go":
		cmd := exec.CommandContext(ctx, "go", "vet", "./...")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "TypeScript":
		cmd := exec.CommandContext(ctx, "npx", "eslint", ".", "--ext", ".ts,.tsx,.js,.jsx")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		if err != nil {
			return string(out), err
		}
		return "ESLint: no errors", nil
	case "Python":
		cmd := exec.CommandContext(ctx, "ruff", "check", ".")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Rust":
		cmd := exec.CommandContext(ctx, "cargo", "clippy")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	default:
		return "", fmt.Errorf("no linter configured for %s", vp.info.Language)
	}
}

func (vp *VerificationPipeline) runTests(ctx context.Context) (string, error) {
	if vp.info == nil {
		return "", fmt.Errorf("no project info")
	}

	switch vp.info.BuildTool {
	case "Go Modules":
		cmd := exec.CommandContext(ctx, "go", "test", "./...")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Cargo":
		cmd := exec.CommandContext(ctx, "cargo", "test")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Vite", "Next.js", "npm/yarn/build":
		cmd := exec.CommandContext(ctx, "npm", "test")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "Flutter":
		cmd := exec.CommandContext(ctx, "flutter", "test")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	case "pip":
		cmd := exec.CommandContext(ctx, "python", "-m", "pytest")
		cmd.Dir = vp.root
		out, err := cmd.CombinedOutput()
		return string(out), err
	default:
		return "", fmt.Errorf("no test runner configured for %s", vp.info.BuildTool)
	}
}

func (vp *VerificationPipeline) FormatResult(result *VerificationResult) string {
	var sb strings.Builder
	sb.WriteString("=== VERIFICATION REPORT ===\n\n")

	if result.BuildPassed {
		sb.WriteString("BUILD: ✅ PASSED\n")
	} else {
		sb.WriteString("BUILD: ❌ FAILED\n")
	}
	if result.BuildOutput != "" {
		sb.WriteString(fmt.Sprintf("  %s\n", truncateOutput(result.BuildOutput, 500)))
	}

	sb.WriteString("\n")
	if result.LintPassed {
		sb.WriteString("LINT: ✅ PASSED\n")
	} else {
		sb.WriteString("LINT: ❌ FAILED\n")
	}
	if result.LintOutput != "" {
		sb.WriteString(fmt.Sprintf("  %s\n", truncateOutput(result.LintOutput, 500)))
	}

	sb.WriteString("\n")
	if result.TestsPassed {
		sb.WriteString("TESTS: ✅ PASSED\n")
	} else {
		sb.WriteString("TESTS: ❌ FAILED\n")
	}
	if result.TestOutput != "" {
		sb.WriteString(fmt.Sprintf("  %s\n", truncateOutput(result.TestOutput, 500)))
	}

	if len(result.Errors) > 0 {
		sb.WriteString("\nERRORS:\n")
		for _, e := range result.Errors {
			sb.WriteString(fmt.Sprintf("  - %s\n", e))
		}
	}

	sb.WriteString("\n=== END REPORT ===")
	return sb.String()
}

func (r *VerificationResult) AllPassed() bool {
	return r.BuildPassed && r.LintPassed && r.TestsPassed
}

func truncateOutput(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	lines := strings.Split(s, "\n")
	sb := strings.Builder{}
	n := 0
	for _, line := range lines {
		if n+len(line) > maxLen {
			sb.WriteString("\n...(truncated)")
			break
		}
		sb.WriteString(line)
		sb.WriteString("\n")
		n += len(line) + 1
	}
	return strings.TrimSpace(sb.String())
}
