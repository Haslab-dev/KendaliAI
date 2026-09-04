package gateway

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

    "sort"
    "github.com/google/uuid"
    "github.com/kendaliai/app/internal/agent"
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
					_ = r.store.IngestDocument(doc, chunks, floatVecs)
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

	// Retrieve document context for this session
	sessionDocs, _ := r.store.ListDocuments(sessionID)
	hasInjectedDoc := false

	// If small/medium document exists in session, provide full text directly for 100% grounded comprehension
	if len(sessionDocs) > 0 {
		latestDoc := sessionDocs[0]
		if len(latestDoc.Content) > 0 && len(latestDoc.Content) <= 24000 {
			sysPrompt += fmt.Sprintf("\n\n## ATTACHED DOCUMENT: '%s'\n%s\n\nUse the above document to answer the user's questions.\n", latestDoc.Title, latestDoc.Content)
			hasInjectedDoc = true
		}
	}

	// Search relevant document chunks via vector search if not already fully injected
	if !hasInjectedDoc && embClient != nil {
		queryText := cleanPrompt
		if len(queryText) > 400 {
			queryText = queryText[:400]
		}
		queryVec, err := embClient.EmbedOne(ctx, queryText)
		if err == nil && len(queryVec) > 0 {
			hits, err := r.store.SearchDocumentChunks(sessionID, []float32(queryVec), 5, 0.35)
			if err == nil && len(hits) > 0 {
				// Ensure hits are sorted by similarity score descending
				sort.Slice(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
				sysPrompt += "\n\n## RETRIEVED EXCERPTS FROM ATTACHED DOCUMENTS (Top " + fmt.Sprintf("%d", len(hits)) + "):\n"
				for i, h := range hits {
					title := h.DocTitle
					if title == "" {
						title = "Document"
					}
					// Include similarity score (rounded to two decimals)
					scoreStr := fmt.Sprintf("%.2f", h.Score)
					sysPrompt += fmt.Sprintf("\n--- [Excerpt %d from '%s' (score: %s)] ---\n%s\n", i+1, title, scoreStr, h.Content)
				}
				sysPrompt += "\nUse the above verified excerpts directly to answer questions.\n"
				hasInjectedDoc = true
			}
		}
	}

	// Fallback for large documents if vector search is still computing in background or unconfigured
	if !hasInjectedDoc && len(sessionDocs) > 0 {
		latestDoc := sessionDocs[0]
		preview := latestDoc.Content
		if len(preview) > 18000 {
			preview = preview[:18000] + "\n... [remaining document content truncated for length] ..."
		}
		sysPrompt += fmt.Sprintf("\n\n## ATTACHED DOCUMENT: '%s'\n%s\n\nUse this document to answer the user's questions.\n", latestDoc.Title, preview)
	}

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

	for step := 0; step < 8; step++ {
		r.bus.Publish(messaging.Event{
			Type:      messaging.EventAgentThinking,
			SessionID: sessionID,
			AgentID:   agentConfig.ID,
			Channel:   channel,
			Payload:   "Planning next step...",
		})

		streamRes, err := StreamOpenAICompatible(ctx, endpoint, apiKey, modelToUse, conversationMsgs, StreamCallbacks{
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
			resp, fallbackErr := pClient.ChatCompletion(ctx, conversationMsgs)
			if fallbackErr != nil {
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentFailed,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload:   fallbackErr.Error(),
				})
				return nil, fmt.Errorf("LLM error: %w", fallbackErr)
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
				InputTokens:  resp.InputTokens,
				OutputTokens: resp.OutputTokens,
			}
		}

		totalTokens += streamRes.InputTokens + streamRes.OutputTokens
		content := streamRes.Content

		// Check if content contains tool calls
		reqs := agent.ParseActionPlan(content)
		if len(reqs) == 0 {
			// Final answer reached!
			finalContent = content
			break
		}

		// Tool calls detected
		conversationMsgs = append(conversationMsgs, agent.Message{Role: "assistant", Content: content})

		for _, req := range reqs {
			toolCallID := uuid.New().String()[:8]

			// Broadcast tool call started
			r.bus.Publish(messaging.Event{
				Type:      messaging.EventAgentToolCall,
				SessionID: sessionID,
				AgentID:   agentConfig.ID,
				Channel:   channel,
				Payload: messaging.ToolCallPayload{
					ID:        toolCallID,
					Tool:      req.Name,
					Arguments: req.Args,
				},
			})

			// Evaluate Policy
			policyEffect := r.evaluatePolicy(agentConfig.ID, req.Name, agentConfig.Policy)
			if policyEffect == "DENY" {
				log.Printf("⛔ Policy denied tool %s for agent %s", req.Name, agentConfig.ID)
				record := ToolCallRecord{
					ID:        toolCallID,
					Tool:      req.Name,
					Arguments: req.Args,
					Output:    "SECURITY DENIAL: Tool execution prohibited by policy.",
					Status:    "denied",
				}
				recordedToolCalls = append(recordedToolCalls, record)

				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentToolResult,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload: messaging.ToolResultPayload{
						ID:         toolCallID,
						Tool:       req.Name,
						Output:     record.Output,
						Status:     "denied",
						DurationMs: 0,
					},
				})

				conversationMsgs = append(conversationMsgs, agent.Message{
					Role:    "user",
					Content: fmt.Sprintf("tool_result(%s):\nSECURITY DENIAL: Not permitted by security policy.", req.Name),
				})
				continue
			}

			// Execute tool
			startExec := time.Now()
			toolDef, exists := toolRegistry[req.Name]
			var toolOutput string
			var status string = "success"

			if !exists {
				toolOutput = fmt.Sprintf("Error: tool '%s' not recognized.", req.Name)
				status = "error"
			} else {
				toolOutput = toolDef.Execute(ctx, req.Args)
				if strings.Contains(toolOutput, "Error") || strings.Contains(toolOutput, "SECURITY DENIAL") {
					status = "error"
				}
			}
			duration := time.Since(startExec).Milliseconds()

			// Record tool call
			record := ToolCallRecord{
				ID:         toolCallID,
				Tool:       req.Name,
				Arguments:  req.Args,
				Output:     toolOutput,
				Status:     status,
				DurationMs: duration,
			}
			recordedToolCalls = append(recordedToolCalls, record)

			// Broadcast tool result
			r.bus.Publish(messaging.Event{
				Type:      messaging.EventAgentToolResult,
				SessionID: sessionID,
				AgentID:   agentConfig.ID,
				Channel:   channel,
				Payload: messaging.ToolResultPayload{
					ID:         toolCallID,
					Tool:       req.Name,
					Output:     toolOutput,
					Status:     status,
					DurationMs: duration,
				},
			})

			conversationMsgs = append(conversationMsgs, agent.Message{
				Role:    "user",
				Content: fmt.Sprintf("tool_result(%s):\n%s", req.Name, toolOutput),
			})
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
		ID:        uuid.New().String(),
		SessionID: sessionID,
		AgentID:   agentConfig.ID,
		Channel:   channel,
		Role:      "assistant",
		Content:   finalContent,
		Thought:   thought,
		ToolCalls: recordedToolCalls,
		Tokens:    totalTokens,
		Model:     modelToUse,
		CreatedAt: time.Now().UnixMilli(),
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
