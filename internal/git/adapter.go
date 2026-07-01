package git

import (
	"fmt"
	"time"
)

type GitCommit struct {
	Type    string `json:"type"`
	Scope   string `json:"scope,omitempty"`
	Message string `json:"message"`
}

type GitAdapter interface {
	Status() (string, error)
	Commit(c GitCommit) (string, error)
	CreateBranch(name string) error
}

type LocalGitAdapter struct {
	workDir      string
	activeBranch string
	commits      []GitCommit
}

func NewLocalGitAdapter(workDir string) *LocalGitAdapter {
	return &LocalGitAdapter{
		workDir:      workDir,
		activeBranch: "main",
	}
}

func (la *LocalGitAdapter) Status() (string, error) {
	return fmt.Sprintf("On branch %s\nnothing to commit, working tree clean", la.activeBranch), nil
}

func (la *LocalGitAdapter) Commit(c GitCommit) (string, error) {
	la.commits = append(la.commits, c)
	hash := fmt.Sprintf("commit-%x", time.Now().UnixNano())
	formatted := fmt.Sprintf("[%s %s] %s: %s", la.activeBranch, hash[:10], c.Type, c.Message)
	return formatted, nil
}

func (la *LocalGitAdapter) CreateBranch(name string) error {
	la.activeBranch = name
	return nil
}
