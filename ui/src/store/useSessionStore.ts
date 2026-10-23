import { create } from 'zustand';
import { Session, SessionMessage, ToolCallRecord } from '../types';
import { useProfileStore } from './useProfileStore';

export interface SessionStoreState {
  sessions: Session[];
  activeSessionId: string | null;
  activeSession: Session | null;
  isLoadingSessions: boolean;

  // Active chat transcript
  messages: SessionMessage[];
  isLoadingMessages: boolean;

  // Live streaming states for current turn
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  streamingThought: string;
  streamingToolCalls: ToolCallRecord[];

  // Search filter
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Queries
  getAgentSessions: (agentId: string) => Session[];
  getGroupSessions: (groupId?: string) => Session[];

  // Actions
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string | null) => Promise<void>;
  createSessionForAgent: (agentId: string, title?: string) => Promise<string>;
  createSessionForGroup: (groupId: string, title?: string) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  pinSession: (sessionId: string, pinned: boolean) => Promise<void>;
  updateSessionModel: (sessionId: string, model: string) => Promise<void>;
  updateSessionMetadata: (sessionId: string, metadata: Record<string, any>) => Promise<void>;

  // Chat Turn Actions
  sendMessage: (content: string, options?: { agentId?: string; images?: string[]; model?: string }) => Promise<void>;
  stopSession: (sessionId?: string) => Promise<void>;

  // Streaming Reducers (fed by WebSocket in useAgentSocket)
  appendMessage: (msg: SessionMessage) => void;
  startStreamingMessage: (id: string, agentId?: string, model?: string) => void;
  appendStreamingTextDelta: (delta: string) => void;
  appendStreamingThoughtDelta: (delta: string) => void;
  upsertStreamingToolCall: (tc: ToolCallRecord) => void;
  finalizeStreamingMessage: (msg: SessionMessage) => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeSession: null,
  isLoadingSessions: false,

  messages: [],
  isLoadingMessages: false,

  isStreaming: false,
  streamingMessageId: null,
  streamingContent: '',
  streamingThought: '',
  streamingToolCalls: [],

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  getAgentSessions: (agentId: string) => {
    const { sessions, searchQuery } = get();
    return sessions
      .filter((s) => s.agentId === agentId && s.type !== 'group')
      .filter((s) => {
        if (!searchQuery.trim()) return true;
        return (s.title || '').toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  getGroupSessions: (groupId?: string) => {
    const { sessions, searchQuery } = get();
    return sessions
      .filter((s) => s.type === 'group' || (groupId && s.metadata?.includes(groupId)))
      .filter((s) => {
        if (!searchQuery.trim()) return true;
        return (s.title || '').toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  loadSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = await res.json();
      const sessions: Session[] = Array.isArray(data) ? data : (data.sessions || []);

      const activeId = get().activeSessionId;
      const active = sessions.find((s) => s.id === activeId) || null;

      set({
        sessions,
        activeSession: active,
        isLoadingSessions: false,
      });
    } catch (err) {
      console.error('[useSessionStore] loadSessions failed:', err);
      set({ isLoadingSessions: false });
    }
  },

  selectSession: async (sessionId: string | null) => {
    if (!sessionId) {
      set({ activeSessionId: null, activeSession: null, messages: [] });
      return;
    }

    const session = get().sessions.find((s) => s.id === sessionId) || null;
    set({ activeSessionId: sessionId, activeSession: session, isLoadingMessages: true });

    if (session?.agentId && session.type !== 'group') {
      const { selectedAgentId, selectAgent } = useProfileStore.getState();
      if (selectedAgentId !== session.agentId) {
        selectAgent(session.agentId);
      }
    }

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
      if (res.ok) {
        const data = await res.json();
        const messages: SessionMessage[] = Array.isArray(data) ? data : (data.messages || []);
        set({ messages, isLoadingMessages: false });
      } else {
        // Fallback for /api/sessions/:id
        const resDetail = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (resDetail.ok) {
          const detail = await resDetail.json();
          set({
            activeSession: detail.session || detail,
            messages: detail.messages || [],
            isLoadingMessages: false,
          });
        }
      }
    } catch (err) {
      console.error('[useSessionStore] selectSession failed:', err);
      set({ isLoadingMessages: false });
    }
  },

  createSessionForAgent: async (agentId: string, title?: string) => {
    const { agents } = useProfileStore.getState();
    const agent = agents.find((a) => a.id === agentId);
    const engine = agent?.engine || 'rakit';
    const acpAgent = agent?.acpAgent || (engine === 'acp' ? 'claude-code' : undefined);
    const model = agent?.model;

    const metadataObj: Record<string, any> = {
      mode: 'agent',
      engine,
      ...(acpAgent ? { acpAgent } : {}),
      ...(model ? { model } : {}),
    };

    const payload = {
      agentId,
      title: title || 'New chat',
      type: 'agent',
      channelId: 'web',
      metadata: JSON.stringify(metadataObj),
    };

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Failed to create session');
    const created: Session = await res.json();

    set((state) => ({
      sessions: [created, ...state.sessions],
      activeSessionId: created.id,
      activeSession: created,
      messages: [],
      searchQuery: '',
    }));

    return created.id;
  },

  createSessionForGroup: async (groupId: string, title?: string) => {
    const payload = {
      agentId: groupId,
      title: title || 'New group chat',
      type: 'group',
      channelId: 'web',
      metadata: JSON.stringify({ groupId }),
    };

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Failed to create group session');
    const created: Session = await res.json();

    set((state) => ({
      sessions: [created, ...state.sessions],
      activeSessionId: created.id,
      activeSession: created,
      messages: [],
    }));

    return created.id;
  },

  deleteSession: async (sessionId: string) => {
    await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      const isCurrent = state.activeSessionId === sessionId;
      return {
        sessions: remaining,
        activeSessionId: isCurrent ? null : state.activeSessionId,
        activeSession: isCurrent ? null : state.activeSession,
        messages: isCurrent ? [] : state.messages,
      };
    });
  },

  renameSession: async (sessionId: string, newTitle: string) => {
    await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, title: newTitle }),
    });

    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s)),
      activeSession: state.activeSession?.id === sessionId ? { ...state.activeSession, title: newTitle } : state.activeSession,
    }));
  },

  pinSession: async (sessionId: string, pinned: boolean) => {
    await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, pinned }),
    });

    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, pinned } : s)),
      activeSession: state.activeSession?.id === sessionId ? { ...state.activeSession, pinned } : state.activeSession,
    }));
  },

  updateSessionModel: async (sessionId: string, model: string) => {
    const { sessions, activeSession } = get();
    const target = sessions.find((s) => s.id === sessionId) || (activeSession?.id === sessionId ? activeSession : null);
    if (!target) return;

    let meta: Record<string, any> = {};
    if (target.metadata) {
      try {
        meta = JSON.parse(target.metadata);
      } catch (e) {
        meta = {};
      }
    }
    meta.model = model;
    const metadataStr = JSON.stringify(meta);

    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, metadata: metadataStr } : s)),
      activeSession: state.activeSession?.id === sessionId ? { ...state.activeSession, metadata: metadataStr } : state.activeSession,
    }));

    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, metadata: metadataStr }),
      });
    } catch (err) {
      console.error('[useSessionStore] updateSessionModel failed:', err);
    }
  },

  updateSessionMetadata: async (sessionId: string, metadata: Record<string, any>) => {
    const { sessions, activeSession } = get();
    const target = sessions.find((s) => s.id === sessionId) || (activeSession?.id === sessionId ? activeSession : null);
    if (!target) return;

    let existingMeta: Record<string, any> = {};
    if (target.metadata) {
      try {
        existingMeta = JSON.parse(target.metadata);
      } catch (e) {
        existingMeta = {};
      }
    }
    const mergedMeta = { ...existingMeta, ...metadata };
    const metadataStr = JSON.stringify(mergedMeta);

    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, metadata: metadataStr } : s)),
      activeSession: state.activeSession?.id === sessionId ? { ...state.activeSession, metadata: metadataStr } : state.activeSession,
    }));

    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, metadata: metadataStr }),
      });
    } catch (err) {
      console.error('[useSessionStore] updateSessionMetadata failed:', err);
    }
  },

  sendMessage: async (content: string, options) => {
    const { activeSessionId, activeSession } = get();
    if (!activeSessionId) return;

    let chosenModel = options?.model;
    if (!chosenModel && activeSession?.metadata) {
      try {
        const meta = JSON.parse(activeSession.metadata);
        if (meta.model) chosenModel = meta.model;
      } catch (e) {
        // ignore
      }
    }

    // Append optimistic user message
    const userMsg: SessionMessage = {
      id: `msg_u_${Date.now()}`,
      sessionId: activeSessionId,
      agentId: options?.agentId,
      channel: 'web',
      role: 'user',
      content,
      model: chosenModel,
      createdAt: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
      streamingContent: '',
      streamingThought: '',
      streamingToolCalls: [],
    }));

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(activeSessionId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          agentId: options?.agentId,
          model: chosenModel,
          images: options?.images,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to send message: ${res.statusText}`);
      }
    } catch (err: any) {
      console.error('[useSessionStore] sendMessage error:', err);
      set({ isStreaming: false });
    }
  },

  stopSession: async (sessionId?: string) => {
    const targetId = sessionId || get().activeSessionId;
    if (!targetId) return;

    try {
      await fetch(`/api/sessions/${encodeURIComponent(targetId)}/stop`, { method: 'POST' });
    } catch (err) {
      console.error('[useSessionStore] stopSession error:', err);
    } finally {
      set({ isStreaming: false });
    }
  },

  startStreamingMessage: (id: string, agentId?: string, model?: string) => {
    set({
      isStreaming: true,
      streamingMessageId: id,
      streamingContent: '',
      streamingThought: '',
      streamingToolCalls: [],
    });
  },

  appendStreamingTextDelta: (delta: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    }));
  },

  appendStreamingThoughtDelta: (delta: string) => {
    set((state) => ({
      streamingThought: state.streamingThought + delta,
    }));
  },

  upsertStreamingToolCall: (tc: ToolCallRecord) => {
    set((state) => {
      const existing = state.streamingToolCalls.findIndex((item) => item.id === tc.id);
      if (existing >= 0) {
        const copy = [...state.streamingToolCalls];
        copy[existing] = { ...copy[existing], ...tc };
        return { streamingToolCalls: copy };
      }
      return { streamingToolCalls: [...state.streamingToolCalls, tc] };
    });
  },

  appendMessage: (msg: SessionMessage) => {
    set((state) => {
      if (!msg) return {};

      // 1. Exact ID check
      if (state.messages.some((m) => m.id === msg.id)) {
        return { messages: state.messages };
      }

      // 2. User optimistic message reconciliation
      if (msg.role === 'user') {
        const optIdx = state.messages.findIndex(
          (m) =>
            m.role === 'user' &&
            m.id.startsWith('msg_u_') &&
            m.content.trim() === (msg.content || '').trim()
        );
        if (optIdx !== -1) {
          const copy = [...state.messages];
          copy[optIdx] = msg;
          return { messages: copy };
        }
      }

      // 3. Exact role + content deduplication within 4 seconds
      const lastMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
      if (
        lastMsg &&
        lastMsg.role === msg.role &&
        lastMsg.content.trim() === (msg.content || '').trim() &&
        Math.abs((msg.createdAt || Date.now()) - (lastMsg.createdAt || 0)) < 4000
      ) {
        return { messages: state.messages };
      }

      return { messages: [...state.messages, msg] };
    });
  },

  finalizeStreamingMessage: (msg: any) => {
    if (msg?.role === 'user') {
      get().appendMessage(msg);
      return;
    }

    set((state) => {
      const activeId = state.activeSessionId;
      const id = msg.id || state.streamingMessageId || `asst-${Date.now()}`;
      const content = msg.content !== undefined ? msg.content : state.streamingContent;
      const thought = msg.thought !== undefined ? msg.thought : state.streamingThought;
      const finalMsg: SessionMessage = {
        id,
        sessionId: msg.sessionId || activeId || '',
        agentId: msg.agentId,
        channel: msg.channel || 'web',
        role: (msg.role || 'assistant') as any,
        content,
        thought,
        toolCalls: state.streamingToolCalls.length > 0 ? state.streamingToolCalls : msg.toolCalls,
        createdAt: msg.createdAt || Date.now(),
      };

      const existingIdx = state.messages.findIndex((m) => m.id === finalMsg.id);
      const updatedMessages = existingIdx >= 0
        ? state.messages.map((m, i) => (i === existingIdx ? finalMsg : m))
        : [...state.messages, finalMsg];

      return {
        messages: updatedMessages,
        isStreaming: false,
        streamingMessageId: null,
        streamingContent: '',
        streamingThought: '',
        streamingToolCalls: [],
      };
    });
  },
}));
