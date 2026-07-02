package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/skills"
	"github.com/spf13/cobra"
)

var skillCmd = &cobra.Command{
	Use:   "skill",
	Short: "Manage skills (create, list, show, delete)",
}

var skillCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Interactive wizard to create a new skill",
	Run:   runSkillCreate,
}

var skillListCmd = &cobra.Command{
	Use:   "list",
	Short: "List installed skills",
	Run:   runSkillList,
}

var skillShowCmd = &cobra.Command{
	Use:   "show <skill-id>",
	Short: "Show full details of a skill",
	Args:  cobra.ExactArgs(1),
	Run:   runSkillShow,
}

var skillDeleteCmd = &cobra.Command{
	Use:   "delete <skill-id>",
	Short: "Delete an installed skill",
	Args:  cobra.ExactArgs(1),
	Run:   runSkillDelete,
}

func init() {
	skillCmd.AddCommand(skillCreateCmd, skillListCmd, skillShowCmd, skillDeleteCmd)
	rootCmd.AddCommand(skillCmd)
}

func runSkillCreate(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	basePath := filepath.Join(homeDir, ".kendaliai", "skills")
	manager := skills.NewManager(basePath)

	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║       KendaliAI Skill Wizard             ║")
	fmt.Println("╚══════════════════════════════════════════╝")
	fmt.Println()
	fmt.Println("Create a specialized persona that auto-routes")
	fmt.Println("matching user requests to expert behavior.")
	fmt.Println()

	reader := bufio.NewReader(os.Stdin)

	name := prompt(reader, "Skill name", "e.g. 'Frontend Designer', 'Go Expert'")
	description := prompt(reader, "Description", "e.g. 'Expert at building React components with Tailwind CSS'")
	keywords := prompt(reader, "Routing keywords (comma-separated)", "e.g. 'frontend, ui, component, design, tailwind, css, react'")
	toolsAllowed := prompt(reader, "Allowed tools (comma-separated, empty=all)", "e.g. 'read_file, apply_patch, exec'")
	toolsDenied := prompt(reader, "Denied tools (comma-separated, empty=none)", "e.g. 'exec, git_apply_patch'")
	constraints := prompt(reader, "Constraints (comma-separated, empty=none)", "e.g. 'Never use inline styles, Prefer Tailwind classes'")
	promptText := promptMultiline(reader, "Prompt / System Instructions", "Enter the skill's prompt text. End with a line containing only '.'")

	id := sanitizeID(name)
	pkg := skills.SkillPackage{
		Spec: skills.SkillSpec{
			ID:          id,
			Name:        name,
			Version:     "1.0.0",
			Description: description,
			Category:    "custom",
			Routing: struct {
				Keywords   []string `yaml:"keywords" json:"keywords"`
				Threshold  float64  `yaml:"threshold" json:"threshold"`
				Confidence float64  `yaml:"confidence,omitempty" json:"confidence,omitempty"`
			}{
				Keywords:   splitTrim(keywords),
				Threshold:  0.7,
			},
			Tools: struct {
				Allowed []string `yaml:"allowed" json:"allowed"`
				Denied  []string `yaml:"denied" json:"denied"`
			}{
				Allowed: splitTrim(toolsAllowed),
				Denied:  splitTrim(toolsDenied),
			},
			Constraints: splitTrim(constraints),
			Lifecycle: skills.Lifecycle{
				OnInstall: "build_embeddings",
				OnDelete:  "remove_embeddings",
			},
		},
		Prompt: promptText,
	}

	if err := manager.Create(pkg); err != nil {
		fmt.Printf("\n  ✗ Failed to create skill: %v\n", err)
		os.Exit(1)
	}

	writeSkillsJSON(homeDir, pkg)

	cwd, _ := os.Getwd()
	storageDir := filepath.Join(cwd, "storage", "skills", id)
	os.MkdirAll(storageDir, 0755)

	fmt.Println()
	fmt.Printf("  ✓ Skill '%s' created [id=%s]\n", name, id)
	fmt.Printf("    Keywords: %s\n", strings.Join(pkg.Spec.Routing.Keywords, ", "))
	fmt.Printf("    Path: %s\n", filepath.Join(basePath, "generated", id))
	fmt.Printf("    Storage: %s\n", storageDir)
	fmt.Println()
}

func runSkillList(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	specs, err := manager.List()
	if err != nil {
		fmt.Printf("  ✗ Failed to list skills: %v\n", err)
		os.Exit(1)
	}

	if len(specs) == 0 {
		fmt.Println("No skills installed. Create one with: kendaliai skill create")
		return
	}

	fmt.Println()
	for _, s := range specs {
		fmt.Printf("  %-20s [%s] v%s\n", s.Name, s.ID, s.Version)
		fmt.Printf("    %s\n", s.Description)
		if len(s.Routing.Keywords) > 0 {
			fmt.Printf("    Keywords: %s\n", strings.Join(s.Routing.Keywords, ", "))
		}
		fmt.Println()
	}
}

