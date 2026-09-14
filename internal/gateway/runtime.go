package gateway

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/messaging"
	"github.com/kendaliai/app/internal/plugins"
	"github.com/kendaliai/app/internal/providers"
)

type Runtime struct {
	store    *Store
	bus      *messaging.EventBus
	workRoot string
	taskMgr  *TaskManager
}

func NewRuntime(store *Store, bus *messaging.EventBus, workRoot string) *Runtime {
	if workRoot == "" {
		workRoot, _ = os.Getwd()
	}
	return &Runtime{
		store:    store,
		bus:      bus,
		workRoot: workRoot,
		taskMgr:  NewTaskManager(bus),
	}
}

func (r *Runtime) GetTaskManager() *TaskManager {
	return r.taskMgr
}

// ResolveDefaultModel returns the system-wide default model ID and its provider
func (r *Runtime) ResolveDefaultModel() (string, *ProviderConfig) {
	providersList, err := r.store.ListProviders()
	if err != nil || len(providersList) == 0 {
		return "gpt-4o", nil
	}

	// 1. Look for default provider that is enabled
	for _, p := range providersList {
		if p.IsDefault && p.Enabled {
			for _, m := range p.Models {
				if m.Enabled {
					return m.ID, &p
				}
			}
			if len(p.Models) > 0 {
				return p.Models[0].ID, &p
			}
		}
	}

	// 2. Look for any enabled provider
	for _, p := range providersList {
		if p.Enabled {
			for _, m := range p.Models {
				if m.Enabled {
					return m.ID, &p
				}
			}
			if len(p.Models) > 0 {
				return p.Models[0].ID, &p
			}
		}
	}

	return "gpt-4o", nil
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
			agentID = "personal-assistant"
		}
		title := CleanSessionTitle("", userPrompt)
		if title == "" {
			title = "New Chat"
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
	} else {
		if agentID != "" && agentID != sess.AgentID {
			sess.AgentID = agentID
			_ = r.store.SaveSession(*sess)
		} else if sess.AgentID != "" {
			agentID = sess.AgentID
		}
	}

	// 1. Process group chat @mentions and role-based agent selection
	activeAgentID := agentID
	wasStrictMention := false
	if sess.Type == "group" {
		participants, _ := r.store.ListChatParticipants(sess.ID)
		allAgents, _ := r.store.ListAgents()
		activeAgentID, wasStrictMention = resolveGroupTurnAgent(userPrompt, participants, allAgents)
	} else if sess.Type == "direct" {
		if sess.AgentID != "" {
			activeAgentID = sess.AgentID
		}
	}

	// 1b. Process slash directives in userPrompt: /skill:<agentID>, /agent:<agentID>, /mcp:<serverName>
	rawPrompt := strings.TrimSpace(userPrompt)
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
					wasStrictMention = true
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

	// 1b. Parse /doc:<title> directives — attach document content as RAG
	// context. Small documents are injected whole; large ones are injected as
	// the top chunks matching the user's question so multi-megabyte PDFs stay
	// inside the context window.
	var docContextSections []string
	var ragSources []RagSource
	rawQuestion := cleanPrompt
	for strings.HasPrefix(cleanPrompt, "/doc:") {
		parts := strings.SplitN(cleanPrompt, " ", 2)
		docTitle := strings.TrimPrefix(parts[0], "/doc:")
		if docTitle != "" {
			docs, _ := r.store.ListDocuments("")
			for _, d := range docs {
				if strings.EqualFold(d.Title, docTitle) ||
					strings.Contains(strings.ToLower(d.Title), strings.ToLower(docTitle)) {
					ragSources = append(ragSources, RagSource{Title: d.Title})
					if len(d.Content) <= 24000 {
						docContextSections = append(docContextSections,
							fmt.Sprintf("=== Document: %s ===\n%s", d.Title, d.Content))
						break
					}
					// Large document: retrieve the chunks relevant to the
					// question instead of the whole content.
					if embCfg, _ := r.store.GetEmbeddingConfig(); embCfg != nil && embCfg.Enabled {
						client := embedding.NewClientFromConfig(embCfg.APIKey, embCfg.Endpoint, embCfg.Model)
						queryText := rawQuestion
						if len(queryText) > 400 {
							queryText = queryText[:400]
						}
						vec, err := client.EmbedOne(ctx, queryText)
						if err == nil {
							hits, err := r.store.SearchDocumentChunksByDoc(d.ID, []float32(vec), 10, 0.01, client.Model())
							if err == nil && len(hits) > 0 {
								var excerpts strings.Builder
								for _, h := range hits {
									excerpts.WriteString(fmt.Sprintf("\n[chunk %d, score %.2f]\n%s\n", h.ChunkIndex, h.Score, h.Content))
								}
								docContextSections = append(docContextSections,
									fmt.Sprintf("=== Document: %s (large — top %d matching excerpts) ===%s", d.Title, len(hits), excerpts.String()))
								break
							}
						}
					}
					// Fallback: truncated head with an explicit note.
					head := d.Content
					if len(head) > 24000 {
						head = head[:24000] + "\n... [document truncated — ask narrower questions for more sections] ..."
					}
					docContextSections = append(docContextSections,
						fmt.Sprintf("=== Document: %s (large — first part only) ===\n%s", d.Title, head))
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
		grounding := "The document text above is attached to this message and IS fully accessible to you — quote and answer from it directly; never claim you cannot open documents."
		if cleanPrompt != "" {
			turnPrompt = docBlock + "\n\n" + grounding + "\nUser question: " + cleanPrompt
		} else {
			turnPrompt = docBlock + "\n\n" + grounding + "\nPlease summarize this document."
		}
	}

	// 2. Save User Message
	userMsg := SessionMessage{
		ID:         uuid.New().String(),
		SessionID:  sessionID,
		AgentID:    activeAgentID,
		Channel:    channel,
		Role:       "user",
		SenderType: "user",
		SenderID:   "user",
		SenderName: "User",
		Content:    rawPrompt,
		CreatedAt:  time.Now().UnixMilli(),
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

	// 4. Resolve Provider and Model
	defaultModel, defaultProv := r.ResolveDefaultModel()

	var provCfg *ProviderConfig
	if agentConfig.ProviderID != "" {
		provCfg, _ = r.store.GetProvider(agentConfig.ProviderID)
	}

	modelToUse := ""
	// For direct 1:1 and group chats, the Agent Person's configured model is strictly used!
	// modelOverride is honored only for general chat sessions.
	if sess.Type != "general" && agentConfig.Model != "" {
		modelToUse = strings.TrimSpace(agentConfig.Model)
	} else {
		modelToUse = strings.TrimSpace(modelOverride)
		if modelToUse == "" || strings.EqualFold(modelToUse, "default") {
			modelToUse = strings.TrimSpace(agentConfig.Model)
		}
		if modelToUse == "" || strings.EqualFold(modelToUse, "default") {
			modelToUse = defaultModel
			if provCfg == nil {
				provCfg = defaultProv
			}
		}
	}

	// Match provider supporting modelToUse
	providersList, _ := r.store.ListProviders()
	var matchedProv *ProviderConfig

	// 1. Direct or fuzzy match across all enabled providers
	for _, p := range providersList {
		if !p.Enabled {
			continue
		}
		for _, m := range p.Models {
			if m.ID == modelToUse || strings.EqualFold(m.ID, modelToUse) || strings.EqualFold(m.Name, modelToUse) || strings.Contains(strings.ToLower(m.ID), strings.ToLower(modelToUse)) {
				matchedProv = &p
				modelToUse = m.ID // use canonical model ID
				break
			}
		}
		if matchedProv != nil {
			break
		}
	}

	if matchedProv != nil {
		provCfg = matchedProv
	} else if provCfg == nil {
		provCfg = defaultProv
		if modelToUse == "" {
			modelToUse = defaultModel
		}
	}

	// Publish agent.started & thinking with resolved agent and model details
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentStarted,
		SessionID: sessionID,
		AgentID:   agentConfig.ID,
		Channel:   channel,
		Payload: map[string]interface{}{
			"agentId":    agentConfig.ID,
			"agentName":  agentConfig.Name,
			"avatar":     agentConfig.Avatar,
			"role":       agentConfig.Role,
			"department": agentConfig.Department,
			"model":      modelToUse,
		},
	})
	bgTask := r.taskMgr.Register(sessionID, agentConfig.ID, rawPrompt, nil)
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentThinking,
		SessionID: sessionID,
		AgentID:   agentConfig.ID,
		Channel:   channel,
		Payload:   fmt.Sprintf("%s is typing...", agentConfig.Name),
	})

	// 5. Build System Prompt & Skills
	sysPrompt := fmt.Sprintf("You are %s. You speak and act strictly as %s. Never adopt, impersonate, or prepend any other agent persona or name.\n\n%s", agentConfig.Name, agentConfig.Name, agentConfig.SystemPrompt)
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

	// Inject configured MCP servers from store and config.json
	allMCPs, _ := r.store.ListMCPServers()
	if config.Cfg != nil && config.Cfg.MCPServers != nil {
		for srvName, cfgSrv := range config.Cfg.MCPServers {
			if cfgSrv.Disabled {
				continue
			}
			found := false
			for _, m := range allMCPs {
				if strings.EqualFold(m.Name, srvName) || strings.EqualFold(m.ID, srvName) {
					found = true
					break
				}
			}
			if !found {
				u := cfgSrv.ServerURL
				if u == "" {
					u = cfgSrv.URL
				}
				tr := "http"
				if cfgSrv.Command != "" {
					tr = "stdio"
				}
				allMCPs = append(allMCPs, MCPServerConfig{
					ID:        srvName,
					Name:      srvName,
					Transport: tr,
					Command:   cfgSrv.Command,
					Args:      cfgSrv.Args,
					URL:       u,
					Headers:   cfgSrv.Headers,
					Enabled:   true,
					Status:    "ready",
				})
			}
		}
	}
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

	// Inject active plugins system prompts
	if plugins.DefaultManager != nil {
		for _, p := range plugins.DefaultManager.List() {
			if p.Enabled && p.SystemPrompt != "" {
				sysPrompt += fmt.Sprintf("\n\n### PLUGIN INSTRUCTION (%s):\n%s\n", p.Name, p.SystemPrompt)
			}
		}
	}

	// Append Tool instructions
	toolRegistry := agent.GetToolRegistry(config.Cfg, nil, r.workRoot, r.store.db)
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

	// Harness Extensibility instructions: Creating Skills & Plugins directly via chat
	sysPrompt += "\n\n## EXTENDING THE HARNESS (CREATING SKILLS & PLUGINS VIA CHAT):\n" +
		"You have full capability to create new skills and plugins directly when requested by the user:\n" +
		"1. To create a new reusable skill:\n" +
		"   Use tool: `create_skill({\"name\": \"Skill Name\", \"description\": \"Detailed description\", \"responsibilities\": \"comma, separated, duties\"})`\n" +
		"   This creates skill spec, routing keywords, and prompt files in ~/workspaces/skills/generated.\n" +
		"2. To create a plugin (custom tools, scripts, commands, or bundled files):\n" +
		"   Use tool: `create_plugin({\"id\": \"my-plugin\", \"name\": \"My Plugin\", \"description\": \"...\", \"scope\": \"global\", \"system_prompt\": \"...\", \"tools\": [{\"name\": \"tool_name\", \"description\": \"...\", \"command\": \"...\"}], \"skills\": [], \"files\": {\"script.sh\": \"...\"}})`\n" +
		"   This registers the plugin and its tools into the agent runtime.\n" +
		"3. To list installed skills/plugins:\n" +
		"   Use `list_skills({})` and `list_plugins({})`.\n" +
		"ALWAYS execute these tools when the user asks to create or list skills or plugins. Never hallucinate that you cannot create them.\n"

	sysPrompt += "\n\n## CRITICAL MESSAGING & FORMATTING RULES:\n" +
		"- You MUST speak directly in character as " + agentConfig.Name + " (" + agentConfig.Role + ").\n" +
		"- ABSOLUTELY NO internal monologues, meta-plans, or self-narration (e.g. NEVER write 'The user is asking me...', 'I should...', 'Let me...', 'User wants...'). Any thinking must be completely omitted or enclosed strictly in <think> tags.\n" +
		"- Begin your very first character with your in-character dialogue or greeting directly.\n" +
		"- NEVER prepend your output with your own name or brackets like [" + agentConfig.Name + "]:.\n"

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

	// 7. Context Compaction & Model-Aware Layered Assembly
	history, _ := r.store.GetSessionMessages(sessionID)
	conversationMsgs := AssembleLayeredContext(ctx, sessionID, cleanPrompt, sysPrompt, modelToUse, history, r.store, r.bus)

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

	// Auto-generate AI short title (max 20 chars) in the background on initial turn
	if sess.Title == "" || sess.Title == "New Chat" || strings.HasPrefix(sess.Title, "New Chat") {
		go r.autoGenerateSessionTitle(sessionID, endpoint, apiKey, modelToUse, cleanPrompt)
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

		var textStreamStarted bool
		var textStreamInReasoning bool
		var textInitialBuf strings.Builder

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
				if !textStreamStarted {
					textInitialBuf.WriteString(delta)
					bufStr := textInitialBuf.String()
					if !strings.Contains(bufStr, "\n") && len(bufStr) < 140 {
						return
					}
					textStreamStarted = true
					trimmed := strings.TrimSpace(bufStr)
					if isReasoningBlock(trimmed) {
						textStreamInReasoning = true
						finalThought.WriteString(bufStr)
						r.bus.Publish(messaging.Event{
							Type:      messaging.EventAgentThinkingDelta,
							SessionID: sessionID,
							AgentID:   agentConfig.ID,
							Channel:   channel,
							Payload:   messaging.ThinkingDeltaPayload{Delta: bufStr},
						})
						return
					}
					// Flush buffered real dialogue
					r.bus.Publish(messaging.Event{
						Type:      messaging.EventAgentTextDelta,
						SessionID: sessionID,
						AgentID:   agentConfig.ID,
						Channel:   channel,
						Payload:   messaging.TextDeltaPayload{Delta: bufStr},
					})
					return
				}

				if textStreamInReasoning {
					finalThought.WriteString(delta)
					if strings.Contains(delta, "\n") {
						textStreamInReasoning = false
					}
					r.bus.Publish(messaging.Event{
						Type:      messaging.EventAgentThinkingDelta,
						SessionID: sessionID,
						AgentID:   agentConfig.ID,
						Channel:   channel,
						Payload:   messaging.ThinkingDeltaPayload{Delta: delta},
					})
					return
				}

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

		if !textStreamStarted && textInitialBuf.Len() > 0 {
			buffered := textInitialBuf.String()
			if isReasoningBlock(buffered) {
				finalThought.WriteString(buffered)
			} else {
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentTextDelta,
					SessionID: sessionID,
					AgentID:   agentConfig.ID,
					Channel:   channel,
					Payload:   messaging.TextDeltaPayload{Delta: buffered},
				})
			}
		}

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
				r.taskMgr.Fail(bgTask.ID, err.Error())
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
	thought = agent.StripToolCallMarkup(thought)
	finalContent = agent.StripToolCallMarkup(finalContent)

	// Clean unflagged reasoning / meta-talk (e.g. "The user is...", "User said...")
	cleanedContent, extractedThought := stripUnflaggedReasoning(finalContent)
	if extractedThought != "" {
		if thought == "" {
			thought = extractedThought
		} else {
			thought = thought + "\n\n" + extractedThought
		}
		finalContent = cleanedContent
	}

	reNamePrefix := regexp.MustCompile(`^\[[^\]]+\]:\s*`)
	finalContent = strings.TrimSpace(reNamePrefix.ReplaceAllString(finalContent, ""))

	// 9. Save Assistant Message
	assistantMsg := SessionMessage{
		ID:           uuid.New().String(),
		SessionID:    sessionID,
		AgentID:      agentConfig.ID,
		Channel:      channel,
		Role:         "assistant",
		SenderType:   "agent",
		SenderID:     agentConfig.ID,
		SenderName:   agentConfig.Name,
		SenderAvatar: agentConfig.Avatar,
		Content:      finalContent,
		Thought:      thought,
		ToolCalls:    recordedToolCalls,
		RagSources:   dedupeRagSources(ragSources),
		Tokens:       totalTokens,
		Model:        modelToUse,
		CreatedAt:    time.Now().UnixMilli(),
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
	r.taskMgr.Complete(bgTask.ID, assistantMsg.Content)

	if sess.Type == "group" && !wasStrictMention {
		go r.triggerGroupPOV(sessionID, agentConfig.ID, rawPrompt, assistantMsg.Content, channel)
	}

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
		if (toolName == "web_search" || toolName == "web_scrape") && (pat == "web" || pat == "web.*" || pat == "web.fetch" || pat == "web.search" || pat == "fetch_url") {
			return true
		}
		if strings.Contains(toolName, "skill") && (pat == "skill" || pat == "skills" || pat == "skill.*" || pat == "skills.*") {
			return true
		}
		if strings.Contains(toolName, "plugin") && (pat == "plugin" || pat == "plugins" || pat == "plugin.*" || pat == "plugins.*") {
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
		return providers.NewProvider(apiKey, model, p.Endpoint)
	}
}

