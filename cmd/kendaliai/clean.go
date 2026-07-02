package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var cleanAll bool

var cleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Remove databases, indexes, and caches. Use -a to also clean storage and skills.",
	Long: `Remove KendaliAI runtime data.

  kendaliai clean       Remove databases (.kendaliai/*.db) and search indexes (.kendaliai/bleve/).
                        Keeps storage/, skills/, and config files intact.

  kendaliai clean -a    Remove everything: databases, indexes, storage/, skills/.
                        Keeps config files (config.yaml, kilo.json, go.mod, etc.) only.`,
	Run: runClean,
}

func init() {
	cleanCmd.Flags().BoolVarP(&cleanAll, "all", "a", false, "Remove storage and skills data too (keeps config)")
	rootCmd.AddCommand(cleanCmd)
}

func runClean(cmd *cobra.Command, args []string) {
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}

	kendaliDir := filepath.Join(cwd, ".kendaliai")
	buildDir := filepath.Join(cwd, "build")
	storageDir := filepath.Join(cwd, "storage")
	homeDir, _ := os.UserHomeDir()
	skillsDir := filepath.Join(homeDir, ".kendaliai", "skills")

	if cleanAll {
		fmt.Println("── Cleaning all runtime data (storage + skills) ──")
	} else {
		fmt.Println("── Cleaning databases and indexes ──")
	}

	var removed, skipped int

	// === Always clean: SQLite databases (.kendaliai/) ===
	removeDir(kendaliDir, ".kendaliai/*.db*", []string{"kendaliai.db", "vectors.db"}, &removed, &skipped)
	removeGlob(filepath.Join(kendaliDir, "*.db"), &removed, &skipped)
	removeGlob(filepath.Join(kendaliDir, "*.db-shm"), &removed, &skipped)
	removeGlob(filepath.Join(kendaliDir, "*.db-wal"), &removed, &skipped)

	// === Always clean: Bleve search index ===
	bleveDir := filepath.Join(kendaliDir, "bleve")
	if _, err := os.Stat(bleveDir); err == nil {
		if err := os.RemoveAll(bleveDir); err != nil {
			fmt.Printf("  ✗ Failed to remove bleve index: %v\n", err)
			skipped++
		} else {
			fmt.Printf("  ✓ Removed bleve index\n")
			removed++
		}
	}

	// === Always clean: old build DBs ===
	removeGlob(filepath.Join(buildDir, "*.db"), &removed, &skipped)
	removeGlob(filepath.Join(buildDir, "*.db-shm"), &removed, &skipped)
	removeGlob(filepath.Join(buildDir, "*.db-wal"), &removed, &skipped)
	removeDirContents(filepath.Join(buildDir, "checkpoints"), &removed, &skipped)
	removeDirContents(filepath.Join(buildDir, "workspaces"), &removed, &skipped)

	if cleanAll {
		// Remove storage sessions and uploads
		if _, err := os.Stat(storageDir); err == nil {
			if err := os.RemoveAll(storageDir); err != nil {
				fmt.Printf("  ✗ Failed to remove storage/: %v\n", err)
				skipped++
			} else {
				fmt.Printf("  ✓ Removed storage/\n")
				removed++
			}
		}

		// Remove skills data (keep directory)
		if _, err := os.Stat(skillsDir); err == nil {
			entries, _ := os.ReadDir(skillsDir)
			for _, e := range entries {
				skillPath := filepath.Join(skillsDir, e.Name())
				if err := os.RemoveAll(skillPath); err != nil {
					fmt.Printf("  ✗ Failed to remove skill: %s\n", e.Name())
					skipped++
				} else {
					fmt.Printf("  ✓ Removed skill: %s\n", e.Name())
					removed++
				}
			}
		}

		// Clean project-level .kendaliai/ directories (recursively search for repo.db leftovers)
		filepath.Walk(cwd, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				if info.Name() == "node_modules" || info.Name() == ".git" {
					return filepath.SkipDir
				}
				return nil
			}
			if filepath.Base(path) == "repo.db" {
				os.Remove(path)
				fmt.Printf("  ✓ Removed stale repo.db: %s\n", path)
				removed++
			}
			return nil
		})
	}

	fmt.Printf("\nDone: %d removed, %d skipped\n", removed, skipped)
}

func removeGlob(pattern string, removed, skipped *int) {
	matches, _ := filepath.Glob(pattern)
	for _, m := range matches {
		if err := os.Remove(m); err != nil {
			*skipped++
		} else {
			fmt.Printf("  ✓ Removed %s\n", m)
			*removed++
		}
	}
}

func removeDir(parent, label string, expected []string, removed, skipped *int) {
	for _, name := range expected {
		path := filepath.Join(parent, name)
		if _, err := os.Stat(path); err == nil {
			if err := os.Remove(path); err != nil {
				fmt.Printf("  ✗ Failed to remove %s: %v\n", path, err)
				*skipped++
			} else {
				fmt.Printf("  ✓ Removed %s\n", path)
				*removed++
			}
		}
	}
}

func removeDirContents(dir string, removed, skipped *int) {
	if _, err := os.Stat(dir); err != nil {
		return
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		path := filepath.Join(dir, e.Name())
		if err := os.RemoveAll(path); err != nil {
			fmt.Printf("  ✗ Failed to remove %s: %v\n", path, err)
			*skipped++
		} else {
			fmt.Printf("  ✓ Removed %s\n", path)
			*removed++
		}
	}
}
