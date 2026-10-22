package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/kendaliai/app/internal/acp"
	"github.com/kendaliai/app/internal/runtime"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var agentCmd = &cobra.Command{
	Use:   "agent",
	Short: "Manage agent manifests (create, list, install, show, delete, find)",
}

var agentCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Interactive wizard to create a new agent manifest",
	Run:   runAgentCreate,
}

var agentListCmd = &cobra.Command{
	Use:   "list",
	Short: "List installed agent manifests",
	Run:   runAgentList,
}

var agentShowCmd = &cobra.Command{
	Use:   "show <agent-id>",
	Short: "Show details of an agent manifest",
	Args:  cobra.ExactArgs(1),
	Run:   runAgentShow,
}

var agentInstallCmd = &cobra.Command{
	Use:   "install <url-or-local-path>",
	Short: "Install an agent manifest from a remote URL or local path",
	Args:  cobra.ExactArgs(1),
	Run:   runAgentInstall,
}

var agentDeleteCmd = &cobra.Command{
	Use:   "delete <agent-id>",
	Short: "Delete an installed agent manifest",
	Args:  cobra.ExactArgs(1),
	Run:   runAgentDelete,
}

var (
	agentFindJson          bool
	agentFindOnlyInstalled bool
)

var agentFindCmd = &cobra.Command{
	Use:   "find",
	Short: "Find and detect installed ACP & autonomous coding agents on the machine",
	Run:   runAgentFind,
}

var findAgentCmd = &cobra.Command{
	Use:   "find-agent",
	Short: "Find and detect installed ACP & autonomous coding agents on the machine",
	Run:   runAgentFind,
}

func init() {
	agentFindCmd.Flags().BoolVarP(&agentFindJson, "json", "j", false, "Output results as JSON")
	agentFindCmd.Flags().BoolVarP(&agentFindOnlyInstalled, "installed", "i", false, "Show only installed agents")

	findAgentCmd.Flags().BoolVarP(&agentFindJson, "json", "j", false, "Output results as JSON")
	findAgentCmd.Flags().BoolVarP(&agentFindOnlyInstalled, "installed", "i", false, "Show only installed agents")

	agentCmd.AddCommand(agentCreateCmd, agentListCmd, agentShowCmd, agentInstallCmd, agentDeleteCmd, agentFindCmd)
	rootCmd.AddCommand(agentCmd)
	rootCmd.AddCommand(findAgentCmd)
}