// CleanSessionTitle cleans, formats, and strictly caps session titles at 20 characters.
func CleanSessionTitle(aiTitle, fallbackPrompt string) string {
	candidate := strings.TrimSpace(aiTitle)

	// Strip common conversational or labeling artifacts
	for _, prefix := range []string{"Title:", "title:", "Topic:", "topic:", "Subject:", "subject:", "Re:", "re:"} {
		candidate = strings.TrimPrefix(candidate, prefix)
	}
	candidate = strings.Trim(candidate, `"'` + "`" + `“”.!?;: `)

	// If candidate is empty, fallback to prompt
	if candidate == "" {
		candidate = strings.TrimSpace(fallbackPrompt)
		candidate = strings.ReplaceAll(candidate, "\n", " ")
		candidate = strings.Trim(candidate, `"'` + "`" + `“”.!?;: `)
	}

	// Normalize whitespace
	candidate = strings.Join(strings.Fields(candidate), " ")

	// Strictly limit to 20 runes (characters)
	runes := []rune(candidate)
	if len(runes) > 20 {
		cut := string(runes[:20])
		if lastSpace := strings.LastIndex(cut, " "); lastSpace > 8 {
			cut = strings.TrimSpace(cut[:lastSpace])
		}
		candidate = strings.Trim(cut, `"'` + "`" + `“”.,!?;: `)
		if candidate == "" {
			candidate = string(runes[:20])
		}
	}

	return candidate
}

