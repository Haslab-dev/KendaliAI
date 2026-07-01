package main

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Run system dependency diagnostic checks",
	Run:   runDoctor,
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}

func runDoctor(cmd *cobra.Command, args []string) {
	fmt.Println("🏥 Running system dependency checks...")
	fmt.Println()

	checksPassed := true

	_, err := exec.LookPath("go")
	if err != nil {
		fmt.Println("❌ Go: Not installed in PATH.")
		checksPassed = false
	} else {
		fmt.Println("✓ Go: Installed.")
	}

	_, err = exec.LookPath("git")
	if err != nil {
		fmt.Println("❌ Git: Not installed in PATH.")
		checksPassed = false
	} else {
		fmt.Println("✓ Git: Installed.")
	}

	_, err = exec.LookPath("sqlite3")
	if err != nil {
		fmt.Println("⚠️ SQLite3: CLI not found (using standard database driver instead).")
	} else {
		fmt.Println("✓ SQLite3: CLI Installed.")
	}

	homeDir, _ := os.UserHomeDir()
	workspaceDir := homeDir + "/.kendaliai"
	_ = os.MkdirAll(workspaceDir, 0755)
	testFile := workspaceDir + "/.doctor_test"
	err = os.WriteFile(testFile, []byte("write test"), 0644)
	if err != nil {
		fmt.Printf("❌ Workspace: Permissions check failed at %s\n", workspaceDir)
		checksPassed = false
	} else {
		_ = os.Remove(testFile)
		fmt.Println("✓ Workspace: Permissions check passed.")
	}

	fmt.Println()
	if checksPassed {
		fmt.Println("🎉 System environment is healthy and ready to compile/run.")
	} else {
		fmt.Println("❌ System diagnostics failed. Please install the missing tools.")
		os.Exit(1)
	}
}
