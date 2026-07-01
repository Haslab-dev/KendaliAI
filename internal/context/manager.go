package context

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/agent"
)

type ContextItem struct {
	Source  string
	Content string
}

type ContextManager struct {
	WorkspaceRoot string
}

func NewContextManager(workspaceRoot string) *ContextManager {
	return &ContextManager{
		WorkspaceRoot: workspaceRoot,
	}
}

func (cm *ContextManager) CompileContext(ctx context.Context, goal string) ([]agent.Message, error) {
	var contextParts []string

	for _, fn := range []string{"README.md", "REFACTORING_NOTES.md"} {
		path := filepath.Join(cm.WorkspaceRoot, fn)
		if content, err := os.ReadFile(path); err == nil {
			str := string(content)
			if len(str) > 1500 {
				str = str[:1500] + "\n...(truncated)"
			}
			contextParts = append(contextParts, fmt.Sprintf("File %s:\n%s", fn, str))
		}
	}

	systemContext := "You are a coordinated AI agent. Context below is preloaded from your environment:\n"
	if len(contextParts) > 0 {
		systemContext += strings.Join(contextParts, "\n\n")
	} else {
		systemContext += "No files found in workspace."
	}

	return []agent.Message{
		{Role: "system", Content: systemContext},
		{Role: "user", Content: goal},
	}, nil
}