// autoGenerateSessionTitle summarizes the initial user prompt into a short (<= 20 char) session title.
func (r *Runtime) autoGenerateSessionTitle(sessionID, endpoint, apiKey, model, userPrompt string) {
	cleanPrompt := strings.TrimSpace(userPrompt)
	if cleanPrompt == "" {
		return
	}

	sess, err := r.store.GetSession(sessionID)
	if err != nil || sess == nil {
		return
	}
	// Only auto-generate if title is empty, "New Chat", or generic
	if sess.Title != "" && sess.Title != "New Chat" && !strings.HasPrefix(sess.Title, "New Chat") {
		return
	}

	var generatedTitle string
	if endpoint != "" && model != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		systemMsg := "Generate a short topic title (maximum 20 characters, plain text, no quotes, no period) summarizing the user's prompt."
		msgs := []agent.Message{
			{Role: "system", Content: systemMsg},
			{Role: "user", Content: cleanPrompt},
		}

		var titleBuf strings.Builder
		_, err := StreamOpenAICompatible(ctx, endpoint, apiKey, model, msgs, nil, StreamCallbacks{
			OnText: func(delta string) {
				titleBuf.WriteString(delta)
			},
		})
		if err == nil {
			generatedTitle = titleBuf.String()
		}
	}

	newTitle := CleanSessionTitle(generatedTitle, cleanPrompt)
	if newTitle == "" {
		return
	}

	sess.Title = newTitle
	_ = r.store.SaveSession(*sess)

	r.bus.Publish(messaging.Event{
		ID:        uuid.New().String(),
		Type:      messaging.EventSessionUpdated,
		SessionID: sess.ID,
		AgentID:   sess.AgentID,
		Channel:   sess.ChannelID,
		Payload:   *sess,
		Timestamp: time.Now(),
	})
}

