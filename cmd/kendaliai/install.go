package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var (
	targetDirFlag string
	forceInstall  bool
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install KendaliAI binary to system PATH (macOS & Linux) and replace old build",
	Run:   runInstall,
}

func init() {
	installCmd.Flags().StringVarP(&targetDirFlag, "dir", "d", "", "Custom installation directory (e.g. /usr/local/bin or ~/.local/bin)")
	installCmd.Flags().BoolVarP(&forceInstall, "force", "f", true, "Force replace old build if it exists")
	rootCmd.AddCommand(installCmd)
}

func runInstall(cmd *cobra.Command, args []string) {
	fmt.Println("📦 Installing KendaliAI to system PATH...")

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Printf("❌ Failed to resolve home directory: %v\n", err)
		os.Exit(1)
	}

	// 1. Resolve source executable
	srcBinary, err := resolveSourceBinary()
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	// 2. Resolve destination directory
	destDir := targetDirFlag
	if destDir == "" {
		destDir = detectBestBinDir(homeDir)
	}
	destDir = expandHome(destDir, homeDir)

	if err := os.MkdirAll(destDir, 0755); err != nil {
		fmt.Printf("❌ Failed to create directory %s: %v\n", destDir, err)
		os.Exit(1)
	}

	targetPath := filepath.Join(destDir, "kendaliai")

	// 3. Replace old build
	if _, err := os.Stat(targetPath); err == nil {
		fmt.Printf("🔄 Replacing existing build at %s...\n", targetPath)
		_ = os.Remove(targetPath)
	}

	// Copy binary
	if err := copyExecutable(srcBinary, targetPath); err != nil {
		fmt.Printf("❌ Failed to install binary to %s: %v\n", targetPath, err)
		if strings.Contains(err.Error(), "permission denied") {
			fmt.Println("💡 Tip: Try running with sudo: sudo make install")
		}
		os.Exit(1)
	}

	// 4. Ensure ~/.kendaliai directory exists
	kendaliDir := filepath.Join(homeDir, ".kendaliai")
	_ = os.MkdirAll(kendaliDir, 0755)

	// 5. Check and update PATH if necessary
	pathEnv := os.Getenv("PATH")
	inPath := isDirInPath(destDir, pathEnv)
	updatedRC := ""

	if !inPath {
		updatedRC = addDirToShellProfile(destDir, homeDir)
	}

	// 6. Report installation status
	fmt.Println("\n🎉 Successfully installed KendaliAI!")
	fmt.Printf("   • Binary Location: %s\n", targetPath)
	if inPath {
		fmt.Println("   • PATH Status:     Already in $PATH ✓")
	} else if updatedRC != "" {
		fmt.Printf("   • PATH Status:     Added to %s ✓\n", updatedRC)
		fmt.Printf("   • Next Step:       Run 'source %s' or open a new terminal window\n", updatedRC)
	} else {
		fmt.Printf("   • PATH Notice:     Add this to your shell profile: export PATH=\"%s:$PATH\"\n", destDir)
	}

	// Verify command
	fmt.Printf("\n🚀 Run 'kendaliai --help' to get started.\n")
}

func resolveSourceBinary() (string, error) {
	// Check current executable first
	exe, err := os.Executable()
	if err == nil {
		if fi, err := os.Stat(exe); err == nil && !fi.IsDir() && strings.Contains(filepath.Base(exe), "kendaliai") {
			return exe, nil
		}
	}

	// Check build/kendaliai relative to current working directory
	cwd, _ := os.Getwd()
	buildPath := filepath.Join(cwd, "build", "kendaliai")
	if fi, err := os.Stat(buildPath); err == nil && !fi.IsDir() {
		return buildPath, nil
	}

	// If running under 'go run', compile to build/kendaliai
	fmt.Println("🔨 Compiling production binary for installation...")
	_ = os.MkdirAll(filepath.Join(cwd, "build"), 0755)
	c := exec.Command("go", "build", "-o", buildPath, "./cmd/kendaliai")
	c.Dir = cwd
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	if err := c.Run(); err != nil {
		return "", fmt.Errorf("failed to compile binary: %w", err)
	}
	return buildPath, nil
}

func detectBestBinDir(homeDir string) string {
	// 1. If /usr/local/bin is writable, prefer it (system-wide standard)
	usrLocalBin := "/usr/local/bin"
	if isDirWritable(usrLocalBin) {
		return usrLocalBin
	}

	// 2. User-level standard on both macOS and Linux: ~/.local/bin
	userLocalBin := filepath.Join(homeDir, ".local", "bin")
	return userLocalBin
}

func isDirWritable(dir string) bool {
	info, err := os.Stat(dir)
	if err != nil {
		return false
	}
	if !info.IsDir() {
		return false
	}

	// Try creating a test file
	testFile := filepath.Join(dir, fmt.Sprintf(".kendaliai_test_%d", os.Getpid()))
	f, err := os.OpenFile(testFile, os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return false
	}
	f.Close()
	_ = os.Remove(testFile)
	return true
}

func copyExecutable(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return os.Chmod(dst, 0755)
}

func isDirInPath(dir, pathEnv string) bool {
	normDir := filepath.Clean(dir)
	parts := strings.Split(pathEnv, string(os.PathListSeparator))
	for _, p := range parts {
		if filepath.Clean(p) == normDir {
			return true
		}
	}
	return false
}

func addDirToShellProfile(dir, homeDir string) string {
	exportLine := fmt.Sprintf("\n# KendaliAI PATH\nexport PATH=\"%s:$PATH\"\n", dir)

	// Detect shell profile files
	candidates := []string{
		filepath.Join(homeDir, ".zshrc"),
		filepath.Join(homeDir, ".bashrc"),
		filepath.Join(homeDir, ".profile"),
	}

	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			content, err := os.ReadFile(c)
			if err == nil && !strings.Contains(string(content), dir) {
				f, err := os.OpenFile(c, os.O_APPEND|os.O_WRONLY, 0644)
				if err == nil {
					_, _ = f.WriteString(exportLine)
					f.Close()
					return c
				}
			} else if err == nil && strings.Contains(string(content), dir) {
				return c
			}
		}
	}

	// Fallback to creating ~/.zshrc or ~/.bashrc based on SHELL
	shell := os.Getenv("SHELL")
	fallback := filepath.Join(homeDir, ".profile")
	if strings.Contains(shell, "zsh") {
		fallback = filepath.Join(homeDir, ".zshrc")
	} else if strings.Contains(shell, "bash") {
		fallback = filepath.Join(homeDir, ".bashrc")
	}

	f, err := os.OpenFile(fallback, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err == nil {
		_, _ = f.WriteString(exportLine)
		f.Close()
		return fallback
	}

	return ""
}

func expandHome(path, homeDir string) string {
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(homeDir, path[2:])
	}
	return path
}
