package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/botmode"
	"github.com/kendaliai/app/internal/messaging"
)

// SubagentSessionPrefix marks sessions created for out-of-chat sub-agent runs.
// The UI hides these from the chat list; they are reachable through the
// background-task banner and carry the full worklog of the delegated run.
const SubagentSessionPrefix = "subtask_"

// subagentTimeout bounds a single delegated run. Heavy work legitimately takes
// longer than the interactive 3-minute chat turn budget.
const subagentTimeout = 20 * time.Minute

// reportMaxRunes caps how much of a sub-agent's final output is injected into
// the parent chat; the full text stays in the subtask session.
const reportMaxRunes = 6000

// SpawnSubagentTool returns the spawn_subagent tool definition bound to a
// parent chat session. The delegated run executes via ExecuteTurnWithModel on
// its own goroutine in a dedicated hidden session: no delta, tool card, or
// thinking event ever reaches the parent chat. Only the final report is
// posted back as a normal assistant message.
func (r *Runtime) SpawnSubagentTool(parentSessionID string) agent.ToolDef {
	return agent.ToolDef{
		Name:        "spawn_subagent",
		Description: "Delegate a heavy task (deep research, large planning, multi-file coding, big review) to a sub-agent that runs OUTSIDE this chat in a background session. Returns a task id immediately; the sub-agent's final report is delivered back into this chat as a message when it finishes.",
		Signature:   `{"task": "string - complete, self-contained instructions with the goal, constraints and expected deliverable", "agent": "string - optional specialist agent id (e.g. coder, research, planner, reviewer). Omit to auto-select", "context": "string - optional extra context or data the sub-agent needs"}`,
		Category:    "orchestration",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			return r.spawnSubagent(parentSessionID, args)
		},
	}
}