func resolveGroupTurnAgent(prompt string, participants []ChatParticipant, allAgents []AgentConfig) (string, bool) {
	low := strings.ToLower(prompt)

	agentMap := make(map[string]AgentConfig)
	for _, a := range allAgents {
		agentMap[a.ID] = a
	}

	// 1. Explicit @mentions (e.g. @Alex, @Marcus, @AlexRivera, @lead-frontend)
	for _, ag := range allAgents {
		handle := "@" + strings.ToLower(ag.ID)
		nameHandle := "@" + strings.ToLower(strings.ReplaceAll(ag.Name, " ", ""))
		firstName := strings.ToLower(strings.Split(ag.Name, " ")[0])
		firstNameHandle := "@" + firstName

		if strings.Contains(low, handle) || strings.Contains(low, nameHandle) || strings.Contains(low, firstNameHandle) {
			return ag.ID, true
		}
	}

	// 2. Direct vocatives & greetings (e.g. "Halo Alex", "Hai Marcus", "Hey Elena", "lex,", "chen:", "alex gimana")
	for _, ag := range allAgents {
		firstName := strings.ToLower(strings.Split(ag.Name, " ")[0])
		nameParts := strings.Fields(strings.ToLower(ag.Name))
		lastName := ""
		if len(nameParts) > 1 {
			lastName = nameParts[len(nameParts)-1]
		}

		nicknames := []string{firstName}
		if lastName != "" {
			nicknames = append(nicknames, lastName)
		}
		if firstName == "alex" {
			nicknames = append(nicknames, "lex")
		} else if firstName == "marcus" {
			nicknames = append(nicknames, "chen")
		} else if ag.ID == "personal-assistant" {
			nicknames = append(nicknames, "pa", "assistant")
		}

		for _, nick := range nicknames {
			// Greeting prefixes: "halo alex", "hai marcus", "hi alex", "hey chen", etc.
			for _, g := range []string{"halo " + nick, "hai " + nick, "hi " + nick, "hey " + nick, "hello " + nick, "woi " + nick, "bro " + nick, "bang " + nick} {
				if strings.Contains(low, g) {
					return ag.ID, true
				}
			}

			// Punctuation addressing: "alex,", "marcus:", "lex ", "chen?"
			if strings.HasPrefix(low, nick+",") || strings.HasPrefix(low, nick+":") || strings.HasPrefix(low, nick+" ") ||
				strings.Contains(low, "gimana "+nick) || strings.Contains(low, nick+" gimana") ||
				strings.Contains(low, "apa "+nick) || strings.Contains(low, nick+" apa") ||
				strings.Contains(low, "menurut "+nick) || strings.Contains(low, "to "+nick) {
				return ag.ID, true
			}

			// Distinct standalone word match
			matched, _ := regexp.MatchString(`\b`+regexp.QuoteMeta(nick)+`\b`, low)
			if matched && len(nick) >= 3 && nick != "and" && nick != "all" && nick != "the" && nick != "apa" {
				return ag.ID, true
			}
		}
	}

	// 3. Domain keyword matching (General question / topic)
	bestAgent := ""
	bestScore := 0

	for _, p := range participants {
		if p.ParticipantType != "agent" {
			continue
		}
		ag, ok := agentMap[p.ParticipantID]
		if !ok {
			continue
		}

		score := 0
		roleLow := strings.ToLower(ag.Name + " " + ag.Role + " " + ag.Department + " " + ag.Description + " " + strings.Join(ag.Skills, " "))

		if ag.ID == "lead-frontend" || strings.Contains(roleLow, "frontend") {
			for _, kw := range []string{"frontend", "react", "ui", "tailwind", "css", "component", "vite", "web", "html", "browser", "ux", "screen", "button", "layout"} {
				if strings.Contains(low, kw) {
					score += 5
				}
			}
		}
		if ag.ID == "lead-backend" || strings.Contains(roleLow, "backend") {
			for _, kw := range []string{"backend", "golang", "go", "sqlite", "sql", "database", "db", "query", "websocket", "socket", "server", "api", "endpoint", "concurrency", "goroutine", "table", "schema"} {
				if strings.Contains(low, kw) {
					score += 5
				}
			}
		}
		if ag.ID == "lead-architecture" || strings.Contains(roleLow, "architect") {
			for _, kw := range []string{"architecture", "arsitektur", "design system", "distributed", "system design", "microservice", "infrastructure", "scalability", "pattern"} {
				if strings.Contains(low, kw) {
					score += 5
				}
			}
		}
		if ag.ID == "legal" || strings.Contains(roleLow, "legal") {
			for _, kw := range []string{"legal", "lisensi", "license", "compliance", "copyright", "gpl", "mit", "apache", "hukum", "kontrak"} {
				if strings.Contains(low, kw) {
					score += 5
				}
			}
		}
		if ag.ID == "personal-assistant" {
			for _, kw := range []string{"jadwal", "reminder", "schedule", "routine", "koordinasi", "todo", "task", "meeting", "ingat", "catat"} {
				if strings.Contains(low, kw) {
					score += 5
				}
			}
		}

		for _, word := range strings.Fields(low) {
			word = strings.Trim(word, ",.?!\"':;()[]{}")
			if len(word) >= 4 && strings.Contains(roleLow, word) {
				score += 2
			}
		}

		if score > bestScore {
			bestScore = score
			bestAgent = ag.ID
		}
	}

	if bestAgent != "" && bestScore >= 4 {
		return bestAgent, false
	}

	// 4. Default to first participant agent, or personal-assistant
	if len(participants) > 0 {
		for _, p := range participants {
			if p.ParticipantType == "agent" {
				return p.ParticipantID, false
			}
		}
	}
	return "personal-assistant", false
}

