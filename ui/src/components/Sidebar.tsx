import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  X,
  Pin,
  Trash2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Send,
  Puzzle,
  Settings,
  Bot,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { GrokAvatar } from './GrokAvatar';
import { TelegramBotConfig } from '../types';

interface AgentGroupMeta {
  id: string;
  name: string;
  avatar: string;
  role?: string;
  department?: string;
}

export const Sidebar: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    selectSession,
    createSession,
    deleteSession,
    agents,
    setActiveAgent,
  } = useAppStore();

  const [sessionSearch, setSessionSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [telegramBots, setTelegramBots] = useState<TelegramBotConfig[]>([]);

  // Load telegram bots to show live connection pills
  useEffect(() => {
    fetch('/api/telegram/bots')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTelegramBots(data);
      })
      .catch(() => {});
  }, []);

  // Map of connected bots by agentId
  const connectedBotsMap = useMemo(() => {
    const map = new Map<string, TelegramBotConfig>();
    telegramBots.forEach((b) => {
      if (b.agentId) map.set(b.agentId, b);
    });
    return map;
  }, [telegramBots]);

  // Combine store agents and office workers from localStorage
  const officeStaffList = useMemo<AgentGroupMeta[]>(() => {
    const list: AgentGroupMeta[] = [];
    const seenIds = new Set<string>();

    // 1. Office workers from localStorage or default staff
    try {
      const saved = localStorage.getItem('kendali_office_workers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((w: any) => {
            if (w.id && !seenIds.has(w.id)) {
              seenIds.add(w.id);
              list.push({
                id: w.id,
                name: w.role || w.name,
                avatar: w.avatar || '💻',
                role: w.role,
                department: w.department,
              });
            }
          });
        }
      }
    } catch {}

    // Fallback default staff if empty
    if (list.length === 0) {
      const defaults: AgentGroupMeta[] = [
        { id: 'lead-frontend', name: 'Senior Dev', avatar: 'blue-drop', role: 'Lead Frontend Dev', department: 'Engineering' },
        { id: 'lead-architecture', name: 'Architect Lead', avatar: 'cyan-bubble', role: 'Lead Architecture', department: 'Architecture' },
        { id: 'lead-backend', name: 'Lead Backend Dev', avatar: 'green-cloud', role: 'Lead Backend Dev', department: 'Engineering' },
        { id: 'legal-counsel', name: 'Legal Counsel', avatar: 'bronze-shield', role: 'Legal & Compliance', department: 'Legal' },
        { id: 'chief-security', name: 'Security Lead', avatar: 'ruby-capsule', role: 'Chief Security Officer', department: 'Security' },
      ];
      defaults.forEach((d) => {
        seenIds.add(d.id);
        list.push(d);
      });
    }

    // 2. Agents from backend store
    (agents || []).forEach((a) => {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id);
        list.push({
          id: a.id,
          name: a.name.replace(/^[^\w\s]+/, '').trim() || a.id,
          avatar: a.avatar || a.id,
        });
      }
    });

    return list;
  }, [agents]);

  // Filter sessions by search term
  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessions;
    const q = sessionSearch.toLowerCase().trim();
    return sessions.filter(
      (s) => (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [sessions, sessionSearch]);

  // Group sessions under each staff agent
  const groupedSessions = useMemo(() => {
    const groups: { agent: AgentGroupMeta; sessions: typeof sessions }[] = [];
    const assignedSessionIds = new Set<string>();

    officeStaffList.forEach((agent) => {
      const agentSessions = filteredSessions.filter((s) => {
        if (s.agentId === agent.id) return true;
        // Also match common aliases
        if (agent.id === 'lead-frontend' && (s.agentId === 'coder' || s.agentId === 'coding-agent')) return true;
        if (agent.id === 'lead-architecture' && s.agentId === 'planner') return true;
        if (agent.id === 'chief-security' && s.agentId === 'reviewer') return true;
        return false;
      });

      agentSessions.forEach((s) => assignedSessionIds.add(s.id));
      groups.push({ agent, sessions: agentSessions });
    });

    // Unassigned or general sessions
    const unassigned = filteredSessions.filter((s) => !assignedSessionIds.has(s.id));
    if (unassigned.length > 0) {
      groups.push({
        agent: {
          id: 'general',
          name: 'Chief of Staff',
          avatar: 'purple-pebble',
          role: 'General Assistant',
        },
        sessions: unassigned,
      });
    }

    return groups;
  }, [officeStaffList, filteredSessions]);

  const toggleGroupCollapse = (agentId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
  };

  const handleSelectSession = async (sessionId: string, agentId?: string) => {
    if (agentId) {
      const matched = agents.find((a) => a.id === agentId);
      if (matched) setActiveAgent(matched);
    }
    await selectSession(sessionId);
    navigate('chat');
  };

  const handleCreateChatForAgent = async (agent: AgentGroupMeta) => {
    const matched = agents.find((a) => a.id === agent.id);
    if (matched) {
      setActiveAgent(matched);
    } else {
      setActiveAgent({
        id: agent.id,
        name: agent.name,
        description: `Staff Worker: ${agent.name}`,
        providerId: '',
        model: '',
        systemPrompt: `You are ${agent.name}. Execute instructions thoroughly and report back clearly.`,
        skills: [],
        tools: ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
        mcp: [],
        memoryScopes: ['user', 'workspace'],
        policy: {},
        avatar: agent.avatar,
        isDefault: false,
      });
    }
    const newSessionId = await createSession(agent.id);
    await selectSession(newSessionId);
    navigate('chat');
  };

  return (
    <aside
      data-pencil-name="Sidebar"
      className="box-border w-[280px] shrink-0 h-full flex flex-col justify-between bg-[#FFFFFF] border-r border-[#E5E7EB] dark:bg-[#141414] dark:border-[#27272A] select-none"
    >
      {/* Top Header matching Grok screenshot */}
      <div className="p-3.5 pb-2 flex flex-col gap-3 border-b border-[#E5E7EB] dark:border-[#27272A]">
        {/* macOS Traffic Lights + New Chat Trigger */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
            <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
            <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
          </div>

          <button
            onClick={async () => {
              const sid = await createSession();
              await selectSession(sid);
              navigate('chat');
            }}
            className="p-1 rounded-[6px] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Create New Chat"
          >
            <Plus size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Search Filter Input */}
        <div className="w-full h-[32px] flex items-center gap-2 px-2.5 bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px]">
          <Search size={13} className="text-[#8A8A85] shrink-0" />
          <input
            type="text"
            value={sessionSearch}
            onChange={(e) => setSessionSearch(e.target.value)}
            placeholder="Search..."
            className="text-[12px] bg-transparent text-[#000000] dark:text-white placeholder:text-[#8A8A85] outline-none w-full font-sans"
          />
          {sessionSearch && (
            <button onClick={() => setSessionSearch('')} className="text-[#8A8A85] hover:text-black">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Main Grouped Chat List by Staff Agent */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
        {groupedSessions.map(({ agent, sessions: agentSessions }) => {
          const isCollapsed = !!collapsedGroups[agent.id];
          const connectedBot = connectedBotsMap.get(agent.id);
          const hasRunningBot = connectedBot && connectedBot.status === 'running';

          return (
            <div key={agent.id} className="flex flex-col gap-1">
              {/* [Icon] Staff Agent Header Row */}
              <div
                className="group flex items-center justify-between px-2 py-1.5 rounded-[8px] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => toggleGroupCollapse(agent.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Big Grok geometric SVG Icon matching screenshot */}
                  <div className="relative shrink-0 flex items-center justify-center">
                    <GrokAvatar id={agent.avatar || agent.id} size={38} className="shrink-0 drop-shadow-xs" />
                    {hasRunningBot && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-black animate-pulse"
                        title={`Connected Bot: ${connectedBot.name} (Online)`}
                      />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-[#000000] dark:text-white font-sans truncate leading-tight">
                      {agent.name}
                    </span>
                    <span className="text-[11px] text-[#8A8A85] truncate font-sans">
                      {agent.role || 'Autonomous Staff'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Plus button: Start fresh chat with this agent */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateChatForAgent(agent);
                    }}
                    className="opacity-60 hover:opacity-100 p-1 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                    title={`Start fresh chat with ${agent.name}`}
                  >
                    <Plus size={13} />
                  </button>

                  {/* Collapse chevron */}
                  <span className="text-[#8A8A85] p-0.5">
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </span>
                </div>
              </div>

              {/* Nested Session Chats under this Agent */}
              {!isCollapsed && (
                <div className="pl-6 space-y-0.5 border-l border-[#E5E7EB] dark:border-[#27272A] ml-3.5">
                  {agentSessions.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleCreateChatForAgent(agent)}
                      className="w-full text-left py-1 text-[11px] text-[#8A8A85] hover:text-[#007AFF] font-mono transition-colors"
                    >
                      -- No sessions yet. Click + to chat
                    </button>
                  ) : (
                    agentSessions.map((s, idx) => {
                      const isActive = s.id === activeSessionId;
                      const sessionLabel = s.title || `Session Chat ${idx + 1}`;

                      return (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s.id, agent.id)}
                          className={`group/session flex items-center justify-between px-2 py-1.5 rounded-[4px] cursor-pointer transition-colors text-left ${
                            isActive
                              ? 'bg-[#FFF5EB] dark:bg-[#2C2218] text-[#000000] dark:text-white font-semibold'
                              : 'text-[#4B5563] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-[10px] text-[#8A8A85] font-mono shrink-0">--</span>
                            <span className="text-[11px] truncate font-sans">
                              {sessionLabel}
                            </span>
                          </div>

                          {/* Quick delete on hover */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(s.id);
                            }}
                            className="opacity-0 group-hover/session:opacity-100 p-0.5 text-[#8A8A85] hover:text-red-500 transition-opacity shrink-0"
                            title="Delete session"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom User & Utility Links (matching Grok screenshot) */}
      <div className="p-3 border-t border-[#E5E7EB] dark:border-[#27272A] flex flex-col gap-2">
        {/* Plugins Link */}
        <button
          onClick={() => navigate('plugins')}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#4B5563] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <Puzzle size={14} className="text-[#8A8A85]" />
          <span>Plugins &amp; Skills</span>
        </button>

        {/* Agency HQ shortcut */}
        <button
          onClick={() => navigate('agency')}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#4B5563] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <Bot size={14} className="text-[#007AFF]" />
          <span>Agency HQ (Staff)</span>
        </button>

        {/* User Card */}
        <div
          onClick={() => navigate('settings')}
          className="flex items-center justify-between p-2 rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#007AFF] text-white font-bold text-[10px] flex items-center justify-center shrink-0">
              AC
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-bold text-[#000000] dark:text-white truncate">
                Alex Chen
              </span>
              <span className="text-[9px] text-[#8A8A85] truncate">
                Pro Workspace
              </span>
            </div>
          </div>
          <Settings size={13} className="text-[#8A8A85]" />
        </div>
      </div>
    </aside>
  );
};
