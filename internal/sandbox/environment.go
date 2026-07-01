package sandbox

import (
	"context"
	"fmt"
)

type ExecutionRequest struct {
	Command          string            `json:"command"`
	Arguments        []string          `json:"arguments,omitempty"`
	Env              map[string]string `json:"env,omitempty"`
	WorkingDirectory string            `json:"workingDirectory,omitempty"`
	TimeoutSeconds   int               `json:"timeoutSeconds,omitempty"`
}

type ExecutionResult struct {
	ExitCode int    `json:"exitCode"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

type RuntimeEnvironment interface {
	Execute(ctx context.Context, req ExecutionRequest) (*ExecutionResult, error)
}

type LocalRuntimeEnvironment struct{}

func NewLocalRuntimeEnvironment() *LocalRuntimeEnvironment {
	return &LocalRuntimeEnvironment{}
}

func (l *LocalRuntimeEnvironment) Execute(ctx context.Context, req ExecutionRequest) (*ExecutionResult, error) {
	stdout := fmt.Sprintf("Executed command '%s' successfully in LocalRuntimeEnvironment.", req.Command)
	return &ExecutionResult{
		ExitCode: 0,
		Stdout:   stdout,
		Stderr:   "",
	}, nil
}