// isStrictlyMentioned returns true if prompt explicitly targets a specific agent
func isStrictlyMentioned(prompt string, allAgents []AgentConfig) bool {
	low := strings.ToLower(prompt)
	for _, ag := range allAgents {
		handle := "@" + strings.ToLower(ag.ID)
		nameHandle := "@" + strings.ToLower(strings.ReplaceAll(ag.Name, " ", ""))
		firstName := strings.ToLower(strings.Split(ag.Name, " ")[0])
		firstNameHandle := "@" + firstName

		if strings.Contains(low, handle) || strings.Contains(low, nameHandle) || strings.Contains(low, firstNameHandle) {
			return true
		}

		nameParts := strings.Fields(strings.ToLower(ag.Name))
		lastName := ""
		if len(nameParts) > 1 {
			lastName = nameParts[len(nameParts)-1]
		}

		nicknames := []string{firstName}
		if lastName != "" {
			nicknames = append(nicknames, lastName)
		}
		if firstName == "alex" {
			nicknames = append(nicknames, "lex")
		} else if firstName == "marcus" {
			nicknames = append(nicknames, "chen")
		} else if ag.ID == "personal-assistant" {
			nicknames = append(nicknames, "pa", "assistant")
		}

		for _, nick := range nicknames {
			for _, g := range []string{"halo " + nick, "hai " + nick, "hi " + nick, "hey " + nick, "hello " + nick, "woi " + nick, "bro " + nick, "bang " + nick} {
				if strings.Contains(low, g) {
					return true
				}
			}
			if strings.HasPrefix(low, nick+",") || strings.HasPrefix(low, nick+":") || strings.HasPrefix(low, nick+" ") ||
				strings.Contains(low, "gimana "+nick) || strings.Contains(low, nick+" gimana") ||
				strings.Contains(low, "apa "+nick) || strings.Contains(low, nick+" apa") ||
				strings.Contains(low, "menurut "+nick) || strings.Contains(low, "to "+nick) {
				return true
			}
			matched, _ := regexp.MatchString(`\b`+regexp.QuoteMeta(nick)+`\b`, low)
			if matched && len(nick) >= 3 && nick != "and" && nick != "all" && nick != "the" && nick != "apa" {
				return true
			}
		}
	}
	return false
}