func (r *Runtime) spawnSubagent(parentSessionID string, args map[string]interface{}) string {
	task := stringArg(args, "task")
	if strings.TrimSpace(task) == "" {
		return "Error: spawn_subagent requires a non-empty 'task' argument."
	}
	limits := r.orchestrationLimits()
	parentDepth := r.sessionSubagentDepth(parentSessionID)
	if parentDepth >= limits.MaxSubagentDepth {
		return fmt.Sprintf("Error: sub-agent depth limit reached (%d). Complete this task directly instead of delegating further.", limits.MaxSubagentDepth)
	}
	if r.taskMgr == nil {
		return "Error: task manager unavailable."
	}
	if r.store == nil {
		return "Error: sub-agent storage unavailable."
	}

	requested := stringArg(args, "agent")
	extraCtx := stringArg(args, "context")
	subAgentID, subAgentName, subAgentAvatar := r.resolveSubagentAgent(requested, task)

	prompt := task
	if extraCtx != "" {
		prompt += "\n\n### Additional context from the orchestrator:\n" + extraCtx
	}
	prompt += "\n\n(You are running as a background sub-agent delegated by the main chat. Work autonomously toward the task — use tools as needed — and produce a complete, self-contained final report. Do not ask the orchestrator questions.)"

	// Hidden workspace session carrying the full worklog of the run.
	subSessionID := SubagentSessionPrefix + uuid.New().String()[:8]
	title := "🛰 " + truncateRunes(task, 60)
	if err := r.store.SaveSession(Session{
		ID:       subSessionID,
		AgentID:  subAgentID,
		Title:    title,
		Avatar:   subAgentAvatar,
		Status:   "active",
		Metadata: fmt.Sprintf(`{"parentSession":%q,"kind":"subagent","depth":%d}`, parentSessionID, parentDepth+1),
	}); err != nil {
		log.Printf("spawn_subagent: session save failed: %v", err)
		return "Error: failed to create sub-agent session."
	}

	// cancel doubles as the timeout and the banner's Cancel button action.
	timeout := time.Duration(limits.SubagentTimeoutMinutes) * time.Minute
	subCtx, cancel := context.WithTimeout(context.Background(), timeout)
	bgTask := r.taskMgr.Register(subSessionID, subAgentID, title, cancel, parentSessionID)

	go func() {
		defer cancel()
		// Wait for a concurrency slot; extra sub-agents queue rather than fail.
		if r.subagentSem != nil {
			r.subagentSem <- struct{}{}
			defer func() { <-r.subagentSem }()
		}
		result, err := r.ExecuteTurnWithModel(subCtx, subSessionID, subAgentID, prompt, "subagent", "")
		if err != nil {
			if subCtx.Err() != nil {
				// Cancelled from the banner or timed out; task status is
				// already terminal — nothing to report back.
				log.Printf("subagent %s ended by cancellation: %v", bgTask.ID, err)
				return
			}
			r.taskMgr.Fail(bgTask.ID, err.Error())
			r.postSubagentReport(parentSessionID, subAgentID, subAgentName, subAgentAvatar, subSessionID, task, "failed", err.Error())
			return
		}
		content := ""
		if result != nil {
			content = result.Content
		}

		// Weak models often burn every tool-loop step and stop without ever
		// writing the deliverable (the turn loop then falls back to a stub
		// like "Completed executing tool actions."). Force a no-tools
		// synthesis pass over the worklog so the parent chat gets a real
		// report instead of a hollow stub.
		if trivialReportContent(content) {
			synthesized, synErr := r.synthesizeReport(subCtx, subSessionID, subAgentID, task, content)
			if synErr != nil {
				log.Printf("subagent %s synthesis failed: %v", bgTask.ID, synErr)
			} else if strings.TrimSpace(synthesized) != "" {
				content = synthesized
				// Keep the worklog complete: persist the report as the final
				// assistant message of the subtask session.
				repMsg := SessionMessage{
					ID:           "subagent-report-" + uuid.New().String()[:8],
					SessionID:    subSessionID,
					AgentID:      subAgentID,
					Channel:      "subagent",
					Role:         "assistant",
					SenderType:   "agent",
					SenderID:     subAgentID,
					SenderName:   subAgentName,
					SenderAvatar: subAgentAvatar,
					Content:      content,
					Model:        "subagent-synthesis",
					CreatedAt:    time.Now().UnixMilli(),
				}
				_ = r.store.SaveMessage(repMsg)
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventMessageCreated,
					SessionID: subSessionID,
					AgentID:   subAgentID,
					Channel:   "subagent",
					Payload:   repMsg,
				})
			}
		}

		r.taskMgr.Complete(bgTask.ID, content)
		r.postSubagentReport(parentSessionID, subAgentID, subAgentName, subAgentAvatar, subSessionID, task, "completed", content)
	}()

	return fmt.Sprintf("Sub-agent spawned: task_id=%s agent=%s session=%s. It is now working in the background outside this chat; its final report will be posted here automatically when done. You can keep the conversation going meanwhile — do not poll for progress.", bgTask.ID, subAgentID, subSessionID)
}

// postSubagentReport delivers the outcome into the parent chat as a normal
// assistant message, so the conversation remains the single inbox. Only
// message.created is published on purpose: agent.completed would make the UI
// treat the report as the live streaming draft.
func (r *Runtime) postSubagentReport(parentSessionID, agentID, agentName, avatar, subSessionID, task, status, detail string) {
	var content string
	if status == "completed" {
		content = fmt.Sprintf("🛰 **Sub-agent report — %s**\n_Task: %s_\n\n%s\n\n_Full worklog in background session `%s`._",
			agentName, truncateRunes(task, 120), truncateRunes(detail, reportMaxRunes), subSessionID)
	} else {
		content = fmt.Sprintf("⚠️ **Sub-agent failed — %s**\n_Task: %s_\n\nError: %s",
			agentName, truncateRunes(task, 120), detail)
	}

	msg := SessionMessage{
		ID:           "subagent-" + uuid.New().String(),
		SessionID:    parentSessionID,
		AgentID:      agentID,
		Channel:      "web",
		Role:         "assistant",
		SenderType:   "agent",
		SenderID:     agentID,
		SenderName:   agentName + " · Sub-agent",
		SenderAvatar: avatar,
		Content:      content,
		Model:        "subagent",
		CreatedAt:    time.Now().UnixMilli(),
	}
	if err := r.store.SaveMessage(msg); err != nil {
		log.Printf("subagent report save failed: %v", err)
	}
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventMessageCreated,
		SessionID: parentSessionID,
		AgentID:   agentID,
		Channel:   "web",
		Payload:   msg,
	})
}

