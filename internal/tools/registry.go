package tools

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kendaliai/app/internal/config"
)

type ToolDef struct {
	Name        string
	Description string
	Signature   string
	Category    string
	Execute     func(ctx context.Context, args map[string]interface{}) string
}

type ToolRegistry struct {
	cfg           *config.Config
	workspaceRoot string
	db            *sql.DB
}

func NewToolRegistry(cfg *config.Config, workspaceRoot string, db *sql.DB) *ToolRegistry {
	return &ToolRegistry{
		cfg:           cfg,
		workspaceRoot: workspaceRoot,
		db:            db,
	}
}

func (tr *ToolRegistry) All() map[string]ToolDef {
	registry := make(map[string]ToolDef)

	for name, tool := range tr.SchedulerTools() {
		registry[name] = tool
	}
	for name, tool := range tr.NotificationTools() {
		registry[name] = tool
	}
	for name, tool := range tr.HTTPClientTools() {
		registry[name] = tool
	}
	for name, tool := range tr.DatabaseTools() {
		registry[name] = tool
	}
	for name, tool := range tr.SecretsTools() {
		registry[name] = tool
	}
	for name, tool := range tr.ArchiveTools() {
		registry[name] = tool
	}
	for name, tool := range tr.BrowserTools() {
		registry[name] = tool
	}
	for name, tool := range tr.CalendarTools() {
		registry[name] = tool
	}
	for name, tool := range tr.EmailTools() {
		registry[name] = tool
	}
	for name, tool := range tr.SpreadsheetTools() {
		registry[name] = tool
	}
	for name, tool := range tr.KnowledgeTools() {
		registry[name] = tool
	}
	for name, tool := range tr.WorkflowTools() {
		registry[name] = tool
	}

	return registry
}

func (tr *ToolRegistry) Categories() []string {
	return []string{
		"Scheduler",
		"Notification",
		"HTTP",
		"Database",
		"Secrets",
		"Archive",
		"Browser",
		"Calendar",
		"Email",
		"Spreadsheet",
		"Knowledge",
		"Workflow",
	}
}

func ToolDefToMap(tools map[string]ToolDef) []map[string]interface{} {
	var result []map[string]interface{}
	for name, tool := range tools {
		result = append(result, map[string]interface{}{
			"name":        name,
			"description": tool.Description,
			"signature":   tool.Signature,
			"category":    tool.Category,
		})
	}
	return result
}

func ExportToolsJSON(tools map[string]ToolDef) string {
	b, _ := json.MarshalIndent(ToolDefToMap(tools), "", "  ")
	return string(b)
}

func EnsureDir(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return os.MkdirAll(path, 0755)
	}
	return nil
}

func GetSecretsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kendaliai", "secrets")
}

func GetSchedulerDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kendaliai", "scheduler")
}

func GetWorkflowDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kendaliai", "workflows")
}

func GetKnowledgeDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kendaliai", "knowledge")
}

func WrapError(err error) string {
	if err == nil {
		return "success"
	}
	return fmt.Sprintf("error: %v", err)
}
