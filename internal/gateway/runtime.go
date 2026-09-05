package gateway

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/messaging"
	"github.com/kendaliai/app/internal/providers"
	openai "github.com/sashabaranov/go-openai"
)

type Runtime struct {
	store    *Store
	bus      *messaging.EventBus
	workRoot string
}

func NewRuntime(store *Store, bus *messaging.EventBus, workRoot string) *Runtime {
	if workRoot == "" {
		workRoot, _ = os.Getwd()
	}
	return &Runtime{
		store:    store,
		bus:      bus,
		workRoot: workRoot,
	}
}

func (r *Runtime) ExecuteTurn(ctx context.Context, sessionID, agentID, userPrompt, channel string) (*SessionMessage, error) {
	return r.ExecuteTurnWithModel(ctx, sessionID, agentID, userPrompt, channel, "")
}

func (r *Runtime) ExecuteTurnWithModel(ctx context.Context, sessionID, agentID, userPrompt, channel, modelOverride string) (*SessionMessage, error) {
	// 1. Ensure Session exists
	sess, err := r.store.GetSession(sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}
	if sess == nil {
		if agentID == "" {
			agentID = "engineer"
		}
		title := userPrompt
		if len(title) > 40 {
			title = title[:40] + "..."
		}
		sess = &Session{
			ID:        sessionID,
			AgentID:   agentID,
			Title:     title,
			ChannelID: channel,
			UserID:    "user",
			Status:    "active",
		}
		_ = r.store.SaveSession(*sess)
	} else if agentID != "" && sess.AgentID != agentID {
		sess.AgentID = agentID
		_ = r.store.SaveSession(*sess)
	} else {
		agentID = sess.AgentID
	}

	// 1. Process slash directives in userPrompt: /skill:<agentID>, /agent:<agentID>, /mcp:<serverName>
	activeAgentID := agentID
	var extraMCPs []string
	cleanPrompt := strings.TrimSpace(userPrompt)

	for {
		if strings.HasPrefix(cleanPrompt, "/skill:") || strings.HasPrefix(cleanPrompt, "/agent:") {
			parts := strings.SplitN(cleanPrompt, " ", 2)
			cmdPart := parts[0]
			targetAgentID := ""
			if strings.HasPrefix(cmdPart, "/skill:") {
				targetAgentID = strings.TrimPrefix(cmdPart, "/skill:")
			} else {
				targetAgentID = strings.TrimPrefix(cmdPart, "/agent:")
			}

			if targetAgentID != "" {
				targetAgent, err := r.store.GetAgent(targetAgentID)
				if err == nil && targetAgent != nil {
					activeAgentID = targetAgentID
				}
			}
			if len(parts) > 1 {
				cleanPrompt = strings.TrimSpace(parts[1])
				continue
			}
			cleanPrompt = ""
			break
		} else if strings.HasPrefix(cleanPrompt, "/mcp:") {
			parts := strings.SplitN(cleanPrompt, " ", 2)
			mcpName := strings.TrimPrefix(parts[0], "/mcp:")
			if mcpName != "" {
				extraMCPs = append(extraMCPs, mcpName)
			}
			if len(parts) > 1 {
				cleanPrompt = strings.TrimSpace(parts[1])
				continue
			}
			cleanPrompt = ""
			break
		}
		break
	}
	if cleanPrompt == "" {
		cleanPrompt = userPrompt
	}

	// 1b. Parse /doc:<title> directives — inject full document content as RAG context
	var docContextSections []string
	var ragSources []RagSource
	for strings.HasPrefix(cleanPrompt, "/doc:") {
		parts := strings.SplitN(cleanPrompt, " ", 2)
		docTitle := strings.TrimPrefix(parts[0], "/doc:")
		if docTitle != "" {
			docs, _ := r.store.ListDocuments("")
			for _, d := range docs {
				if strings.EqualFold(d.Title, docTitle) ||
					strings.Contains(strings.ToLower(d.Title), strings.ToLower(docTitle)) {
					docContextSections = append(docContextSections,
						fmt.Sprintf("=== Document: %s ===\n%s", d.Title, d.Content))
					ragSources = append(ragSources, RagSource{Title: d.Title})
					break
				}
			}
		}
		if len(parts) > 1 {
			cleanPrompt = strings.TrimSpace(parts[1])
			continue
		}
		cleanPrompt = ""
		break
	}
	// The injected document is LLM context for this turn only — it must not
	// be saved, displayed, or mirrored as part of the user's message.
	turnPrompt := cleanPrompt
	if len(docContextSections) > 0 {
		docBlock := strings.Join(docContextSections, "\n\n")
		if cleanPrompt != "" {
			turnPrompt = docBlock + "\n\n---\nUser question: " + cleanPrompt
		} else {
			turnPrompt = docBlock + "\n\n---\nPlease summarize this document."
		}
	}

	// 2. Save User Message
	userMsg := SessionMessage{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		AgentID:   activeAgentID,
		Channel:   channel,
		Role:      "user",
		Content:   cleanPrompt,
		CreatedAt: time.Now().UnixMilli(),
	}
	_ = r.store.SaveMessage(userMsg)

	// Publish message.created for user
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventMessageCreated,
		SessionID: sessionID,
		AgentID:   activeAgentID,
		Channel:   channel,
		Payload:   userMsg,
	})

	// Publish agent.started & thinking
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentStarted,
		SessionID: sessionID,
		AgentID:   activeAgentID,
		Channel:   channel,
	})
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentThinking,
		SessionID: sessionID,
		AgentID:   activeAgentID,
		Channel:   channel,
		Payload:   "Planning next step...",
	})

	// 3. Resolve Agent Config
	agentConfig, err := r.store.GetAgent(activeAgentID)
	if err != nil || agentConfig == nil {
		// Fallback to default agent
		agents, _ := r.store.ListAgents()
		if len(agents) > 0 {
			agentConfig = &agents[0]
		} else {
			agentConfig = &AgentConfig{
				ID:           "personal-assistant",
				Name:         "Personal Assistant",
				SystemPrompt: "You are a helpful personal AI assistant.",
				ProviderID:   "",
				Model:        "",
			}
		}
	}
	if len(extraMCPs) > 0 {
		cloned := *agentConfig
		for _, m := range extraMCPs {
			already := false
			for _, ex := range cloned.MCP {
				if strings.EqualFold(ex, m) {
					already = true
					break
				}
			}
			if !already {
				cloned.MCP = append(cloned.MCP, m)
			}
		}
		agentConfig = &cloned
	}

	// 4. Resolve Provider
	var provCfg *ProviderConfig
	if agentConfig.ProviderID != "" {
		provCfg, _ = r.store.GetProvider(agentConfig.ProviderID)
	}
	if provCfg == nil {
		providersList, _ := r.store.ListProviders()
		for _, p := range providersList {
			if p.IsDefault && p.Enabled {
				provCfg = &p
				break
			}
		}
		if provCfg == nil && len(providersList) > 0 {
			provCfg = &providersList[0]
		}
	}

	modelToUse := agentConfig.Model
	if modelOverride != "" {
		modelToUse = modelOverride
		// If another enabled provider supports this model, switch provCfg
		providersList, _ := r.store.ListProviders()
		for _, p := range providersList {
			if !p.Enabled {
				continue
			}
			for _, m := range p.Models {
				if m.ID == modelOverride {
					provCfg = &p
					break
				}
			}
		}
	} else if provCfg != nil && len(provCfg.Models) > 0 {
		supported := false
		for _, m := range provCfg.Models {
			if m.ID == modelToUse && m.Enabled {
				supported = true
				break
			}
		}
		if !supported {
			for _, m := range provCfg.Models {
				if m.Enabled {
					modelToUse = m.ID
					break
				}
			}
			if modelToUse == "" && len(provCfg.Models) > 0 {
				modelToUse = provCfg.Models[0].ID
			}
		}
	}

	// 5. Build System Prompt & Skills
	sysPrompt := agentConfig.SystemPrompt
	if len(agentConfig.Skills) > 0 {
		sysPrompt += "\n\n## ATTACHED SKILLS (Apply these guidelines when relevant):\n"
		homeDir, _ := os.UserHomeDir()
		for _, skName := range agentConfig.Skills {
			skPath := filepath.Join(homeDir, ".kendaliai", "skills", "generated", skName, "prompt.md")
			data, err := os.ReadFile(skPath)
			if err == nil {
				sysPrompt += fmt.Sprintf("\n### Skill: %s\n%s\n", skName, string(data))
			} else {
				sysPrompt += fmt.Sprintf("- Skill: %s (Focus on %s best practices)\n", skName, skName)
			}
		}
	}

	// Inject all bootstrap agents as accessible skills / sub-agents across every session
	allAgents, _ := r.store.ListAgents()
	if len(allAgents) > 0 {
		sysPrompt += "\n\n## SPECIALIZED AGENT PERSONAS & SKILLS (Invocable across all sessions):\n"
		sysPrompt += "You can adopt skills or delegate tasks to specialized agent personas:\n"
		for _, ag := range allAgents {
			sysPrompt += fmt.Sprintf("- /skill:%s (%s %s): %s (Skills: %s)\n",
				ag.ID, ag.Avatar, ag.Name, ag.Description, strings.Join(ag.Skills, ", "))
		}
	}

	// Inject configured MCP servers
	allMCPs, _ := r.store.ListMCPServers()
	var activeMCPs []MCPServerConfig
	for _, m := range allMCPs {
		hasInAgent := false
		for _, reqM := range agentConfig.MCP {
			if strings.EqualFold(reqM, m.Name) || strings.EqualFold(reqM, m.ID) {
				hasInAgent = true
				break
			}
		}
		if m.Enabled || hasInAgent {
			activeMCPs = append(activeMCPs, m)
		}
	}
	if len(activeMCPs) > 0 {
		sysPrompt += "\n\n## MODEL CONTEXT PROTOCOL (MCP) SERVERS (Invocable via mcp_call):\n"
		sysPrompt += "You can call external MCP capabilities using: tool: mcp_call({\"server\": \"SERVER_NAME\", \"tool\": \"TOOL_NAME\", \"arguments\": {...}})\n"
		for _, m := range activeMCPs {
			toolSummary := ""
			if len(m.ToolsCached) > 0 {
				names := make([]string, 0, len(m.ToolsCached))
				for _, t := range m.ToolsCached {
					names = append(names, t.Name)
				}
				toolSummary = " — Tools: " + strings.Join(names, ", ")
			}
			sysPrompt += fmt.Sprintf("- /mcp:%s: %s (Transport: %s)%s\n", m.Name, m.ID, m.Transport, toolSummary)
		}
	}

	// Append Tool instructions
	toolRegistry := agent.GetToolRegistry(nil, nil, r.workRoot, r.store.db)
	sysPrompt += "\n\n## AVAILABLE TOOLS:\n"
	sysPrompt += "You can execute tools to perform actions. When calling tools, use the standard format:\n"
	sysPrompt += "tool: TOOL_NAME({\"arg\": \"value\"})\n"
	sysPrompt += "One tool call per line. No extra explanations before tool calls.\n"
	sysPrompt += "Tools available:\n"
	for name, def := range toolRegistry {
		if r.isToolAllowed(name, agentConfig.Tools) {
			sysPrompt += fmt.Sprintf("- %s: %s (Signature: %s)\n", name, def.Description, def.Signature)
		}
	}

	// Native function-calling tool definitions (GOALS.md Gate-1). The text
	// instructions above are kept so the text protocol remains a working
	// fallback for providers that reject the tools API.
	nativeToolsEnabled := config.Cfg.NativeToolsEnabled()
	toolDefs := agent.BuildToolDefinitions(toolRegistry, func(name string) bool {
		return r.isToolAllowed(name, agentConfig.Tools)
	})
	if nativeToolsEnabled && len(toolDefs) > 0 {
		sysPrompt += "\nTool definitions are also attached via the native function-calling API. Prefer issuing tool calls through it; the `tool: NAME({...})` text format remains available as a fallback.\n"
	}

	// 6. Vector RAG Retrieval & Auto-Ingest
	embCfg, _ := r.store.GetEmbeddingConfig()
	var embClient *embedding.Client
	if embCfg != nil && embCfg.Enabled && (embCfg.APIKey != "" || embCfg.Endpoint != "") {
		embClient = embedding.NewClientFromConfig(embCfg.APIKey, embCfg.Endpoint, embCfg.Model)
	}

	// Auto-ingest large user paste (>3,000 chars or multiple paragraphs)
	if len(cleanPrompt) > 3000 && embClient != nil {
		go func(txt, sessId string) {
			chunks := ChunkText(txt, 1500, 150)
			if len(chunks) > 1 {
				doc := Document{
					ID:        uuid.New().String(),
					SessionID: sessId,
					Title:     "User Paste (" + time.Now().Format("Jan 02 15:04") + ")",
					Source:    "user_paste",
					Content:   txt,
				}
				ctxTimeout, cancel := context.WithTimeout(context.Background(), 60*time.Second)
				defer cancel()
				vecs, err := embClient.Embed(ctxTimeout, chunks)
				if err == nil {
					var floatVecs [][]float32
					for _, v := range vecs {
						floatVecs = append(floatVecs, []float32(v))
					}
					_ = r.store.IngestDocument(doc, chunks, floatVecs, embClient.Model())
					r.bus.Publish(messaging.Event{
						Type:      "document.ingested",
						SessionID: sessId,
						Payload: map[string]interface{}{
							"documentId": doc.ID,
							"title":      doc.Title,
							"chunkCount": len(chunks),
						},
					})
				}
			}
		}(cleanPrompt, sessionID)
	}

	// RAG context policy (owner decision): documents are injected ONLY when
	// explicitly requested via /doc:<title>. No automatic retrieval — uploads
	// are embedded on ingest so /doc: and the scored vector search work, but
	// ordinary chat never pulls document content behind the user's back.

	// 7. Context Compaction & Conversation Assembly (128k Token Limit Safe)
	history, _ := r.store.GetSessionMessages(sessionID)
	var conversationMsgs []agent.Message
	conversationMsgs = append(conversationMsgs, agent.Message{Role: "system", Content: sysPrompt})

	// Helper to trim single massive messages exceeding 20k chars
	cleanTurnContent := func(txt string, maxChars int) string {
		if len(txt) <= maxChars {
			return txt
		}
		half := maxChars / 2
		return txt[:half] + "\n\n... [middle content trimmed for context window] ...\n\n" + txt[len(txt)-half:]
	}

	recentWindowSize := 8
	if len(history) <= recentWindowSize {
		// All history messages fit within recent focus buffer
		for _, m := range history {
			conversationMsgs = append(conversationMsgs, agent.Message{
				Role:    m.Role,
				Content: cleanTurnContent(m.Content, 24000),
			})
		}
	} else {
		// Compaction: summarize older turns (0 .. N-recentWindowSize) into a Memory Anchor
		olderTurns := history[:len(history)-recentWindowSize]
		recentTurns := history[len(history)-recentWindowSize:]

		var anchor strings.Builder
		anchor.WriteString("## [CONTEXT COMPACTION MEMORY ANCHOR]\n")
		anchor.WriteString("The earlier part of this conversation was compacted to preserve context within the 128k limit. Key dialogue history:\n")
		for _, ot := range olderTurns {
			roleLabel := "User"
			if ot.Role == "assistant" {
				roleLabel = "Assistant"
			} else if ot.Role == "tool" {
				roleLabel = "Tool Output"
			}
			c := strings.TrimSpace(ot.Content)
			if len(c) > 280 {
				c = c[:270] + "..."
			}
			anchor.WriteString(fmt.Sprintf("- [%s]: %s\n", roleLabel, c))
		}
		anchor.WriteString("\nThe active, recent conversation follows verbatim below:\n")

		// Inject memory anchor as a system message right after main system prompt
		conversationMsgs = append(conversationMsgs, agent.Message{
			Role:    "system",
			Content: anchor.String(),
		})

		// Add recent turns verbatim
		for _, m := range recentTurns {
			conversationMsgs = append(conversationMsgs, agent.Message{
				Role:    m.Role,
				Content: cleanTurnContent(m.Content, 24000),
			})
		}

		// Check total estimated tokens (threshold ~100k tokens out of 128k)
		totalChars := 0
		for _, m := range conversationMsgs {
			totalChars += len(m.Content)
		}
		if totalChars/4 > 100000 {
			r.bus.Publish(messaging.Event{
				Type:      "session.compacted",
				SessionID: sessionID,
				Payload: map[string]interface{}{
					"message": "Conversation context approached 100k token limit; active working memory compacted to guarantee safety margin within 128k context.",
				},
			})
		}
	}

	// The last assembled message is the just-saved user turn. When a /doc:
	// injection is active, give the model the full document context while the
	// stored/displayed message stays the short version the user typed.
	if turnPrompt != cleanPrompt && len(conversationMsgs) > 0 {
		last := &conversationMsgs[len(conversationMsgs)-1]
		if last.Role == "user" {
			last.Content = turnPrompt
		} else {
			conversationMsgs = append(conversationMsgs, agent.Message{Role: "user", Content: turnPrompt})
		}
	}

	// 7. Interactive Streaming Execution Loop (max 8 tool steps)
	var recordedToolCalls []ToolCallRecord
	var finalContent string
	var finalThought strings.Builder
	var totalTokens int

	endpoint := ""
	apiKey := ""
	if provCfg != nil {
		endpoint = provCfg.Endpoint
		apiKey = provCfg.APIKey
	}

	// Native function calling (GOALS.md Gate-1): pass tool definitions to the
	// provider and dispatch structured tool_calls. The text protocol remains
	// as an automatic fallback (mid-turn, on provider errors, or when the
	// model replies in text format anyway).
	nativeTools := nativeToolsEnabled && len(toolDefs) > 0

	for step := 0; step < 8; step++ {
		r.bus.Publish(messaging.Event{
			Type:      messaging.EventAgentThinking,
			SessionID: sessionID,
			AgentID:   agentConfig.ID,
			Channel:   channel,
			Payload:   "Planning next step...",
		})

		toolsParam := toolDefs
		if !nativeTools {
			toolsParam = nil
		}

		streamRes, err := StreamOpenAICompatible(ctx, endpoint, apiKey, modelToUse, conversationMsgs, toolsParam, StreamCallbacks{
			OnThinking: func(delta string) {
				finalThought.WriteString(delta)
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentThinkingDelta,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload: messaging.ThinkingDeltaPayload{
						Delta: delta,
					},
				})
			},
			OnText: func(delta string) {
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentTextDelta,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload: messaging.TextDeltaPayload{
						Delta: delta,
					},
				})
			},
		})

		if err != nil {
			log.Printf("SSE stream error (%v), attempting fallback...", err)
			pClient := r.createProviderClient(provCfg, modelToUse)

			var resp *agent.Response
			if nativeTools {
				if tp, ok := pClient.(agent.ToolCallingProvider); ok {
					resp, err = tp.ChatCompletionWithTools(ctx, conversationMsgs, toolDefs)
					if err != nil {
						log.Printf("native tool fallback failed (%v), retrying without tools", err)
						resp = nil
						nativeTools = false
					}
				} else {
					nativeTools = false
				}
			}
			if resp == nil {
				resp, err = pClient.ChatCompletion(ctx, conversationMsgs)
			}
			if err != nil {
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentFailed,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload:   err.Error(),
				})
				return nil, fmt.Errorf("LLM error: %w", err)
			}

			content := resp.Content
			th := ""
			if strings.Contains(content, "<think>") && strings.Contains(content, "</think>") {
				sIdx := strings.Index(content, "<think>") + len("<think>")
				eIdx := strings.Index(content, "</think>")
				if eIdx > sIdx {
					th = strings.TrimSpace(content[sIdx:eIdx])
					content = strings.TrimSpace(content[:sIdx-len("<think>")] + content[eIdx+len("</think>"):])
				}
			}
			if th != "" {
				finalThought.WriteString(th)
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentThinkingDelta,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload:   messaging.ThinkingDeltaPayload{Delta: th},
				})
			}
			r.bus.Publish(messaging.Event{
				Type:      messaging.EventAgentTextDelta,
				SessionID: sessionID,
				AgentID:   agentConfig.ID,
				Channel:   channel,
				Payload:   messaging.TextDeltaPayload{Delta: content},
			})

			streamRes = &StreamResult{
				Content:      content,
				Thought:      th,
				ToolCalls:    resp.ToolCalls,
				FinishReason: resp.FinishReason,
				InputTokens:  resp.InputTokens,
				OutputTokens: resp.OutputTokens,
			}
		}

		totalTokens += streamRes.InputTokens + streamRes.OutputTokens

		// Native tool calls requested by the model (Gate-1).
		if len(streamRes.ToolCalls) > 0 {
			conversationMsgs = append(conversationMsgs, agent.Message{
				Role:      "assistant",
				Content:   streamRes.Content,
				ToolCalls: streamRes.ToolCalls,
			})
			for _, tc := range streamRes.ToolCalls {
				followUp := r.executeToolCall(ctx, sessionID, channel, agentConfig, tc, toolRegistry, true, &recordedToolCalls)
				conversationMsgs = append(conversationMsgs, followUp)
			}
			continue
		}

		content := streamRes.Content

		// Legacy text-protocol tool calls (`tool: NAME({...})`).
		reqs := agent.ParseActionPlan(content)
		if len(reqs) == 0 {
			// Final answer reached!
			finalContent = content
			break
		}

		if nativeTools {
			// The model replied in the text protocol despite native tool
			// definitions; stop sending them for the rest of this turn.
			nativeTools = false
		}

		// Tool calls detected
		conversationMsgs = append(conversationMsgs, agent.Message{Role: "assistant", Content: content})

		for _, req := range reqs {
			tc := agent.ToolCall{ID: uuid.New().String()[:8], Name: req.Name, Args: req.Args}
			followUp := r.executeToolCall(ctx, sessionID, channel, agentConfig, tc, toolRegistry, false, &recordedToolCalls)
			conversationMsgs = append(conversationMsgs, followUp)
		}
	}

	if finalContent == "" && len(recordedToolCalls) > 0 {
		finalContent = "Completed executing tool actions."
	}

	// 8. Extract Thought / Reasoning process
	thought := strings.TrimSpace(finalThought.String())
	if thought == "" && strings.Contains(finalContent, "<think>") && strings.Contains(finalContent, "</think>") {
		start := strings.Index(finalContent, "<think>") + len("<think>")
		end := strings.Index(finalContent, "</think>")
		if end > start {
			thought = strings.TrimSpace(finalContent[start:end])
			finalContent = strings.TrimSpace(finalContent[:start-len("<think>")] + finalContent[end+len("</think>"):])
		}
	}

	// 9. Save Assistant Message
	assistantMsg := SessionMessage{
		ID:         uuid.New().String(),
		SessionID:  sessionID,
		AgentID:    agentConfig.ID,
		Channel:    channel,
		Role:       "assistant",
		Content:    finalContent,
		Thought:    thought,
		ToolCalls:  recordedToolCalls,
		RagSources: dedupeRagSources(ragSources),
		Tokens:     totalTokens,
		Model:      modelToUse,
		CreatedAt:  time.Now().UnixMilli(),
	}
	_ = r.store.SaveMessage(assistantMsg)

	// Broadcast agent.completed
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentCompleted,
		SessionID: sessionID,
		AgentID:   agentConfig.ID,
		Channel:   channel,
		Payload:   assistantMsg,
	})

	return &assistantMsg, nil
}

