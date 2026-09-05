import { create } from 'zustand';
import { AgentConfig, ProviderConfig, Session, SessionMessage, ToolCallRecord, MCPServerConfig, GatewayLogEvent } from '../types';

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

  activeAgent: AgentConfig | null;
  setActiveAgent: (agent: AgentConfig) => void;
  agents: AgentConfig[];
  loadAgents: () => Promise<void>;

  providers: ProviderConfig[];
  loadProviders: () => Promise<void>;

  mcps: MCPServerConfig[];
  loadMcps: () => Promise<void>;

  messages: SessionMessage[];
  setMessages: (msgs: SessionMessage[]) => void;
  appendMessage: (msg: SessionMessage) => void;
  appendToolCall: (tc: ToolCallRecord) => void;
  updateToolCall: (tc: ToolCallRecord) => void;
  startStreamingAssistantMessage: (id: string, model?: string) => void;
  appendThinkingDelta: (delta: string) => void;
  appendTextDelta: (delta: string) => void;
  appendStreamingToolCall: (tc: ToolCallRecord) => void;
  updateStreamingToolResult: (tc: ToolCallRecord) => void;
  finalizeStreamingMessage: (msg: SessionMessage) => void;

  isGenerating: boolean;
  setIsGenerating: (val: boolean) => void;
  thinkingStatus: string;
  setThinkingStatus: (status: string) => void;

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

  selectSession: async (id: string) => {
    set({ activeSessionId: id });
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        set({ messages: data.messages || [] });
        if (data.session && data.session.agentId) {
          const matchedAgent = get().agents.find((a) => a.id === data.session.agentId);
          if (matchedAgent) {
            set({ activeAgent: matchedAgent });
          } else if (get().agents.length > 0) {
            const defAgent = get().agents.find((a) => a.isDefault) || get().agents[0];
            set({ activeAgent: defAgent });
          }
        }
      }
    } catch (e) {
      console.error('Failed to load session messages:', e);
    }
  },

  sessions: [],
  loadSessions: async () => {
    try {
      const res = await fetch('/api/sessions');
      const sessions = await res.json();
      set({ sessions: sessions || [] });
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  },

  createSession: async (agentId) => {
    const currentAgent = get().activeAgent;
    const targetAgentId = agentId || (currentAgent ? currentAgent.id : 'personal-assistant');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: targetAgentId,
          title: 'New Chat',
          channelId: 'web',
        }),
      });
      const newSess = await res.json();
      await get().loadSessions();
      set({ activeSessionId: newSess.id, messages: [] });
      return newSess.id;
    } catch (e) {
      console.error('Failed to create session:', e);
      return '';
    }
  },

  deleteSession: async (id) => {
    try {
      await fetch(`/api/sessions?id=${id}`, { method: 'DELETE' });
      await get().loadSessions();
      if (get().activeSessionId === id) {
        const remaining = get().sessions;
        if (remaining.length > 0) {
          set({ activeSessionId: remaining[0].id });
        } else {
          get().createSession();
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
    const sessId = get().activeSessionId;
    if (sessId) {
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessId, agentId: agent.id }),
      });
    }
  },
  agents: [],
  loadAgents: async () => {
    try {
      const res = await fetch('/api/agents');
      const agents = await res.json();
      set({ agents: agents || [] });
      if (agents && agents.length > 0 && !get().activeAgent) {
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

  messages: [],
  setMessages: (messages) => set({ messages }),
  appendMessage: (msg) =>
    set((s) => {
      if (s.messages.some((m) => m.id === msg.id)) {
        return { messages: s.messages };
      }
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

  startStreamingAssistantMessage: (id, model) => {
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant' && msgs[msgs.length - 1].id.startsWith('asst-stream-')) {
        return { messages: msgs };
      }
      const draft: SessionMessage = {
        id,
        sessionId: s.activeSessionId || '',
        channel: 'web',
        role: 'assistant',
        content: '',
        thought: '',
        toolCalls: [],
        model: model || s.activeModel || s.activeAgent?.model || 'default',
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

  activeModel: null,
  setActiveModel: (activeModel) => set({ activeModel }),

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
