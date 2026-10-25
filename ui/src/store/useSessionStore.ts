import { create } from 'zustand';
import { Session, SessionMessage, ToolCallRecord } from '../types';
import { useProfileStore } from './useProfileStore';
import { useAgentStore } from './useAgentStore';

// De-duplicates rapid agent switches: one Main Chat request per agent at a
// time, even if the rail is clicked repeatedly.
const mainSessionRequests = new Map<string, Promise<string>>();

/**
 * The agent's Main Chat is the default, undeletable session every agent owns.
 * Flagged via metadata.isMain (with a legacy title fallback).
 */
export function isMainSession(sess: Session | null | undefined): boolean {
  if (!sess || sess.type === 'group') return false;
  if (sess.metadata) {
    try {
      const m = JSON.parse(sess.metadata);
      if (m && m.isMain === true) return true;
    } catch {}
  }
  return (sess.title || '').trim().toLowerCase() === 'main chat';
}

export interface SessionStreamState {
  messageId: string | null;
  agentId?: string;
  model?: string;
  content: string;
  thought: string;
  toolCalls: ToolCallRecord[];
  startedAt: number;
  status: 'streaming' | 'idle';
}

export interface SessionUsage {
  usedTokens: number;
  contextWindow: number;
  percent: number;
  model?: string;
  updatedAt: number;
}

const EMPTY_STREAM: SessionStreamState = {
  messageId: null,
  content: '',
  thought: '',
  toolCalls: [],
  startedAt: 0,
  status: 'idle',
};

// Mirrors the active session's stream into the legacy flat fields so existing
// chat views keep rendering without knowing about the per-session map.
function streamFields(stream?: SessionStreamState) {
  return {
    isStreaming: stream?.status === 'streaming',
    streamingMessageId: stream?.messageId ?? null,
    streamingContent: stream?.content ?? '',
    streamingThought: stream?.thought ?? '',
    streamingToolCalls: stream?.toolCalls ?? [],
  };
}

export interface SessionStoreState {
  sessions: Session[];
  activeSessionId: string | null;
  activeSession: Session | null;
  isLoadingSessions: boolean;

  // Active chat transcript
  messages: SessionMessage[];
  isLoadingMessages: boolean;

  // Per-session live streams — every session runs independently, so a turn in
  // one session never blocks or overwrites another.
  streams: Record<string, SessionStreamState>;
  usageBySession: Record<string, SessionUsage>;

  // Mirrors of the active session's stream (kept for existing views)
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
  openMainSession: (agentId: string) => Promise<string>;
  createSessionForAgent: (agentId: string, title?: string, overrides?: { engine?: string; acpAgent?: string; model?: string }) => Promise<string>;
  createSessionForGroup: (groupId: string, title?: string) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  pinSession: (sessionId: string, pinned: boolean) => Promise<void>;
  updateSessionModel: (sessionId: string, model: string) => Promise<void>;
  updateSessionMetadata: (sessionId: string, metadata: Record<string, any>) => Promise<void>;

  // Chat Turn Actions
  sendMessage: (content: string, options?: { agentId?: string; images?: string[]; attachments?: import('../types').Attachment[]; model?: string; engine?: string; acpAgent?: string; sessionId?: string }) => Promise<void>;
  stopSession: (sessionId?: string) => Promise<void>;

  // Context usage
  setUsage: (sessionId: string, usage: Partial<SessionUsage> & { usedTokens?: number; contextWindow?: number; percent?: number }) => void;
  loadUsage: (sessionId: string) => Promise<void>;

  // Streaming Reducers (fed by WebSocket in useAgentSocket). sessionId defaults
  // to the active session when omitted.
  appendMessage: (msg: SessionMessage) => void;
  startStreamingMessage: (sessionId: string | undefined, id: string, agentId?: string, model?: string) => void;
  appendStreamingTextDelta: (sessionId: string | undefined, delta: string) => void;
  appendStreamingThoughtDelta: (sessionId: string | undefined, delta: string) => void;
  upsertStreamingToolCall: (sessionId: string | undefined, tc: ToolCallRecord) => void;
  finalizeStreamingMessage: (msg: SessionMessage) => void;
  isSessionStreaming: (sessionId?: string | null) => boolean;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeSession: null,
  isLoadingSessions: false,

