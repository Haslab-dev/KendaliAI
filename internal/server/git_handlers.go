package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// resolveGitDir resolves and cleans target directory, finding enclosing .git root if necessary.
func (s *Server) resolveGitDir(dir string) string {
	home, _ := os.UserHomeDir()
	dir = strings.TrimSpace(dir)
	if dir == "" || dir == "." {
		dir = s.explorer.GetBaseDir()
	}
	if dir == "~" {
		dir = home
	} else if strings.HasPrefix(dir, "~/") {
		dir = filepath.Join(home, strings.TrimPrefix(dir, "~/"))
	}
	dir = filepath.Clean(dir)

	fi, err := os.Stat(dir)
	if err != nil {
		return s.explorer.GetBaseDir()
	}
	if !fi.IsDir() {
		dir = filepath.Dir(dir)
	}

	// Walk upwards to find .git root if in subfolder
	cur := dir
	for {
		if _, err := os.Stat(filepath.Join(cur, ".git")); err == nil {
			return cur
		}
		parent := filepath.Dir(cur)
		if parent == cur || parent == "." || parent == "/" {
			break
		}
		cur = parent
	}
	return dir
}

// GitStatusFile represents one changed file in working tree.
type GitStatusFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"` // "M", "A", "D", "?", "R"
	Staging   string `json:"staging"` // "staged", "unstaged", "untracked"
	Additions int    `json:"additions,omitempty"`
	Deletions int    `json:"deletions,omitempty"`
}

// handleGitStatus GET /api/git/status?dir=...
func (s *Server) handleGitStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		repoDir := s.resolveGitDir(r.URL.Query().Get("dir"))

		// Check if it's a git repo
		checkCmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
		checkCmd.Dir = repoDir
		if err := checkCmd.Run(); err != nil {
			writeJSON(w, map[string]interface{}{
				"isRepo":    false,
				"path":      repoDir,
				"branch":    "",
				"staged":    []GitStatusFile{},
				"unstaged":  []GitStatusFile{},
				"untracked": []GitStatusFile{},
			})
			return
		}

		// Current branch
		branchCmd := exec.Command("git", "branch", "--show-current")
		branchCmd.Dir = repoDir
		branchBytes, _ := branchCmd.Output()
		branch := strings.TrimSpace(string(branchBytes))
		if branch == "" {
			// Detached HEAD
			headCmd := exec.Command("git", "rev-parse", "--short", "HEAD")
			headCmd.Dir = repoDir
			headBytes, _ := headCmd.Output()
			branch = "HEAD (" + strings.TrimSpace(string(headBytes)) + ")"
		}

		// Status
		statusCmd := exec.Command("git", "status", "--porcelain=v1", "-uall")
		statusCmd.Dir = repoDir
		out, err := statusCmd.Output()
		if err != nil {
			http.Error(w, fmt.Sprintf("git status error: %v", err), http.StatusInternalServerError)
			return
		}

		staged := []GitStatusFile{}
		unstaged := []GitStatusFile{}
		untracked := []GitStatusFile{}

		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if len(line) < 4 {
				continue
			}
			x := line[0]
			y := line[1]
			p := strings.TrimSpace(line[3:])
			if strings.Contains(p, " -> ") {
				parts := strings.Split(p, " -> ")
				p = parts[1]
			}

			if x == '?' && y == '?' {
				untracked = append(untracked, GitStatusFile{
					Path:    p,
					Status:  "?",
					Staging: "untracked",
				})
				continue
			}

			if x != ' ' && x != '?' {
				staged = append(staged, GitStatusFile{
					Path:    p,
					Status:  string(x),
					Staging: "staged",
				})
			}

			if y != ' ' && y != '?' {
				unstaged = append(unstaged, GitStatusFile{
					Path:    p,
					Status:  string(y),
					Staging: "unstaged",
				})
			}
		}

		// Ahead / behind count
		ahead := 0
		behind := 0
		abCmd := exec.Command("git", "rev-list", "--left-right", "--count", "HEAD...@{u}")
		abCmd.Dir = repoDir
		if abOut, err := abCmd.Output(); err == nil {
			parts := strings.Fields(string(abOut))
			if len(parts) >= 2 {
				ahead, _ = strconv.Atoi(parts[0])
				behind, _ = strconv.Atoi(parts[1])
			}
		}

		writeJSON(w, map[string]interface{}{
			"isRepo":    true,
			"path":      repoDir,
			"branch":    branch,
			"ahead":     ahead,
			"behind":    behind,
			"staged":    staged,
			"unstaged":  unstaged,
			"untracked": untracked,
		})
	}
}

