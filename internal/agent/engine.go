package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

type ToolRequest struct {
	Name string
	Args map[string]interface{}
}

type ToolResult struct {
	Name    string
	Output  string
	Err     error
	Latency time.Duration
}

// ExecutionEngine handles decoupled concurrent tool scheduling and execution.
// This fulfills Rule 4 (Worker Pool) & Rule 5 (Concurrency) of the Production Architecture.
type ExecutionEngine struct {
	Workers  int
	Registry map[string]ToolDef
}

func NewExecutionEngine(workers int, registry map[string]ToolDef) *ExecutionEngine {
	return &ExecutionEngine{
		Workers:  workers,
		Registry: registry,
	}
}

// ExecuteParallel dispatches commands to a worker pool rather than spawning 1-to-1 processing channels
func (e *ExecutionEngine) ExecuteParallel(ctx context.Context, reqs []ToolRequest) []ToolResult {
	reqChan := make(chan ToolRequest, len(reqs))
	resChan := make(chan ToolResult, len(reqs))

	for _, req := range reqs {
		reqChan <- req
	}
	close(reqChan)

	var wg sync.WaitGroup
	// Fire up N persistent workers
	for i := 0; i < e.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for req := range reqChan {
				start := time.Now()

				tool, exists := e.Registry[req.Name]
				if !exists {
					resChan <- ToolResult{
						Name:    req.Name,
						Output:  fmt.Sprintf("error: tool '%s' not mapped", req.Name),
						Err:     fmt.Errorf("missing tool"),
						Latency: time.Since(start),
					}
					continue
				}

				output := tool.Execute(ctx, req.Args)

				latency := time.Since(start)
				success := !strings.Contains(output, "Error") && !strings.Contains(output, "SECURITY DENIAL")
				RecordTelemetry(req.Name, success, latency)

				resChan <- ToolResult{
					Name:    req.Name,
					Output:  output,
					Latency: latency,
				}
			}
		}()
	}
	wg.Wait()
	close(resChan)

	var results []ToolResult
	for res := range resChan {
		results = append(results, res)
	}
	return results
}