  messages: [],
  isLoadingMessages: false,

  streams: {},
  usageBySession: {},

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
      .filter((s) => s.type !== 'group' && s.agentId === agentId)
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
      set({ activeSessionId: null, activeSession: null, messages: [], ...streamFields(undefined) });
      useAgentStore.getState().setComposerTarget({ kind: 'native', id: 'rakit-kode' });
      return;
    }

    let session = get().sessions.find((s) => s.id === sessionId) || null;
    if (!session) {
      try {
        const sRes = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          session = sData.session || sData;
          if (session && session.id) {
            set((state) => ({
              sessions: state.sessions.some((s) => s.id === session!.id)
                ? state.sessions
                : [session!, ...state.sessions],
            }));
          }
        }
      } catch (e) {
        console.error('[useSessionStore] fetch session detail failed:', e);
      }
    }

    set({
      activeSessionId: sessionId,
      activeSession: session,
      isLoadingMessages: true,
      messages: [],
      ...streamFields(get().streams[sessionId]),
    });
    void get().loadUsage(sessionId);

    if (session?.type === 'group' || (session?.metadata && session.metadata.includes('groupId'))) {
      let gId = session.agentId;
      if (session.metadata) {
        try {
          const m = JSON.parse(session.metadata);
          if (m.groupId) gId = m.groupId;
        } catch {}
      }
      const { selectGroup, setActiveNavTab } = useProfileStore.getState();
      selectGroup(gId);
      setActiveNavTab('groups');
    } else if (session?.agentId) {
      const { selectAgent, setActiveNavTab } = useProfileStore.getState();
      selectAgent(session.agentId);
      setActiveNavTab('chat');
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
        } else {
          set({ isLoadingMessages: false });
        }
      }
    } catch (err) {
      console.error('[useSessionStore] selectSession failed:', err);
      set({ isLoadingMessages: false });
    }
  },

  openMainSession: (agentId: string) => {
    const pending = mainSessionRequests.get(agentId);
    if (pending) return pending;

    const request = (async () => {
      // The server owns Main Chat identity: it reuses the existing session,
      // merges duplicates, and creates one only when the agent has none.
      const res = await fetch('/api/sessions/main', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (!res.ok) {
        const detail = (await res.text()).trim();
        throw new Error(detail || 'Failed to open Main Chat');
      }
      const session: Session = await res.json();
      await get().loadSessions();
      await get().selectSession(session.id);
      return session.id;
    })().finally(() => {
      mainSessionRequests.delete(agentId);
    });

    mainSessionRequests.set(agentId, request);
    return request;
  },

  createSessionForAgent: async (agentId: string, title?: string, overrides?: { engine?: string; acpAgent?: string; model?: string }) => {
    const { agents } = useProfileStore.getState();
    const agent = agents.find((a) => a.id === agentId);
    const engine = overrides?.engine || agent?.engine || 'rakit';
    const acpAgent = overrides?.acpAgent || (engine === 'acp' ? (agent?.acpAgent || 'agy') : undefined);
    const model = overrides?.model || agent?.model;

    const metadataObj: Record<string, any> = {
      mode: 'agent',
      engine,
      // Mark Main Chat atomically at creation so a rapid second lookup cannot
      // miss it and create a duplicate.
      ...(title === 'Main Chat' ? { isMain: true } : {}),
      ...(acpAgent ? { acpAgent } : {}),
      ...(model ? { model } : {}),
    };

    const payload = {
      agentId: agentId,
      title: title || 'New task',
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
    const { groups } = useProfileStore.getState();
    const group = groups.find((g) => g.id === groupId);
    const memberIds = group?.memberIds || [];
    const participants = memberIds.map((id) => ({
      participantType: 'agent',
      participantId: id,
      role: 'member',
    }));

    // Generate a fresh task title rather than repeating the group's name
    const existingGroupSessions = get().sessions.filter(
      (s) => s.type === 'group' && (s.agentId === groupId || s.metadata?.includes(groupId))
    );
    const topicNumber = existingGroupSessions.length + 1;
    const resolvedTitle = title || `Topic #${topicNumber}`;

    const payload = {
      agentId: groupId,
      title: resolvedTitle,
      type: 'group',
      channelId: 'web',
      metadata: JSON.stringify({ groupId, memberIds }),
      participants,
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
    // Main Chat sessions are permanent — silently refuse deletion.
    const target = get().sessions.find((s) => s.id === sessionId);
    if (target && isMainSession(target)) return;

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
    let { activeSessionId, activeSession } = get();
    if (options?.sessionId && options.sessionId !== activeSessionId) {
      activeSessionId = options.sessionId;
      activeSession = get().sessions.find((s) => s.id === options.sessionId) || activeSession;
    }
    if (!activeSessionId) {
      const { activeGroup, selectedAgentId, activeNavTab } = useProfileStore.getState();
      if (activeNavTab === 'groups' && activeGroup) {
        activeSessionId = await get().createSessionForGroup(activeGroup.id);
        activeSession = get().activeSession;
      } else {
        const targetAgent = options?.agentId || selectedAgentId || 'lutfi';
        activeSessionId = await get().createSessionForAgent(targetAgent, content.slice(0, 36), {
          engine: options?.engine,
          acpAgent: options?.acpAgent,
          model: options?.model,
        });
        activeSession = get().activeSession;
      }
    }

    let chosenModel = options?.model;
    let chosenEngine = options?.engine;
    let chosenAcpAgent = options?.acpAgent;

    if (activeSession?.metadata) {
      try {
        const meta = JSON.parse(activeSession.metadata);
        if (!chosenModel && meta.model) chosenModel = meta.model;
        if (!chosenEngine && meta.engine) chosenEngine = meta.engine;
        if (!chosenAcpAgent && meta.acpAgent) chosenAcpAgent = meta.acpAgent;
      } catch (e) {
        // ignore
      }
    }

    // Append optimistic user message
    const userMsg: SessionMessage = {
      id: `msg_u_${Date.now()}`,
      sessionId: activeSessionId,
      agentId: options?.agentId || activeSession?.agentId,
      channel: 'web',
      role: 'user',
      content,
      model: chosenModel,
      attachments: options?.attachments,
      createdAt: Date.now(),
    };

    const targetSessionId = activeSessionId;
    const isActive = targetSessionId === get().activeSessionId;
    const stream: SessionStreamState = {
      messageId: null,
      agentId: options?.agentId || activeSession?.agentId,
      model: chosenModel,
      content: '',
      thought: '',
      toolCalls: [],
      startedAt: Date.now(),
      status: 'streaming',
    };
    set((state) => ({
      streams: { ...state.streams, [targetSessionId]: stream },
      ...(isActive
        ? { messages: [...state.messages, userMsg], ...streamFields(stream) }
        : {}),
    }));

    // Auto-update session title if it's currently a placeholder or generic group/task name
    const currentTitle = activeSession?.title || '';
    const { groups, activeAgent } = useProfileStore.getState();
    const isPlaceholder =
      !currentTitle ||
      currentTitle === 'New chat' ||
      currentTitle === 'New group chat' ||
      currentTitle === 'New task' ||
      currentTitle === 'Untitled task' ||
      currentTitle.toLowerCase().startsWith('topic #') ||
      currentTitle.toLowerCase().startsWith('task #') ||
      currentTitle.toLowerCase().startsWith('discussion #') ||
      (activeAgent?.name && currentTitle.toLowerCase() === activeAgent.name.toLowerCase()) ||
      groups.some((g) => g.name.toLowerCase() === currentTitle.toLowerCase());

    if (isPlaceholder && content.trim()) {
      const generatedTitle = content.trim().replace(/[\r\n]+/g, ' ').slice(0, 42);
      set((state) => ({
        activeSession: state.activeSession ? { ...state.activeSession, title: generatedTitle } : null,
        sessions: state.sessions.map((s) => (s.id === activeSessionId ? { ...s, title: generatedTitle } : s)),
      }));
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSessionId, title: generatedTitle }),
      }).catch(() => {});
    }

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(activeSessionId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          agentId: options?.agentId || activeSession?.agentId,
          model: chosenModel,
          engine: chosenEngine,
          acpAgent: chosenAcpAgent,
          images: options?.images,
          attachments: options?.attachments,
        }),
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          if (body?.error) detail = body.error;
        } catch {}
        throw new Error(detail || `Failed to send message: ${res.status}`);
      }
    } catch (err: any) {
      console.error('[useSessionStore] sendMessage error:', err);
      set((state) => {
        const current = state.streams[targetSessionId];
        const streams = {
          ...state.streams,
          [targetSessionId]: { ...(current || EMPTY_STREAM), status: 'idle' as const },
        };
        return {
          streams,
          ...(targetSessionId === state.activeSessionId ? streamFields(streams[targetSessionId]) : {}),
        };
      });
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
      set((state) => {
        const current = state.streams[targetId];
        const streams = {
          ...state.streams,
          [targetId]: { ...(current || EMPTY_STREAM), status: 'idle' as const },
        };
        return {
          streams,
          ...(targetId === state.activeSessionId ? streamFields(streams[targetId]) : {}),
        };
      });
    }
  },

  setUsage: (sessionId, usage) => {
    if (!sessionId) return;
    const window = usage.contextWindow ?? get().usageBySession[sessionId]?.contextWindow ?? 0;
    const used = usage.usedTokens ?? get().usageBySession[sessionId]?.usedTokens ?? 0;
    const percent = usage.percent ?? (window > 0 ? Math.min(100, (used / window) * 100) : 0);
    set((state) => ({
      usageBySession: {
        ...state.usageBySession,
        [sessionId]: {
          usedTokens: used,
          contextWindow: window,
          percent,
          model: usage.model ?? state.usageBySession[sessionId]?.model,
          updatedAt: Date.now(),
        },
      },
    }));
  },

  loadUsage: async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/usage`);
      if (!res.ok) return;
      const data = await res.json();
      get().setUsage(sessionId, {
        usedTokens: data.usedTokens ?? 0,
        contextWindow: data.contextWindow ?? 0,
        percent: data.percent,
        model: data.model,
      });
    } catch {
      // Usage is advisory; ignore transient failures.
    }
  },

  isSessionStreaming: (sessionId?: string | null) => {
    const sid = sessionId || get().activeSessionId;
    if (!sid) return false;
    return get().streams[sid]?.status === 'streaming';
  },

  startStreamingMessage: (sessionId: string | undefined, id: string, agentId?: string, model?: string) => {
    const sid = sessionId || get().activeSessionId;
    if (!sid) return;
    set((state) => {
      const stream: SessionStreamState = {
        messageId: id,
        agentId,
        model,
        content: '',
        thought: '',
        toolCalls: [],
        startedAt: Date.now(),
        status: 'streaming',
      };
      const streams = { ...state.streams, [sid]: stream };
      return { streams, ...(sid === state.activeSessionId ? streamFields(stream) : {}) };
    });
  },

  appendStreamingTextDelta: (sessionId: string | undefined, delta: string) => {
    const sid = sessionId || get().activeSessionId;
    if (!sid || !delta) return;
    set((state) => {
      const prev = state.streams[sid];
      const stream: SessionStreamState = {
        ...(prev || EMPTY_STREAM),
        content: (prev?.content || '') + delta,
        startedAt: prev?.startedAt || Date.now(),
        status: 'streaming',
      };
      const streams = { ...state.streams, [sid]: stream };
      return { streams, ...(sid === state.activeSessionId ? streamFields(stream) : {}) };
    });
  },

  appendStreamingThoughtDelta: (sessionId: string | undefined, delta: string) => {
    const sid = sessionId || get().activeSessionId;
    if (!sid || !delta) return;
    set((state) => {
      const prev = state.streams[sid];
      const stream: SessionStreamState = {
        ...(prev || EMPTY_STREAM),
        thought: (prev?.thought || '') + delta,
        startedAt: prev?.startedAt || Date.now(),
        status: 'streaming',
      };
      const streams = { ...state.streams, [sid]: stream };
      return { streams, ...(sid === state.activeSessionId ? streamFields(stream) : {}) };
    });
  },

  upsertStreamingToolCall: (sessionId: string | undefined, tc: ToolCallRecord) => {
    const sid = sessionId || get().activeSessionId;
    if (!sid) return;
    set((state) => {
      const prev = state.streams[sid] || EMPTY_STREAM;
      const existing = prev.toolCalls.findIndex((item) => item.id === tc.id);
      let toolCalls: ToolCallRecord[];
      if (existing >= 0) {
        toolCalls = prev.toolCalls.map((item, i) => {
          if (i !== existing) return item;
          return {
            ...item,
            ...tc,
            arguments: (tc.arguments && Object.keys(tc.arguments).length > 0)
              ? tc.arguments
              : item.arguments,
          };
        });
      } else {
        toolCalls = [...prev.toolCalls, tc];
      }
      const stream: SessionStreamState = {
        ...prev,
        toolCalls,
        startedAt: prev.startedAt || Date.now(),
        status: 'streaming',
      };
      const streams = { ...state.streams, [sid]: stream };
      return { streams, ...(sid === state.activeSessionId ? streamFields(stream) : {}) };
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
    if (!msg) return;
    if (msg.role === 'user') {
      get().appendMessage(msg);
      return;
    }

    set((state) => {
      const sid = msg.sessionId || state.activeSessionId || '';
      if (!sid) return {};
      const stream = state.streams[sid];
      const isActive = sid === state.activeSessionId;
      const finalMsg: SessionMessage = {
        id: msg.id || stream?.messageId || `asst-${Date.now()}`,
        sessionId: sid,
        agentId: msg.agentId ?? stream?.agentId,
        channel: msg.channel || 'web',
        role: (msg.role || 'assistant') as any,
        content: msg.content !== undefined ? msg.content : (stream?.content || ''),
        thought: msg.thought !== undefined ? msg.thought : (stream?.thought || ''),
        toolCalls: (msg.toolCalls && msg.toolCalls.length > 0)
          ? msg.toolCalls
          : (stream?.toolCalls || []),
        tokens: msg.tokens,
        model: msg.model || stream?.model,
        attachments: msg.attachments,
        createdAt: msg.createdAt || Date.now(),
      };

      // Keep the finished content in the stream map so switching back to a
      // session whose turn completed in the background still shows it.
      const finishedStream: SessionStreamState = {
        ...(stream || EMPTY_STREAM),
        messageId: finalMsg.id,
        content: finalMsg.content,
        thought: finalMsg.thought || '',
        toolCalls: finalMsg.toolCalls || [],
        model: finalMsg.model,
        status: 'idle',
      };
      const streams = { ...state.streams, [sid]: finishedStream };

      if (!isActive) {
        return { streams };
      }

      const existingIdx = state.messages.findIndex((m) => m.id === finalMsg.id);
      const updatedMessages = existingIdx >= 0
        ? state.messages.map((m, i) => (i === existingIdx ? finalMsg : m))
        : [...state.messages, finalMsg];

      return {
        streams,
        messages: updatedMessages,
        ...streamFields(finishedStream),
      };
    });
  },
}));
