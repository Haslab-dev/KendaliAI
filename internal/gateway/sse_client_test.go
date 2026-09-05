package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kendaliai/app/internal/agent"
)

// sseResponse writes a canned text/event-stream body.
func sseResponse(t *testing.T, chunks []string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		for _, c := range chunks {
			_, _ = w.Write([]byte("data: " + c + "\n\n"))
		}
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
}

func TestStreamOpenAICompatibleAccumulatesToolCalls(t *testing.T) {
	server := sseResponse(t, []string{
		`{"choices":[{"index":0,"delta":{"role":"assistant","content":"Let me read that file."}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"read_file","arguments":""}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"path\":"}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"x.txt\"}"}}]}}]}`,
		`{"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":7,"completion_tokens":4}}`,
	})
	defer server.Close()

	var textDeltas []string
	res, err := StreamOpenAICompatible(context.Background(), server.URL, "key", "model", []agent.Message{
		{Role: "user", Content: "read x.txt"},
	}, []agent.ToolDefinition{
		{Name: "read_file", Description: "Reads a file.", Parameters: map[string]interface{}{"type": "object"}},
	}, StreamCallbacks{OnText: func(d string) { textDeltas = append(textDeltas, d) }})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.FinishReason != "tool_calls" {
		t.Errorf("FinishReason = %q, want tool_calls", res.FinishReason)
	}
	if res.Content != "Let me read that file." {
		t.Errorf("Content = %q", res.Content)
	}
	if len(textDeltas) != 1 {
		t.Errorf("text deltas = %v", textDeltas)
	}
	if len(res.ToolCalls) != 1 {
		t.Fatalf("len(ToolCalls) = %d, want 1", len(res.ToolCalls))
	}
	tc := res.ToolCalls[0]
	if tc.ID != "call_abc" || tc.Name != "read_file" {
		t.Errorf("unexpected tool call: %+v", tc)
	}
	if tc.Args["path"] != "x.txt" {
		t.Errorf("Args not parsed from fragments: %v", tc.Args)
	}
	if res.InputTokens != 7 || res.OutputTokens != 4 {
		t.Errorf("usage = %d/%d, want 7/4", res.InputTokens, res.OutputTokens)
	}
}

func TestStreamOpenAICompatibleNativeMessageSerialization(t *testing.T) {
	var captured map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	_, err := StreamOpenAICompatible(context.Background(), server.URL, "key", "model", []agent.Message{
		{Role: "user", Content: "hi"},
		{Role: "assistant", Content: "", ToolCalls: []agent.ToolCall{{ID: "call_1", Name: "t", Args: map[string]interface{}{"a": "b"}}}},
		{Role: "tool", ToolCallID: "call_1", Name: "t", Content: "result"},
		{Role: "tool", Name: "legacy", Content: "old"},
	}, []agent.ToolDefinition{{Name: "t", Parameters: map[string]interface{}{"type": "object"}}}, StreamCallbacks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	msgs := captured["messages"].([]interface{})
	if len(msgs) != 4 {
		t.Fatalf("len(messages) = %d, want 4", len(msgs))
	}
	if _, ok := captured["tools"]; !ok {
		t.Fatal("request missing tools array")
	}

	assistant := msgs[1].(map[string]interface{})
	calls := assistant["tool_calls"].([]interface{})
	if len(calls) != 1 || calls[0].(map[string]interface{})["id"] != "call_1" {
		t.Errorf("assistant tool_calls not serialized: %v", assistant)
	}
	toolMsg := msgs[2].(map[string]interface{})
	if toolMsg["role"] != "tool" || toolMsg["tool_call_id"] != "call_1" || toolMsg["content"] != "result" {
		t.Errorf("native tool message wrong: %v", toolMsg)
	}
	legacy := msgs[3].(map[string]interface{})
	if legacy["role"] != "user" || legacy["content"] != "tool_result(legacy):\nold" {
		t.Errorf("legacy tool message wrong: %v", legacy)
	}
}

func TestStreamOpenAICompatibleWithoutToolsDegradesNativeShapes(t *testing.T) {
	var captured map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	_, err := StreamOpenAICompatible(context.Background(), server.URL, "key", "model", []agent.Message{
		{Role: "assistant", Content: "", ToolCalls: []agent.ToolCall{{ID: "call_1", Name: "t", ArgsJSON: `{"a":"b"}`}}},
		{Role: "tool", ToolCallID: "call_1", Name: "t", Content: "result"},
	}, nil, StreamCallbacks{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, ok := captured["tools"]; ok {
		t.Error("tools array sent despite nil tools param")
	}
	msgs := captured["messages"].([]interface{})
	assistant := msgs[0].(map[string]interface{})
	if _, has := assistant["tool_calls"]; has {
		t.Errorf("assistant tool_calls serialized in text-protocol mode: %v", assistant)
	}
	toolMsg := msgs[1].(map[string]interface{})
	if toolMsg["role"] != "user" || !strings.Contains(toolMsg["content"].(string), "tool_result(t)") {
		t.Errorf("tool message not degraded to user text: %v", toolMsg)
	}
}
