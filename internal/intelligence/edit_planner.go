package intelligence

import (
	"fmt"
	"strings"
)

type EditPlanner struct {
	root string
}

func NewEditPlanner(root string) *EditPlanner {
	return &EditPlanner{root: root}
}

func (ep *EditPlanner) ParsePlan(llmOutput string) []EditPlan {
	var plans []EditPlan
	lines := strings.Split(llmOutput, "\n")
	var current *EditPlan

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "EDIT:") || strings.HasPrefix(line, "edit:") {
			if current != nil {
				plans = append(plans, *current)
			}
			current = parseEditDirective(line)
			continue
		}

		if current != nil {
			if strings.HasPrefix(line, "content:") || strings.HasPrefix(line, "CONTENT:") {
				current.Content = strings.TrimSpace(line[len("content:"):])
			} else if current.Content != "" {
				current.Content += "\n" + line
			}
		}
	}
	if current != nil && current.File != "" {
		plans = append(plans, *current)
	}
	return plans
}

func parseEditDirective(line string) *EditPlan {
	clean := strings.TrimPrefix(line, "EDIT:")
	clean = strings.TrimPrefix(clean, "edit:")
	clean = strings.TrimSpace(clean)

	plan := &EditPlan{}
	parts := strings.Fields(clean)

	if len(parts) >= 1 {
		plan.File = parts[0]
	}
	if len(parts) >= 2 {
		plan.Op = parts[1]
	}
	if len(parts) >= 3 {
		plan.Target = strings.Join(parts[2:], " ")
	}

	return plan
}

func (ep *EditPlanner) Validate(plan EditPlan) error {
	if plan.File == "" {
		return fmt.Errorf("edit plan missing file")
	}
	if plan.Op == "" {
		return fmt.Errorf("edit plan missing operation")
	}
	validOps := map[string]bool{
		"replace": true, "insert_before": true, "insert_after": true,
		"delete": true, "rename": true, "append": true, "prepend": true,
	}
	if !validOps[plan.Op] {
		return fmt.Errorf("unknown edit operation: %s", plan.Op)
	}
	return nil
}

func (ep *EditPlanner) FormatPlan(plans []EditPlan) string {
	var sb strings.Builder
	sb.WriteString("EDIT PLAN:\n")
	for i, p := range plans {
		sb.WriteString(fmt.Sprintf("  %d. %s %s %s", i+1, p.Op, p.File, p.Target))
		if p.Content != "" {
			sb.WriteString(fmt.Sprintf(" (%d chars content)", len(p.Content)))
		}
		sb.WriteString("\n")
	}
	return sb.String()
}
