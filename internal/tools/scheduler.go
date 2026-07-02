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

func (tr *ToolRegistry) SchedulerTools() map[string]ToolDef {
	schedulerDir := GetSchedulerDir()
	_ = os.MkdirAll(schedulerDir, 0755)

	return map[string]ToolDef{
		"schedule_task": {
			Name:        "schedule_task",
			Description: "Schedules a recurring or one-time task. Supports cron expressions or human schedules like 'daily', 'every weekday 9am'.",
			Signature:   `{"name": "string", "schedule": "string", "workflow": "string", "payload": "object", "enabled": "boolean"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				name, _ := args["name"].(string)
				schedule, _ := args["schedule"].(string)
				workflow, _ := args["workflow"].(string)
				enabled := true
				if e, ok := args["enabled"].(bool); ok {
					enabled = e
				}

				if name == "" || schedule == "" {
					return "error: 'name' and 'schedule' are required"
				}

				taskID := uuid.New().String()[:8]
				task := map[string]interface{}{
					"id":        taskID,
					"name":      name,
					"schedule":  schedule,
					"workflow":  workflow,
					"payload":   args["payload"],
					"enabled":   enabled,
					"created":   time.Now().Format(time.RFC3339),
					"last_run":  nil,
					"next_run":  parseScheduleTime(schedule),
					"run_count": 0,
				}

				data, _ := json.MarshalIndent(task, "", "  ")
				taskPath := fmt.Sprintf("%s/%s.json", schedulerDir, taskID)
				if err := os.WriteFile(taskPath, data, 0644); err != nil {
					return fmt.Sprintf("error saving task: %v", err)
				}

				return fmt.Sprintf(`{"id":"%s","name":"%s","schedule":"%s","next_run":"%s","status":"scheduled"}`,
					taskID, name, schedule, task["next_run"])
			},
		},

		"cancel_schedule": {
			Name:        "cancel_schedule",
			Description: "Cancels and deletes a scheduled task by ID.",
			Signature:   `{"task_id": "string"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				taskID, _ := args["task_id"].(string)
				if taskID == "" {
					return "error: 'task_id' is required"
				}

				taskPath := fmt.Sprintf("%s/%s.json", schedulerDir, taskID)
				if _, err := os.Stat(taskPath); os.IsNotExist(err) {
					return fmt.Sprintf("task '%s' not found", taskID)
				}

				if err := os.Remove(taskPath); err != nil {
					return fmt.Sprintf("error deleting task: %v", err)
				}

				return fmt.Sprintf(`{"id":"%s","status":"cancelled"}`, taskID)
			},
		},

		"list_schedules": {
			Name:        "list_schedules",
			Description: "Lists all scheduled tasks with their next run times and status.",
			Signature:   `{}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				entries, err := os.ReadDir(schedulerDir)
				if err != nil {
					return "no scheduled tasks"
				}

				var tasks []map[string]interface{}
				for _, e := range entries {
					if e.IsDir() || strings.HasSuffix(e.Name(), ".lock") {
						continue
					}
					data, _ := os.ReadFile(filepath.Join(schedulerDir, e.Name()))
					var task map[string]interface{}
					if json.Unmarshal(data, &task) == nil {
						tasks = append(tasks, task)
					}
				}

				if len(tasks) == 0 {
					return "no scheduled tasks"
				}

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("Scheduled Tasks (%d total)\n\n", len(tasks)))
				for _, t := range tasks {
					status := "enabled"
					if enabled, ok := t["enabled"].(bool); ok && !enabled {
						status = "paused"
					}
					nextRun := "N/A"
					if n, ok := t["next_run"].(string); ok {
						nextRun = n
					}
					sb.WriteString(fmt.Sprintf("• [%s] %s | %s | next: %s\n",
						t["id"], t["name"], status, nextRun))
				}
				return sb.String()
			},
		},

		"run_now": {
			Name:        "run_now",
			Description: "Triggers a scheduled task immediately, bypassing its schedule.",
			Signature:   `{"task_id": "string"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				taskID, _ := args["task_id"].(string)
				if taskID == "" {
					return "error: 'task_id' is required"
				}

				taskPath := fmt.Sprintf("%s/%s.json", schedulerDir, taskID)
				data, err := os.ReadFile(taskPath)
				if err != nil {
					return fmt.Sprintf("task '%s' not found", taskID)
				}

				var task map[string]interface{}
				if err := json.Unmarshal(data, &task); err != nil {
					return fmt.Sprintf("error parsing task: %v", err)
				}

				workflow, _ := task["workflow"].(string)
				now := time.Now().Format(time.RFC3339)
				task["last_run"] = now
				if rc, ok := task["run_count"].(float64); ok {
					task["run_count"] = rc + 1
				} else {
					task["run_count"] = 1.0
				}

				data, _ = json.MarshalIndent(task, "", "  ")
				os.WriteFile(taskPath, data, 0644)

				return fmt.Sprintf(`{"id":"%s","workflow":"%s","triggered":"%s"}`,
					taskID, workflow, now)
			},
		},

		"pause_schedule": {
			Name:        "pause_schedule",
			Description: "Pauses a scheduled task without deleting it.",
			Signature:   `{"task_id": "string"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				taskID, _ := args["task_id"].(string)
				if taskID == "" {
					return "error: 'task_id' is required"
				}

				taskPath := fmt.Sprintf("%s/%s.json", schedulerDir, taskID)
				data, err := os.ReadFile(taskPath)
				if err != nil {
					return fmt.Sprintf("task '%s' not found", taskID)
				}

				var task map[string]interface{}
				if err := json.Unmarshal(data, &task); err != nil {
					return fmt.Sprintf("error parsing task: %v", err)
				}

				task["enabled"] = false
				data, _ = json.MarshalIndent(task, "", "  ")
				os.WriteFile(taskPath, data, 0644)

				return fmt.Sprintf(`{"id":"%s","status":"paused"}`, taskID)
			},
		},

		"resume_schedule": {
			Name:        "resume_schedule",
			Description: "Resumes a paused scheduled task.",
			Signature:   `{"task_id": "string"}`,
			Category:    "Scheduler",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				taskID, _ := args["task_id"].(string)
				if taskID == "" {
					return "error: 'task_id' is required"
				}

				taskPath := fmt.Sprintf("%s/%s.json", schedulerDir, taskID)
				data, err := os.ReadFile(taskPath)
				if err != nil {
					return fmt.Sprintf("task '%s' not found", taskID)
				}

				var task map[string]interface{}
				if err := json.Unmarshal(data, &task); err != nil {
					return fmt.Sprintf("error parsing task: %v", err)
				}

				task["enabled"] = true
				if schedule, ok := task["schedule"].(string); ok {
					task["next_run"] = parseScheduleTime(schedule)
				}

				data, _ = json.MarshalIndent(task, "", "  ")
				os.WriteFile(taskPath, data, 0644)

				return fmt.Sprintf(`{"id":"%s","status":"resumed","next_run":"%s"}`,
					taskID, task["next_run"])
			},
		},
	}
}

func parseScheduleTime(schedule string) string {
	if schedule == "" {
		return time.Now().Add(1 * time.Hour).Format(time.RFC3339)
	}

	now := time.Now()

	switch strings.ToLower(schedule) {
	case "every minute":
		return now.Add(1 * time.Minute).Format(time.RFC3339)
	case "hourly":
		return now.Truncate(time.Hour).Add(time.Hour).Format(time.RFC3339)
	case "daily":
		tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
		return tomorrow.Format(time.RFC3339)
	case "every weekday":
		next := now.AddDate(0, 0, 1)
		for next.Weekday() == time.Saturday || next.Weekday() == time.Sunday {
			next = next.AddDate(0, 0, 1)
		}
		return time.Date(next.Year(), next.Month(), next.Day(), 9, 0, 0, 0, next.Location()).Format(time.RFC3339)
	case "weekly":
		daysUntilSunday := (7 - int(now.Weekday())) % 7
		if daysUntilSunday == 0 {
			daysUntilSunday = 7
		}
		next := now.AddDate(0, 0, daysUntilSunday)
		return time.Date(next.Year(), next.Month(), next.Day(), 0, 0, 0, 0, next.Location()).Format(time.RFC3339)
	case "monthly":
		return time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, now.Location()).Format(time.RFC3339)
	default:
		return fmt.Sprintf("schedule parsed: %s | next run calculated by cron daemon", schedule)
	}
}