func getAgentsDir() string {
	homeDir, _ := os.UserHomeDir()
	dir := filepath.Join(homeDir, ".kendaliai", "agents")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func runAgentCreate(cmd *cobra.Command, args []string) {
	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║       KendaliAI Agent Wizard             ║")
	fmt.Println("╚══════════════════════════════════════════╝")
	fmt.Println()

	reader := bufio.NewReader(os.Stdin)

	name := prompt(reader, "Agent Display Name", "e.g. 'Content Writer', 'Security Reviewer'")
	description := prompt(reader, "Description", "e.g. 'Specialized technical documentation reviewer'")
	systemPrompt := promptMultiline(reader, "System Prompt / Role Instructions", "Instructions that shape the agent's behavior. End with a line containing '.'")
	defaultSkills := prompt(reader, "Default Skills (comma-separated)", "e.g. 'hello-world, docx'")
	preferredModels := prompt(reader, "Preferred Models (comma-separated)", "e.g. 'deepseek-v4-flash'")
	maxConcurrencyStr := prompt(reader, "Max Concurrency (default '1')", "e.g. '2'")
	approvalRequiredStr := prompt(reader, "Require Approval? (y/n, default 'n')", "")

	id := sanitizeID(name)
	maxConc := 1
	if mc, err := strconv.Atoi(maxConcurrencyStr); err == nil && mc > 0 {
		maxConc = mc
	}
	appReq := false
	if strings.ToLower(approvalRequiredStr) == "y" {
		appReq = true
	}

	m := runtime.AgentManifest{
		ID:              id,
		DisplayName:     name,
		Description:     description,
		SystemPrompt:    systemPrompt,
		DefaultSkills:   splitTrim(defaultSkills),
		PreferredModels: splitTrim(preferredModels),
		FallbackModels:  splitTrim(preferredModels),
		MaxConcurrency:  maxConc,
		ApprovalRequired: appReq,
		Capabilities:    []string{"read_files", "write_files"},
		Policies:        []string{"allow_read_only"},
	}

	if err := m.Validate(); err != nil {
		fmt.Printf("\n  ✗ Manifest validation failed: %v\n", err)
		os.Exit(1)
	}

	data, err := yaml.Marshal(&m)
	if err != nil {
		fmt.Printf("\n  ✗ Failed to marshal YAML: %v\n", err)
		os.Exit(1)
	}

	destPath := filepath.Join(getAgentsDir(), id+".yaml")
	if err := os.WriteFile(destPath, data, 0644); err != nil {
		fmt.Printf("\n  ✗ Failed to write manifest file: %v\n", err)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Printf("  ✓ Agent manifest created [id=%s]\n", id)
	fmt.Printf("    Path: %s\n", destPath)
	fmt.Println()
}

func runAgentList(cmd *cobra.Command, args []string) {
	dir := getAgentsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		fmt.Printf("  ✗ Failed to read agents directory: %v\n", err)
		os.Exit(1)
	}

	count := 0
	fmt.Println()
	fmt.Println("Installed Agents:")
	for _, entry := range entries {
		if entry.IsDir() || (filepath.Ext(entry.Name()) != ".yaml" && filepath.Ext(entry.Name()) != ".yml") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var m runtime.AgentManifest
		if err := yaml.Unmarshal(data, &m); err != nil {
			continue
		}
		fmt.Printf("  %-20s [%s] concurrency=%d\n", m.DisplayName, m.ID, m.MaxConcurrency)
		fmt.Printf("    %s\n", m.Description)
		fmt.Println()
		count++
	}

	if count == 0 {
		fmt.Println("  No agent manifests installed. Create one with: kendaliai agent create")
	}
}

func runAgentShow(cmd *cobra.Command, args []string) {
	id := args[0]
	path := filepath.Join(getAgentsDir(), id+".yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("  ✗ Agent manifest '%s' not found\n", id)
		os.Exit(1)
	}

	var m runtime.AgentManifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		fmt.Printf("  ✗ Failed to parse manifest YAML: %v\n", err)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Printf("  Display Name:      %s\n", m.DisplayName)
	fmt.Printf("  ID:                %s\n", m.ID)
	fmt.Printf("  Description:       %s\n", m.Description)
	fmt.Printf("  Max Concurrency:   %d\n", m.MaxConcurrency)
	fmt.Printf("  Require Approval:  %v\n", m.ApprovalRequired)
	if len(m.DefaultSkills) > 0 {
		fmt.Printf("  Default Skills:    %s\n", strings.Join(m.DefaultSkills, ", "))
	}
	if len(m.PreferredModels) > 0 {
		fmt.Printf("  Preferred Models:  %s\n", strings.Join(m.PreferredModels, ", "))
	}
	fmt.Println()
	fmt.Println("  ── System Prompt ──")
	for _, line := range strings.Split(m.SystemPrompt, "\n") {
		fmt.Printf("  %s\n", line)
	}
	fmt.Println()
}

func runAgentInstall(cmd *cobra.Command, args []string) {
	src := args[0]
	var data []byte
	var err error

	if strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://") {
		fmt.Printf("📥 Downloading agent manifest from %s...\n", src)
		resp, err := http.Get(src)
		if err != nil {
			fmt.Printf("  ✗ Download failed: %v\n", err)
			os.Exit(1)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			fmt.Printf("  ✗ Download failed: HTTP status %d\n", resp.StatusCode)
			os.Exit(1)
		}
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("  ✗ Read failed: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Printf("📖 Reading local manifest from %s...\n", src)
		data, err = os.ReadFile(src)
		if err != nil {
			fmt.Printf("  ✗ Read failed: %v\n", err)
			os.Exit(1)
		}
	}

	var m runtime.AgentManifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		fmt.Printf("  ✗ Invalid YAML manifest: %v\n", err)
		os.Exit(1)
	}

	if err := m.Validate(); err != nil {
		fmt.Printf("  ✗ Validation failed: %v\n", err)
		os.Exit(1)
	}

	destPath := filepath.Join(getAgentsDir(), m.ID+".yaml")
	if err := os.WriteFile(destPath, data, 0644); err != nil {
		fmt.Printf("  ✗ Failed to install manifest: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("  ✓ Successfully installed Agent '%s' [id=%s] to %s\n", m.DisplayName, m.ID, destPath)
}

func runAgentDelete(cmd *cobra.Command, args []string) {
	id := args[0]
	path := filepath.Join(getAgentsDir(), id+".yaml")
	if _, err := os.Stat(path); err != nil {
		fmt.Printf("  ✗ Agent manifest '%s' not found\n", id)
		os.Exit(1)
	}

	fmt.Printf("  Delete agent manifest '%s'? [y/N] ", id)
	var confirm string
	fmt.Scanln(&confirm)
	if strings.ToLower(confirm) != "y" {
		fmt.Println("  Cancelled.")
		return
	}

	if err := os.Remove(path); err != nil {
		fmt.Printf("  ✗ Delete failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("  ✓ Deleted Agent manifest '%s'\n", id)
}

func runAgentFind(cmd *cobra.Command, args []string) {
	reg := acp.NewRegistry(nil)
	agents := reg.List()

	// Query versions concurrently
	var wg sync.WaitGroup
	for i := range agents {
		if agents[i].Available {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				agents[idx].Version = acp.DetectVersion(agents[idx].Command)
			}(i)
		}
	}
	wg.Wait()

	total := len(agents)
	installedCount := 0
	for _, a := range agents {
		if a.Available {
			installedCount++
		}
	}

	if agentFindJson {
		var outputList []acp.AgentDescriptor
		for _, a := range agents {
			if agentFindOnlyInstalled && !a.Available {
				continue
			}
			outputList = append(outputList, a)
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(outputList)
		return
	}

	bold := "\033[1m"
	dim := "\033[2m"
	green := "\033[32m"
	red := "\033[31m"
	cyan := "\033[36m"
	reset := "\033[0m"

	fmt.Println()
	fmt.Printf("%s%s╔══════════════════════════════════════════════════════════════════════════════════════════╗%s\n", bold, cyan, reset)
	fmt.Printf("%s%s║                              KendaliAI Agent Discovery                                   ║%s\n", bold, cyan, reset)
	fmt.Printf("%s%s╚══════════════════════════════════════════════════════════════════════════════════════════╝%s\n", bold, cyan, reset)
	fmt.Printf("%sScanning for installed ACP & autonomous coding agents on this machine...%s\n\n", dim, reset)

	fmt.Printf("%-10s %-22s %-22s %-12s %s\n", "STATUS", "AGENT", "VERSION", "PROTOCOL", "BINARY LOCATION")
	fmt.Printf("%s--------------------------------------------------------------------------------------------------%s\n", dim, reset)

	homeDir, _ := os.UserHomeDir()
	for _, a := range agents {
		if agentFindOnlyInstalled && !a.Available {
			continue
		}

		if a.Available {
			ver := a.Version
			if ver == "" {
				ver = "detected"
			}
			if len(ver) > 21 {
				ver = ver[:21]
			}
			dispPath := a.Command
			if homeDir != "" && strings.HasPrefix(dispPath, homeDir) {
				dispPath = "~" + strings.TrimPrefix(dispPath, homeDir)
			}

			proto := "acp"
			if a.ID == "agy" {
				proto = "stream-json"
			} else if a.ID == "pi" {
				proto = "rpc-json"
			}

			fmt.Printf("%s✔ FOUND%s   %s%-22s%s %-22s %s%-12s%s %s%s%s\n",
				green, reset, bold, a.Name, reset, ver, cyan, proto, reset, dim, dispPath, reset)
		} else {
			proto := "acp"
			if a.ID == "agy" {
				proto = "stream-json"
			} else if a.ID == "pi" {
				proto = "rpc-json"
			}

			fmt.Printf("%s✖ MISSING%s %s%-22s%s %-22s %s%-12s%s %s%s%s\n",
				red, reset, dim, a.Name, reset, "-", dim, proto, reset, dim, a.Command+" (not in PATH)", reset)
		}
	}

	fmt.Printf("%s--------------------------------------------------------------------------------------------------%s\n\n", dim, reset)

	pct := 0
	if total > 0 {
		pct = (installedCount * 100) / total
	}

	statusSummary := fmt.Sprintf("%d/%d INSTALLED (%d%%)", installedCount, total, pct)
	if installedCount == total {
		fmt.Printf("Summary: %s%sALL READY (%s)%s (%s%d installed%s, %s%d missing%s)\n",
			bold, green, statusSummary, reset, green, installedCount, reset, red, total-installedCount, reset)
	} else {
		fmt.Printf("Summary: %s%s%s%s (%s%d installed%s, %s%d missing%s)\n",
			bold, cyan, statusSummary, reset, green, installedCount, reset, red, total-installedCount, reset)
	}

	manifestsDir := getAgentsDir()
	if entries, err := os.ReadDir(manifestsDir); err == nil && len(entries) > 0 {
		mCount := 0
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".yaml") || strings.HasSuffix(e.Name(), ".json") {
				mCount++
			}
		}
		if mCount > 0 {
			fmt.Printf("\n%sLocal agent manifests found: %s%d%s %sin %s%s\n", dim, bold, mCount, reset, dim, manifestsDir, reset)
		}
	}
	fmt.Println()
}