func runSkillShow(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  ✗ Skill '%s' not found\n", args[0])
		os.Exit(1)
	}

	fmt.Println()
	fmt.Printf("  Name:        %s\n", pkg.Spec.Name)
	fmt.Printf("  ID:          %s\n", pkg.Spec.ID)
	fmt.Printf("  Version:     %s\n", pkg.Spec.Version)
	fmt.Printf("  Description: %s\n", pkg.Spec.Description)
	fmt.Printf("  Category:    %s\n", pkg.Spec.Category)
	fmt.Println()

	if len(pkg.Spec.Routing.Keywords) > 0 {
		fmt.Printf("  Keywords:    %s\n", strings.Join(pkg.Spec.Routing.Keywords, ", "))
		fmt.Printf("  Threshold:   %.2f\n", pkg.Spec.Routing.Threshold)
	}

	if len(pkg.Spec.Tools.Allowed) > 0 {
		fmt.Printf("  Tools Allowed: %s\n", strings.Join(pkg.Spec.Tools.Allowed, ", "))
	}
	if len(pkg.Spec.Tools.Denied) > 0 {
		fmt.Printf("  Tools Denied:  %s\n", strings.Join(pkg.Spec.Tools.Denied, ", "))
	}

	if len(pkg.Spec.Constraints) > 0 {
		fmt.Println()
		fmt.Println("  Constraints:")
		for _, c := range pkg.Spec.Constraints {
			fmt.Printf("    - %s\n", c)
		}
	}

	fmt.Println()
	fmt.Println("  ── Prompt ──")
	fmt.Println()
	for _, line := range strings.Split(pkg.Prompt, "\n") {
		fmt.Printf("  %s\n", line)
	}
	fmt.Println()

	if pkg.Examples != "" {
		fmt.Println("  ── Examples ──")
		fmt.Println(pkg.Examples)
		fmt.Println()
	}
}

func runSkillDelete(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  ✗ Skill '%s' not found\n", args[0])
		os.Exit(1)
	}

	fmt.Printf("  Delete '%s' [%s]? [y/N] ", pkg.Spec.Name, pkg.Spec.ID)
	var confirm string
	fmt.Scanln(&confirm)
	if strings.ToLower(confirm) != "y" {
		fmt.Println("  Cancelled.")
		return
	}

	if err := manager.Delete(args[0]); err != nil {
		fmt.Printf("  ✗ Failed: %v\n", err)
		os.Exit(1)
	}

	removeFromSkillsJSON(homeDir, args[0])
	fmt.Printf("  ✓ Deleted '%s'\n", pkg.Spec.Name)
}

func prompt(reader *bufio.Reader, label, placeholder string) string {
	if placeholder != "" {
		fmt.Printf("  %s\n    %s\n  → ", label, placeholder)
	} else {
		fmt.Printf("  %s\n  → ", label)
	}
	input, _ := reader.ReadString('\n')
	return strings.TrimSpace(input)
}

func promptMultiline(reader *bufio.Reader, label, placeholder string) string {
	fmt.Printf("  %s\n", label)
	if placeholder != "" {
		fmt.Printf("    %s\n", placeholder)
	}
	fmt.Println("  (type '.' on a new line to finish)")

	var lines []string
	for {
		fmt.Print("  | ")
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimRight(line, "\n")
		if line == "." {
			break
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func sanitizeID(name string) string {
	id := strings.ToLower(name)
	id = strings.ReplaceAll(id, " ", "-")
	id = strings.ReplaceAll(id, "_", "-")
	clean := ""
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			clean += string(r)
		}
	}
	if clean == "" {
		clean = "custom-skill"
	}
	return clean
}

func splitTrim(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

type skillsJSON struct {
	Skills []skillJSONEntry `json:"skills"`
}

type skillJSONEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Installed   bool   `json:"installed"`
}

func writeSkillsJSON(homeDir string, pkg skills.SkillPackage) {
	path := filepath.Join(homeDir, ".kendaliai", "skills", "skills.json")
	var registry skillsJSON

	data, _ := os.ReadFile(path)
	json.Unmarshal(data, &registry)

	for i, s := range registry.Skills {
		if s.ID == pkg.Spec.ID {
			registry.Skills[i].Installed = true
			registry.Skills[i].Name = pkg.Spec.Name
			registry.Skills[i].Description = pkg.Spec.Description
			saveSkillsJSON(path, &registry)
			return
		}
	}

	registry.Skills = append(registry.Skills, skillJSONEntry{
		ID:          pkg.Spec.ID,
		Name:        pkg.Spec.Name,
		Description: pkg.Spec.Description,
		Installed:   true,
	})
	saveSkillsJSON(path, &registry)
}

func removeFromSkillsJSON(homeDir string, id string) {
	path := filepath.Join(homeDir, ".kendaliai", "skills", "skills.json")
	var registry skillsJSON

	data, _ := os.ReadFile(path)
	json.Unmarshal(data, &registry)

	filtered := registry.Skills[:0]
	for _, s := range registry.Skills {
		if s.ID != id {
			filtered = append(filtered, s)
		}
	}
	registry.Skills = filtered
	saveSkillsJSON(path, &registry)
}

func saveSkillsJSON(path string, registry *skillsJSON) {
	b, _ := json.MarshalIndent(registry, "", "  ")
	os.WriteFile(path, b, 0644)
}
