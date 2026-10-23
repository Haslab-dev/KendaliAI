import { create } from 'zustand';
import {
  ACPAgentDescriptor,
  ACPPermissionRequest,
  ACPSessionInfo,
  Session,
  parseSessionMetadata,
} from '../types';
import {
  cancelACPSession,
  closeACPSession,
  deleteACPSession,
  listACPAgents,
  listACPSessions,
  promptACPSession,
  respondACPPermission,
  resumeACPSession,
  setACPAutoApprove,
  startACPSession,
} from '../lib/acpApi';
import { useAppStore } from './useAppStore';
import { sendSocketMessage } from '../hooks/useAgentSocket';

/* Agent workspace store — "forgeADE on the server" task state:
 * ACP agent roster, live ACP session statuses, permission prompts,
 * pinned/archived sets, and the active task. Message streaming itself is
 * shared with the gateway (useAppStore.messages for the active session id),
 * because the backend translates ACP updates into the same agent.* events. */

export interface ComposerTarget {
  kind: 'native' | 'acp';
  id: string; // native agent id or ACP descriptor id
  model?: string;
}

const PINNED_KEY = 'forge:pinned-sessions';
const ARCHIVED_KEY = 'forge:archived-sessions';

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
}

interface AgentState {
  // ACP roster + live statuses
  acpAgents: ACPAgentDescriptor[];
  acpSessions: Record<string, ACPSessionInfo>;
  loadRoster: () => Promise<void>;
  loadACPSessions: () => Promise<void>;
  applyACPStatus: (info: ACPSessionInfo) => void;

  // Permission prompts keyed by session id
  permissions: Record<string, ACPPermissionRequest[]>;
  applyPermission: (req: ACPPermissionRequest) => void;
  respondPermission: (sessionId: string, requestId: string, optionId: string) => Promise<void>;

  // Active agent task
  activeAgentSessionId: string | null;
  setActiveAgentSession: (id: string | null) => Promise<void>;
  composerTarget: ComposerTarget | null;
  setComposerTarget: (t: ComposerTarget | null) => void;

  // Turn wall-clock tracking for the "Worked for Ns" row
  turnStart: Record<string, number>;
  beginTurn: (sessionId: string) => void;
  endTurn: (sessionId: string) => void;

  // Task management
  startTask: (opts: { kind: 'native' | 'acp'; agentId: string; cwd?: string; model?: string; autoApprove?: boolean }) => Promise<string>;
  resumeTask: (sessionId: string) => Promise<ACPSessionInfo | null>;
  sendPrompt: (text: string) => Promise<void>;
  stopTask: (sessionId?: string) => Promise<void>;
  stopSessionTask: (sessionId: string) => Promise<void>;
  closeTask: (sessionId: string) => Promise<void>;
  removeTask: (sessionId: string) => Promise<void>;
  toggleAutoApprove: (sessionId: string) => Promise<void>;
  renameTask: (sessionId: string, title: string) => Promise<void>;

