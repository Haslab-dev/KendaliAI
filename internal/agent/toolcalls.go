package agent

import (
	"context"
	"sort"
	"strings"
)

// ToolDefinition is a provider-agnostic function-calling tool description.
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ToolCallingProvider is optionally implemented by providers that support the
// native function-calling API. The gateway turn loop checks for this interface
// and falls back to the text protocol (`tool: NAME({...})`) when it is absent
// or when the provider rejects the request.
type ToolCallingProvider interface {
	ChatCompletionWithTools(ctx context.Context, msgs []Message, tools []ToolDefinition) (*Response, error)
}

// SignatureToJSONSchema converts the loose signature notation used by ToolDef
// (e.g. `{"path": "string", "offset": "int"}`) into a JSON Schema object.
// The signature strings are flat maps of arg name → type name; unparseable or
// empty signatures yield a permissive object schema, matching the text
// protocol's lack of argument enforcement.
func SignatureToJSONSchema(signature string) map[string]interface{} {
	schema := map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}
	inner := strings.TrimSpace(signature)
	inner = strings.TrimPrefix(inner, "{")
	inner = strings.TrimSuffix(inner, "}")
	if strings.TrimSpace(inner) == "" {
		return schema
	}

	props := map[string]interface{}{}
	for _, part := range strings.Split(inner, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		colon := strings.Index(part, ":")
		if colon < 0 {
			continue
		}
		name := strings.Trim(strings.TrimSpace(part[:colon]), `"'`)
		if name == "" {
			continue
		}
		props[name] = signatureJSONType(strings.TrimSpace(part[colon+1:]))
	}
	schema["properties"] = props
	return schema
}

func signatureJSONType(typeName string) map[string]interface{} {
	switch strings.ToLower(strings.Trim(strings.TrimSpace(typeName), `"'`)) {
	case "int", "integer", "float", "double", "number":
		return map[string]interface{}{"type": "number"}
	case "bool", "boolean":
		return map[string]interface{}{"type": "boolean"}
	case "array", "list":
		return map[string]interface{}{"type": "array"}
	case "object", "map":
		return map[string]interface{}{"type": "object"}
	default:
		return map[string]interface{}{"type": "string"}
	}
}

// BuildToolDefinitions converts a ToolDef registry into native function-calling
// tool definitions, filtered by an optional allow predicate (nil = allow all)
// and sorted by name for deterministic ordering.
func BuildToolDefinitions(registry map[string]ToolDef, allowed func(name string) bool) []ToolDefinition {
	names := make([]string, 0, len(registry))
	for name := range registry {
		if allowed == nil || allowed(name) {
			names = append(names, name)
		}
	}
	sort.Strings(names)

	defs := make([]ToolDefinition, 0, len(names))
	for _, name := range names {
		def := registry[name]
		defs = append(defs, ToolDefinition{
			Name:        name,
			Description: def.Description,
			Parameters:  SignatureToJSONSchema(def.Signature),
		})
	}
	return defs
}
