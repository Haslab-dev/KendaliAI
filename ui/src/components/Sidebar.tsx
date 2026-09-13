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
  model?: string;
}

export interface SidebarProps {
  onClose?: () => void;
  isMobile?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onClose, isMobile = false }) => {
  const {
    sessions,
    activeSessionId,
    selectSession,
    createSession,
    deleteSession,
    agents,
    activeAgent,
    setActiveAgent,
    setActiveModel,
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
                avatar: w.avatar || 'blue-drop',
                role: w.role,
                department: w.department,
                model: w.model,
              });
            }
          });
        }
      }
    } catch {}

    // Fallback default staff if empty
    if (list.length === 0) {
      const defaults: AgentGroupMeta[] = [
        { id: 'lead-frontend', name: 'Senior Dev', avatar: 'blue-drop', role: 'Lead Frontend Dev', department: 'Engineering', model: 'gpt-4o' },
        { id: 'lead-architecture', name: 'Architect Lead', avatar: 'cyan-bubble', role: 'Lead Architecture', department: 'Architecture', model: 'claude-3-7-sonnet' },
        { id: 'lead-backend', name: 'Lead Backend Dev', avatar: 'green-cloud', role: 'Lead Backend Dev', department: 'Engineering', model: 'qwen2.5-coder:latest' },
        { id: 'legal-counsel', name: 'Legal Counsel', avatar: 'bronze-shield', role: 'Legal & Compliance', department: 'Legal', model: 'gpt-4o' },
        { id: 'chief-security', name: 'Security Lead', avatar: 'ruby-capsule', role: 'Chief Security Officer', department: 'Security', model: 'gpt-4o' },
        { id: 'devops-lead', name: 'DevOps Lead', avatar: 'orange-leaf', role: 'DevOps & Infra', department: 'Operations', model: 'deepseek-chat' },
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
          model: a.model,
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

  // Group sessions under each staff agent and sort by recent active activity
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

      // Sort sessions within each agent by latest updated/created first
      agentSessions.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

      agentSessions.forEach((s) => assignedSessionIds.add(s.id));
      groups.push({ agent, sessions: agentSessions });
    });

    // Unassigned or general sessions
    const unassigned = filteredSessions.filter((s) => !assignedSessionIds.has(s.id));
    if (unassigned.length > 0) {
      unassigned.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
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

    // Sort groups so the agent worker with the most recent active session / new telegram message is on top!
    const getGroupScore = (g: (typeof groups)[0]) => {
      let maxTime = 0;
      let latestTgTime = 0;

      for (const s of g.sessions) {
        const t = s.updatedAt || s.createdAt || 0;
        if (t > maxTime) maxTime = t;

        const isTg = s.id.startsWith('tg-') || (s as any).channelId === 'telegram' || (s as any).channel === 'telegram';
        if (isTg && t > latestTgTime) {
          latestTgTime = t;
        }
      }

      // 1. If this agent worker has incoming Telegram messages, boost heavily so it jumps to top!
      if (latestTgTime > 0) {
        return 2000000000 + latestTgTime;
      }

      // 2. If group has the currently active session being viewed by user
      if (activeSessionId && g.sessions.some((s) => s.id === activeSessionId)) {
        return 1000000000 + maxTime;
      }

      // 3. If group matches the active agent worker
      if (activeAgent && g.agent.id === activeAgent.id) {
        return 500000000 + maxTime;
      }

      return maxTime;
    };

    groups.sort((a, b) => {
      const scoreA = getGroupScore(a);
      const scoreB = getGroupScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      // Put workers with sessions before workers with 0 sessions
      if (a.sessions.length > 0 && b.sessions.length === 0) return -1;
      if (a.sessions.length === 0 && b.sessions.length > 0) return 1;
      return 0;
    });

    return groups;
  }, [officeStaffList, filteredSessions, activeSessionId, activeAgent]);

  // Sorted staff list for mobile carousel (recent active agent worker / new telegram message first)
  const sortedStaffList = useMemo(() => {
    const list = [...officeStaffList];
    list.sort((a, b) => {
      const aSessions = sessions.filter((s) => s.agentId === a.id);
      const bSessions = sessions.filter((s) => s.agentId === b.id);

      const aTgTime = aSessions.reduce((max, s) => {
        const isTg = s.id.startsWith('tg-') || (s as any).channelId === 'telegram' || (s as any).channel === 'telegram';
        return isTg ? Math.max(max, s.updatedAt || s.createdAt || 0) : max;
      }, 0);

      const bTgTime = bSessions.reduce((max, s) => {
        const isTg = s.id.startsWith('tg-') || (s as any).channelId === 'telegram' || (s as any).channel === 'telegram';
        return isTg ? Math.max(max, s.updatedAt || s.createdAt || 0) : max;
      }, 0);

      // If either has telegram activity, prioritize latest telegram message time
      if (aTgTime > 0 || bTgTime > 0) {
        if (aTgTime !== bTgTime) return bTgTime - aTgTime;
      }

      if (activeSessionId) {
        const aHasActive = sessions.some((s) => s.id === activeSessionId && s.agentId === a.id);
        const bHasActive = sessions.some((s) => s.id === activeSessionId && s.agentId === b.id);
        if (aHasActive && !bHasActive) return -1;
        if (!aHasActive && bHasActive) return 1;
      }
      if (activeAgent && a.id === activeAgent.id) return -1;
      if (activeAgent && b.id === activeAgent.id) return 1;

      const aTime = aSessions.reduce((max, s) => Math.max(max, s.updatedAt || s.createdAt || 0), 0);
      const bTime = bSessions.reduce((max, s) => Math.max(max, s.updatedAt || s.createdAt || 0), 0);
      return bTime - aTime;
    });
    return list;
  }, [officeStaffList, sessions, activeSessionId, activeAgent]);

  const toggleGroupCollapse = (agentId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
  };

  const handleSelectSession = async (sessionId: string, agentId?: string) => {
    if (agentId) {
      const matched = agents.find((a) => a.id === agentId);
      if (matched) {
        setActiveAgent(matched);
        if (matched.model) setActiveModel(matched.model);
      } else {
        const staff = officeStaffList.find((s) => s.id === agentId);
        if (staff) {
          if (staff.model) setActiveModel(staff.model);
          setActiveAgent({
            id: staff.id,
            name: staff.role || staff.name,
            description: `Staff Worker: ${staff.role || staff.name}`,
            providerId: '',
            model: staff.model || '',
            systemPrompt: `You are ${staff.name}. Execute instructions thoroughly and report back clearly.`,
            skills: [],
            tools: ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
            mcp: [],
            memoryScopes: ['user', 'workspace'],
            policy: {},
            avatar: staff.avatar,
            isDefault: false,
          });
        }
      }
    }
    await selectSession(sessionId);
    onClose?.();
    navigate('chat');
  };

  const handleCreateChatForAgent = async (agent: AgentGroupMeta) => {
    if (agent.model) {
      setActiveModel(agent.model);
    }
    const matched = agents.find((a) => a.id === agent.id);
    if (matched) {
      setActiveAgent(matched);
      if (matched.model) setActiveModel(matched.model);
    } else {
      setActiveAgent({
        id: agent.id,
        name: agent.role || agent.name,
        description: `Staff Worker: ${agent.role || agent.name}`,
        providerId: '',
        model: agent.model || '',
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
    onClose?.();
    navigate('chat');
  };

  return (
    <aside
      data-pencil-name="Sidebar"
      className={`box-border ${isMobile ? 'w-full' : 'w-[280px]'} shrink-0 h-full flex flex-col justify-between bg-[#FFFFFF] border-r border-[#E5E7EB] dark:bg-[#141414] dark:border-[#27272A] select-none`}
    >
      {/* Top Header */}
      <div className="p-3.5 pb-2 flex flex-col gap-3 border-b border-[#E5E7EB] dark:border-[#27272A]">
        {/* macOS Traffic Lights + New Chat Trigger + Mobile Close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
            <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
            <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
            {isMobile && (
              <span className="ml-2 text-xs font-bold text-[#000000] dark:text-white font-sans">
                Agents &amp; Sessions
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                const sid = await createSession();
                await selectSession(sid);
                onClose?.();
                navigate('chat');
              }}
              className="p-1 rounded-[6px] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
              title="Create New Chat"
            >
              <Plus size={16} strokeWidth={2.2} />
              {isMobile && <span className="text-[11px] font-bold">New Chat</span>}
            </button>

            {isMobile && onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-[6px] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ml-1"
                title="Close Drawer"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Specialist Staff Agent Quick Switcher Carousel */}
        {isMobile && (
          <div className="flex flex-col gap-1.5 pb-2 border-b border-[#E5E7EB] dark:border-[#27272A]">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A85]">
                Specialist Staff Agents
              </span>
              <button
                onClick={() => {
                  onClose?.();
                  navigate('agency');
                }}
                className="text-[10px] font-semibold text-[#007AFF] hover:underline"
              >
                Agency HQ →
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar px-1">
              {sortedStaffList.map((staff) => {
                const isCurrentActive = activeAgent?.id === staff.id;
                return (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => handleCreateChatForAgent(staff)}
                    className={`flex flex-col items-center p-2 rounded-[8px] border shrink-0 transition-all cursor-pointer ${
                      isCurrentActive
                        ? 'border-[#007AFF] bg-blue-50/70 dark:bg-blue-950/30 shadow-xs'
                        : 'border-[#E5E7EB] dark:border-[#2C2C2E] bg-[#FAFAFA] dark:bg-[#1C1C1E] hover:border-gray-300'
                    }`}
                    style={{ minWidth: '76px' }}
                    title={`${staff.name} (${staff.role || ''})`}
                  >
                    <GrokAvatar id={staff.avatar || staff.id} size={30} className="mb-1" />
                    <span className="text-[10px] font-bold text-[#000000] dark:text-white truncate max-w-[70px] leading-tight">
                      {staff.name}
                    </span>
                    <span className="text-[9px] text-[#8A8A85] truncate max-w-[70px] leading-tight mt-0.5">
                      {staff.role?.split(' ')[0] || staff.department || 'Staff'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Filter Input */}
        <div className="w-full h-[32px] flex items-center gap-2 px-2.5 bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px]">
          <Search size={13} className="text-[#8A8A85] shrink-0" />
          <input
            type="text"
            value={sessionSearch}
            onChange={(e) => setSessionSearch(e.target.value)}
            placeholder="Search sessions..."
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

          const hasTelegramSessions = agentSessions.some(
            (s) => s.id.startsWith('tg-') || (s as any).channelId === 'telegram' || (s as any).channel === 'telegram'
          );

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
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-bold text-[#000000] dark:text-white font-sans truncate leading-tight">
                        {agent.name}
                      </span>
                      {hasTelegramSessions && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-[#E1F2FB] dark:bg-[#0E3550] text-[#0088cc] shrink-0 font-mono"
                          title="Connected with Telegram"
                        >
                          <Send size={7} /> TG
                        </span>
                      )}
                    </div>
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
                      className="w-full text-left py-1 text-[11px] text-[#8A8A85] hover:text-[#007AFF] transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={11} className="text-[#8A8A85]" />
                      <span>No sessions yet. Click to chat</span>
                    </button>
                  ) : (
                    agentSessions.map((s, idx) => {
                      const isActive = s.id === activeSessionId;
                      const sessionLabel = s.title || `Session Chat ${idx + 1}`;
                      const isTelegram =
                        s.id.startsWith('tg-') ||
                        (s as any).channelId === 'telegram' ||
                        (s as any).channel === 'telegram';
                      const isRecent = s.updatedAt && Date.now() / 1000 - s.updatedAt < 600;

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
                            {isTelegram ? (
                              <span
                                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-[#E1F2FB] dark:bg-[#0E3550] text-[#0088cc] shrink-0 font-mono tracking-tight"
                                title="Telegram Synced Chat"
                              >
                                <Send size={7} className="text-[#0088cc]" />
                                <span>TG</span>
                              </span>
                            ) : (
                              <MessageSquare size={10} className="text-[#8A8A85] shrink-0 opacity-60" />
                            )}

                            {isTelegram && isRecent && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[#0088cc] animate-pulse shrink-0"
                                title="Recent Telegram activity"
                              />
                            )}

                            <span className="text-[11px] truncate font-sans">
                              {sessionLabel}
                            </span>
                          </div>

                          {/* Quick delete button (touch-friendly on mobile, hover on desktop) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(s.id);
                            }}
                            className="opacity-70 md:opacity-0 md:group-hover/session:opacity-100 p-1 text-[#8A8A85] hover:text-red-500 transition-opacity shrink-0 cursor-pointer"
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

      {/* Bottom User & Utility Links */}
      <div className="p-3 border-t border-[#E5E7EB] dark:border-[#27272A] flex flex-col gap-2">
        {/* Plugins Link */}
        <button
          onClick={() => {
            onClose?.();
            navigate('plugins');
          }}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#4B5563] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Puzzle size={14} className="text-[#8A8A85]" />
          <span>Plugins &amp; Skills</span>
        </button>

        {/* Agency HQ shortcut */}
        <button
          onClick={() => {
            onClose?.();
            navigate('agency');
          }}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#4B5563] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Bot size={14} className="text-[#007AFF]" />
          <span>Agency HQ (Staff)</span>
        </button>

        {/* User Card */}
        <div
          onClick={() => {
            onClose?.();
            navigate('settings');
          }}
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
