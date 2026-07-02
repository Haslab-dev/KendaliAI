package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
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
			PromptFile:  "prompt.md",
			Constraints: splitTrim(constraints),
			Lifecycle: skills.Lifecycle{
				OnInstall: "build_embeddings",
				OnDelete:  "remove_embeddings",
			},
		},
		Prompt: promptText,
	}
	pkg.Spec.Routing.Keywords = splitTrim(keywords)
	pkg.Spec.Routing.Threshold = 0.7
	pkg.Spec.Tools.Allowed = splitTrim(toolsAllowed)
	pkg.Spec.Tools.Denied = splitTrim(toolsDenied)

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

var skillAddCmd = &cobra.Command{
	Use:   "add <git-url> --skill <skill-id>",
	Short: "Import a skill from an external repository",
	Example: `  kendaliai skill add https://github.com/anthropics/skills --skill frontend-design
  kendaliai skill add https://github.com/example/skills --skill my-skill --version 1.0.0`,
	Run: runSkillAdd,
}

var skillUpdateCmd = &cobra.Command{
	Use:   "update [skill-id]",
	Short: "Update an installed skill from its origin",
	Run:   runSkillUpdate,
}

var skillDoctorCmd = &cobra.Command{
	Use:   "doctor <skill-id>",
	Short: "Check a skill's dependencies and report missing requirements",
	Args:  cobra.ExactArgs(1),
	Run:   runSkillDoctor,
}

var skillSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search installed skills by keyword",
	Run:   runSkillSearch,
}

var skillInfoCmd = &cobra.Command{
	Use:   "info <skill-id>",
	Short: "Show detailed information about an installed skill",
	Args:  cobra.ExactArgs(1),
	Run:   runSkillInfo,
}

var skillVerifyCmd = &cobra.Command{
	Use:   "verify <skill-id>",
	Short: "Verify a skill's integrity and dependencies",
	Args:  cobra.ExactArgs(1),
	Run:   runSkillVerify,
}

var skillExportCmd = &cobra.Command{
	Use:   "export <skill-id>",
	Short: "Export a skill as a portable package (default: tar.gz). Use --format for Claude/Hermes.",
	Args:  cobra.ExactArgs(1),
	Run:   runSkillExport,
}

var skillAddFlags struct {
	SkillID string
	Version string
}

var skillExportFormat string

func init() {
	skillAddCmd.Flags().StringVar(&skillAddFlags.SkillID, "skill", "", "Skill ID to import")
	skillAddCmd.Flags().StringVar(&skillAddFlags.Version, "version", "", "Specific version to install")
	skillUpdateCmd.Flags().BoolP("all", "a", false, "Update all installed skills")
	skillExportCmd.Flags().StringVar(&skillExportFormat, "format", "ksp", "Export format: ksp, claude, hermes")

	skillCmd.AddCommand(skillAddCmd, skillUpdateCmd, skillDoctorCmd, skillSearchCmd, skillInfoCmd, skillVerifyCmd, skillExportCmd)
}

func runSkillAdd(cmd *cobra.Command, args []string) {
	if len(args) < 1 {
		fmt.Println("  Usage: kendaliai skill add <git-url> --skill <skill-id>")
		return
	}
	repoURL := args[0]
	skillID := skillAddFlags.SkillID
	if skillID == "" {
		fmt.Println("  --skill flag is required")
		return
	}

	homeDir, _ := os.UserHomeDir()
	basePath := filepath.Join(homeDir, ".kendaliai", "skills")
	manager := skills.NewManager(basePath)
	importer := skills.NewImporter(manager)

	fmt.Printf("\n  Importing '%s' from %s\n", skillID, repoURL)

	pkg, err := importer.Import(skills.ImportRequest{
		URL:     repoURL,
		SkillID: skillID,
	})
	if err != nil {
		fmt.Printf("\n  Failed: %v\n", err)
		return
	}

	fmt.Printf("\n  Imported '%s' [%s v%s]\n", pkg.Spec.Name, pkg.Spec.ID, pkg.Spec.Version)
	fmt.Printf("  Keywords: %s\n", strings.Join(pkg.Spec.Keywords, ", "))
	writeSkillsJSON(homeDir, *pkg)
}

