import { create } from 'zustand';
import { Session, SessionMessage, ToolCallRecord } from '../types';
import { useProfileStore } from './useProfileStore';
import { useAgentStore } from './useAgentStore';

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
  openMainSession: (agentId: string) => Promise<string>;
  createSessionForAgent: (agentId: string, title?: string, overrides?: { engine?: string; acpAgent?: string; model?: string }) => Promise<string>;
  createSessionForGroup: (groupId: string, title?: string) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  pinSession: (sessionId: string, pinned: boolean) => Promise<void>;
  updateSessionModel: (sessionId: string, model: string) => Promise<void>;
  updateSessionMetadata: (sessionId: string, metadata: Record<string, any>) => Promise<void>;

  // Chat Turn Actions
  sendMessage: (content: string, options?: { agentId?: string; images?: string[]; model?: string; engine?: string; acpAgent?: string }) => Promise<void>;
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
      set({ activeSessionId: null, activeSession: null, messages: [] });
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

    set({ activeSessionId: sessionId, activeSession: session, isLoadingMessages: true, messages: [] });

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

  openMainSession: async (agentId: string) => {
    // Open the agent's Main Chat, creating it on first visit.
    const existing = get().sessions.find(
      (s) => s.type !== 'group' && s.agentId === agentId && isMainSession(s)
    );
    if (existing) {
      await get().selectSession(existing.id);
      return existing.id;
    }
    const sid = await get().createSessionForAgent(agentId, 'Main Chat');
    await get().updateSessionMetadata(sid, { isMain: true });
    return sid;
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
      createdAt: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
      streamingContent: '',
      streamingThought: '',
      streamingToolCalls: [],
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
        const existingTc = copy[existing];
        copy[existing] = {
          ...existingTc,
          ...tc,
          arguments: (tc.arguments && Object.keys(tc.arguments).length > 0)
            ? tc.arguments
            : existingTc.arguments,
        };
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