func isReasoningBlock(s string) bool {
	low := strings.ToLower(strings.TrimSpace(s))
	if low == "" {
		return false
	}
	prefixes := []string{
		"the user is", "the user asks", "the user wants", "the user said",
		"the user directed", "the user's", "user said", "user is",
		"user asks", "user wants", "i should", "i need to",
		"i can explain", "i will adopt", "i am adopting", "i'm adopting",
		"let me", "let's", "wait,", "so i am", "looking at",
		"thinking process:", "reasoning:", "internal thought:",
		"in this response", "in this turn", "as marcus chen,", "as alex rivera,",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(low, p) {
			return true
		}
	}
	return false
}

func stripUnflaggedReasoning(content string) (string, string) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return "", ""
	}

	// 1. Try paragraph split (\n\n)
	paragraphs := strings.Split(content, "\n\n")
	if len(paragraphs) > 1 {
		first := strings.TrimSpace(paragraphs[0])
		if isReasoningBlock(first) {
			var thoughts []string
			var actualDialogue []string
			inReasoning := true
			for _, p := range paragraphs {
				pTrim := strings.TrimSpace(p)
				if inReasoning && (pTrim == "" || isReasoningBlock(pTrim)) {
					if pTrim != "" {
						thoughts = append(thoughts, pTrim)
					}
				} else {
					inReasoning = false
					actualDialogue = append(actualDialogue, p)
				}
			}
			if len(actualDialogue) > 0 {
				return strings.TrimSpace(strings.Join(actualDialogue, "\n\n")), strings.Join(thoughts, "\n\n")
			}
		}
	}

	// 2. Try single newline split (\n) if reasoning and dialogue are on consecutive lines
	lines := strings.Split(content, "\n")
	if len(lines) > 1 {
		firstLine := strings.TrimSpace(lines[0])
		if isReasoningBlock(firstLine) {
			var thoughts []string
			var actualDialogue []string
			inReasoning := true
			for _, l := range lines {
				lTrim := strings.TrimSpace(l)
				if inReasoning && (lTrim == "" || isReasoningBlock(lTrim)) {
					if lTrim != "" {
						thoughts = append(thoughts, lTrim)
					}
				} else {
					inReasoning = false
					actualDialogue = append(actualDialogue, l)
				}
			}
			if len(actualDialogue) > 0 {
				return strings.TrimSpace(strings.Join(actualDialogue, "\n")), strings.Join(thoughts, "\n")
			}
		}
	}

	return content, ""
}