// executeToolCall evaluates policy, executes a single tool call, records it,
// and broadcasts the call/result events on the bus. The returned follow-up
// message must be appended to the conversation by the caller; its shape
// depends on nativeMode (role "tool" with tool_call_id vs legacy user
// tool_result text).
func (r *Runtime) executeToolCall(
	ctx context.Context,
	sessionID, channel string,
	agentConfig *AgentConfig,
	call agent.ToolCall,
	toolRegistry map[string]agent.ToolDef,
	nativeMode bool,
	recordedToolCalls *[]ToolCallRecord,
) agent.Message {
	toolCallID := call.ID
	if toolCallID == "" {
		toolCallID = uuid.New().String()[:8]
	}

	// Broadcast tool call started
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentToolCall,
		SessionID: sessionID,
		AgentID:   agentConfig.ID,
		Channel:   channel,
		Payload: messaging.ToolCallPayload{
			ID:        toolCallID,
			Tool:      call.Name,
			Arguments: call.Args,
		},
	})

	// Evaluate Policy
	policyEffect := r.evaluatePolicy(agentConfig.ID, call.Name, agentConfig.Policy)
	if policyEffect == "DENY" {
		log.Printf("⛔ Policy denied tool %s for agent %s", call.Name, agentConfig.ID)
		record := ToolCallRecord{
			ID:        toolCallID,
			Tool:      call.Name,
			Arguments: call.Args,
			Output:    "SECURITY DENIAL: Tool execution prohibited by policy.",
			Status:    "denied",
		}
		*recordedToolCalls = append(*recordedToolCalls, record)

		r.bus.Publish(messaging.Event{
			Type:      messaging.EventAgentToolResult,
			SessionID: sessionID,
			AgentID:   agentConfig.ID,
			Channel:   channel,
			Payload: messaging.ToolResultPayload{
				ID:         toolCallID,
				Tool:       call.Name,
				Output:     record.Output,
				Status:     "denied",
				DurationMs: 0,
			},
		})

		return toolResultMessage(nativeMode, call, "SECURITY DENIAL: Not permitted by security policy.")
	}

	// Execute tool
	startExec := time.Now()
	toolDef, exists := toolRegistry[call.Name]
	var toolOutput string
	var status string = "success"

	if !exists {
		toolOutput = fmt.Sprintf("Error: tool '%s' not recognized.", call.Name)
		status = "error"
	} else {
		toolOutput = toolDef.Execute(ctx, call.Args)
		if strings.Contains(toolOutput, "Error") || strings.Contains(toolOutput, "SECURITY DENIAL") {
			status = "error"
		}
	}
	duration := time.Since(startExec).Milliseconds()

	// Record tool call
	record := ToolCallRecord{
		ID:         toolCallID,
		Tool:       call.Name,
		Arguments:  call.Args,
		Output:     toolOutput,
		Status:     status,
		DurationMs: duration,
	}
	*recordedToolCalls = append(*recordedToolCalls, record)

	// Broadcast tool result
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentToolResult,
		SessionID: sessionID,
		AgentID:   agentConfig.ID,
		Channel:   channel,
		Payload: messaging.ToolResultPayload{
			ID:         toolCallID,
			Tool:       call.Name,
			Output:     toolOutput,
			Status:     status,
			DurationMs: duration,
		},
	})

	return toolResultMessage(nativeMode, call, toolOutput)
}