// trivialReportContent detects hollow turn outcomes — the tool-loop stub,
// empty text, or one-liners — that must never be delivered as a "report".
// A delegated task is expected to produce a substantial deliverable.
func trivialReportContent(s string) bool {
	t := strings.ToLower(strings.TrimSpace(s))
	if t == "" {
		return true
	}
	if len([]rune(t)) < 120 {
		return true
	}
	return strings.Contains(t, "completed executing tool actions")
}

// synthesizeReport forces the final deliverable: a no-tools completion over
// the task plus every tool output in the worklog. This is the "summary
// action" — whatever the model did during the run, it must end with a
// self-contained report in the task's language.
func (r *Runtime) synthesizeReport(ctx context.Context, subSessionID, subAgentID, task, lastContent string) (string, error) {
	agentConfig, err := r.store.GetAgent(subAgentID)
	if err != nil || agentConfig == nil {
		agents, listErr := r.store.ListAgents()
		if listErr != nil || len(agents) == 0 {
			return "", fmt.Errorf("no agent config available for synthesis")
		}
		agentConfig = &agents[0]
	}

	var provCfg *ProviderConfig
	if agentConfig.ProviderID != "" {
		provCfg, _ = r.store.GetProvider(agentConfig.ProviderID)
	}
	model := strings.TrimSpace(agentConfig.Model)
	if model == "" {
		defModel, defProvCfg := r.ResolveDefaultModel()
		model = defModel
		if provCfg == nil {
			provCfg = defProvCfg
		}
	}

	sys := "You are a sub-agent delivering the FINAL REPORT of a delegated task. Using the task description and the executed tool outputs below, write the complete, self-contained deliverable in the same language as the task. Follow any structural requirements the task specified. Never mention tools, steps, this instruction, or the delegation itself. Output only the report content."
	msgs := []agent.Message{
		{Role: "system", Content: sys},
		{Role: "user", Content: "Task:\n" + task},
	}

	history, _ := r.store.GetSessionMessages(subSessionID)
	for _, m := range history {
		for _, tc := range m.ToolCalls {
			out := strings.TrimSpace(tc.Output)
			if out == "" {
				continue
			}
			msgs = append(msgs, agent.Message{
				Role:    "user",
				Content: fmt.Sprintf("Tool %s output:\n%s", tc.Tool, truncateRunes(out, 2500)),
			})
		}
	}
	if strings.TrimSpace(lastContent) != "" {
		msgs = append(msgs, agent.Message{
			Role:    "user",
			Content: "The run ended with this unfinished note:\n" + lastContent,
		})
	}
	msgs = append(msgs, agent.Message{Role: "user", Content: "Now write the final report."})

	client := r.createProviderClient(provCfg, model)
	resp, err := client.ChatCompletion(ctx, msgs)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(resp.Content), nil
}

// resolveSubagentAgent picks the specialist for a delegated run: explicit
// id/name match first, then keyword routing over the task, then the first
// registered agent as a safe fallback.
func (r *Runtime) resolveSubagentAgent(requested, task string) (string, string, string) {
	agents, err := r.store.ListAgents()
	if err == nil && requested != "" {
		for _, ag := range agents {
			if strings.EqualFold(ag.ID, requested) || strings.EqualFold(ag.Name, requested) {
				return ag.ID, ag.Name, ag.Avatar
			}
		}
	}

	pick := func(candidateIDs ...string) (string, string, string, bool) {
		if err != nil {
			return "", "", "", false
		}
		for _, cand := range candidateIDs {
			for _, ag := range agents {
				if strings.EqualFold(ag.ID, cand) || strings.EqualFold(ag.Role, cand) || strings.EqualFold(ag.Department, cand) {
					return ag.ID, ag.Name, ag.Avatar, true
				}
			}
		}
		return "", "", "", false
	}

	lower := strings.ToLower(task + " " + requested)
	switch {
	case containsAny(lower, "research", "investigat", "riset", "deep-dive", "fact-check"):
		if id, n, a, ok := pick("research", "researcher"); ok {
			return id, n, a
		}
	case containsAny(lower, "code", "implement", "refactor", "bug", "koding", "script"):
		if id, n, a, ok := pick("coder", "developer", "engineer"); ok {
			return id, n, a
		}
	case containsAny(lower, "plan", "architect", "design", "rencana", "milestone"):
		if id, n, a, ok := pick("planner", "architect"); ok {
			return id, n, a
		}
	case containsAny(lower, "review", "audit", "security", "vulnerab"):
		if id, n, a, ok := pick("reviewer", "security"); ok {
			return id, n, a
		}
	}

	if err == nil && len(agents) > 0 {
		return agents[0].ID, agents[0].Name, agents[0].Avatar
	}
	return "assistant", "Sub-Agent", "purple-pebble"
}