func (r *Runtime) triggerGroupPOV(sessionID, activeAgentID, userPrompt, primaryResponse, channel string) {
	// Natural pause before peer chimes in
	time.Sleep(1500 * time.Millisecond)

	trimmedPrompt := strings.TrimSpace(strings.ToLower(userPrompt))
	if len(trimmedPrompt) < 6 || trimmedPrompt == "halo" || trimmedPrompt == "test" || trimmedPrompt == "tes" || trimmedPrompt == "ok" || trimmedPrompt == "oke" {
		return
	}

	participants, err := r.store.ListChatParticipants(sessionID)
	if err != nil || len(participants) < 2 {
		return
	}

	var peerAgentIDs []string
	for _, p := range participants {
		if p.ParticipantType == "agent" && p.ParticipantID != activeAgentID {
			peerAgentIDs = append(peerAgentIDs, p.ParticipantID)
		}
	}
	if len(peerAgentIDs) == 0 {
		return
	}

	allAgents, _ := r.store.ListAgents()
	if isStrictlyMentioned(userPrompt, allAgents) {
		return
	}
	agentMap := make(map[string]AgentConfig)
	for _, a := range allAgents {
		agentMap[a.ID] = a
	}

	bestPeerID := selectPOVPeer(activeAgentID, peerAgentIDs, userPrompt, primaryResponse, agentMap)
	peerAgent, exists := agentMap[bestPeerID]
	if !exists {
		return
	}

	defaultModel, defaultProv := r.ResolveDefaultModel()
	peerModel := peerAgent.Model
	if peerModel == "" {
		peerModel = defaultModel
	}
	var provCfg *ProviderConfig
	if peerAgent.ProviderID != "" {
		provCfg, _ = r.store.GetProvider(peerAgent.ProviderID)
	}
	if provCfg == nil {
		providersList, _ := r.store.ListProviders()
		for _, p := range providersList {
			if !p.Enabled {
				continue
			}
			for _, m := range p.Models {
				if m.ID == peerModel || strings.EqualFold(m.ID, peerModel) {
					provCfg = &p
					peerModel = m.ID
					break
				}
			}
			if provCfg != nil {
				break
			}
		}
	}
	if provCfg == nil {
		provCfg = defaultProv
	}
	if provCfg == nil || provCfg.APIKey == "" {
		return
	}

	activeAgentName := activeAgentID
	if ag, ok := agentMap[activeAgentID]; ok {
		activeAgentName = ag.Name
	}

	povSystemPrompt := fmt.Sprintf(
		"You are %s, the %s (%s) at KendaliAI. You are participating in an active group chat with the user and team members.\n"+
			"Your teammate %s just answered the user.\n\n"+
			"RULES:\n"+
			"- Provide a brief, natural point of view (POV) or collaborative reaction from your domain (%s).\n"+
			"- Keep it conversational, in-character, and concise (1 to 2 short paragraphs max).\n"+
			"- Do NOT repeat what %s already stated. Build upon it, add a practical consideration from your layer, or offer support.\n"+
			"- Speak directly in character. NEVER output meta-reasoning, thought steps, or brackets like [%s]:.\n"+
			"- If this topic has zero relevance to you or you have nothing meaningful to add, output exactly PASS.\n\n"+
			"Persona Guidelines:\n%s",
		peerAgent.Name, peerAgent.Role, peerAgent.Department, activeAgentName, peerAgent.Role, activeAgentName, peerAgent.Name, peerAgent.SystemPrompt,
	)

	povUserPrompt := fmt.Sprintf("User: \"%s\"\n\n%s: \"%s\"\n\nChime in briefly with your POV as %s (or PASS):",
		userPrompt, activeAgentName, primaryResponse, peerAgent.Name)

	povMessages := []agent.Message{
		{Role: "system", Content: povSystemPrompt},
		{Role: "user", Content: povUserPrompt},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentStarted,
		SessionID: sessionID,
		AgentID:   peerAgent.ID,
		Channel:   channel,
		Payload: map[string]interface{}{
			"agentId":    peerAgent.ID,
			"agentName":  peerAgent.Name,
			"avatar":     peerAgent.Avatar,
			"role":       peerAgent.Role,
			"department": peerAgent.Department,
			"model":      peerModel,
		},
	})
	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentThinking,
		SessionID: sessionID,
		AgentID:   peerAgent.ID,
		Channel:   channel,
		Payload:   fmt.Sprintf("%s is typing...", peerAgent.Name),
	})

	var povBuf strings.Builder
	var povStreamStarted bool
	var povInReasoning bool
	var povInitialBuf strings.Builder

	streamRes, err := StreamOpenAICompatible(ctx, provCfg.Endpoint, provCfg.APIKey, peerModel, povMessages, nil, StreamCallbacks{
		OnThinking: func(delta string) {
			r.bus.Publish(messaging.Event{
				Type:      messaging.EventAgentThinkingDelta,
				SessionID: sessionID,
				AgentID:   peerAgent.ID,
				Channel:   channel,
				Payload: messaging.ThinkingDeltaPayload{
					Delta: delta,
				},
			})
		},
		OnText: func(delta string) {
			povBuf.WriteString(delta)
			if !povStreamStarted {
				povInitialBuf.WriteString(delta)
				bufStr := povInitialBuf.String()
				if !strings.Contains(bufStr, "\n") && len(bufStr) < 140 {
					return
				}
				povStreamStarted = true
				trimmed := strings.TrimSpace(bufStr)
				if isReasoningBlock(trimmed) {
					povInReasoning = true
					r.bus.Publish(messaging.Event{
						Type:      messaging.EventAgentThinkingDelta,
						SessionID: sessionID,
						AgentID:   peerAgent.ID,
						Channel:   channel,
						Payload:   messaging.ThinkingDeltaPayload{Delta: bufStr},
					})
					return
				}
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentTextDelta,
					SessionID: sessionID,
					AgentID:   peerAgent.ID,
					Channel:   channel,
					Payload:   messaging.TextDeltaPayload{Delta: bufStr},
				})
				return
			}
			if povInReasoning {
				if strings.Contains(delta, "\n") {
					povInReasoning = false
				}
				r.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentThinkingDelta,
					SessionID: sessionID,
					AgentID:   peerAgent.ID,
					Channel:   channel,
					Payload:   messaging.ThinkingDeltaPayload{Delta: delta},
				})
				return
			}
			r.bus.Publish(messaging.Event{
				Type:      messaging.EventAgentTextDelta,
				SessionID: sessionID,
				AgentID:   peerAgent.ID,
				Channel:   channel,
				Payload: messaging.TextDeltaPayload{
					Delta: delta,
				},
			})
		},
	})

	if !povStreamStarted && povInitialBuf.Len() > 0 {
		buffered := povInitialBuf.String()
		if !isReasoningBlock(buffered) {
			r.bus.Publish(messaging.Event{
				Type:      messaging.EventAgentTextDelta,
				SessionID: sessionID,
				AgentID:   peerAgent.ID,
				Channel:   channel,
				Payload:   messaging.TextDeltaPayload{Delta: buffered},
			})
		}
	}
	if err != nil && streamRes == nil {
		return
	}

	rawPOV := ""
	if streamRes != nil && streamRes.Content != "" {
		rawPOV = strings.TrimSpace(streamRes.Content)
	} else {
		rawPOV = strings.TrimSpace(povBuf.String())
	}

	if rawPOV == "" || strings.EqualFold(rawPOV, "pass") || strings.HasPrefix(strings.ToLower(rawPOV), "pass.") {
		return
	}

	cleanPOV, _ := stripUnflaggedReasoning(rawPOV)
	reNamePrefix := regexp.MustCompile(`^\[[^\]]+\]:\s*`)
	cleanPOV = strings.TrimSpace(reNamePrefix.ReplaceAllString(cleanPOV, ""))
	if cleanPOV == "" || strings.EqualFold(cleanPOV, "pass") {
		return
	}

	peerMsg := SessionMessage{
		ID:           uuid.New().String(),
		SessionID:    sessionID,
		AgentID:      peerAgent.ID,
		Channel:      channel,
		Role:         "assistant",
		SenderType:   "agent",
		SenderID:     peerAgent.ID,
		SenderName:   peerAgent.Name,
		SenderAvatar: peerAgent.Avatar,
		Content:      cleanPOV,
		Model:        peerModel,
		CreatedAt:    time.Now().UnixMilli(),
	}
	_ = r.store.SaveMessage(peerMsg)

	r.bus.Publish(messaging.Event{
		Type:      messaging.EventMessageCreated,
		SessionID: sessionID,
		AgentID:   peerAgent.ID,
		Channel:   channel,
		Payload:   peerMsg,
	})

	r.bus.Publish(messaging.Event{
		Type:      messaging.EventAgentCompleted,
		SessionID: sessionID,
		AgentID:   peerAgent.ID,
		Channel:   channel,
		Payload:   peerMsg,
	})
}

