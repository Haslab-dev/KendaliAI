import { create } from 'zustand';
import { AgentConfig, AgentGroup } from '../types';

const SELECTED_AGENT_KEY = 'kendali:selected-agent-id';
const SELECTED_GROUP_KEY = 'kendali:selected-group-id';

export const DEFAULT_FALLBACK_AGENTS: AgentConfig[] = [
  {
    id: 'lutfi',
    name: 'Lutfi',
    role: 'Planner',
    department: 'Planning & Architecture',
    avatar: 'amber-star',
    description: 'Spesialis perencana arsitektur sistem, pemecah masalah, dan dekomposisi task bertahap.',
    model: 'deepseek-v4-1-flash',
    providerId: '',
    isDefault: true,
    engine: 'rakit',
    skills: ['planning', 'task-decomposition', 'architecture', 'system-design'],
    tools: ['filesystem.*', 'shell.*', 'git.*', 'search'],
    mcp: [],
    memoryScopes: ['user', 'workspace'],
    policy: {},
    systemPrompt: 'You are Lutfi, lead Planner and system architect in Kendali AI. You break down complex requests into clear, structured, phased plans with explicit tasks, dependencies, and acceptance criteria. You focus on strategic architecture, technical design, and actionable decomposition without skipping details.',
  },
  {
    id: 'bewustein',
    name: 'Bewustein',
    role: 'Researcher',
    department: 'Research & Intelligence',
    avatar: 'emerald-spark',
    description: 'Spesialis riset mendalam, pencarian fakta, investigasi web, dan sintesis literatur.',
    model: 'deepseek-v4-1-flash',
    providerId: '',
    isDefault: false,
    engine: 'rakit',
    skills: ['deep-research', 'synthesis', 'fact-checking', 'literature-review'],
    tools: ['http.*', 'search', 'web.fetch', 'filesystem.read', 'bash'],
    mcp: [],
    memoryScopes: ['user', 'session'],
    policy: {},
    systemPrompt: 'You are Bewustein, Lead Researcher and factual intelligence analyst at Kendali AI. You conduct deep investigations, gather multi-domain evidence, cross-reference sources, verify facts rigorously, and synthesize comprehensive, cited reports.',
  },
  {
    id: 'fatimah',
    name: 'Fatimah',
    role: 'Study Leaner',
    department: 'Learning & Mastery',
    avatar: 'purple-pebble',
    description: 'Spesialis akselerasi belajar adaptif, teknik Feynman, pemahaman konsep rumit, dan panduan belajar terarah.',
    model: 'deepseek-v4-1-flash',
    providerId: '',
    isDefault: false,
    engine: 'rakit',
    skills: ['feynman-technique', 'active-recall', 'study-guide', 'concept-mapping', 'spaced-repetition'],
    tools: ['filesystem.read', 'search', 'web.fetch'],
    mcp: [],
    memoryScopes: ['user', 'agent', 'session'],
    policy: {},
    systemPrompt: 'You are Fatimah, an empathetic and highly structured Study Leaner (learning specialist and study companion) at Kendali AI. You deconstruct complex educational topics and difficult concepts using the Feynman technique, intuitive analogies, active recall drills, spaced repetition schedules, and clear study summaries to help users master any subject quickly.',
  },
];

export interface ProfileStoreState {
  agents: AgentConfig[];
  selectedAgentId: string | null;
  activeAgent: AgentConfig | null;
  isLoadingAgents: boolean;

  // Groups
  groups: AgentGroup[];
  selectedGroupId: string | null;
  activeGroup: AgentGroup | null;
  isLoadingGroups: boolean;

  // Navigation mode: 'chat' | 'agent' | 'groups' | 'connections' | 'automations' | 'settings' | 'git' | 'editor'
  activeNavTab: 'chat' | 'agent' | 'groups' | 'connections' | 'automations' | 'settings' | 'git' | 'editor';
  setActiveNavTab: (tab: 'chat' | 'agent' | 'groups' | 'connections' | 'automations' | 'settings' | 'git' | 'editor') => void;

  // Actions
  loadAgents: () => Promise<void>;
  selectAgent: (agentId: string) => void;
  createAgent: (agent: Partial<AgentConfig>) => Promise<AgentConfig>;
  updateAgent: (agent: Partial<AgentConfig> & { id: string }) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  duplicateAgent: (agentId: string) => Promise<AgentConfig>;

