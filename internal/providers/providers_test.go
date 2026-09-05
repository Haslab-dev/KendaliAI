package providers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kendaliai/app/internal/agent"
)

func testToolDefinitions() []agent.ToolDefinition {
	return []agent.ToolDefinition{
		{
			Name:        "read_file",
			Description: "Reads a file.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path":  map[string]interface{}{"type": "string"},
					"limit": map[string]interface{}{"type": "number"},
				},
			},
		},
	}
}

func TestOpenAINativeToolCallResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"choices": [{
				"index": 0,
				"finish_reason": "tool_calls",
				"message": {
					"role": "assistant",
					"content": "",
					"tool_calls": [{
						"id": "call_abc123",
						"type": "function",
						"function": {"name": "read_file", "arguments": "{\"path\":\"/tmp/x\",\"limit\":5}"}
					}]
				}
			}],
			"usage": {"prompt_tokens": 10, "completion_tokens": 5}
		}`))
	}))
	defer server.Close()

	p := NewProvider("test-key", "test-model", server.URL)
	resp, err := p.ChatCompletionWithTools(context.Background(), []agent.Message{
		{Role: "user", Content: "read /tmp/x"},
	}, testToolDefinitions())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.FinishReason != "tool_calls" {
		t.Errorf("FinishReason = %q, want tool_calls", resp.FinishReason)
	}
	if len(resp.ToolCalls) != 1 {
		t.Fatalf("len(ToolCalls) = %d, want 1", len(resp.ToolCalls))
	}
	tc := resp.ToolCalls[0]
	if tc.ID != "call_abc123" || tc.Name != "read_file" {
		t.Errorf("unexpected tool call: %+v", tc)
	}
	if tc.Args["path"] != "/tmp/x" {
		t.Errorf("Args not parsed: %v", tc.Args)
	}
	if tc.ArgsJSON != `{"path":"/tmp/x","limit":5}` {
		t.Errorf("ArgsJSON = %q", tc.ArgsJSON)
	}
	if resp.InputTokens != 10 || resp.OutputTokens != 5 {
		t.Errorf("usage = %d/%d, want 10/5", resp.InputTokens, resp.OutputTokens)
	}
}

func TestOpenAIRequestCarriesToolsAndToolMessages(t *testing.T) {
	var captured map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"done"}}],"usage":{}}`))
	}))
	defer server.Close()

	p := NewProvider("test-key", "test-model", server.URL)
	_, err := p.ChatCompletionWithTools(context.Background(), []agent.Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "read /tmp/x"},
		{Role: "assistant", Content: "", ToolCalls: []agent.ToolCall{{ID: "call_1", Name: "read_file", Args: map[string]interface{}{"path": "/tmp/x"}}}},
		{Role: "tool", ToolCallID: "call_1", Name: "read_file", Content: "file body"},
	}, testToolDefinitions())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tools, ok := captured["tools"].([]interface{})
	if !ok || len(tools) != 1 {
		t.Fatalf("request tools missing: %v", captured["tools"])
	}
	fn := tools[0].(map[string]interface{})["function"].(map[string]interface{})
	if fn["name"] != "read_file" {
		t.Errorf("tool name = %v", fn["name"])
	}
	params := fn["parameters"].(map[string]interface{})
	props := params["properties"].(map[string]interface{})
	if _, ok := props["path"]; !ok {
		t.Errorf("parameters.properties missing path: %v", params)
	}

	msgs := captured["messages"].([]interface{})
	if len(msgs) != 4 {
		t.Fatalf("len(messages) = %d, want 4", len(msgs))
	}
	assistant := msgs[2].(map[string]interface{})
	calls := assistant["tool_calls"].([]interface{})
	if len(calls) != 1 {
		t.Fatalf("assistant tool_calls missing: %v", assistant)
	}
	args := calls[0].(map[string]interface{})["function"].(map[string]interface{})["arguments"].(string)
	if args != `{"path":"/tmp/x"}` {
		t.Errorf("echoed arguments = %q", args)
	}
	toolMsg := msgs[3].(map[string]interface{})
	if toolMsg["role"] != "tool" || toolMsg["tool_call_id"] != "call_1" {
		t.Errorf("tool message wrong: %v", toolMsg)
	}
}

