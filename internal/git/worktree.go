package git

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

// Worktree represents a Git worktree entry.
type Worktree struct {
	Path       string `json:"path"`
	HEAD       string `json:"head"`
	Branch     string `json:"branch"`
	IsBare     bool   `json:"isBare"`
	IsDetached bool   `json:"isDetached"`
	IsLocked   bool   `json:"isLocked"`
	LockReason string `json:"lockReason,omitempty"`
	Prunable   bool   `json:"prunable"`
}

// WorktreeManager provides Git worktree operations.
type WorktreeManager struct {
	mu sync.RWMutex
}

var DefaultWorktreeManager = &WorktreeManager{}

// ListWorktrees lists all worktrees for a repository using `git worktree list --porcelain`.
func (m *WorktreeManager) ListWorktrees(ctx context.Context, repoDir string) ([]Worktree, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if repoDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		repoDir = cwd
	}

	cmd := exec.CommandContext(ctx, "git", "worktree", "list", "--porcelain")
	cmd.Dir = repoDir
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git worktree list failed: %w", err)
	}

	var worktrees []Worktree
	var current Worktree
	scanner := bufio.NewScanner(bytes.NewReader(out))

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			if current.Path != "" {
				worktrees = append(worktrees, current)
				current = Worktree{}
			}
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		key := parts[0]
		val := ""
		if len(parts) > 1 {
			val = strings.TrimSpace(parts[1])
		}

		switch key {
		case "worktree":
			current.Path = val
		case "HEAD":
			current.HEAD = val
		case "branch":
			// branch refs/heads/feature-xyz -> feature-xyz
			current.Branch = strings.TrimPrefix(val, "refs/heads/")
		case "bare":
			current.IsBare = true
		case "detached":
			current.IsDetached = true
		case "locked":
			current.IsLocked = true
			current.LockReason = val
		case "prunable":
			current.Prunable = true
		}
	}

	if current.Path != "" {
		worktrees = append(worktrees, current)
	}

	return worktrees, nil
}

// AddWorktree creates a new linked worktree.
func (m *WorktreeManager) AddWorktree(ctx context.Context, repoDir, targetPath, branch string, createBranch bool) (*Worktree, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if repoDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		repoDir = cwd
	}

	if !filepath.IsAbs(targetPath) {
		targetPath = filepath.Join(repoDir, targetPath)
	}

	var args []string
	args = append(args, "worktree", "add")

	if createBranch && branch != "" {
		args = append(args, "-b", branch, targetPath)
	} else if branch != "" {
		args = append(args, targetPath, branch)
	} else {
		args = append(args, targetPath)
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = repoDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("git worktree add failed: %s (%w)", strings.TrimSpace(string(out)), err)
	}

	// Fetch details of the newly created worktree
	cmdHead := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	cmdHead.Dir = targetPath
	headOut, _ := cmdHead.Output()
	head := strings.TrimSpace(string(headOut))

	wt := &Worktree{
		Path:   targetPath,
		HEAD:   head,
		Branch: branch,
	}

	return wt, nil
}

// RemoveWorktree removes a worktree and deletes its linked directory.
func (m *WorktreeManager) RemoveWorktree(ctx context.Context, repoDir, targetPath string, force bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if repoDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return err
		}
		repoDir = cwd
	}

	if !filepath.IsAbs(targetPath) {
		targetPath = filepath.Join(repoDir, targetPath)
	}

	args := []string{"worktree", "remove"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, targetPath)

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = repoDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git worktree remove failed: %s (%w)", strings.TrimSpace(string(out)), err)
	}

	return nil
}

// PruneWorktrees prunes worktree information in .git/worktrees.
func (m *WorktreeManager) PruneWorktrees(ctx context.Context, repoDir string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if repoDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return err
		}
		repoDir = cwd
	}

	cmd := exec.CommandContext(ctx, "git", "worktree", "prune")
	cmd.Dir = repoDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git worktree prune failed: %s (%w)", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// ListBranches returns all local branches and the currently active branch.
func (m *WorktreeManager) ListBranches(ctx context.Context, repoDir string) ([]string, string, error) {
	if repoDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, "", err
		}
		repoDir = cwd
	}

	cmd := exec.CommandContext(ctx, "git", "branch", "--no-color")
	cmd.Dir = repoDir
	out, err := cmd.Output()
	if err != nil {
		return nil, "", err
	}

	var branches []string
	currentBranch := ""
	lines := strings.Split(string(out), "\n")
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if strings.HasPrefix(l, "* ") {
			name := strings.TrimPrefix(l, "* ")
			currentBranch = name
			branches = append(branches, name)
		} else {
			branches = append(branches, l)
		}
	}

	return branches, currentBranch, nil
}
