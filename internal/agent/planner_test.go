package agent

import (
	"strings"
	"testing"
)

func TestParseActionPlan_BalancedParens(t *testing.T) {
	input := `tool: exec({"command": "cat > file.md << 'EOF'\n# Title\ncontent with (parens) and more\nEOF\n"})`
	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "exec" {
		t.Errorf("expected tool name 'exec', got '%s'", reqs[0].Name)
	}
}

func TestParseActionPlan_NoStringAwarenessBreaks(t *testing.T) {
	// This tests the exact bug: heredoc content containing ) that
	// would prematurely close the paren depth counter if we weren't
	// tracking JSON string state.
	input := `tool: exec({"command": "echo 'hello (world)'"})`
	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "exec" {
		t.Errorf("expected tool name 'exec', got '%s'", reqs[0].Name)
	}
}

func TestParseActionPlan_MultipleTools(t *testing.T) {
	input := `tool: exec({"command": "ls"})
tool: read_file({"path": "foo.md", "limit": 50})`
	reqs := ParseActionPlan(input)
	if len(reqs) != 2 {
		t.Fatalf("expected 2 requests, got %d", len(reqs))
	}
	if reqs[0].Name != "exec" {
		t.Errorf("expected first tool 'exec', got '%s'", reqs[0].Name)
	}
	if reqs[1].Name != "read_file" {
		t.Errorf("expected second tool 'read_file', got '%s'", reqs[1].Name)
	}
}

func TestParseActionPlan_FinalAnswer(t *testing.T) {
	input := "This is a final answer with no tool calls."
	reqs := ParseActionPlan(input)
	if len(reqs) != 0 {
		t.Fatalf("expected 0 requests, got %d", len(reqs))
	}
}

func TestParseActionPlan_ApplyPatchCreateFile(t *testing.T) {
	input := `tool: apply_patch({"path": "deck_1.md", "old_str": "", "new_str": "# Slide 1\nContent with (parens)\n"})`
	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "apply_patch" {
		t.Errorf("expected tool name 'apply_patch', got '%s'", reqs[0].Name)
	}
	args := reqs[0].Args
	if args["path"] != "deck_1.md" {
		t.Errorf("expected path 'deck_1.md', got '%v'", args["path"])
	}
	if args["old_str"] != "" {
		t.Errorf("expected old_str '', got '%v'", args["old_str"])
	}
	ns, ok := args["new_str"].(string)
	if !ok || ns == "" {
		t.Errorf("expected non-empty new_str, got '%v'", args["new_str"])
	}
}

func TestParseActionPlan_NestedJSONBracesInString(t *testing.T) {
	// Tests that { and } inside JSON strings are properly handled
	// (they should not affect paren depth since we only track parens)
	input := `tool: exec({"command": "echo '{\"key\": \"value\"}'"})`
	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
}

func TestParseActionPlan_MultiLineHeredoc(t *testing.T) {
	input := "tool: exec({\"command\": \"cat > example/deck_1.md << 'DECKEOF'\n# KendaliAI - Autonomous AI Coding Agent\n## Slide 1: Overview\n" +
		"KendaliAI (short for 'Kendali AI') is a next-generation platform.\n" +
		"DECKEOF\n" +
		"\"})"
	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "exec" {
		t.Errorf("expected tool name 'exec', got '%s'", reqs[0].Name)
	}
}

func TestParseActionPlan_DSML(t *testing.T) {
	input := `<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="exec">
<｜｜DSML｜｜ parameter name="command" string="true">ls -la && echo "--- personal/ ---"</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`

	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "exec" {
		t.Errorf("expected tool name 'exec', got '%s'", reqs[0].Name)
	}
	if reqs[0].Args["command"] != `ls -la && echo "--- personal/ ---"` {
		t.Errorf("unexpected command arg: %v", reqs[0].Args["command"])
	}
}

func TestParseActionPlan_DSMLNoParams(t *testing.T) {
	input := `<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="list_skills">

</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`

	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "list_skills" {
		t.Errorf("expected tool name 'list_skills', got '%s'", reqs[0].Name)
	}
}

func TestParseActionPlan_ToolCallXML(t *testing.T) {
	input := `<tool_call>
{"name": "read_file", "arguments": {"path": "test.txt", "limit": 100}}
</tool_call>`

	reqs := ParseActionPlan(input)
	if len(reqs) != 1 {
		t.Fatalf("expected 1 request, got %d", len(reqs))
	}
	if reqs[0].Name != "read_file" {
		t.Errorf("expected tool name 'read_file', got '%s'", reqs[0].Name)
	}
	if reqs[0].Args["path"] != "test.txt" {
		t.Errorf("expected path 'test.txt', got '%v'", reqs[0].Args["path"])
	}
}

func TestStripToolCallMarkup(t *testing.T) {
	input := `Here is the result:
<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="list_skills">
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
All done!`
	stripped := StripToolCallMarkup(input)
	if strings.Contains(stripped, "DSML") {
		t.Errorf("expected DSML stripped, got %q", stripped)
	}
	if !strings.Contains(stripped, "Here is the result:") || !strings.Contains(stripped, "All done!") {
		t.Errorf("expected outer text preserved, got %q", stripped)
	}

	inputWithParams := `I need to check the directory contents.
<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="exec">
<｜｜DSML｜｜ parameter name="command" string="true">pwd && echo "=== ls -la ===" && ls -la</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`
	strippedParams := StripToolCallMarkup(inputWithParams)
	if strings.Contains(strippedParams, "DSML") || strings.Contains(strippedParams, "parameter") {
		t.Errorf("expected DSML and parameter stripped, got %q", strippedParams)
	}
	if strippedParams != "I need to check the directory contents." {
		t.Errorf("expected cleaned text, got %q", strippedParams)
	}
}
