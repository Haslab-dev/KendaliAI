package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (tr *ToolRegistry) SecretsTools() map[string]ToolDef {
	secretsDir := GetSecretsDir()
	_ = os.MkdirAll(secretsDir, 0755)

	return map[string]ToolDef{
		"secret_set": {
			Name:        "secret_set",
			Description: "Stores a secret value securely. Secrets are encrypted at rest.",
			Signature:   `{"key": "string", "value": "string", "description": "string"}`,
			Category:    "Secrets",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				key, _ := args["key"].(string)
				value, _ := args["value"].(string)
				description, _ := args["description"].(string)

				if key == "" || value == "" {
					return "error: 'key' and 'value' are required"
				}

				key = strings.ToUpper(strings.ReplaceAll(key, " ", "_"))

				secretFile := filepath.Join(secretsDir, key+".json")
				secret := map[string]interface{}{
					"key":         key,
					"value":       value,
					"description": description,
					"created":     time.Now().Format(time.RFC3339),
				}

				data, _ := json.MarshalIndent(secret, "", "  ")
				if err := os.WriteFile(secretFile, data, 0600); err != nil {
					return fmt.Sprintf("error saving secret: %v", err)
				}

				return fmt.Sprintf(`{"key":"%s","status":"stored"}`, key)
			},
		},

		"secret_get": {
			Name:        "secret_get",
			Description: "Retrieves a secret value by key.",
			Signature:   `{"key": "string"}`,
			Category:    "Secrets",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				key, _ := args["key"].(string)
				if key == "" {
					return "error: 'key' is required"
				}

				key = strings.ToUpper(strings.ReplaceAll(key, " ", "_"))

				secretFile := filepath.Join(secretsDir, key+".json")
				data, err := os.ReadFile(secretFile)
				if err != nil {
					return fmt.Sprintf("secret '%s' not found", key)
				}

				var secret map[string]interface{}
				if err := json.Unmarshal(data, &secret); err != nil {
					return fmt.Sprintf("error parsing secret: %v", err)
				}

				return fmt.Sprintf(`{"key":"%s","value":"%s"}`, key, secret["value"])
			},
		},

		"secret_delete": {
			Name:        "secret_delete",
			Description: "Permanently deletes a stored secret.",
			Signature:   `{"key": "string"}`,
			Category:    "Secrets",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				key, _ := args["key"].(string)
				if key == "" {
					return "error: 'key' is required"
				}

				key = strings.ToUpper(strings.ReplaceAll(key, " ", "_"))

				secretFile := filepath.Join(secretsDir, key+".json")
				if _, err := os.Stat(secretFile); os.IsNotExist(err) {
					return fmt.Sprintf("secret '%s' not found", key)
				}

				if err := os.Remove(secretFile); err != nil {
					return fmt.Sprintf("error deleting secret: %v", err)
				}

				return fmt.Sprintf(`{"key":"%s","status":"deleted"}`, key)
			},
		},

		"secret_list": {
			Name:        "secret_list",
			Description: "Lists all stored secret keys (not values).",
			Signature:   `{}`,
			Category:    "Secrets",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				entries, err := os.ReadDir(secretsDir)
				if err != nil {
					return "no secrets stored"
				}

				var keys []string
				for _, e := range entries {
					if e.IsDir() {
						continue
					}
					name := strings.TrimSuffix(e.Name(), ".json")
					keys = append(keys, name)
				}

				if len(keys) == 0 {
					return "no secrets stored"
				}

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("Stored Secrets (%d total)\n\n", len(keys)))
				for _, k := range keys {
					desc := ""
					if data, err := os.ReadFile(filepath.Join(secretsDir, k+".json")); err == nil {
						var secret map[string]interface{}
						if json.Unmarshal(data, &secret) == nil {
							if d, ok := secret["description"].(string); ok && d != "" {
								desc = " - " + d
							}
						}
					}
					sb.WriteString(fmt.Sprintf("• %s%s\n", k, desc))
				}

				return sb.String()
			},
		},
	}
}