// toolResultMessage builds the conversation follow-up for a finished tool
// call: native role "tool" message when the call carries a provider-issued ID
// and native mode is active, else the legacy user-role tool_result text.
func toolResultMessage(nativeMode bool, call agent.ToolCall, output string) agent.Message {
	if nativeMode && call.ID != "" {
		return agent.Message{
			Role:       "tool",
			ToolCallID: call.ID,
			Name:       call.Name,
			Content:    output,
		}
	}
	return agent.Message{
		Role:    "user",
		Content: fmt.Sprintf("tool_result(%s):\n%s", call.Name, output),
	}
}

// dedupeRagSources collapses repeated injections of the same document,
// keeping the best retrieval score seen for it.
func dedupeRagSources(sources []RagSource) []RagSource {
	if len(sources) == 0 {
		return nil
	}
	seen := map[string]*RagSource{}
	order := []string{}
	for _, src := range sources {
		if existing, ok := seen[src.Title]; ok {
			if src.Score > existing.Score {
				existing.Score = src.Score
			}
			continue
		}
		cp := src
		seen[src.Title] = &cp
		order = append(order, src.Title)
	}
	out := make([]RagSource, 0, len(order))
	for _, title := range order {
		out = append(out, *seen[title])
	}
	return out
}

func (r *Runtime) isToolAllowed(toolName string, allowedPatterns []string) bool {
	if len(allowedPatterns) == 0 {
		return true
	}
	for _, pat := range allowedPatterns {
		if pat == "*" || pat == toolName {
			return true
		}
		if toolName == "mcp_call" && (pat == "mcp" || pat == "mcp.*" || strings.HasPrefix(pat, "mcp:")) {
			return true
		}
		if strings.HasSuffix(pat, ".*") {
			prefix := strings.TrimSuffix(pat, ".*")
			if strings.HasPrefix(toolName, prefix) {
				return true
			}
		}
	}
	return false
}

