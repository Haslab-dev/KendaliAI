package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var followFlag bool
var agentFlag string
var levelFlag string
var sessionFlag string
var tailCount int
var jsonOutput bool

var logsCmd = &cobra.Command{
	Use:   "logs",
	Short: "Stream global system logs from KendaliAI",
	Run:   runLogs,
}

func init() {
	logsCmd.Flags().BoolVarP(&followFlag, "follow", "f", false, "Follow log output")
	logsCmd.Flags().StringVar(&agentFlag, "agent", "", "Filter logs by agent role")
	logsCmd.Flags().StringVar(&levelFlag, "level", "", "Filter logs by log level (info, warn, error)")
	logsCmd.Flags().StringVar(&sessionFlag, "session", "", "Filter logs by session ID")
	logsCmd.Flags().IntVarP(&tailCount, "tail", "n", 100, "Number of lines to show")
	logsCmd.Flags().BoolVar(&jsonOutput, "json", false, "Output log entries as raw JSON")
	rootCmd.AddCommand(logsCmd)
}

func runLogs(cmd *cobra.Command, args []string) {
	homeDir, _ := os.UserHomeDir()
	logPath := filepath.Join(homeDir, ".kendaliai", "kendaliai.log")

	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		fmt.Printf("No logs found at: %s\n", logPath)
		return
	}

	file, err := os.Open(logPath)
	if err != nil {
		fmt.Printf("Failed to open log file: %v\n", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var lines []string
	for scanner.Scan() {
		line := scanner.Text()

		if agentFlag != "" && !strings.Contains(line, agentFlag) {
			continue
		}
		if levelFlag != "" && !strings.Contains(strings.ToLower(line), strings.ToLower(levelFlag)) {
			continue
		}
		if sessionFlag != "" && !strings.Contains(line, sessionFlag) {
			continue
		}

		lines = append(lines, line)
	}

	start := len(lines) - tailCount
	if start < 0 {
		start = 0
	}

	for i := start; i < len(lines); i++ {
		if jsonOutput {
			fmt.Printf(`{"log": %q}`+"\n", lines[i])
		} else {
			fmt.Println(lines[i])
		}
	}
}