// handleGitLog GET /api/git/log?dir=...&limit=30
func (s *Server) handleGitLog() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		repoDir := s.resolveGitDir(r.URL.Query().Get("dir"))
		limit := 30
		if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
			limit = l
		}

		cmd := exec.Command("git", "log", "-n", strconv.Itoa(limit), "--format=%H\x1f%h\x1f%an\x1f%ae\x1f%aI\x1f%s\x1f%d")
		cmd.Dir = repoDir
		out, err := cmd.Output()
		if err != nil {
			writeJSON(w, map[string]interface{}{"commits": []interface{}{}, "error": err.Error()})
			return
		}

		type CommitItem struct {
			Hash        string `json:"hash"`
			ShortHash   string `json:"short_hash"`
			AuthorName  string `json:"author_name"`
			AuthorEmail string `json:"author_email"`
			Timestamp   string `json:"timestamp"`
			Message     string `json:"message"`
			Decorations string `json:"decorations"`
		}

		commits := []CommitItem{}
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			parts := strings.Split(line, "\x1f")
			if len(parts) >= 6 {
				dec := ""
				if len(parts) >= 7 {
					dec = strings.TrimSpace(parts[6])
				}
				commits = append(commits, CommitItem{
					Hash:        parts[0],
					ShortHash:   parts[1],
					AuthorName:  parts[2],
					AuthorEmail: parts[3],
					Timestamp:   parts[4],
					Message:     parts[5],
					Decorations: dec,
				})
			}
		}

		writeJSON(w, map[string]interface{}{"commits": commits})
	}
}

// handleGitDiff GET /api/git/diff?dir=...&path=...&staged=true|false
func (s *Server) handleGitDiff() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		repoDir := s.resolveGitDir(r.URL.Query().Get("dir"))
		filePath := r.URL.Query().Get("path")
		staged := r.URL.Query().Get("staged") == "true"

		args := []string{"diff"}
		if staged {
			args = append(args, "--cached")
		}
		if filePath != "" {
			args = append(args, "--", filePath)
		}

		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		out, err := cmd.Output()
		diffStr := string(out)

		// If diff is empty and it's an untracked file, format untracked content as diff
		if diffStr == "" && filePath != "" && !staged {
			fullPath := filepath.Join(repoDir, filePath)
			if data, err := os.ReadFile(fullPath); err == nil {
				lines := strings.Split(string(data), "\n")
				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("--- /dev/null\n+++ b/%s\n@@ -0,0 +1,%d @@\n", filePath, len(lines)))
				for _, line := range lines {
					sb.WriteString("+" + line + "\n")
				}
				diffStr = sb.String()
			}
		}

		writeJSON(w, map[string]interface{}{
			"diff":  diffStr,
			"path":  filePath,
			"error": fmt.Sprintf("%v", err),
		})
	}
}

// handleGitStage POST /api/git/stage
func (s *Server) handleGitStage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dir   string   `json:"dir"`
			Paths []string `json:"paths"`
			All   bool     `json:"all"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		repoDir := s.resolveGitDir(req.Dir)
		args := []string{"add"}
		if req.All || len(req.Paths) == 0 {
			args = append(args, "-A")
		} else {
			args = append(args, "--")
			args = append(args, req.Paths...)
		}

		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		out, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("git add failed: %s (%v)", string(out), err), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	}
}

// handleGitUnstage POST /api/git/unstage
func (s *Server) handleGitUnstage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dir   string   `json:"dir"`
			Paths []string `json:"paths"`
			All   bool     `json:"all"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		repoDir := s.resolveGitDir(req.Dir)
		args := []string{"reset", "HEAD"}
		if !req.All && len(req.Paths) > 0 {
			args = append(args, "--")
			args = append(args, req.Paths...)
		}

		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		out, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("git reset failed: %s (%v)", string(out), err), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	}
}