func (r *Runtime) evaluatePolicy(agentID, toolName string, agentPolicy map[string]string) string {
	// 1. Check database policies first
	dbPolicies, err := r.store.ListPolicies(agentID)
	if err == nil {
		for _, p := range dbPolicies {
			if p.ToolName == toolName || p.ToolName == "*" {
				return p.Effect
			}
		}
	}

	// 2. Check agent manifest policy
	if agentPolicy != nil {
		if eff, ok := agentPolicy[toolName]; ok {
			return strings.ToUpper(eff)
		}
	}

	// Default allow
	return "ALLOW"
}

func (r *Runtime) createProviderClient(p *ProviderConfig, model string) agent.Provider {
	if p == nil || (p.APIKey == "" && p.Endpoint == "") {
		// Fallback to internal provider from config if available
		return providers.NewProviderFromConfig()
	}

	apiKey := p.APIKey
	if apiKey == "" {
		apiKey = "dummy-key"
	}

	switch p.Type {
	case "anthropic":
		return providers.NewAnthropicProvider(apiKey, model, p.Endpoint)
	default:
		// OpenAI compatible (DeepSeek, OpenAI, Groq, Ollama)
		cfg := openai.DefaultConfig(apiKey)
		if p.Endpoint != "" {
			cfg.BaseURL = p.Endpoint
		}
		return &openAIWrapper{
			client: openai.NewClientWithConfig(cfg),
			model:  model,
		}
	}
}

type openAIWrapper struct {
	client *openai.Client
	model  string
}

func (w *openAIWrapper) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	openAiMsgs := make([]openai.ChatCompletionMessage, len(msgs))
	for i, m := range msgs {
		openAiMsgs[i] = openai.ChatCompletionMessage{
			Role:    m.Role,
			Content: m.Content,
		}
	}

	resp, err := w.client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:    w.model,
		Messages: openAiMsgs,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response choices")
	}

	return &agent.Response{
		Content:      resp.Choices[0].Message.Content,
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
	}, nil
}