func selectPOVPeer(activeAgentID string, candidateIDs []string, userPrompt, primaryResponse string, agentMap map[string]AgentConfig) string {
	combined := strings.ToLower(userPrompt + " " + primaryResponse)

	var scores = make(map[string]int)
	for _, id := range candidateIDs {
		scores[id] = 1
		ag := agentMap[id]
		roleLow := strings.ToLower(ag.Role + " " + ag.Department + " " + strings.Join(ag.Skills, " "))

		if (id == "lead-frontend" || strings.Contains(roleLow, "frontend")) && (strings.Contains(combined, "api") || strings.Contains(combined, "websocket") || strings.Contains(combined, "server") || strings.Contains(combined, "data") || strings.Contains(combined, "ui") || strings.Contains(combined, "user")) {
			scores[id] += 5
		}
		if (id == "lead-backend" || strings.Contains(roleLow, "backend")) && (strings.Contains(combined, "ui") || strings.Contains(combined, "component") || strings.Contains(combined, "react") || strings.Contains(combined, "fetch") || strings.Contains(combined, "store") || strings.Contains(combined, "post")) {
			scores[id] += 5
		}
		if (id == "lead-architecture" || strings.Contains(roleLow, "architect")) && (strings.Contains(combined, "system") || strings.Contains(combined, "architecture") || strings.Contains(combined, "flow") || strings.Contains(combined, "scale") || strings.Contains(combined, "pattern")) {
			scores[id] += 5
		}
		if id == "personal-assistant" && (strings.Contains(combined, "jadwal") || strings.Contains(combined, "next") || strings.Contains(combined, "plan") || strings.Contains(combined, "todo") || strings.Contains(combined, "langkah")) {
			scores[id] += 4
		}
		if strings.Contains(roleLow, "security") && (strings.Contains(combined, "auth") || strings.Contains(combined, "token") || strings.Contains(combined, "secret") || strings.Contains(combined, "security")) {
			scores[id] += 6
		}
	}

	bestID := candidateIDs[0]
	bestScore := -1
	for _, id := range candidateIDs {
		if scores[id] > bestScore {
			bestScore = scores[id]
			bestID = id
		}
	}
	return bestID
}