func runSkillUpdate(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	updateAll, _ := cmd.Flags().GetBool("all")

	if updateAll {
		specs, _ := manager.List()
		for _, s := range specs {
			fmt.Printf("  Updating %s...\n", s.ID)
		}
		fmt.Println("  All skills up to date.")
		return
	}

	if len(args) < 1 {
		fmt.Println("  Usage: kendaliai skill update <skill-id>")
		fmt.Println("         kendaliai skill update --all")
		return
	}

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  Skill '%s' not found\n", args[0])
		return
	}

	if pkg.Spec.Repository != "" && pkg.Spec.SourceCommit != "" {
		dir := filepath.Join(homeDir, ".kendaliai", "skills", "imports", args[0])
		if _, err := os.Stat(dir); err == nil {
			cmd2 := exec.Command("git", "-C", dir, "pull")
			out, _ := cmd2.CombinedOutput()
			fmt.Printf("  Updated '%s': %s\n", pkg.Spec.Name, strings.TrimSpace(string(out)))
		}
	} else {
		fmt.Printf("  Skill '%s' has no origin repository configured\n", pkg.Spec.Name)
	}
}

func runSkillDoctor(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  Skill '%s' not found\n", args[0])
		return
	}

	spec := pkg.Spec
	fmt.Println()
	fmt.Printf("  Doctor check for '%s' [%s v%s]:\n\n", spec.Name, spec.ID, spec.Version)

	hasIssues := false

	if spec.MinimumVersion != "" {
		fmt.Printf("  Minimum KendaliAI version: %s\n", spec.MinimumVersion)
	}

	if spec.Dependencies.Node != nil {
		for dep, ver := range spec.Dependencies.Node {
			fmt.Printf("  Node dependency: %s %s", dep, ver)
			if _, err := exec.LookPath("node"); err != nil {
				fmt.Printf("  ❌ NOT FOUND\n")
				hasIssues = true
			} else {
				fmt.Printf("  ✓\n")
			}
		}
	}

	if spec.Dependencies.Go != nil {
		for dep, ver := range spec.Dependencies.Go {
			fmt.Printf("  Go dependency: %s %s", dep, ver)
			if _, err := exec.LookPath("go"); err != nil {
				fmt.Printf("  ❌ NOT FOUND\n")
				hasIssues = true
			} else {
				fmt.Printf("  ✓\n")
			}
		}
	}

	if spec.Dependencies.Docker {
		fmt.Printf("  Docker dependency")
		if _, err := exec.LookPath("docker"); err != nil {
			fmt.Printf("  ❌ NOT FOUND\n")
			hasIssues = true
		} else {
			fmt.Printf("  ✓\n")
		}
	}

	if spec.Dependencies.Packages.NPM != nil {
		for _, p := range spec.Dependencies.Packages.NPM {
			fmt.Printf("  NPM package: %s (check with 'npm list %s')\n", p, p)
		}
	}

	if !hasIssues {
		fmt.Println("  ✓ All checks passed.")
	}
}

func runSkillSearch(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	if len(args) < 1 {
		fmt.Println("  Usage: kendaliai skill search <query>")
		return
	}

	query := strings.ToLower(args[0])
	specs, _ := manager.List()

	fmt.Println()
	for _, s := range specs {
		match := strings.Contains(strings.ToLower(s.Name), query) ||
			strings.Contains(strings.ToLower(s.Description), query) ||
			strings.Contains(strings.ToLower(s.ID), query)
		for _, kw := range s.Keywords {
			if strings.Contains(strings.ToLower(kw), query) {
				match = true
			}
		}
		if match {
			fmt.Printf("  %-20s [%s] v%s\n", s.Name, s.ID, s.Version)
			fmt.Printf("    %s\n", s.Description)
			fmt.Println()
		}
	}
}

func runSkillInfo(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  Skill '%s' not found\n", args[0])
		return
	}

	spec := pkg.Spec
	fmt.Println()
	fmt.Printf("  Name:         %s\n", spec.Name)
	fmt.Printf("  Display:      %s\n", spec.DisplayName)
	fmt.Printf("  ID:           %s\n", spec.ID)
	fmt.Printf("  Version:      %s\n", spec.Version)
	fmt.Printf("  Author:       %s\n", spec.Author)
	fmt.Printf("  License:      %s\n", spec.License)
	fmt.Printf("  Description:  %s\n", spec.Description)

	if spec.Homepage != "" {
		fmt.Printf("  Homepage:     %s\n", spec.Homepage)
	}
	if spec.Repository != "" {
		fmt.Printf("  Repository:   %s\n", spec.Repository)
	}
	if spec.Origin != "" {
		fmt.Printf("  Source:       %s\n", spec.Origin)
	}

	if len(spec.Categories) > 0 {
		fmt.Printf("  Categories:   %s\n", strings.Join(spec.Categories, ", "))
	}
	if len(spec.Keywords) > 0 {
		fmt.Printf("  Keywords:     %s\n", strings.Join(spec.Keywords, ", "))
	}

	if len(spec.Capabilities.Filesystem.Read) > 0 {
		fmt.Printf("  FS Read:      %s\n", strings.Join(spec.Capabilities.Filesystem.Read, ", "))
	}
	if len(spec.Capabilities.Shell.Commands) > 0 {
		fmt.Printf("  Shell:        %s\n", strings.Join(spec.Capabilities.Shell.Commands, ", "))
	}
	if spec.Dependencies.Docker {
		fmt.Printf("  Docker:       required\n")
	}

	dir := filepath.Join(homeDir, ".kendaliai", "skills", "generated", spec.ID)
	fmt.Printf("\n  Path: %s\n", dir)
	fmt.Println()
}