// handleGitDiscard POST /api/git/discard
func (s *Server) handleGitDiscard() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dir   string   `json:"dir"`
			Paths []string `json:"paths"`
			All   bool     `json:"all"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		repoDir := s.resolveGitDir(req.Dir)

		// 1. Restore tracked files
		checkoutArgs := []string{"checkout", "--"}
		if req.All || len(req.Paths) == 0 {
			checkoutArgs = append(checkoutArgs, ".")
		} else {
			checkoutArgs = append(checkoutArgs, req.Paths...)
		}
		cmdCheckout := exec.Command("git", checkoutArgs...)
		cmdCheckout.Dir = repoDir
		_, _ = cmdCheckout.CombinedOutput()

		// 2. Clean untracked files
		cleanArgs := []string{"clean", "-fd"}
		if !req.All && len(req.Paths) > 0 {
			cleanArgs = append(cleanArgs, "--")
			cleanArgs = append(cleanArgs, req.Paths...)
		}
		cmdClean := exec.Command("git", cleanArgs...)
		cmdClean.Dir = repoDir
		_, _ = cmdClean.CombinedOutput()

		writeJSON(w, map[string]bool{"ok": true})
	}
}

// handleGitCommit POST /api/git/commit
func (s *Server) handleGitCommit() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dir         string `json:"dir"`
			Message     string `json:"message"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		fullMsg := strings.TrimSpace(req.Message)
		if fullMsg == "" {
			http.Error(w, "commit message cannot be empty", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Description) != "" {
			fullMsg += "\n\n" + strings.TrimSpace(req.Description)
		}

		repoDir := s.resolveGitDir(req.Dir)
		cmd := exec.Command("git", "commit", "-m", fullMsg)
		cmd.Dir = repoDir
		out, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("git commit failed: %s", strings.TrimSpace(string(out))), http.StatusBadRequest)
			return
		}

		writeJSON(w, map[string]interface{}{
			"ok":     true,
			"output": strings.TrimSpace(string(out)),
		})
	}
}

// handleGitAction POST /api/git/action (push, pull, fetch)
func (s *Server) handleGitAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dir    string `json:"dir"`
			Action string `json:"action"` // "push", "pull", "fetch"
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		repoDir := s.resolveGitDir(req.Dir)
		ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
		defer cancel()

		var cmd *exec.Cmd
		switch req.Action {
		case "push":
			cmd = exec.CommandContext(ctx, "git", "push")
		case "pull":
			cmd = exec.CommandContext(ctx, "git", "pull")
		case "fetch":
			cmd = exec.CommandContext(ctx, "git", "fetch", "--all")
		default:
			http.Error(w, "invalid action (push, pull, fetch)", http.StatusBadRequest)
			return
		}
		cmd.Dir = repoDir
		cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
		out, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("git %s failed: %s (%v)", req.Action, string(out), err), http.StatusBadRequest)
			return
		}

		writeJSON(w, map[string]interface{}{
			"ok":     true,
			"action": req.Action,
			"output": strings.TrimSpace(string(out)),
		})
	}
}

