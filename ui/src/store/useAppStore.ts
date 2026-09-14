import { create } from 'zustand';
import { AgentConfig, ProviderConfig, Session, SessionMessage, ToolCallRecord, MCPServerConfig, GatewayLogEvent, BackgroundTask, GlobalModelOption } from '../types';

interface AppState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  selectSession: (id: string) => Promise<void>;
  sessions: Session[];
  loadSessions: () => Promise<void>;
  createSession: (agentId?: string) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  clearSessionMessages: (id: string) => Promise<void>;

  telegramAgents: Record<string, { connected: boolean; botId: string; botName: string }>;
  loadTelegramAgents: () => Promise<void>;

  createDirectChat: (agentId: string) => Promise<string>;
  createGroupChat: (title: string, participants: string[], avatar?: string) => Promise<string>;
  createGeneralChat: (title?: string) => Promise<string>;
  updateGroupParticipants: (groupId: string, participants: string[]) => Promise<void>;

  activeAgent: AgentConfig | null;
  setActiveAgent: (agent: AgentConfig | null) => void;
  agents: AgentConfig[];
  loadAgents: () => Promise<void>;

  providers: ProviderConfig[];
  loadProviders: () => Promise<void>;

  availableModels: GlobalModelOption[];
  defaultModel: string | null;
  isLoadingModels: boolean;
  loadModels: (refresh?: boolean) => Promise<void>;
  setDefaultModel: (modelId: string, providerId?: string) => Promise<void>;

  mcps: MCPServerConfig[];
  loadMcps: () => Promise<void>;

  tasks: BackgroundTask[];
  loadTasks: () => Promise<void>;
  cancelTask: (id: string) => Promise<void>;

  messages: SessionMessage[];
  loadSessionMessages: (sessionId: string) => Promise<void>;
  appendMessage: (msg: SessionMessage) => void;
  appendToolCall: (tc: ToolCallRecord) => void;
  updateToolCall: (tc: ToolCallRecord) => void;
  startStreamingAssistantMessage: (
    id: string,
    model?: string,
    senderId?: string,
    senderName?: string,
    senderAvatar?: string
  ) => void;
  appendThinkingDelta: (delta: string) => void;
  appendTextDelta: (delta: string) => void;
  appendStreamingToolCall: (tc: ToolCallRecord) => void;
  updateStreamingToolResult: (tc: ToolCallRecord) => void;
  finalizeStreamingMessage: (msg: SessionMessage) => void;

  isGenerating: boolean;
  setIsGenerating: (val: boolean) => void;
  thinkingStatus: string;
  setThinkingStatus: (status: string) => void;
  typingAgent: { id: string; name: string; avatar?: string } | null;
  setTypingAgent: (agent: { id: string; name: string; avatar?: string } | null) => void;

  activeModel: string | null;
  setActiveModel: (model: string | null) => void;

  logs: GatewayLogEvent[];
  loadLogs: () => Promise<void>;
  appendLogEvent: (ev: GatewayLogEvent) => void;
  clearLogs: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('kendali_theme') as 'dark' | 'light') || 'dark',
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('kendali_theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
    set({ theme: next });
  },

  activeSessionId: null,
  setActiveSessionId: (id) => {
    if (id) {
      get().selectSession(id);
    } else {
      set({ activeSessionId: null, messages: [] });
    }
  },

  telegramAgents: {},
  loadTelegramAgents: async () => {
    try {
      const res = await fetch('/api/telegram/agents');
      if (res.ok) {
        const data = await res.json();
        set({ telegramAgents: data || {} });
      }
    } catch (e) {
      console.warn('Failed to load telegram agents:', e);
    }
  },

  selectSession: async (id: string) => {
    set({ activeSessionId: id });
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        set({ messages: data.messages || [] });
        const sess: Session | undefined = data.session;
        if (sess) {
          if (sess.type === 'direct' && sess.agentId) {
            const targetId = sess.agentId;
            let matchedAgent = get().agents.find((a) => a.id === targetId);
            if (matchedAgent) {
              set({ activeAgent: matchedAgent });
              if (matchedAgent.model) {
                set({ activeModel: matchedAgent.model });
              }
            } else {
              // Check office staff from local storage or defaults
              let staffInfo: any = null;
              try {
                const saved = localStorage.getItem('kendali_office_workers');
                if (saved) {
                  const parsed = JSON.parse(saved);
                  if (Array.isArray(parsed)) {
                    staffInfo = parsed.find((w: any) => w.id === targetId);
                  }
                }
              } catch {}

              const defStaff: Record<string, { name: string; role: string; avatar: string; model?: string }> = {
                'lead-frontend': { name: 'Senior Dev', role: 'Lead Frontend Dev', avatar: 'blue-drop', model: 'gpt-4o' },
                'lead-architecture': { name: 'Architect Lead', role: 'Lead Architecture', avatar: 'cyan-bubble', model: 'claude-3-7-sonnet' },
                'lead-backend': { name: 'Lead Backend Dev', role: 'Lead Backend Dev', avatar: 'green-cloud', model: 'qwen2.5-coder:latest' },
                'legal-counsel': { name: 'Legal Counsel', role: 'Legal & Compliance', avatar: 'bronze-shield', model: 'gpt-4o' },
                'chief-security': { name: 'Security Lead', role: 'Chief Security Officer', avatar: 'ruby-capsule', model: 'gpt-4o' },
                'devops-lead': { name: 'DevOps Lead', role: 'DevOps & Infra', avatar: 'orange-leaf', model: 'deepseek-chat' },
                'personal-assistant': { name: 'Personal Assistant', role: 'Personal Assistant', avatar: 'blue-drop', model: 'gpt-4o' },
              };

              const staff = staffInfo || defStaff[targetId];
              const createdAgent: AgentConfig = {
                id: targetId,
                name: staff?.role || staff?.name || targetId,
                role: staff?.role,
                description: staff?.description || `Staff Worker: ${staff?.role || targetId}`,
                providerId: '',
                model: staff?.model || '',
                systemPrompt: staff?.systemPrompt || `You are ${staff?.name || targetId}. Execute instructions thoroughly and report back clearly.`,
                skills: staff?.skills || [],
                tools: staff?.tools || ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
                mcp: [],
                memoryScopes: ['user', 'workspace'],
                policy: {},
                avatar: staff?.avatar || 'blue-drop',
                isDefault: false,
              };
              set({ activeAgent: createdAgent });
              if (createdAgent.model) {
                set({ activeModel: createdAgent.model });
              }
            }
          } else if (sess.type === 'group') {
            set({ activeAgent: null });
          } else {
            // General chat - agent is null or personal-assistant, restore user preferred model
            set({ activeAgent: null });
            const savedModel = localStorage.getItem('kendali_active_model') || get().defaultModel;
            if (savedModel) {
              set({ activeModel: savedModel });
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to load session messages:', e);
    }
  },

  loadSessionMessages: async (sessionId: string) => {
    await get().selectSession(sessionId);
  },

  sessions: [],
  loadSessions: async () => {
    try {
      const res = await fetch('/api/sessions');
      const sessions = await res.json();
      set({ sessions: sessions || [] });
      get().loadTelegramAgents().catch(() => {});
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  },

  createDirectChat: async (agentId: string) => {
    const existing = get().sessions.find(
      (s) => (s.id === `direct_${agentId}` || (s.type === 'direct' && s.agentId === agentId))
    );
    if (existing) {
      await get().selectSession(existing.id);
      return existing.id;
    }

    const agent = get().agents.find((a) => a.id === agentId);
    const title = agent ? (agent.name || agent.role || agentId) : agentId;
    const avatar = agent ? (agent.avatar || 'blue-drop') : 'blue-drop';

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `direct_${agentId}`,
          agentId,
          title,
          type: 'direct',
          avatar,
          channelId: 'web',
          participants: [{ participantType: 'agent', participantId: agentId, role: 'member' }],
        }),
      });
      const newSess = await res.json();
      await get().loadSessions();
      await get().selectSession(newSess.id);
      return newSess.id;
    } catch (e) {
      console.error('Failed to create direct chat:', e);
      return '';
    }
  },

  createGroupChat: async (title: string, participants: string[], avatar = 'users') => {
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          participants,
          avatar,
        }),
      });
      const newGroup = await res.json();
      await get().loadSessions();
      await get().selectSession(newGroup.id);
      return newGroup.id;
    } catch (e) {
      console.error('Failed to create group chat:', e);
      return '';
    }
  },

  createGeneralChat: async (title = 'New Chat') => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          type: 'general',
          avatar: 'bot',
          channelId: 'web',
        }),
      });
      const newSess = await res.json();
      await get().loadSessions();
      await get().selectSession(newSess.id);
      return newSess.id;
    } catch (e) {
      console.error('Failed to create general chat:', e);
      return '';
    }
  },

  updateGroupParticipants: async (groupId: string, participants: string[]) => {
    try {
      await fetch(`/api/groups/${groupId}/participants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants }),
      });
      await get().loadSessions();
      if (get().activeSessionId === groupId) {
        await get().selectSession(groupId);
      }
    } catch (e) {
      console.error('Failed to update group participants:', e);
    }
  },

  createSession: async (agentId) => {
    if (agentId) {
      return get().createDirectChat(agentId);
    }
    return get().createGeneralChat();
  },

  deleteSession: async (id) => {
    try {
      await fetch(`/api/sessions?id=${id}`, { method: 'DELETE' });
      await get().loadSessions();
      if (get().activeSessionId === id) {
        const remaining = get().sessions;
        if (remaining.length > 0) {
          await get().selectSession(remaining[0].id);
        } else {
          await get().createGeneralChat();
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  },

  clearSessionMessages: async (id) => {
    try {
      await fetch(`/api/sessions/${id}/clear`, { method: 'POST' });
      set({ messages: [] });
    } catch (e) {
      console.error('Failed to clear messages:', e);
    }
  },

  activeAgent: null,
  setActiveAgent: (agent) => {
    set({ activeAgent: agent });
  },
  agents: [],
  loadAgents: async () => {
    try {
      const res = await fetch('/api/agents');
      const agents = await res.json();
      set({ agents: agents || [] });
      get().loadTelegramAgents().catch(() => {});
      if (agents && agents.length > 0 && !get().activeAgent && !get().activeSessionId) {
        set({ activeAgent: agents[0] });
      }
    } catch (e) {
      console.error('Failed to load agents:', e);
    }
  },

  providers: [],
  loadProviders: async () => {
    try {
      const res = await fetch('/api/providers');
      const providers = await res.json();
      set({ providers: providers || [] });
      await get().loadModels(false);
    } catch (e) {
      console.error('Failed to load providers:', e);
    }
  },

  mcps: [],
  loadMcps: async () => {
    try {
      const res = await fetch('/api/mcps');
      const mcps = await res.json();
      set({ mcps: mcps || [] });
    } catch (e) {
      console.error('Failed to load mcps:', e);
    }
  },

  tasks: [],
  loadTasks: async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const tasks = await res.json();
        set({ tasks: tasks || [] });
      }
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  },
  cancelTask: async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}/cancel`, { method: 'POST' });
      await get().loadTasks();
    } catch (e) {
      console.error('Failed to cancel task:', e);
    }
  },

  messages: [],
  setMessages: (messages) => set({ messages }),
  appendMessage: (msg) =>
    set((s) => {
      // 1. Exact ID check
      if (s.messages.some((m) => m.id === msg.id)) {
        return { messages: s.messages };
      }
      // 2. Exact role + content deduplication within 4 seconds (guards against duplicate event delivery or dual-socket race)
      const lastMsg = s.messages.length > 0 ? s.messages[s.messages.length - 1] : null;
      if (
        lastMsg &&
        lastMsg.role === msg.role &&
        lastMsg.content.trim() === (msg.content || '').trim() &&
        Math.abs((msg.createdAt || Date.now()) - (lastMsg.createdAt || 0)) < 4000
      ) {
        return { messages: s.messages };
      }
      // 3. User optimistic message reconciliation
      if (msg.role === 'user') {
        const optIdx = s.messages.findIndex(
          (m) =>
            m.role === 'user' &&
            (m.id.startsWith('user-') || m.id.startsWith('opt-')) &&
            m.content.trim() === (msg.content || '').trim()
        );
        if (optIdx !== -1) {
          const copy = [...s.messages];
          copy[optIdx] = msg;
          return { messages: copy };
        }
      }
      return { messages: [...s.messages, msg] };
    }),
  appendToolCall: (tc) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        const last = { ...msgs[msgs.length - 1] };
        last.toolCalls = [...(last.toolCalls || []), tc];
        msgs[msgs.length - 1] = last;
      }
      return { messages: msgs };
    });
  },
  updateToolCall: (tc) => {
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].toolCalls) {
          const idx = msgs[i].toolCalls!.findIndex((x) => x.id === tc.id || x.tool === tc.tool);
          if (idx !== -1) {
            msgs[i].toolCalls![idx] = { ...msgs[i].toolCalls![idx], ...tc };
            break;
          }
        }
      }
      return { messages: msgs };
    });
  },

  startStreamingAssistantMessage: (id, model, senderId, senderName, senderAvatar) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant' && msgs[msgs.length - 1].id.startsWith('asst-stream-')) {
        const last = { ...msgs[msgs.length - 1] };
        if (model) last.model = model;
        if (senderId) last.senderId = senderId;
        if (senderName) last.senderName = senderName;
        if (senderAvatar) last.senderAvatar = senderAvatar;
        msgs[msgs.length - 1] = last;
        return { messages: msgs };
      }
      const matchedAgent = senderId ? s.agents.find((a) => a.id === senderId) : null;
      const draft: SessionMessage = {
        id,
        sessionId: s.activeSessionId || '',
        channel: 'web',
        role: 'assistant',
        content: '',
        thought: '',
        toolCalls: [],
        senderId: senderId || s.activeAgent?.id,
        senderName: senderName || matchedAgent?.name || s.activeAgent?.name,
        senderAvatar: senderAvatar || matchedAgent?.avatar || s.activeAgent?.avatar,
        model: model || matchedAgent?.model || s.activeModel || s.activeAgent?.model || 'default',
        createdAt: Date.now(),
      };
      return { messages: [...msgs, draft] };
    });
  },

  appendThinkingDelta: (delta) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
        const draft: SessionMessage = {
          id: 'asst-stream-' + Date.now(),
          sessionId: s.activeSessionId || '',
          channel: 'web',
          role: 'assistant',
          content: '',
          thought: delta,
          toolCalls: [],
          model: s.activeModel || s.activeAgent?.model || 'default',
          createdAt: Date.now(),
        };
        return { messages: [...msgs, draft] };
      }
      const last = { ...msgs[msgs.length - 1] };
      last.thought = (last.thought || '') + delta;
      msgs[msgs.length - 1] = last;
      return { messages: msgs };
    });
  },

  appendTextDelta: (delta) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
        const draft: SessionMessage = {
          id: 'asst-stream-' + Date.now(),
          sessionId: s.activeSessionId || '',
          channel: 'web',
          role: 'assistant',
          content: delta,
          thought: '',
          toolCalls: [],
          model: s.activeModel || s.activeAgent?.model || 'default',
          createdAt: Date.now(),
        };
        return { messages: [...msgs, draft] };
      }
      const last = { ...msgs[msgs.length - 1] };
      last.content = (last.content || '') + delta;
      msgs[msgs.length - 1] = last;
      return { messages: msgs };
    });
  },

  appendStreamingToolCall: (tc) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
        const draft: SessionMessage = {
          id: 'asst-stream-' + Date.now(),
          sessionId: s.activeSessionId || '',
          channel: 'web',
          role: 'assistant',
          content: '',
          thought: '',
          toolCalls: [tc],
          model: s.activeModel || s.activeAgent?.model || 'default',
          createdAt: Date.now(),
        };
        return { messages: [...msgs, draft] };
      }
      const last = { ...msgs[msgs.length - 1] };
      const currentTools = last.toolCalls || [];
      const exists = currentTools.some(t => t.id === tc.id);
      if (!exists) {
        last.toolCalls = [...currentTools, tc];
      }
      msgs[msgs.length - 1] = last;
      return { messages: msgs };
    });
  },

  updateStreamingToolResult: (tc) => {
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].toolCalls && msgs[i].toolCalls!.length > 0) {
          const toolIndex = msgs[i].toolCalls!.findIndex(t => t.id === tc.id || t.tool === tc.tool);
          if (toolIndex !== -1) {
            const updatedTools = [...msgs[i].toolCalls!];
            updatedTools[toolIndex] = { ...updatedTools[toolIndex], ...tc };
            msgs[i] = { ...msgs[i], toolCalls: updatedTools };
            break;
          }
        }
      }
      return { messages: msgs };
    });
  },

  finalizeStreamingMessage: (finalMsg) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...finalMsg,
          toolCalls: finalMsg.toolCalls && finalMsg.toolCalls.length > 0 ? finalMsg.toolCalls : msgs[msgs.length - 1].toolCalls,
          thought: finalMsg.thought || msgs[msgs.length - 1].thought,
        };
      } else {
        msgs.push(finalMsg);
      }
      return { messages: msgs };
    });
  },

  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  thinkingStatus: 'Thinking...',
  setThinkingStatus: (thinkingStatus) => set({ thinkingStatus }),
  typingAgent: null,
  setTypingAgent: (typingAgent) => set({ typingAgent }),

  availableModels: [],
  defaultModel: null,
  isLoadingModels: false,
  activeModel: localStorage.getItem('kendali_active_model') || null,
  setActiveModel: (activeModel) => {
    if (activeModel) {
      localStorage.setItem('kendali_active_model', activeModel);
    } else {
      localStorage.removeItem('kendali_active_model');
    }
    set({ activeModel });
    const sessId = get().activeSessionId;
    if (sessId && activeModel) {
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessId, model: activeModel }),
      }).catch(() => {});
    }
  },

  loadModels: async (refresh = false) => {
    set({ isLoadingModels: true });
    try {
      const url = refresh ? '/api/models?refresh=true' : '/api/models';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const models: GlobalModelOption[] = data.models || [];
        const defMdl = data.defaultModel || (models.length > 0 ? models[0].id : 'gpt-4o');

        let curActive = get().activeModel;
        if (!curActive) {
          curActive = localStorage.getItem('kendali_active_model') || defMdl;
        }

        set({
          availableModels: models,
          defaultModel: defMdl,
          activeModel: curActive,
        });
      }
    } catch (e) {
      console.warn('Failed to load models:', e);
    } finally {
      set({ isLoadingModels: false });
    }
  },

  setDefaultModel: async (modelId: string, providerId?: string) => {
    try {
      await fetch('/api/models/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, providerId }),
      });
      set({ defaultModel: modelId });
      await get().loadModels(false);
    } catch (e) {
      console.warn('Failed to set default model:', e);
    }
  },

  logs: [],
  loadLogs: async () => {
    try {
      const res = await fetch('/api/logs?limit=300');
      if (res.ok) {
        const data = await res.json();
        set({ logs: data.logs || [] });
      }
    } catch (e) {
      console.error('Failed to load initial logs:', e);
    }
  },
  appendLogEvent: (ev) => {
    set((s) => {
      if (s.logs.some((l) => l.id === ev.id)) return { logs: s.logs };
      const next = [...s.logs, ev];
      if (next.length > 500) {
        return { logs: next.slice(next.length - 500) };
      }
      return { logs: next };
    });
  },
  clearLogs: () => set({ logs: [] }),
}));