  loadGroups: () => Promise<void>;
  selectGroup: (groupId: string | null) => void;
  createGroup: (name: string, brief: string, memberIds: string[]) => Promise<AgentGroup>;
  updateGroup: (group: Partial<AgentGroup> & { id: string }) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  agents: DEFAULT_FALLBACK_AGENTS,
  selectedAgentId: localStorage.getItem(SELECTED_AGENT_KEY) || DEFAULT_FALLBACK_AGENTS[0].id,
  activeAgent: DEFAULT_FALLBACK_AGENTS[0],
  isLoadingAgents: false,

  groups: [],
  selectedGroupId: localStorage.getItem(SELECTED_GROUP_KEY) || null,
  activeGroup: null,
  isLoadingGroups: false,

  activeNavTab: 'chat',
  setActiveNavTab: (tab) => set({ activeNavTab: tab }),

  loadAgents: async () => {
    set({ isLoadingAgents: true });
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      const rawAgents: AgentConfig[] = Array.isArray(data) ? data : (data.agents || []);
      const agents = rawAgents.length > 0 ? rawAgents : DEFAULT_FALLBACK_AGENTS;
      
      const savedId = get().selectedAgentId;
      let active = agents.find((a) => a.id === savedId) || agents.find((a) => a.isDefault) || agents[0] || null;

      set({
        agents,
        activeAgent: active,
        selectedAgentId: active ? active.id : null,
        isLoadingAgents: false,
      });

      if (active) {
        localStorage.setItem(SELECTED_AGENT_KEY, active.id);
      }
    } catch (err) {
      console.error('[useProfileStore] loadAgents failed:', err);
      set({ isLoadingAgents: false });
    }
  },

  selectAgent: (agentId: string) => {
    const agent = get().agents.find((a) => a.id === agentId) || null;
    localStorage.setItem(SELECTED_AGENT_KEY, agentId);
    set({
      selectedAgentId: agentId,
      activeAgent: agent,
      selectedGroupId: null,
      activeGroup: null,
    });
  },

  createAgent: async (agentData: Partial<AgentConfig>) => {
    const payload = {
      name: agentData.name || 'New Agent',
      role: agentData.role || 'Assistant',
      description: agentData.description || '',
      systemPrompt: agentData.systemPrompt || 'You are an autonomous AI assistant.',
      model: agentData.model || '',
      providerId: agentData.providerId || '',
      avatar: agentData.avatar || '🤖',
      isDefault: false,
      engine: agentData.engine || 'rakit',
      skills: agentData.skills || [],
      tools: agentData.tools || [],
      mcp: agentData.mcp || [],
    };

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Failed to create agent');
    const saved: AgentConfig = await res.json();

    set((state) => ({
      agents: [...state.agents, saved],
      activeAgent: saved,
      selectedAgentId: saved.id,
    }));
    localStorage.setItem(SELECTED_AGENT_KEY, saved.id);

    return saved;
  },

  updateAgent: async (agentData) => {
    // Optimistic local update so UI reflects changes immediately
    set((state) => {
      const merged = state.agents.map((a) => (a.id === agentData.id ? { ...a, ...agentData } : a));
      const active = state.selectedAgentId === agentData.id
        ? ({ ...(state.activeAgent || {}), ...agentData } as AgentConfig)
        : state.activeAgent;
      return { agents: merged, activeAgent: active };
    });

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentData),
    });

    if (!res.ok) throw new Error('Failed to update agent');
    const updated: AgentConfig = await res.json();

    set((state) => ({
      agents: state.agents.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
      activeAgent: state.selectedAgentId === updated.id ? { ...(state.activeAgent || {}), ...updated } as AgentConfig : state.activeAgent,
    }));
  },

  deleteAgent: async (agentId: string) => {
    const res = await fetch(`/api/agents?id=${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete agent');

    set((state) => {
      const remaining = state.agents.filter((a) => a.id !== agentId);
      const nextActive = remaining[0] || null;
      if (nextActive) {
        localStorage.setItem(SELECTED_AGENT_KEY, nextActive.id);
      } else {
        localStorage.removeItem(SELECTED_AGENT_KEY);
      }
      return {
        agents: remaining,
        activeAgent: nextActive,
        selectedAgentId: nextActive ? nextActive.id : null,
      };
    });
  },

  duplicateAgent: async (agentId: string) => {
    const source = get().agents.find((a) => a.id === agentId);
    if (!source) throw new Error('Agent not found');

    const copyData: Partial<AgentConfig> = {
      ...source,
      name: `${source.name} (Copy)`,
      isDefault: false,
    };
    delete (copyData as any).id;

    return get().createAgent(copyData);
  },

  loadGroups: async () => {
    set({ isLoadingGroups: true });
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        const rawGroups: any[] = Array.isArray(data) ? data : (data.groups || []);
        const groups: AgentGroup[] = rawGroups.map((g: any) => ({
          id: g.id,
          name: g.name || g.title || 'Untitled Group',
          title: g.title || g.name || 'Untitled Group',
          brief: g.brief || g.description || '',
          avatar: g.avatar || 'users',
          memberIds: Array.isArray(g.memberIds)
            ? g.memberIds
            : (Array.isArray(g.participants) ? g.participants.map((p: any) => p.participantId || p.id) : []),
          createdAt: g.createdAt || Date.now(),
          updatedAt: g.updatedAt || Date.now(),
        }));
        const active = groups.find((g) => g.id === get().selectedGroupId) || groups[0] || null;
        localStorage.setItem('kendali:groups-cache', JSON.stringify(groups));
        set({
          groups,
          activeGroup: active,
          selectedGroupId: active ? active.id : null,
          isLoadingGroups: false,
        });
      } else {
        // Fallback for local cache if groups endpoint not yet implemented
        const local = localStorage.getItem('kendali:groups-cache');
        const groups = local ? JSON.parse(local) : [];
        set({ groups, isLoadingGroups: false });
      }
    } catch {
      const local = localStorage.getItem('kendali:groups-cache');
      const groups = local ? JSON.parse(local) : [];
      set({ groups, isLoadingGroups: false });
    }
  },

  selectGroup: (groupId: string | null) => {
    if (groupId) {
      localStorage.setItem(SELECTED_GROUP_KEY, groupId);
      const groups = get().groups;
      let group = groups.find((g) => g.id === groupId) || null;
      if (!group && groups.length > 0) {
        group = groups.find((g) => g.name.toLowerCase() === groupId.toLowerCase()) || groups[0];
      }
      set({
        selectedGroupId: group ? group.id : groupId,
        activeGroup: group,
        selectedAgentId: null,
        activeAgent: null,
      });
    } else {
      localStorage.removeItem(SELECTED_GROUP_KEY);
      set({ selectedGroupId: null, activeGroup: null });
    }
  },

  createGroup: async (name: string, brief: string, memberIds: string[]) => {
    const newGroup: AgentGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      brief,
      memberIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup),
      });
    } catch {
      // Local storage fallback
    }

    const updated = [...get().groups, newGroup];
    localStorage.setItem('kendali:groups-cache', JSON.stringify(updated));
    localStorage.setItem(SELECTED_GROUP_KEY, newGroup.id);

    set({
      groups: updated,
      activeGroup: newGroup,
      selectedGroupId: newGroup.id,
    });

    return newGroup;
  },

  updateGroup: async (groupData) => {
    const updated = get().groups.map((g) =>
      g.id === groupData.id ? { ...g, ...groupData, updatedAt: Date.now() } : g
    );
    localStorage.setItem('kendali:groups-cache', JSON.stringify(updated));
    try {
      await fetch('/api/groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupData),
      });
    } catch {}
    set({
      groups: updated,
      activeGroup: get().selectedGroupId === groupData.id ? (updated.find((g) => g.id === groupData.id) || null) : get().activeGroup,
    });
  },

  deleteGroup: async (groupId: string) => {
    const remaining = get().groups.filter((g) => g.id !== groupId);
    localStorage.setItem('kendali:groups-cache', JSON.stringify(remaining));
    try {
      await fetch(`/api/groups?id=${encodeURIComponent(groupId)}`, { method: 'DELETE' });
    } catch {}
    const next = remaining[0] || null;
    set({
      groups: remaining,
      activeGroup: next,
      selectedGroupId: next ? next.id : null,
    });
  },
}));