// sessionSubagentDepth returns how deep a session sits in the delegation tree.
func (r *Runtime) sessionSubagentDepth(sessionID string) int {
	if r.store == nil {
		return 0
	}
	sess, err := r.store.GetSession(sessionID)
	if err != nil || sess == nil || sess.Metadata == "" {
		return 0
	}
	var meta map[string]interface{}
	if err := json.Unmarshal([]byte(sess.Metadata), &meta); err != nil {
		return 0
	}
	if d, ok := meta["depth"].(float64); ok {
		return int(d)
	}
	return 0
}

// SubagentStatusTool lets the orchestrator inspect delegated runs without
// polling the chat transcript.
func (r *Runtime) SubagentStatusTool(parentSessionID string) agent.ToolDef {
	return agent.ToolDef{
		Name:        "subagent_status",
		Description: "List the sub-agents you delegated (status, task id, title) or inspect one by task_id. Use this instead of asking the user to wait.",
		Signature:   `{"task_id": "string - optional; omit to list every delegated task"}`,
		Category:    "orchestration",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			if r.taskMgr == nil {
				return "Error: task manager unavailable."
			}
			taskID := stringArg(args, "task_id")
			if taskID != "" {
				t := r.taskMgr.Get(taskID)
				if t == nil || t.ParentSessionID != parentSessionID {
					return "Error: task not found for this session."
				}
				out, _ := json.Marshal(t)
				return string(out)
			}
			tasks := r.taskMgr.TasksForParent(parentSessionID)
			if len(tasks) == 0 {
				return "No sub-agents have been delegated from this session."
			}
			type summary struct {
				ID        string `json:"id"`
				Title     string `json:"title"`
				Status    string `json:"status"`
				AgentID   string `json:"agentId"`
				StartedAt int64  `json:"startedAt"`
				Error     string `json:"error,omitempty"`
			}
			items := make([]summary, 0, len(tasks))
			for _, t := range tasks {
				items = append(items, summary{
					ID: t.ID, Title: t.Title, Status: t.Status, AgentID: t.AgentID,
					StartedAt: t.StartedAt, Error: t.Error,
				})
			}
			out, _ := json.Marshal(items)
			return string(out)
		},
	}
}