// handleGitCheckout POST /api/git/checkout
func (s *Server) handleGitCheckout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dir    string `json:"dir"`
			Branch string `json:"branch"`
			Create bool   `json:"create"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Branch == "" {
			http.Error(w, "branch name is required", http.StatusBadRequest)
			return
		}

		repoDir := s.resolveGitDir(req.Dir)
		var cmd *exec.Cmd
		if req.Create {
			cmd = exec.Command("git", "checkout", "-b", req.Branch)
		} else {
			cmd = exec.Command("git", "checkout", req.Branch)
		}
		cmd.Dir = repoDir
		out, err := cmd.CombinedOutput()
		if err != nil {
			http.Error(w, fmt.Sprintf("git checkout failed: %s", strings.TrimSpace(string(out))), http.StatusBadRequest)
			return
		}

		writeJSON(w, map[string]interface{}{
			"ok":     true,
			"branch": req.Branch,
		})
	}
}

// DirectoryEntry represents a directory in the internal file manager.
type DirectoryEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsGit     bool   `json:"isGit"`
	ModTime   string `json:"modTime"`
}

// handleWorkspaceBrowse GET /api/workspace/browse?dir=...
// Lists server directories for the internal folder picker (no native OS dialog needed).
func (s *Server) handleWorkspaceBrowse() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		home, _ := os.UserHomeDir()
		targetDir := r.URL.Query().Get("dir")
		if targetDir == "" {
			targetDir = s.explorer.GetBaseDir()
		}
		if targetDir == "~" {
			targetDir = home
		} else if strings.HasPrefix(targetDir, "~/") {
			targetDir = filepath.Join(home, strings.TrimPrefix(targetDir, "~/"))
		}
		targetDir = filepath.Clean(targetDir)

		info, err := os.Stat(targetDir)
		if err != nil || !info.IsDir() {
			targetDir = home
		}

		entries, err := os.ReadDir(targetDir)
		if err != nil {
			http.Error(w, fmt.Sprintf("cannot read directory: %v", err), http.StatusInternalServerError)
			return
		}

		subdirs := []DirectoryEntry{}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			if strings.HasPrefix(name, ".") && name != ".git" {
				continue
			}
			full := filepath.Join(targetDir, name)
			// Check if it's a git repo
			isGit := false
			if _, err := os.Stat(filepath.Join(full, ".git")); err == nil {
				isGit = true
			}

			modStr := ""
			if info, err := entry.Info(); err == nil {
				modStr = info.ModTime().Format(time.RFC3339)
			}

			subdirs = append(subdirs, DirectoryEntry{
				Name:    name,
				Path:    full,
				IsGit:   isGit,
				ModTime: modStr,
			})
		}

		parent := filepath.Dir(targetDir)
		if parent == targetDir {
			parent = ""
		}

		// Also check if current targetDir is a git repo
		isGitRoot := false
		if _, err := os.Stat(filepath.Join(targetDir, ".git")); err == nil {
			isGitRoot = true
		}

		cwd, _ := os.Getwd()
		presets := []map[string]string{
			{"label": "Current Workspace", "path": s.explorer.GetBaseDir()},
			{"label": "Process Working Dir", "path": cwd},
			{"label": "Home Directory (~)", "path": home},
			{"label": "Workspaces (~/workspaces)", "path": filepath.Join(home, "workspaces")},
		}

		writeJSON(w, map[string]interface{}{
			"current":   targetDir,
			"parent":    parent,
			"isGit":     isGitRoot,
			"dirs":      subdirs,
			"presets":   presets,
		})
	}
}

// handleGitRepos GET /api/git/repos
// Discovers git repositories on the server to populate quick picker dropdowns.
func (s *Server) handleGitRepos() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		home, _ := os.UserHomeDir()
		cwd, _ := os.Getwd()
		baseDir := s.explorer.GetBaseDir()

		searchRoots := []string{
			baseDir,
			cwd,
			filepath.Join(home, "hasdev"),
			filepath.Join(home, "personal"),
			filepath.Join(home, "workspaces"),
			filepath.Join(home, "Projects"),
			home,
		}

		type RepoInfo struct {
			Name   string `json:"name"`
			Path   string `json:"path"`
			Branch string `json:"branch"`
		}

		discovered := make(map[string]RepoInfo)

		checkRepo := func(p string) {
			p = filepath.Clean(p)
			if _, exists := discovered[p]; exists {
				return
			}
			if _, err := os.Stat(filepath.Join(p, ".git")); err == nil {
				bCmd := exec.Command("git", "branch", "--show-current")
				bCmd.Dir = p
				bOut, _ := bCmd.Output()
				br := strings.TrimSpace(string(bOut))
				if br == "" {
					br = "main"
				}
				name := filepath.Base(p)
				discovered[p] = RepoInfo{
					Name:   name,
					Path:   p,
					Branch: br,
				}
			}
		}

		// Check primary roots
		checkRepo(baseDir)
		checkRepo(cwd)

		// Scan direct children of candidate folders
		for _, root := range searchRoots {
			entries, err := os.ReadDir(root)
			if err != nil {
				continue
			}
			for _, e := range entries {
				if e.IsDir() && !strings.HasPrefix(e.Name(), ".") && e.Name() != "node_modules" {
					sub := filepath.Join(root, e.Name())
					checkRepo(sub)
					// One level deeper for multi-tenant dev folders
					if e.Name() == "personal" || e.Name() == "workspaces" || e.Name() == "hasdev" {
						subEntries, _ := os.ReadDir(sub)
						for _, se := range subEntries {
							if se.IsDir() && !strings.HasPrefix(se.Name(), ".") {
								checkRepo(filepath.Join(sub, se.Name()))
							}
						}
					}
				}
			}
		}

		list := []RepoInfo{}
		// Put baseDir first if present
		if baseInfo, ok := discovered[baseDir]; ok {
			list = append(list, baseInfo)
			delete(discovered, baseDir)
		}
		for _, info := range discovered {
			list = append(list, info)
		}

		writeJSON(w, list)
	}
}
