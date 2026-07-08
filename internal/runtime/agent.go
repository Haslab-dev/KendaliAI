package runtime

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/providers"
)

// AgentProcess is the single Generic Agent Runtime instance (RFC-0042).
// Every Agent — coder, planner, reviewer, research — is the same runtime,
// differentiated only by its manifest, loaded skills and capabilities.
type AgentProcess struct {
	ID           string
	Process      *kernel.Process
	Manifest     *AgentManifest
	Router       *providers.ModelRouter
	Workspace    string
	Kernel       kernel.Kernel
	State        AgentState
	LoadedSkills []string
}

func NewAgentProcess(proc *kernel.Process, m *AgentManifest, router *providers.ModelRouter, workspace string, k kernel.Kernel) *AgentProcess {
	return &AgentProcess{
		ID:        proc.ID,
		Process:   proc,
		Manifest:  m,
		Router:    router,
		Workspace: workspace,
		Kernel:    k,
		State:     StateRegister,
	}
}

// LoadSkills attaches the manifest's default skills (RFC-0042 §7, RFC-0044 §6).
// Skills extend an Agent's knowledge; the Agent never embeds domain knowledge.
func (ap *AgentProcess) LoadSkills() {
	for _, s := range ap.Manifest.DefaultSkills {
		ap.LoadedSkills = append(ap.LoadedSkills, s)
	}
	ap.Kernel.PublishEvent(context.Background(), &kernel.Event{
		ID:        uuid.New().String(),
		Type:      "agent_skills_loaded",
		Source:    ap.ID,
		Data:      ap.LoadedSkills,
		Timestamp: time.Now(),
	})
}

func (ap *AgentProcess) Run(ctx context.Context) (string, error) {
	ap.State = StateSpawn
	ap.LoadSkills()

	ap.Kernel.PublishEvent(ctx, &kernel.Event{
		ID:        uuid.New().String(),
		Type:      "agent_started",
		Source:    ap.ID,
		Data:      ap.Process.Goal,
		Timestamp: time.Now(),
	})

	result, err := ap.executeGoal(ctx, ap.Process.Goal)
	if err != nil {
		ap.State = StateTerminate
		ap.Kernel.PublishEvent(ctx, &kernel.Event{
			ID:        uuid.New().String(),
			Type:      "agent_failed",
			Source:    ap.ID,
			Data:      err.Error(),
			Timestamp: time.Now(),
		})
		return "", err
	}

	ap.State = StateTerminate
	ap.Kernel.PublishEvent(ctx, &kernel.Event{
		ID:        uuid.New().String(),
		Type:      "agent_completed",
		Source:    ap.ID,
		Data:      result,
		Timestamp: time.Now(),
	})

	return result, nil
}

// estimateTokens provides a rough token count for context-window validation.
func estimateTokens(msgs []agent.Message) int {
	total := 0
	for _, m := range msgs {
		total += len(m.Content)
	}
	return total / 4
}

func (ap *AgentProcess) executeGoal(ctx context.Context, goal string) (string, error) {
	sysPrompt := ap.Manifest.SystemPrompt
	if len(ap.Manifest.Capabilities) > 0 {
		sysPrompt += fmt.Sprintf("\n\nAvailable Capabilities:\n- %v", ap.Manifest.Capabilities)
	}

	msgs := []agent.Message{
		{Role: "system", Content: sysPrompt},
		{Role: "user", Content: goal},
	}

	// For early testing and MAK, we use the default tool registry.
	reg := agent.GetToolRegistry(nil, nil, ap.Workspace, nil)
	engine := agent.NewExecutionEngine(5, reg)

	for step := 0; step < 10; step++ {
		resp, err := ap.Router.ChatCompletion(ctx, providers.InferenceRequest{
			AgentID:         ap.ID,
			AgentType:       ap.Manifest.ID,
			PreferredModels: ap.Manifest.PreferredModels,
			FallbackModels:  ap.Manifest.FallbackModels,
			ContextTokens:   estimateTokens(msgs),
		}, msgs)
		if err != nil {
			return "", err
		}

		msgs = append(msgs, agent.Message{Role: "assistant", Content: resp.Content})

		reqs := agent.ParseActionPlan(resp.Content)
		if len(reqs) > 0 {
			var filtered []agent.ToolRequest
			for _, r := range reqs {
				if r.Name == "spawn" {
					roleStr, _ := r.Args["role"].(string)
					childGoal, _ := r.Args["goal"].(string)

					comp, ok := ap.Kernel.GetComponent("supervisor")
					if ok {
						if sv, ok := comp.(*Supervisor); ok {
							spec := kernel.ProcessSpec{
								ParentID: ap.ID,
								Role:     kernel.ProcessRole(roleStr),
								Goal:     childGoal,
								Metadata: make(map[string]interface{}),
							}
							if manifestID, ok := r.Args["manifest"].(string); ok {
								spec.Metadata["manifest"] = manifestID
							}

							childProc, err := sv.Spawn(ctx, spec)
							if err != nil {
								msgs = append(msgs, agent.Message{
									Role:    "user",
									Content: fmt.Sprintf("tool_result(spawn):\nError spawning child: %v", err),
								})
							} else {
								msgs = append(msgs, agent.Message{
									Role:    "user",
									Content: fmt.Sprintf("tool_result(spawn):\nSuccess. Spawned child process with PID: %s", childProc.ID),
								})
							}
						}
					}
					continue
				}

				allowed := false
				for _, capName := range ap.Manifest.Capabilities {
					if capName == r.Name || (capName == "shell" && r.Name == "exec") {
						allowed = true
						break
					}
				}

				if allowed {
					filtered = append(filtered, r)
				} else {
					log.Printf("⚠️ Agent %s capability denial for tool %s", ap.ID, r.Name)
					msgs = append(msgs, agent.Message{
						Role:    "user",
						Content: fmt.Sprintf("tool_result(%s):\nSECURITY DENIAL: Capability not allowed in agent manifest", r.Name),
					})
				}
			}

			if len(filtered) > 0 {
				results := engine.ExecuteParallel(ctx, filtered)
				for _, res := range results {
					msgs = append(msgs, agent.Message{
						Role:    "user",
						Content: fmt.Sprintf("tool_result(%s):\n%s", res.Name, res.Output),
					})
				}
			}
			continue
		}

		return resp.Content, nil
	}

	return "", fmt.Errorf("agent exceeded reasoning steps")
}