func TestOpenAILegacyToolRoleWithoutCallIDBecomesUserText(t *testing.T) {
	var captured map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"ok"}}],"usage":{}}`))
	}))
	defer server.Close()

	p := NewProvider("test-key", "test-model", server.URL)
	_, err := p.ChatCompletion(context.Background(), []agent.Message{
		{Role: "user", Content: "hi"},
		{Role: "tool", Name: "exec", Content: "output"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	msgs := captured["messages"].([]interface{})
	last := msgs[1].(map[string]interface{})
	if last["role"] != "user" {
		t.Errorf("legacy tool message role = %v, want user", last["role"])
	}
	if last["content"] != "tool_result(exec):\noutput" {
		t.Errorf("legacy tool message content = %q", last["content"])
	}
}

func TestAnthropicNativeToolUseResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"content": [
				{"type": "text", "text": "Let me read that file."},
				{"type": "tool_use", "id": "toolu_01", "name": "read_file", "input": {"path": "/tmp/x"}}
			],
			"stop_reason": "tool_use",
			"usage": {"input_tokens": 12, "output_tokens": 8}
		}`))
	}))
	defer server.Close()

	p := NewAnthropicProvider("test-key", "test-model", server.URL)
	resp, err := p.ChatCompletionWithTools(context.Background(), []agent.Message{
		{Role: "user", Content: "read /tmp/x"},
	}, testToolDefinitions())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.FinishReason != "tool_use" {
		t.Errorf("FinishReason = %q, want tool_use", resp.FinishReason)
	}
	if resp.Content != "Let me read that file." {
		t.Errorf("Content = %q", resp.Content)
	}
	if len(resp.ToolCalls) != 1 {
		t.Fatalf("len(ToolCalls) = %d, want 1", len(resp.ToolCalls))
	}
	tc := resp.ToolCalls[0]
	if tc.ID != "toolu_01" || tc.Name != "read_file" || tc.Args["path"] != "/tmp/x" {
		t.Errorf("unexpected tool call: %+v", tc)
	}
}

func TestAnthropicRequestBlocksAndTools(t *testing.T) {
	var captured map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","usage":{}}`))
	}))
	defer server.Close()

	p := NewAnthropicProvider("test-key", "test-model", server.URL)
	_, err := p.ChatCompletionWithTools(context.Background(), []agent.Message{
		{Role: "system", Content: "be helpful"},
		{Role: "user", Content: "read /tmp/x"},
		{Role: "assistant", ToolCalls: []agent.ToolCall{{ID: "toolu_01", Name: "read_file", Args: map[string]interface{}{"path": "/tmp/x"}}}},
		{Role: "tool", ToolCallID: "toolu_01", Name: "read_file", Content: "file body"},
	}, testToolDefinitions())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if sys, _ := captured["system"].(string); sys != "be helpful" {
		t.Errorf("system = %v", captured["system"])
	}

	tools, ok := captured["tools"].([]interface{})
	if !ok || len(tools) != 1 {
		t.Fatalf("request tools missing: %v", captured["tools"])
	}
	schema := tools[0].(map[string]interface{})["input_schema"].(map[string]interface{})
	if schema["type"] != "object" {
		t.Errorf("input_schema.type = %v", schema["type"])
	}

	msgs := captured["messages"].([]interface{})
	if len(msgs) != 3 {
		t.Fatalf("len(messages) = %d, want 3", len(msgs))
	}
	assistant := msgs[1].(map[string]interface{})
	blocks := assistant["content"].([]interface{})
	if len(blocks) != 1 {
		t.Fatalf("assistant blocks = %v", blocks)
	}
	use := blocks[0].(map[string]interface{})
	if use["type"] != "tool_use" || use["id"] != "toolu_01" || use["name"] != "read_file" {
		t.Errorf("tool_use block wrong: %v", use)
	}
	result := msgs[2].(map[string]interface{})
	rblocks := result["content"].([]interface{})
	tr := rblocks[0].(map[string]interface{})
	if tr["type"] != "tool_result" || tr["tool_use_id"] != "toolu_01" || tr["content"] != "file body" {
		t.Errorf("tool_result block wrong: %v", tr)
	}
}

func TestAnthropicLegacyToolRoleWithoutCallIDBecomesUserText(t *testing.T) {
	var captured map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","usage":{}}`))
	}))
	defer server.Close()

	p := NewAnthropicProvider("test-key", "test-model", server.URL)
	_, err := p.ChatCompletion(context.Background(), []agent.Message{
		{Role: "user", Content: "hi"},
		{Role: "tool", Name: "exec", Content: "output"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	msgs := captured["messages"].([]interface{})
	last := msgs[1].(map[string]interface{})
	if last["content"] != "tool_result(exec):\noutput" {
		t.Errorf("legacy tool message content = %q", last["content"])
	}
}