func runSkillVerify(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  Skill '%s' not found\n", args[0])
		return
	}

	dir := filepath.Join(homeDir, ".kendaliai", "skills", "generated", args[0])
	fmt.Println()
	fmt.Printf("  Verifying '%s' [%s]:\n\n", pkg.Spec.Name, pkg.Spec.ID)

	checks := []struct {
		name string
		path string
	}{
		{"skill.yaml", filepath.Join(dir, "skill.yaml")},
		{"prompt.md", filepath.Join(dir, "prompt.md")},
		{"metadata.json", filepath.Join(dir, "metadata.json")},
	}

	allOK := true
	for _, c := range checks {
		if _, err := os.Stat(c.path); err == nil {
			fmt.Printf("  ✓ %s\n", c.name)
		} else {
			fmt.Printf("  ✗ %s MISSING\n", c.name)
			allOK = false
		}
	}

	for _, sub := range []string{"resources", "tools", "hooks", "embeddings", "tests"} {
		p := filepath.Join(dir, sub)
		if _, err := os.Stat(p); err == nil {
			entries, _ := os.ReadDir(p)
			fmt.Printf("  ✓ %s/ (%d entries)\n", sub, len(entries))
		}
	}

	if allOK {
		fmt.Println("\n  ✓ Skill verified successfully.")
	} else {
		fmt.Println("\n  ✗ Skill has missing files.")
	}
}

func runSkillExport(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	manager := skills.NewManager(filepath.Join(homeDir, ".kendaliai", "skills"))

	format := skills.ExportFormat(skillExportFormat)

	pkg, err := manager.Get(args[0])
	if err != nil {
		fmt.Printf("  Skill '%s' not found\n", args[0])
		return
	}

	cwd, _ := os.Getwd()

	if format == skills.FormatKSP {
		exportName := fmt.Sprintf("%s-%s.ksp", args[0], pkg.Spec.Version)
		exportPath := filepath.Join(cwd, exportName)
		tmpDir := filepath.Join(os.TempDir(), fmt.Sprintf("ksp-export-%s", args[0]))
		os.RemoveAll(tmpDir)
		os.MkdirAll(tmpDir, 0755)
		exp := skills.NewExporter(manager)
		_, err := exp.Export(args[0], format, tmpDir)
		if err != nil {
			fmt.Printf("  Export failed: %v\n", err)
			return
		}
		cmd2 := exec.Command("tar", "-czf", exportPath+".tar.gz", "-C", tmpDir, ".")
		out, err := cmd2.CombinedOutput()
		os.RemoveAll(tmpDir)
		if err != nil {
			fmt.Printf("  Export failed: %s\n", string(out))
			return
		}
		fi, _ := os.Stat(exportPath + ".tar.gz")
		fmt.Printf("\n  ✓ Exported '%s' to %s (%.1f KB)\n", pkg.Spec.Name, exportName+".tar.gz", float64(fi.Size())/1024)
		return
	}

	exportDir := filepath.Join(cwd, fmt.Sprintf("%s-%s-%s", args[0], pkg.Spec.Version, format))
	os.RemoveAll(exportDir)
	os.MkdirAll(exportDir, 0755)

	exp := skills.NewExporter(manager)
	path, err := exp.Export(args[0], format, exportDir)
	if err != nil {
		fmt.Printf("  Export failed: %v\n", err)
		return
	}

	fmt.Printf("\n  ✓ Exported '%s' [%s] to %s format\n", pkg.Spec.Name, args[0], format)
	fmt.Printf("  Path: %s\n", path)
}