// CancelSubagentTool stops a delegated run.
func (r *Runtime) CancelSubagentTool(parentSessionID string) agent.ToolDef {
	return agent.ToolDef{
		Name:        "cancel_subagent",
		Description: "Cancel a running sub-agent task by task_id.",
		Signature:   `{"task_id": "string - the task id returned by spawn_subagent"}`,
		Category:    "orchestration",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			if r.taskMgr == nil {
				return "Error: task manager unavailable."
			}
			taskID := stringArg(args, "task_id")
			if taskID == "" {
				return "Error: cancel_subagent requires 'task_id'."
			}
			t := r.taskMgr.Get(taskID)
			if t == nil || t.ParentSessionID != parentSessionID {
				return "Error: task not found for this session."
			}
			if err := r.taskMgr.Cancel(taskID); err != nil {
				return "Error: " + err.Error()
			}
			return fmt.Sprintf("Sub-agent task %s cancelled.", taskID)
		},
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func stringArg(args map[string]interface{}, key string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// DeepSearchTool returns the deep_search tool definition.
func (r *Runtime) DeepSearchTool(parentSessionID string) agent.ToolDef {
	return agent.ToolDef{
		Name:        "deep_search",
		Description: "Run DeepSearch: decomposes a complex inquiry into multiple parallel research angles, deploys background sub-agents concurrently, and synthesizes findings into a unified, cross-verified report.",
		Signature:   `{"query": "string - complex topic or question to deep-search", "mode": "string - optional mode (regular, fun, think). Defaults to session mode"}`,
		Category:    "research",
		Execute: func(ctx context.Context, args map[string]interface{}) string {
			return r.executeDeepSearch(parentSessionID, args)
		},
	}
}

func (r *Runtime) executeDeepSearch(parentSessionID string, args map[string]interface{}) string {
	query := stringArg(args, "query")
	if strings.TrimSpace(query) == "" {
		return "Error: deep_search requires a non-empty 'query' argument."
	}
	if strings.HasPrefix(parentSessionID, SubagentSessionPrefix) {
		return "Error: deep_search cannot be called from within a sub-agent session."
	}
	if r.taskMgr == nil {
		return "Error: task manager unavailable."
	}

	modeStr := stringArg(args, "mode")
	activeMode := botmode.ParseMode(modeStr)
	parentChannel := "web"
	if sess, _ := r.store.GetSession(parentSessionID); sess != nil {
		if modeStr == "" {
			activeMode = botmode.ExtractSessionMode(sess.Metadata)
		}
		if sess.ChannelID != "" {
			parentChannel = sess.ChannelID
		}
	}

	subtasks := botmode.DecomposeQuery(query)
	if len(subtasks) == 0 {
		return "Error: query could not be decomposed into subtasks."
	}

	r.bus.Publish(messaging.Event{
		Type:      "deepsearch.progress",
		SessionID: parentSessionID,
		Payload: map[string]any{
			"stage":     "decomposed",
			"subtasks":  len(subtasks),
			"query":     query,
			"timestamp": time.Now().UnixMilli(),
		},
	})

	var wg sync.WaitGroup
	resultsChan := make(chan botmode.SubtaskResult, len(subtasks))

	for _, st := range subtasks {
		sub := st
		wg.Add(1)
		go func() {
			defer wg.Done()
			start := time.Now()
			subCtx, cancel := context.WithTimeout(context.Background(), subagentTimeout)
			defer cancel()

			subAgentID, _, _ := r.resolveSubagentAgent(sub.Role, sub.Query)
			subSessionID := SubagentSessionPrefix + uuid.New().String()[:8]
			title := "🛰 " + truncateRunes(sub.Angle+": "+sub.Query, 60)
			_ = r.store.SaveSession(Session{
				ID:       subSessionID,
				AgentID:  subAgentID,
				Title:    title,
				Status:   "active",
				Metadata: fmt.Sprintf(`{"parentSession":%q,"kind":"subagent"}`, parentSessionID),
			})

			res, err := r.ExecuteTurnWithModel(subCtx, subSessionID, subAgentID, sub.Query, "subagent", "")
			output := ""
			success := true
			if err != nil {
				output = "Error: " + err.Error()
				success = false
			} else if res != nil {
				output = res.Content
			}

			resultsChan <- botmode.SubtaskResult{
				SubtaskID: sub.ID,
				Angle:     sub.Angle,
				Output:    output,
				Duration:  time.Since(start),
				Success:   success,
			}
		}()
	}

	go func() {
		wg.Wait()
		close(resultsChan)

		var collected []botmode.SubtaskResult
		for res := range resultsChan {
			collected = append(collected, res)
		}

		synthesized := botmode.SynthesizeReport(query, collected, activeMode)

		repMsg := SessionMessage{
			ID:         "deepsearch-report-" + uuid.New().String()[:8],
			SessionID:  parentSessionID,
			Channel:    parentChannel,
			Role:       "assistant",
			SenderType: "agent",
			SenderName: "DeepSearch",
			Content:    synthesized,
			CreatedAt:  time.Now().UnixMilli(),
		}
		_ = r.store.SaveMessage(repMsg)
		r.bus.Publish(messaging.Event{
			Type:      messaging.EventMessageCreated,
			SessionID: parentSessionID,
			Channel:   parentChannel,
			Payload:   repMsg,
		})
	}()

	return fmt.Sprintf("DeepSearch launched across %d parallel sub-agents for: %q. Live research progress is underway; the synthesized report will be delivered automatically here when completed.", len(subtasks), query)
}