  // Sidebar organization (forgeADE parity)
  pinned: Set<string>;
  archived: Set<string>;
  togglePinned: (id: string) => void;
  toggleArchived: (id: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  // Global New Task modal (sidebar ⌘N, rail, home view)
  newTaskOpen: boolean;
  setNewTaskOpen: (v: boolean) => void;
  // Preselected agent for the modal (e.g. from a roster CTA)
  newTaskPrefill?: { kind: 'native' | 'acp'; agentId: string } | null;
  openNewTask: (prefill?: { kind: 'native' | 'acp'; agentId: string }) => void;

  // Permission-mode chip on the composer (forge parity; bypass = ACP auto-approve)
  executionMode: 'ask' | 'code' | 'plan' | 'bypass';
  setExecutionMode: (m: 'ask' | 'code' | 'plan' | 'bypass') => void;

  // Bottom terminal dock inside the agent workspace (forge BottomTerminal)
  terminalOpen: boolean;
  setTerminalOpen: (v: boolean) => void;
  toggleTerminal: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  acpAgents: [],
  acpSessions: {},
  loadRoster: async () => {
    try {
      const agents = await listACPAgents();
      set({ acpAgents: agents });
    } catch (e) {
      console.warn('ACP roster unavailable:', e);
    }
  },
  loadACPSessions: async () => {
    try {
      const list = await listACPSessions();
      const map: Record<string, ACPSessionInfo> = {};
      for (const info of list) map[info.id] = info;
      set({ acpSessions: map });
    } catch (e) {
      console.warn('ACP session list unavailable:', e);
    }
  },
  applyACPStatus: (info) =>
    set((s) => ({ acpSessions: { ...s.acpSessions, [info.id]: info } })),

  permissions: {},
  applyPermission: (req) =>
    set((s) => {
      const list = s.permissions[req.sessionId] || [];
      if (list.some((p) => p.requestId === req.requestId)) return {};
      return { permissions: { ...s.permissions, [req.sessionId]: [...list, req] } };
    }),
  respondPermission: async (sessionId, requestId, optionId) => {
    set((s) => ({
      permissions: {
        ...s.permissions,
        [sessionId]: (s.permissions[sessionId] || []).filter((p) => p.requestId !== requestId),
      },
    }));
    try {
      await respondACPPermission(sessionId, requestId, optionId);
    } catch (e) {
      console.error('Failed to respond to permission:', e);
    }
  },

  activeAgentSessionId: null,
  setActiveAgentSession: async (id) => {
    set({ activeAgentSessionId: id });
    const app = useAppStore.getState();
    if (id) {
      await app.selectSession(id);
      const sess = app.sessions.find((s) => s.id === id);
      const meta = parseSessionMetadata(sess);
      if (meta.engine === 'acp' && meta.acpAgent) {
        set({ composerTarget: { kind: 'acp', id: meta.acpAgent, model: (meta.model as string) || undefined } });
        // Auto-resume closed or idle ACP session
        const acpInfo = get().acpSessions[id];
        if (!acpInfo || acpInfo.status === 'closed') {
          void get().resumeTask(id);
        }
      } else if (sess?.type === 'agent') {
        set({ composerTarget: { kind: 'native', id: sess.agentId || 'personal-assistant', model: (meta.model as string) || undefined } });
      }
    } else {
      set({ composerTarget: null });
    }
  },
  composerTarget: { kind: 'native', id: 'rakit-kode' },
  setComposerTarget: (t) => set({ composerTarget: t }),

  turnStart: {},
  beginTurn: (sessionId) => set((s) => ({ turnStart: { ...s.turnStart, [sessionId]: Date.now() } })),
  endTurn: (sessionId) =>
    set((s) => {
      const next = { ...s.turnStart };
      delete next[sessionId];
      return { turnStart: next };
    }),

  startTask: async ({ kind, agentId, cwd, model, autoApprove }) => {
    if (kind === 'acp') {
      const info = await startACPSession({ agentId, cwd, model, autoApprove });
      set((s) => ({ acpSessions: { ...s.acpSessions, [info.id]: info } }));
      await useAppStore.getState().loadSessions();
      await get().setActiveAgentSession(info.id);
      return info.id;
    }
    // Native agent task through the gateway runtime.
    const app = useAppStore.getState();
    const ws = cwd || app.activeWorkspacePath;
    const id = await app.createAgentSession(ws, 'New Task');
    if (id) {
      await get().setActiveAgentSession(id);
      if (agentId) {
        set({ composerTarget: { kind: 'native', id: agentId, model } });
      }
    }
    return id;
  },

  resumeTask: async (sessionId: string) => {
    try {
      const info = await resumeACPSession(sessionId);
      set((s) => ({ acpSessions: { ...s.acpSessions, [info.id]: info } }));
      return info;
    } catch (e) {
      console.warn('Failed to resume ACP session:', e);
      return null;
    }
  },

  sendPrompt: async (text) => {
    const id = get().activeAgentSessionId;
    if (!id || !text.trim()) return;
    const target = get().composerTarget;
    const app = useAppStore.getState();
    const sess = app.sessions.find((s) => s.id === id);
    const meta = sess ? parseSessionMetadata(sess) : {};
    const isACP = meta.engine === 'acp' || (!sess && target?.kind === 'acp') || (!sess && !!get().acpSessions[id]);
    if (isACP) {
      try {
        await promptACPSession(id, text);
      } catch (e: any) {
        // Try auto-resuming and retrying prompt
        try {
          await resumeACPSession(id);
          await promptACPSession(id, text);
        } catch (retryErr: any) {
          app.appendMessage({
            id: 'acp-err-' + Date.now(),
            sessionId: id,
            channel: 'acp',
            role: 'assistant',
            content: '⚠️ ' + (retryErr?.message || e?.message || 'Failed to reach the ACP agent.'),
            createdAt: Date.now(),
          });
        }
      }
      return;
    }
    // Native gateway turn. Respect the task's own agent when direct.
    if (sess?.type === 'agent' || target?.kind === 'native') {
      if (target?.model) app.setActiveModel(target.model);
    }
    await sendSocketMessage(text);
  },

  stopTask: async (sessionId) => {
    const id = sessionId || get().activeAgentSessionId;
    if (!id) return;
    await get().stopSessionTask(id);
  },

  stopSessionTask: async (sessionId) => {
    if (get().acpSessions[sessionId]) {
      try {
        await cancelACPSession(sessionId);
      } catch (e) {
        console.warn('ACP cancel failed:', e);
      }
      return;
    }
    try {
      await fetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
    } catch (e) {
      console.warn('Stop failed:', e);
    }
    useAppStore.getState().setIsGenerating(false);
  },

  closeTask: async (sessionId) => {
    try {
      await closeACPSession(sessionId);
    } catch {}
    set((s) => {
      const next = { ...s.acpSessions };
      const info = next[sessionId];
      if (info) next[sessionId] = { ...info, status: 'closed', running: false };
      return { acpSessions: next };
    });
  },

  removeTask: async (sessionId) => {
    try {
      if (get().acpSessions[sessionId]) await deleteACPSession(sessionId);
      else await fetch(`/api/sessions?id=${sessionId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to remove task:', e);
    }
    get().pinned.delete(sessionId);
    get().archived.delete(sessionId);
    saveSet(PINNED_KEY, get().pinned);
    saveSet(ARCHIVED_KEY, get().archived);
    set((s) => {
      const next = { ...s.acpSessions };
      delete next[sessionId];
      return { acpSessions: next };
    });
    await useAppStore.getState().loadSessions();
    if (get().activeAgentSessionId === sessionId) {
      await get().setActiveAgentSession(null);
    }
  },

  toggleAutoApprove: async (sessionId) => {
    const info = get().acpSessions[sessionId];
    const next = !(info?.autoApprove ?? false);
    set((s) => ({
      acpSessions: next && info
        ? { ...s.acpSessions, [sessionId]: { ...info, autoApprove: next } }
        : s.acpSessions,
    }));
    try {
      await setACPAutoApprove(sessionId, next);
    } catch (e) {
      console.warn('auto-approve toggle failed:', e);
    }
  },

  renameTask: async (sessionId, title) => {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, title }),
      });
      await useAppStore.getState().loadSessions();
    } catch (e) {
      console.error('Rename failed:', e);
    }
  },

  pinned: loadSet(PINNED_KEY),
  archived: loadSet(ARCHIVED_KEY),
  togglePinned: (id) =>
    set((s) => {
      const next = new Set(s.pinned);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSet(PINNED_KEY, next);
      return { pinned: next };
    }),
  toggleArchived: (id) =>
    set((s) => {
      const next = new Set(s.archived);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSet(ARCHIVED_KEY, next);
      return { archived: next };
    }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  newTaskOpen: false,
  setNewTaskOpen: (v) => set({ newTaskOpen: v, newTaskPrefill: v ? get().newTaskPrefill ?? null : null }),
  newTaskPrefill: null,
  openNewTask: (prefill) => {
    useAppStore.getState().setActiveAgentSessionId(null);
    useAppStore.getState().setActiveSessionId(null);
    set({
      activeAgentSessionId: null,
      newTaskOpen: false,
      newTaskPrefill: prefill ?? null,
      composerTarget: prefill ? { kind: prefill.kind, id: prefill.agentId } : { kind: 'native', id: 'rakit-kode' },
    });
  },

  executionMode: (localStorage.getItem('forge:execution-mode') as 'ask' | 'code' | 'plan' | 'bypass') || 'code',
  setExecutionMode: (m) => {
    localStorage.setItem('forge:execution-mode', m);
    set({ executionMode: m });
  },

  terminalOpen: false,
  setTerminalOpen: (v) => set({ terminalOpen: v }),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
}));

/** Whether the given session id is an ACP-backed task. */
export function isACPSession(acpSessions: Record<string, ACPSessionInfo>, sess?: Session | null): boolean {
  if (!sess) return false;
  return !!acpSessions[sess.id] || parseSessionMetadata(sess).engine === 'acp';
}
