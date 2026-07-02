package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

func (tr *ToolRegistry) WorkflowTools() map[string]ToolDef {
	workflowDir := GetWorkflowDir()
	_ = os.MkdirAll(workflowDir, 0755)

	return map[string]ToolDef{
		"workflow_create": {
			Name:        "workflow_create",
			Description: "Creates a new workflow definition with steps.",
			Signature:   `{"name": "string", "description": "string", "steps": "array"}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				name, _ := args["name"].(string)
				description, _ := args["description"].(string)
				steps, _ := args["steps"].([]interface{})

				if name == "" {
					return "error: 'name' is required"
				}

				workflowID := uuid.New().String()[:8]
				workflow := map[string]interface{}{
					"id":          workflowID,
					"name":        name,
					"description": description,
					"steps":       steps,
					"status":      "draft",
					"created":     time.Now().Format(time.RFC3339),
					"updated":     time.Now().Format(time.RFC3339),
				}

				data, _ := json.MarshalIndent(workflow, "", "  ")
				wfPath := filepath.Join(workflowDir, workflowID+".json")
				if err := os.WriteFile(wfPath, data, 0644); err != nil {
					return fmt.Sprintf("error saving workflow: %v", err)
				}

				return fmt.Sprintf(`{"id":"%s","name":"%s","status":"created","steps":%d}`,
					workflowID, name, len(steps))
			},
		},

		"workflow_run": {
			Name:        "workflow_run",
			Description: "Executes a workflow by ID.",
			Signature:   `{"id": "string", "params": "object"}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}

				absPath := filepath.Join(workflowDir, id+".json")
				if _, err := os.Stat(absPath); os.IsNotExist(err) {
					return fmt.Sprintf("workflow '%s' not found", id)
				}

				data, _ := os.ReadFile(absPath)
				var workflow map[string]interface{}
				json.Unmarshal(data, &workflow)

				steps, _ := workflow["steps"].([]interface{})
				workflow["status"] = "running"
				workflow["last_run"] = time.Now().Format(time.RFC3339)

				data, _ = json.MarshalIndent(workflow, "", "  ")
				os.WriteFile(absPath, data, 0644)

				return fmt.Sprintf(`{"id":"%s","name":"%s","status":"started","steps":%d}`,
					id, workflow["name"], len(steps))
			},
		},

		"workflow_pause": {
			Name:        "workflow_pause",
			Description: "Pauses a running workflow.",
			Signature:   `{"id": "string"}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}

				absPath := filepath.Join(workflowDir, id+".json")
				data, err := os.ReadFile(absPath)
				if err != nil {
					return fmt.Sprintf("workflow '%s' not found", id)
				}

				var workflow map[string]interface{}
				json.Unmarshal(data, &workflow)

				workflow["status"] = "paused"
				workflow["paused_at"] = time.Now().Format(time.RFC3339)

				data, _ = json.MarshalIndent(workflow, "", "  ")
				os.WriteFile(absPath, data, 0644)

				return fmt.Sprintf(`{"id":"%s","status":"paused"}`, id)
			},
		},

		"workflow_cancel": {
			Name:        "workflow_cancel",
			Description: "Cancels and deletes a workflow.",
			Signature:   `{"id": "string"}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}

				absPath := filepath.Join(workflowDir, id+".json")
				if _, err := os.Stat(absPath); os.IsNotExist(err) {
					return fmt.Sprintf("workflow '%s' not found", id)
				}

				os.Remove(absPath)
				return fmt.Sprintf(`{"id":"%s","status":"cancelled"}`, id)
			},
		},

		"workflow_list": {
			Name:        "workflow_list",
			Description: "Lists all defined workflows.",
			Signature:   `{}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				entries, err := os.ReadDir(workflowDir)
				if err != nil {
					return "no workflows defined"
				}

				var workflows []map[string]interface{}
				for _, e := range entries {
					if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
						continue
					}

					data, _ := os.ReadFile(filepath.Join(workflowDir, e.Name()))
					var wf map[string]interface{}
					if json.Unmarshal(data, &wf) == nil {
						delete(wf, "steps")
						delete(wf, "results")
						workflows = append(workflows, wf)
					}
				}

				if len(workflows) == 0 {
					return "no workflows defined"
				}

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("Workflows (%d total)\n\n", len(workflows)))
				for _, wf := range workflows {
					sb.WriteString(fmt.Sprintf("• [%s] %s | %s\n",
						wf["id"], wf["name"], wf["status"]))
				}

				return sb.String()
			},
		},

		"workflow_info": {
			Name:        "workflow_info",
			Description: "Gets detailed information about a workflow.",
			Signature:   `{"id": "string"}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}

				absPath := filepath.Join(workflowDir, id+".json")
				data, err := os.ReadFile(absPath)
				if err != nil {
					return fmt.Sprintf("workflow '%s' not found", id)
				}

				return string(data)
			},
		},

		"workflow_resume": {
			Name:        "workflow_resume",
			Description: "Resumes a paused workflow.",
			Signature:   `{"id": "string"}`,
			Category:    "Workflow",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				id, _ := args["id"].(string)
				if id == "" {
					return "error: 'id' is required"
				}

				absPath := filepath.Join(workflowDir, id+".json")
				data, err := os.ReadFile(absPath)
				if err != nil {
					return fmt.Sprintf("workflow '%s' not found", id)
				}

				var workflow map[string]interface{}
				json.Unmarshal(data, &workflow)

				workflow["status"] = "running"
				workflow["resumed_at"] = time.Now().Format(time.RFC3339)

				data, _ = json.MarshalIndent(workflow, "", "  ")
				os.WriteFile(absPath, data, 0644)

				return fmt.Sprintf(`{"id":"%s","status":"resumed"}`, id)
			},
		},
	}
}
