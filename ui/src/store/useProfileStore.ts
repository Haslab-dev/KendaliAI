import { create } from 'zustand';
import { AgentConfig, AgentGroup } from '../types';

const SELECTED_AGENT_KEY = 'kendali:selected-agent-id';
const SELECTED_GROUP_KEY = 'kendali:selected-group-id';

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

  // Navigation mode: 'agent' (single agent sessions) | 'groups' (multi-agent sessions)
  activeNavTab: 'chat' | 'agent' | 'groups' | 'connections' | 'automations' | 'settings';
  setActiveNavTab: (tab: 'chat' | 'agent' | 'groups' | 'connections' | 'automations' | 'settings') => void;

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
  agents: [],
  selectedAgentId: localStorage.getItem(SELECTED_AGENT_KEY) || null,
  activeAgent: null,
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
      const agents: AgentConfig[] = Array.isArray(data) ? data : (data.agents || []);
      
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
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentData),
    });

    if (!res.ok) throw new Error('Failed to update agent');
    const updated: AgentConfig = await res.json();

    set((state) => ({
      agents: state.agents.map((a) => (a.id === updated.id ? updated : a)),
      activeAgent: state.selectedAgentId === updated.id ? updated : state.activeAgent,
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
        const groups: AgentGroup[] = Array.isArray(data) ? data : (data.groups || []);
        const active = groups.find((g) => g.id === get().selectedGroupId) || groups[0] || null;
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
      const group = get().groups.find((g) => g.id === groupId) || null;
      set({ selectedGroupId: groupId, activeGroup: group });
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
