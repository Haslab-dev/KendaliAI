package workspace

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// FileItem represents a file or folder in the workspace.
type FileItem struct {
	Name      string      `json:"name"`
	Path      string      `json:"path"`      // Relative path to workspace root
	FullPath  string      `json:"fullPath"`  // Absolute path on disk
	IsDir     bool        `json:"isDir"`
	Size      int64       `json:"size"`
	ModTime   string      `json:"modTime"`
	GitStatus string      `json:"gitStatus,omitempty"` // "M", "U", "D", or ""
	Children  []*FileItem `json:"children,omitempty"`
}

// Explorer provides workspace file management and tree exploration.
type Explorer struct {
	mu      sync.RWMutex
	baseDir string
}

func NewExplorer(baseDir string) *Explorer {
	if baseDir == "" {
		cwd, err := os.Getwd()
		if err == nil {
			baseDir = cwd
		}
	}
	return &Explorer{
		baseDir: baseDir,
	}
}

// GetBaseDir returns the workspace root directory.
func (e *Explorer) GetBaseDir() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.baseDir
}

// SetBaseDir updates the workspace root directory.
func (e *Explorer) SetBaseDir(dir string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.baseDir = dir
}

// ListDirectory lists files and folders inside relativeDir.
func (e *Explorer) ListDirectory(relativeDir string) ([]*FileItem, error) {
	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	targetDir := base
	if relativeDir != "" && relativeDir != "." {
		targetDir = filepath.Join(base, relativeDir)
	}

	// Security: prevent path traversal outside workspace
	rel, err := filepath.Rel(base, targetDir)
	if err != nil || strings.HasPrefix(rel, "..") {
		return nil, fmt.Errorf("access denied: path outside workspace")
	}

	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return nil, err
	}

	gitStatusMap := e.getGitStatusMap(base)

	var items []*FileItem
	for _, entry := range entries {
		name := entry.Name()
		// Skip noisy directories
		if name == ".git" || name == "node_modules" || name == ".next" || name == "dist" || name == ".cache" {
			continue
		}

		full := filepath.Join(targetDir, name)
		relPath, _ := filepath.Rel(base, full)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		status := gitStatusMap[filepath.ToSlash(relPath)]

		item := &FileItem{
			Name:      name,
			Path:      filepath.ToSlash(relPath),
			FullPath:  full,
			IsDir:     entry.IsDir(),
			Size:      info.Size(),
			ModTime:   info.ModTime().Format(time.RFC3339),
			GitStatus: status,
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir // directories first
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return items, nil
}

// GetTree returns a nested directory tree up to maxDepth (e.g. 3).
func (e *Explorer) GetTree(maxDepth int) ([]*FileItem, error) {
	if maxDepth <= 0 {
		maxDepth = 3
	}

	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	gitStatusMap := e.getGitStatusMap(base)
	return e.readTreeRecursive(base, "", 1, maxDepth, gitStatusMap)
}

func (e *Explorer) readTreeRecursive(baseDir, currentRel string, currentDepth, maxDepth int, gitStatusMap map[string]string) ([]*FileItem, error) {
	targetDir := baseDir
	if currentRel != "" {
		targetDir = filepath.Join(baseDir, currentRel)
	}

	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return nil, err
	}

	var items []*FileItem
	for _, entry := range entries {
		name := entry.Name()
		if name == ".git" || name == "node_modules" || name == ".next" || name == "dist" || name == ".cache" {
			continue
		}

		full := filepath.Join(targetDir, name)
		relPath, _ := filepath.Rel(baseDir, full)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		status := gitStatusMap[filepath.ToSlash(relPath)]
		item := &FileItem{
			Name:      name,
			Path:      filepath.ToSlash(relPath),
			FullPath:  full,
			IsDir:     entry.IsDir(),
			Size:      info.Size(),
			ModTime:   info.ModTime().Format(time.RFC3339),
			GitStatus: status,
		}

		if entry.IsDir() && currentDepth < maxDepth {
			children, err := e.readTreeRecursive(baseDir, relPath, currentDepth+1, maxDepth, gitStatusMap)
			if err == nil {
				item.Children = children
			}
		}

		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return items, nil
}

// ReadFile reads the content of a file within the workspace.
func (e *Explorer) ReadFile(relativeOrFullPath string) (string, string, error) {
	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	fullPath := relativeOrFullPath
	if !filepath.IsAbs(fullPath) {
		fullPath = filepath.Join(base, relativeOrFullPath)
	}

	rel, err := filepath.Rel(base, fullPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", "", fmt.Errorf("access denied: path outside workspace")
	}

	data, err := os.ReadFile(fullPath)
	if err != nil {
		return "", "", err
	}

	// Detect content-type
	mimeType := http.DetectContentType(data)
	return string(data), mimeType, nil
}

// WriteFile creates or updates a file within the workspace.
func (e *Explorer) WriteFile(relativeOrFullPath string, content string) error {
	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	fullPath := relativeOrFullPath
	if !filepath.IsAbs(fullPath) {
		fullPath = filepath.Join(base, relativeOrFullPath)
	}

	rel, err := filepath.Rel(base, fullPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return fmt.Errorf("access denied: path outside workspace")
	}

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// CreateDirectory creates a folder inside the workspace.
func (e *Explorer) CreateDirectory(relativeOrFullPath string) error {
	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	fullPath := relativeOrFullPath
	if !filepath.IsAbs(fullPath) {
		fullPath = filepath.Join(base, relativeOrFullPath)
	}

	rel, err := filepath.Rel(base, fullPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return fmt.Errorf("access denied: path outside workspace")
	}

	return os.MkdirAll(fullPath, 0755)
}

// DeletePath removes a file or directory from the workspace.
func (e *Explorer) DeletePath(relativeOrFullPath string) error {
	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	fullPath := relativeOrFullPath
	if !filepath.IsAbs(fullPath) {
		fullPath = filepath.Join(base, relativeOrFullPath)
	}

	rel, err := filepath.Rel(base, fullPath)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." || rel == "" {
		return fmt.Errorf("access denied: cannot delete workspace root or external files")
	}

	return os.RemoveAll(fullPath)
}

// RenamePath moves or renames a file/folder within the workspace.
func (e *Explorer) RenamePath(oldRelPath, newRelPath string) error {
	e.mu.RLock()
	base := e.baseDir
	e.mu.RUnlock()

	oldFull := filepath.Join(base, oldRelPath)
	newFull := filepath.Join(base, newRelPath)

	oldRel, err1 := filepath.Rel(base, oldFull)
	newRel, err2 := filepath.Rel(base, newFull)
	if err1 != nil || err2 != nil || strings.HasPrefix(oldRel, "..") || strings.HasPrefix(newRel, "..") {
		return fmt.Errorf("access denied: path outside workspace")
	}

	// Ensure destination directory exists
	if err := os.MkdirAll(filepath.Dir(newFull), 0755); err != nil {
		return err
	}

	return os.Rename(oldFull, newFull)
}

// getGitStatusMap runs `git status --porcelain` and returns a map of filepath -> status code.
func (e *Explorer) getGitStatusMap(repoDir string) map[string]string {
	statusMap := make(map[string]string)
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = repoDir
	out, err := cmd.Output()
	if err != nil {
		return statusMap
	}

	lines := strings.Split(string(out), "\n")
	for _, l := range lines {
		if len(l) < 4 {
			continue
		}
		statusChar := strings.TrimSpace(l[:2])
		filePath := strings.TrimSpace(l[3:])
		// Handle rename format "orig -> target"
		if strings.Contains(filePath, " -> ") {
			parts := strings.Split(filePath, " -> ")
			filePath = parts[1]
		}
		statusMap[filepath.ToSlash(filePath)] = statusChar
	}

	return statusMap
}
