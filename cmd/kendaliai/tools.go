package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/tools"
	"github.com/spf13/cobra"
)

var toolsCmd = &cobra.Command{
	Use:   "tools",
	Short: "List all available agent tools with their signatures",
	Run:   runTools,
}

var runtimeToolsCmd = &cobra.Command{
	Use:   "runtime-tools",
	Short: "List runtime automation tools (scheduler, email, workflow, etc.)",
	Run:   runRuntimeTools,
}

func init() {
	rootCmd.AddCommand(toolsCmd)
	rootCmd.AddCommand(runtimeToolsCmd)
}

func runTools(cmd *cobra.Command, args []string) {
	cwd, _ := os.Getwd()
	reg := agent.GetToolRegistry(nil, nil, cwd, nil)

	categories := map[string][]agent.ToolDef{}
	for _, tool := range reg {
		categories[tool.Category] = append(categories[tool.Category], tool)
	}

	order := []string{"Explore", "Intelligence", "Editing", "Skill", "Verification", "Memory", "Git", "Object", "MCP", "Shell"}
	fmt.Println()
	for _, cat := range order {
		tools := categories[cat]
		if len(tools) == 0 {
			continue
		}
		fmt.Printf("  ▸ %s (%d)\n", cat, len(tools))
		for _, t := range tools {
			fmt.Printf("    %-24s %s\n", t.Name, t.Signature)
		}
		fmt.Println()
	}

	fmt.Printf("  Total: %d agent tools\n", len(reg))
}

func runRuntimeTools(cmd *cobra.Command, args []string) {
	cwd, _ := os.Getwd()
	tr := tools.NewToolRegistry(nil, cwd, nil)
	all := tr.All()

	b, _ := json.MarshalIndent(tools.ToolDefToMap(all), "", "  ")
	fmt.Println(string(b))
	fmt.Printf("\n  Total: %d runtime tools\n", len(all))
}