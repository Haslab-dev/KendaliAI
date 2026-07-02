package intelligence

import (
	"testing"
)

func TestEditPlanner_ParsePlan(t *testing.T) {
	input := `EDIT: src/App.tsx replace Hero component
content: export default function Hero() {
content:   return <section>New Hero</section>
content: }
EDIT: src/components/Navbar.tsx insert_after Logo
EDIT: src/components/Pricing.tsx delete OldPricing`

	plans := NewEditPlanner("").ParsePlan(input)

	if len(plans) != 3 {
		t.Fatalf("expected 3 plans, got %d", len(plans))
	}

	if plans[0].File != "src/App.tsx" {
		t.Errorf("plan 0 file: got '%s', want 'src/App.tsx'", plans[0].File)
	}
	if plans[0].Op != "replace" {
		t.Errorf("plan 0 op: got '%s', want 'replace'", plans[0].Op)
	}
	if plans[0].Content == "" {
		t.Error("plan 0 should have content")
	}

	if plans[1].Op != "insert_after" {
		t.Errorf("plan 1 op: got '%s', want 'insert_after'", plans[1].Op)
	}

	if plans[2].Op != "delete" {
		t.Errorf("plan 2 op: got '%s', want 'delete'", plans[2].Op)
	}
}

func TestEditPlanner_Validate(t *testing.T) {
	ep := NewEditPlanner("")

	validPlans := []EditPlan{
		{File: "app.tsx", Op: "replace", Target: "Hero"},
		{File: "nav.tsx", Op: "insert_before", Target: "Footer"},
		{File: "page.tsx", Op: "insert_after", Target: "Navbar"},
		{File: "old.tsx", Op: "delete", Target: "OldComponent"},
		{File: "btn.tsx", Op: "rename", Target: "Button→MyButton"},
		{File: "app.tsx", Op: "append"},
		{File: "app.tsx", Op: "prepend"},
	}

	for _, p := range validPlans {
		if err := ep.Validate(p); err != nil {
			t.Errorf("should be valid: %+v, got: %v", p, err)
		}
	}

	invalidPlans := []EditPlan{
		{File: "", Op: "replace"},
		{File: "app.tsx", Op: ""},
		{File: "app.tsx", Op: "invalid_op"},
	}

	for _, p := range invalidPlans {
		if err := ep.Validate(p); err == nil {
			t.Errorf("should be invalid: %+v", p)
		}
	}
}

func TestEditPlanner_FormatPlan(t *testing.T) {
	ep := NewEditPlanner("")
	plans := []EditPlan{
		{File: "App.tsx", Op: "replace", Target: "Hero"},
		{File: "Navbar.tsx", Op: "insert_after", Target: "Logo"},
	}

	formatted := ep.FormatPlan(plans)
	if formatted == "" {
		t.Error("format should not be empty")
	}
	if !contains(formatted, "replace") || !contains(formatted, "App.tsx") {
		t.Error("format missing expected content")
	}
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
