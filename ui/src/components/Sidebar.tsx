import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  X,
  Trash2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Send,
  Settings,
  Bot,
  Users,
  Clock,
  Sparkles,
  Terminal,
  Shield,
  Cpu,
  Code2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { GrokAvatar } from './GrokAvatar';
import { CreateGroupModal } from './CreateGroupModal';
import { AgentConfig, Session } from '../types';

export interface SidebarProps {
  onClose?: () => void;
  isMobile?: boolean;
}

type TabFilter = 'all' | 'direct' | 'groups' | 'general';

export const Sidebar: React.FC<SidebarProps> = ({ onClose, isMobile = false }) => {
  const {
    sessions,
    activeSessionId,
    selectSession,
    deleteSession,
    agents,
    activeAgent,
    createDirectChat,
    createGeneralChat,
    telegramAgents,
  } = useAppStore();

  const [sessionSearch, setSessionSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [isGeneralCollapsed, setIsGeneralCollapsed] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  // Separate sessions by type
  const { directSessions, groupSessions, generalSessions } = useMemo(() => {
    const direct: Session[] = [];
    const group: Session[] = [];
    const general: Session[] = [];

    sessions.forEach((s) => {
      if (s.type === 'group') {
        group.push(s);
      } else if (s.type === 'direct' || (s.agentId && !s.type)) {
        direct.push(s);
      } else {
        general.push(s);
      }
    });

    return { directSessions: direct, groupSessions: group, generalSessions: general };
  }, [sessions]);

  // Combine agents with direct sessions to form persistent contacts list
  const directAgentContacts = useMemo(() => {
    const list: {
      agent: AgentConfig;
      session?: Session;
      lastMessageSnippet?: string;
      lastMessageTime?: number;
      telegramConnected: boolean;
    }[] = [];

    // All registered agents
    agents.forEach((agent) => {
      const sess = directSessions.find(
        (s) => s.id === `direct_${agent.id}` || s.agentId === agent.id
      );

      const isTg =
        agent.telegramConnected ||
        !!telegramAgents[agent.id]?.connected;

      const lastSnippet = sess?.lastMessage
        ? sess.lastMessage.content?.slice(0, 55) || 'Sent attachment'
        : sess?.summary || agent.role || agent.description || 'Available for instructions';

      const lastTime = sess?.lastMessage?.createdAt || sess?.updatedAt || sess?.createdAt;

      list.push({
        agent,
        session: sess,
        lastMessageSnippet: lastSnippet,
        lastMessageTime: lastTime,
        telegramConnected: isTg,
      });
    });

    // Sort by recent activity
    list.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    return list;
  }, [agents, directSessions, telegramAgents]);

  // Format relative timestamp
  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const now = Date.now();
    const timeMs = ts < 1e11 ? ts * 1000 : ts; // handle seconds vs ms
    const diffSec = Math.floor((now - timeMs) / 1000);

    if (diffSec < 60) return 'now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    return new Date(timeMs).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!sessionSearch.trim()) return directAgentContacts;
    const q = sessionSearch.toLowerCase();
    return directAgentContacts.filter(
      (c) =>
        c.agent.name.toLowerCase().includes(q) ||
        (c.agent.role || '').toLowerCase().includes(q) ||
        (c.lastMessageSnippet || '').toLowerCase().includes(q)
    );
  }, [directAgentContacts, sessionSearch]);

  // Filter group chats
  const filteredGroups = useMemo(() => {
    if (!sessionSearch.trim()) return groupSessions;
    const q = sessionSearch.toLowerCase();
    return groupSessions.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        (g.lastMessage?.content || '').toLowerCase().includes(q)
    );
  }, [groupSessions, sessionSearch]);

  // Filter general chats
  const filteredGeneral = useMemo(() => {
    if (!sessionSearch.trim()) return generalSessions;
    const q = sessionSearch.toLowerCase();
    return generalSessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.lastMessage?.content || '').toLowerCase().includes(q)
    );
  }, [generalSessions, sessionSearch]);

  const handleSelectAgentContact = async (agentId: string) => {
    await createDirectChat(agentId);
    onClose?.();
    navigate('chat');
  };

  const handleSelectGroup = async (groupId: string) => {
    await selectSession(groupId);
    onClose?.();
    navigate('chat');
  };

  const handleSelectGeneral = async (sessionId: string) => {
    await selectSession(sessionId);
    onClose?.();
    navigate('chat');
  };

  const handleNewGeneralChat = async () => {
    await createGeneralChat('New Chat');
    onClose?.();
    navigate('chat');
  };

  // Group avatar icon helper
  const renderGroupIcon = (avatar?: string) => {
    switch (avatar) {
      case 'terminal':
        return <Terminal size={18} className="text-emerald-500" />;
      case 'shield':
        return <Shield size={18} className="text-amber-500" />;
      case 'cpu':
        return <Cpu size={18} className="text-indigo-500" />;
      case 'code':
        return <Code2 size={18} className="text-blue-500" />;
      case 'sparkles':
        return <Sparkles size={18} className="text-purple-500" />;
      default:
        return <Users size={18} className="text-[#007AFF]" />;
    }
  };

  return (
    <aside
      data-pencil-name="Sidebar"
      className={`box-border ${
        isMobile ? 'w-full' : 'w-[300px]'
      } shrink-0 h-full flex flex-col justify-between bg-[#FFFFFF] border-r border-[#E5E7EB] dark:bg-[#141414] dark:border-[#27272A] select-none`}
    >
      {/* Top Header */}
      <div className="p-3.5 pb-2 flex flex-col gap-2.5 border-b border-[#E5E7EB] dark:border-[#27272A]">
        {/* macOS Traffic Lights + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
            <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
            <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
            <span className="ml-2 text-xs font-bold text-[#000000] dark:text-white font-sans">
              Chats
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* New Group Button */}
            <button
              onClick={() => setIsCreateGroupOpen(true)}
              className="p-1 rounded-[6px] text-[#8A8A85] hover:text-[#007AFF] hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
              title="Create Group Chat"
            >
              <Users size={16} />
            </button>

            {/* New General Chat */}
            <button
              onClick={handleNewGeneralChat}
              className="p-1 rounded-[6px] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="New General Chat"
            >
              <Plus size={16} strokeWidth={2.2} />
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

        {/* Search Bar */}
        <div className="w-full h-[32px] flex items-center gap-2 px-2.5 bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px]">
          <Search size={13} className="text-[#8A8A85] shrink-0" />
          <input
            type="text"
            value={sessionSearch}
            onChange={(e) => setSessionSearch(e.target.value)}
            placeholder="Search agents, groups, messages..."
            className="text-[12px] bg-transparent text-[#000000] dark:text-white placeholder:text-[#8A8A85] outline-none w-full font-sans"
          />
          {sessionSearch && (
            <button onClick={() => setSessionSearch('')} className="text-[#8A8A85] hover:text-black dark:hover:text-white cursor-pointer">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Tabs (WhatsApp Style) */}
        <div className="flex items-center gap-1 pt-0.5">
          {(['all', 'direct', 'groups', 'general'] as TabFilter[]).map((tab) => {
            const isActive = activeTab === tab;
            const labels: Record<TabFilter, string> = {
              all: 'All',
              direct: 'Direct',
              groups: 'Groups',
              general: 'General',
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-[#F3F4F6] dark:bg-[#27272A] text-[#6B7280] dark:text-[#A1A1AA] hover:bg-[#E5E7EB] dark:hover:bg-[#3F3F46]'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main WhatsApp-Style Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
        {/* SECTION 1: DIRECT CHATS (Agent Persons) */}
        {(activeTab === 'all' || activeTab === 'direct') && (
          <div>
            <div className="flex items-center justify-between px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8A8A85]">
              <span>Direct Chats ({filteredContacts.length})</span>
            </div>

            <div className="space-y-1">
              {filteredContacts.length === 0 ? (
                <div className="text-center py-4 text-xs text-[#8A8A85]">
                  No matching agent contacts.
                </div>
              ) : (
                filteredContacts.map(({ agent, session, lastMessageSnippet, lastMessageTime, telegramConnected }) => {
                  const isActive =
                    activeSessionId === session?.id ||
                    (!activeSessionId && activeAgent?.id === agent.id);

                  return (
                    <div
                      key={agent.id}
                      onClick={() => handleSelectAgentContact(agent.id)}
                      className={`group flex items-center justify-between p-2 rounded-[10px] cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#EBF5FF] dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 shadow-2xs'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Grok Avatar with Online Indicator */}
                        <div className="relative shrink-0 flex items-center justify-center">
                          <GrokAvatar id={agent.avatar || agent.id} size={40} className="shrink-0 drop-shadow-xs" />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-black"
                            title="Online"
                          />
                        </div>

                        {/* Text details */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[13px] font-bold text-[#000000] dark:text-white font-sans truncate">
                                {agent.name}
                              </span>
                              {telegramConnected && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-[#E1F2FB] dark:bg-[#0E3550] text-[#0088cc] shrink-0 font-mono"
                                  title="Telegram Bot Linked"
                                >
                                  <Send size={7} /> TG
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#8A8A85] shrink-0 font-mono">
                              {formatTime(lastMessageTime)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] truncate font-sans">
                              {lastMessageSnippet}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-[#27272A] text-[#8A8A85] shrink-0">
                              {agent.role?.split(' ')[0] || agent.department || 'Staff'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: GROUP CHATS */}
        {(activeTab === 'all' || activeTab === 'groups') && (
          <div>
            <div className="flex items-center justify-between px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8A8A85]">
              <span>Group Chats ({filteredGroups.length})</span>
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(true)}
                className="text-[10px] font-bold text-[#007AFF] hover:underline flex items-center gap-0.5 cursor-pointer lowercase"
              >
                <Plus size={11} />
                <span>new group</span>
              </button>
            </div>

            <div className="space-y-1">
              {filteredGroups.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setIsCreateGroupOpen(true)}
                  className="w-full text-center py-3 text-xs text-[#8A8A85] hover:text-[#007AFF] border border-dashed border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px] transition-colors cursor-pointer"
                >
                  + Create your first Group Chat
                </button>
              ) : (
                filteredGroups.map((group) => {
                  const isActive = activeSessionId === group.id;
                  const memberCount = group.participants?.length || 0;
                  const lastSnippet = group.lastMessage?.content || 'No messages yet';
                  const lastTime = group.lastMessage?.createdAt || group.updatedAt || group.createdAt;

                  return (
                    <div
                      key={group.id}
                      onClick={() => handleSelectGroup(group.id)}
                      className={`group flex items-center justify-between p-2 rounded-[10px] cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#EBF5FF] dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 shadow-2xs'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Group Icon Circle */}
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center shrink-0">
                          {renderGroupIcon(group.avatar)}
                        </div>

                        {/* Group Details */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[13px] font-bold text-[#000000] dark:text-white font-sans truncate">
                              {group.title}
                            </span>
                            <span className="text-[10px] text-[#8A8A85] shrink-0 font-mono">
                              {formatTime(lastTime)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] truncate font-sans">
                              {lastSnippet}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-50 dark:bg-blue-900/40 text-[#007AFF] font-bold shrink-0">
                              {memberCount} agents
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Delete group */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete group "${group.title}"?`)) {
                            deleteSession(group.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#8A8A85] hover:text-red-500 rounded transition-opacity ml-1 cursor-pointer"
                        title="Delete group"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: GENERAL CHAT ACCORDION */}
        {(activeTab === 'all' || activeTab === 'general') && (
          <div>
            <div
              className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8A8A85] cursor-pointer hover:text-black dark:hover:text-white transition-colors"
              onClick={() => setIsGeneralCollapsed(!isGeneralCollapsed)}
            >
              <div className="flex items-center gap-1">
                {isGeneralCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span>General Chats ({filteredGeneral.length})</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNewGeneralChat();
                }}
                className="text-[10px] font-bold text-[#007AFF] hover:underline flex items-center gap-0.5 cursor-pointer lowercase"
                title="Create General Chat"
              >
                <Plus size={11} />
                <span>new chat</span>
              </button>
            </div>

            {!isGeneralCollapsed && (
              <div className="space-y-0.5 pt-1">
                {filteredGeneral.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleNewGeneralChat}
                    className="w-full text-left py-1.5 px-2 text-[11px] text-[#8A8A85] hover:text-[#007AFF] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Start a general chat</span>
                  </button>
                ) : (
                  filteredGeneral.map((sess) => {
                    const isActive = activeSessionId === sess.id;
                    const lastSnippet = sess.lastMessage?.content || sess.title || 'General Chat';
                    const lastTime = sess.lastMessage?.createdAt || sess.updatedAt || sess.createdAt;

                    return (
                      <div
                        key={sess.id}
                        onClick={() => handleSelectGeneral(sess.id)}
                        className={`group/general flex items-center justify-between px-2.5 py-1.5 rounded-[8px] cursor-pointer transition-colors text-left ${
                          isActive
                            ? 'bg-[#FFF5EB] dark:bg-[#2C2218] text-[#000000] dark:text-white font-semibold'
                            : 'text-[#4B5563] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MessageSquare size={12} className="text-[#8A8A85] shrink-0 opacity-70" />
                          <span className="text-[11px] truncate font-sans">
                            {sess.title || 'General Chat'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px] text-[#8A8A85] font-mono">
                            {formatTime(lastTime)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(sess.id);
                            }}
                            className="opacity-0 group-hover/general:opacity-100 p-0.5 text-[#8A8A85] hover:text-red-500 transition-opacity cursor-pointer"
                            title="Delete session"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Shortcuts */}
      <div className="p-3 border-t border-[#E5E7EB] dark:border-[#27272A] flex flex-col gap-1.5">
        {/* Routines & Automations shortcut */}
        <button
          onClick={() => {
            onClose?.();
            navigate('scheduler');
          }}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#4B5563] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Clock size={14} className="text-[#D97706]" />
          <span>Routines &amp; Automations</span>
        </button>

        {/* Agent Persons shortcut */}
        <button
          onClick={() => {
            onClose?.();
            navigate('agents');
          }}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-[#4B5563] dark:text-[#A1A1AA] hover:text-black dark:hover:text-white rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Bot size={14} className="text-[#007AFF]" />
          <span>Agent Persons</span>
        </button>

        {/* Settings */}
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

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
      />
    </aside>
  );
};
