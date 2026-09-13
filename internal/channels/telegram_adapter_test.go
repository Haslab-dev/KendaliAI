package channels

import (
	"strings"
	"testing"
)

func TestSanitizeModelArtifacts(t *testing.T) {
	raw := `<｜begin of sentence｜><｜thought｜>
Thinking deeply about this...
Let me check the files.
</｜thought｜>Here is the answer: 42<tool_call>
{"name": "eval", "arguments": {}}
</tool_call><｜end of sentence｜>`

	cleaned := SanitizeModelArtifacts(raw)
	if strings.Contains(cleaned, "Thinking deeply") {
		t.Errorf("SanitizeModelArtifacts did not strip <｜thought｜> block, got: %s", cleaned)
	}
	if strings.Contains(cleaned, "tool_call") {
		t.Errorf("SanitizeModelArtifacts did not strip <tool_call>, got: %s", cleaned)
	}
	if strings.Contains(cleaned, "sentence") {
		t.Errorf("SanitizeModelArtifacts did not strip sentence tokens, got: %s", cleaned)
	}
	if !strings.Contains(cleaned, "Here is the answer: 42") {
		t.Errorf("Expected content to remain, got: %s", cleaned)
	}
}

func TestFormatMarkdownForTelegram(t *testing.T) {
	input := `# Header 1
## Header 2
This is **bold** text and ` + "`inline_code`" + `.
Here is a list:
* First item
* Second item

Check [Google](https://google.com) for details.

` + "```go\nfunc main() {\n    if x < 10 && y > 2 {\n        println(\"hello\");\n    }\n}\n```"

	formatted := FormatMarkdownForTelegram(input)

	// Verify headers transformed to <b>
	if !strings.Contains(formatted, "<b>Header 1</b>") {
		t.Errorf("Expected <b>Header 1</b>, got: %s", formatted)
	}
	if !strings.Contains(formatted, "<b>Header 2</b>") {
		t.Errorf("Expected <b>Header 2</b>, got: %s", formatted)
	}

	// Verify bold transformed to <b>
	if !strings.Contains(formatted, "<b>bold</b>") {
		t.Errorf("Expected <b>bold</b>, got: %s", formatted)
	}

	// Verify inline code
	if !strings.Contains(formatted, "<code>inline_code</code>") {
		t.Errorf("Expected <code>inline_code</code>, got: %s", formatted)
	}

	// Verify bullet list
	if !strings.Contains(formatted, "• First item") || !strings.Contains(formatted, "• Second item") {
		t.Errorf("Expected bullets '• ', got: %s", formatted)
	}

	// Verify link transformed to <a href="...">
	if !strings.Contains(formatted, `<a href="https://google.com">Google</a>`) {
		t.Errorf("Expected link tag, got: %s", formatted)
	}

	// Verify code block transformed and HTML-escaped
	if !strings.Contains(formatted, "<pre><code>") {
		t.Errorf("Expected <pre><code>, got: %s", formatted)
	}
	if !strings.Contains(formatted, "x &lt; 10 &amp;&amp; y &gt; 2") {
		t.Errorf("Expected escaped '<' and '&' inside code block, got: %s", formatted)
	}
}
