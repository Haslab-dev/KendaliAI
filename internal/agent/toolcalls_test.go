package agent

import (
	"encoding/json"
	"testing"
)

func TestSignatureToJSONSchema(t *testing.T) {
	tests := []struct {
		name      string
		signature string
		check     func(t *testing.T, schema map[string]interface{})
	}{
		{
			name:      "flat mixed types",
			signature: `{"path": "string", "offset": "int", "verbose": "boolean", "tags": "array", "meta": "object"}`,
			check: func(t *testing.T, schema map[string]interface{}) {
				props, ok := schema["properties"].(map[string]interface{})
				if !ok {
					t.Fatalf("properties not an object: %v", schema["properties"])
				}
				if got := props["path"].(map[string]interface{})["type"]; got != "string" {
					t.Errorf("path type = %v, want string", got)
				}
				if got := props["offset"].(map[string]interface{})["type"]; got != "number" {
					t.Errorf("offset type = %v, want number", got)
				}
				if got := props["verbose"].(map[string]interface{})["type"]; got != "boolean" {
					t.Errorf("verbose type = %v, want boolean", got)
				}
				if got := props["tags"].(map[string]interface{})["type"]; got != "array" {
					t.Errorf("tags type = %v, want array", got)
				}
				if got := props["meta"].(map[string]interface{})["type"]; got != "object" {
					t.Errorf("meta type = %v, want object", got)
				}
			},
		},
		{
			name:      "empty signature",
			signature: `{}`,
			check: func(t *testing.T, schema map[string]interface{}) {
				if schema["type"] != "object" {
					t.Errorf("type = %v, want object", schema["type"])
				}
				props := schema["properties"].(map[string]interface{})
				if len(props) != 0 {
					t.Errorf("expected no properties, got %v", props)
				}
			},
		},
		{
			name:      "garbage signature stays permissive",
			signature: `not json at all`,
			check: func(t *testing.T, schema map[string]interface{}) {
				if schema["type"] != "object" {
					t.Errorf("type = %v, want object", schema["type"])
				}
			},
		},
		{
			name:      "unknown type falls back to string",
			signature: `{"query": "string (the search query)"}`,
			check: func(t *testing.T, schema map[string]interface{}) {
				props := schema["properties"].(map[string]interface{})
				if got := props["query"].(map[string]interface{})["type"]; got != "string" {
					t.Errorf("query type = %v, want string", got)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.check(t, SignatureToJSONSchema(tt.signature))
		})
	}
}

func TestSignatureToJSONSchemaProducesValidJSON(t *testing.T) {
	schema := SignatureToJSONSchema(`{"path": "string", "limit": "int"}`)
	if _, err := json.Marshal(schema); err != nil {
		t.Fatalf("schema is not marshalable: %v", err)
	}
}

func TestBuildToolDefinitions(t *testing.T) {
	registry := map[string]ToolDef{
		"zeta_tool":   {Name: "zeta_tool", Description: "last", Signature: `{"id": "string"}`},
		"alpha_tool":  {Name: "alpha_tool", Description: "first", Signature: `{"path": "string"}`},
		"hidden_tool": {Name: "hidden_tool", Description: "not allowed", Signature: `{}`},
	}

	defs := BuildToolDefinitions(registry, func(name string) bool { return name != "hidden_tool" })

	if len(defs) != 2 {
		t.Fatalf("len(defs) = %d, want 2", len(defs))
	}
	if defs[0].Name != "alpha_tool" || defs[1].Name != "zeta_tool" {
		t.Errorf("defs not sorted by name: %s, %s", defs[0].Name, defs[1].Name)
	}
	if defs[0].Description != "first" {
		t.Errorf("description = %q, want %q", defs[0].Description, "first")
	}
	params := defs[0].Parameters["properties"].(map[string]interface{})
	if _, ok := params["path"]; !ok {
		t.Errorf("alpha_tool parameters missing 'path': %v", params)
	}
}

func TestBuildToolDefinitionsAllowsAllWhenPredicateNil(t *testing.T) {
	registry := map[string]ToolDef{
		"a": {Name: "a", Signature: `{}`},
		"b": {Name: "b", Signature: `{}`},
	}
	if got := len(BuildToolDefinitions(registry, nil)); got != 2 {
		t.Errorf("len = %d, want 2", got)
	}
}

func TestToolCallArguments(t *testing.T) {
	tests := []struct {
		name string
		call ToolCall
		want string
	}{
		{name: "raw json passthrough", call: ToolCall{ID: "1", Name: "t", ArgsJSON: `{"path":"x"}`, Args: nil}, want: `{"path":"x"}`},
		{name: "marshals args", call: ToolCall{ID: "1", Name: "t", Args: map[string]interface{}{"limit": float64(5)}}, want: `{"limit":5}`},
		{name: "empty args", call: ToolCall{ID: "1", Name: "t"}, want: "{}"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.call.Arguments(); got != tt.want {
				t.Errorf("Arguments() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestToolCallToRequest(t *testing.T) {
	call := ToolCall{ID: "call_1", Name: "read_file", Args: map[string]interface{}{"path": "/tmp/x"}}
	req := call.ToRequest()
	if req.Name != "read_file" || req.Args["path"] != "/tmp/x" {
		t.Errorf("unexpected request: %+v", req)
	}
}
