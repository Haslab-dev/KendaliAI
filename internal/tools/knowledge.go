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

func (tr *ToolRegistry) KnowledgeTools() map[string]ToolDef {
	knowledgeDir := GetKnowledgeDir()
	_ = os.MkdirAll(knowledgeDir, 0755)

	return map[string]ToolDef{
		"knowledge_embed": {
			Name:        "knowledge_embed",
			Description: "Embeds a piece of knowledge for semantic retrieval.",
			Signature:   `{"content": "string", "source": "string", "tags": "array"}`,
			Category:    "Knowledge",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				content, _ := args["content"].(string)
				source, _ := args["source"].(string)
				tags, _ := args["tags"].([]interface{})

				if content == "" {
					return "error: 'content' is required"
				}

				kbID := fmt.Sprintf("kb-%d", time.Now().UnixNano()/1000000)

				var tagList []string
				if tags != nil {
					for _, t := range tags {
						tagList = append(tagList, fmt.Sprintf("%v", t))
					}
				}

				kb := map[string]interface{}{
					"id":      kbID,
					"content": content,
					"source":  source,
					"tags":    tagList,
					"created": time.Now().Format(time.RFC3339),
				}

				data, _ := json.MarshalIndent(kb, "", "  ")
				kbPath := filepath.Join(knowledgeDir, kbID+".json")
				if err := os.WriteFile(kbPath, data, 0644); err != nil {
					return fmt.Sprintf("error saving knowledge: %v", err)
				}

				return fmt.Sprintf(`{"id":"%s","status":"embedded","tags":%v}`, kbID, tagList)
			},
		},

		"knowledge_search": {
			Name:        "knowledge_search",
			Description: "Searches stored knowledge by content or tags.",
			Signature:   `{"query": "string", "tags": "array", "limit": "int"}`,
			Category:    "Knowledge",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				query, _ := args["query"].(string)
				limit := 10
				if l, ok := args["limit"].(float64); ok {
					limit = int(l)
				}

				entries, _ := os.ReadDir(knowledgeDir)
				var matches []map[string]interface{}

				for _, e := range entries {
					if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
						continue
					}

					data, _ := os.ReadFile(filepath.Join(knowledgeDir, e.Name()))
					var kb map[string]interface{}
					if json.Unmarshal(data, &kb) != nil {
						continue
					}

					content, _ := kb["content"].(string)
					relevant := query == "" || strings.Contains(strings.ToLower(content), strings.ToLower(query))

					if relevant {
						matches = append(matches, kb)
						if len(matches) >= limit {
							break
						}
					}
				}

				if len(matches) == 0 {
					return "no matching knowledge found"
				}

				b, _ := json.MarshalIndent(matches, "", "  ")
				return string(b)
			},
		},

		"knowledge_summarize": {
			Name:        "knowledge_summarize",
			Description: "Creates a summary of content.",
			Signature:   `{"content": "string", "max_length": "int"}`,
			Category:    "Knowledge",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				content, _ := args["content"].(string)
				maxLength := 200
				if ml, ok := args["max_length"].(float64); ok {
					maxLength = int(ml)
				}

				if content == "" {
					return "error: 'content' is required"
				}

				sentences := strings.Split(content, ".")
				var summary []string
				length := 0

				for _, s := range sentences {
					s = strings.TrimSpace(s)
					if s == "" || length+len(s) > maxLength {
						continue
					}
					summary = append(summary, s)
					length += len(s)
				}

				result := strings.Join(summary, ".") + "."
				if len(result) > maxLength {
					result = result[:maxLength] + "..."
				}

				return fmt.Sprintf(`{"summary":"%s","original_length":%d}`, result, len(content))
			},
		},

		"knowledge_chunk": {
			Name:        "knowledge_chunk",
			Description: "Splits content into smaller chunks for embedding.",
			Signature:   `{"content": "string", "chunk_size": "int", "overlap": "int"}`,
			Category:    "Knowledge",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				content, _ := args["content"].(string)
				chunkSize := 500
				if cs, ok := args["chunk_size"].(float64); ok {
					chunkSize = int(cs)
				}
				overlap := 50
				if ov, ok := args["overlap"].(float64); ok {
					overlap = int(ov)
				}

				if content == "" {
					return "error: 'content' is required"
				}

				runes := []rune(content)
				var chunks []string

				for i := 0; i < len(runes); i += chunkSize - overlap {
					end := i + chunkSize
					if end > len(runes) {
						end = len(runes)
					}
					chunks = append(chunks, string(runes[i:end]))
					if end >= len(runes) {
						break
					}
				}

				return fmt.Sprintf(`{"chunks":%v,"count":%d}`, chunks, len(chunks))
			},
		},

		"knowledge_list": {
			Name:        "knowledge_list",
			Description: "Lists all stored knowledge items.",
			Signature:   `{"limit": "int"}`,
			Category:    "Knowledge",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				limit := 50
				if l, ok := args["limit"].(float64); ok {
					limit = int(l)
				}

				entries, _ := os.ReadDir(knowledgeDir)
				var items []map[string]interface{}

				for _, e := range entries {
					if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
						continue
					}

					data, _ := os.ReadFile(filepath.Join(knowledgeDir, e.Name()))
					var kb map[string]interface{}
					if json.Unmarshal(data, &kb) != nil {
						continue
					}

					delete(kb, "content")
					items = append(items, kb)

					if len(items) >= limit {
						break
					}
				}

				b, _ := json.MarshalIndent(items, "", "  ")
				return string(b)
			},
		},
	}
}
