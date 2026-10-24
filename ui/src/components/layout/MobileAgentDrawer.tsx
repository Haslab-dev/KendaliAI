import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Users,
  Check,
  Search,
  MessageSquare,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useUIStore } from '../../store/useUIStore';
import { AgentIcon } from '../shell/AgentIcon';
import { getAgentAvatarColor } from '../GrokAvatar';
import { relativeTime } from '../../lib/time';
import { navigate } from '../../router';
import { cn } from '../../lib/cn';

interface MobileAgentDrawerProps {
  onOpenCreateAgent?: () => void;
  onOpenCreateGroup?: () => void;
}

/**
 * Mobile Drawer (Muse AI parity):
 * - Seamlessly slides in from the left when the top-left burger icon is tapped.
 * - Solid, high-contrast, theme-aware surface with gentle backdrop blur.
 * - Dual-tab navigation:
 *     1. [Tasks] — Recent conversation history with search & instant resume.
 *     2. [Agents] — Agent roster & groups with real-time active state synchronization.
 * - Quick "+ New" action in header to immediately start a fresh task.
 */
export const MobileAgentDrawer: React.FC<MobileAgentDrawerProps> = ({
  onOpenCreateAgent,
  onOpenCreateGroup,
}) => {
  const { mobileDrawerOpen, closeMobileDrawer } = useUIStore();
  const {
    agents,
    selectedAgentId,
    selectAgent,
    activeAgent,
    groups,
    activeGroup,
    selectGroup,
    activeNavTab,
    setActiveNavTab,
  } = useProfileStore();

  const {
    sessions,
    activeSession,
    activeSessionId,
    selectSession,
    createSessionForAgent,
    createSessionForGroup,
  } = useSessionStore();

  const [drawerTab, setDrawerTab] = useState<'tasks' | 'agents'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        closeMobileDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen, closeMobileDrawer]);

  // Synchronized active agent: matches whichever agent currently owns the active session!
  const currentAgentId = activeSession?.agentId || selectedAgentId || activeAgent?.id;

  // Filtered & sorted recent sessions
  const filteredSessions = useMemo(() => {
    const list = Array.isArray(sessions) ? [...sessions] : [];
    // Sort newest first
    list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((s) => {
      const titleMatch = (s.title || '').toLowerCase().includes(q);
      const agent = (agents || []).find((ag) => ag.id === s.agentId);
      const agentMatch = (agent?.name || '').toLowerCase().includes(q);
      return titleMatch || agentMatch;
    });
  }, [sessions, searchQuery, agents]);

  if (!mobileDrawerOpen) return null;

  const handleStartNewTask = () => {
    closeMobileDrawer();
    setActiveNavTab('chat');
    selectSession(null);
    navigate('agent');
  };

  const handleSelectSession = async (sessionId: string) => {
    closeMobileDrawer();
    setActiveNavTab('chat');
    navigate('agent');
    await selectSession(sessionId);
  };

  const handleSelectAgent = async (agentId: string) => {
    closeMobileDrawer();
    selectAgent(agentId);
    setActiveNavTab('chat');
    navigate('agent');

    // Find latest session for this agent or create a fresh one
    const matching = (sessions || [])
      .filter((s) => s.agentId === agentId && s.type !== 'group')
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    if (matching.length > 0) {
      await selectSession(matching[0].id);
    } else {
      const newSid = await createSessionForAgent(agentId);
      await selectSession(newSid);
    }
  };

  const handleSelectGroup = async (group: any) => {
    closeMobileDrawer();
    selectGroup(group.id);
    setActiveNavTab('groups');
    navigate('agent');

    const matching = (sessions || [])
      .filter((s) => {
        if (s.type === 'group') {
          if (s.metadata) {
            try {
              const m = JSON.parse(s.metadata);
              return m.groupId === group.id;
            } catch {}
          }
        }
        return false;
      })
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    if (matching.length > 0) {
      await selectSession(matching[0].id);
    } else {
      const newSid = await createSessionForGroup(group.id);
      await selectSession(newSid);
    }
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden select-none">
      {/* Semi-transparent blur backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 animate-in fade-in duration-200"
        onClick={closeMobileDrawer}
      />

      {/* Solid drawer surface docked to left with high contrast */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-50 w-[84vw] max-w-[320px] h-full bg-card dark:bg-[#161618] border-r border-border text-foreground shadow-2xl flex flex-col animate-in slide-in-from-left duration-200"
        aria-label="Mobile Drawer Navigation"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 shrink-0 bg-card dark:bg-[#161618]">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold">
              <svg width={20} height={20} viewBox="0 0 48 48" fill="currentColor">
                <path d="M24 3c1.6 10.6 6.4 16.7 20 21-13.6 4.3-18.4 10.4-20 21-1.6-10.6-6.4-16.7-20-21 13.6-4.3 18.4-10.4 20-21Z" />
                <circle cx="39.5" cy="8.5" r="3.2" />
              </svg>
            </div>
            <div>
              <h2 className="text-ui-base font-bold text-foreground leading-none">KendaliAI</h2>
              <span className="text-3xs text-muted-foreground leading-tight">Agent Gateway</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick + New Task action */}
            <button
              type="button"
              onClick={handleStartNewTask}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-semibold text-ui-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
              title="Start a new turn / task"
            >
              <Plus className="size-3 stroke-[2.5]" />
              <span>New</span>
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={closeMobileDrawer}
              className="size-8 rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground flex items-center justify-center cursor-pointer transition-colors"
              title="Close drawer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher: [Tasks (N)]  |  [Agents (N)] */}
        <div className="px-3 pt-2.5 pb-2 border-b border-border/50 shrink-0 bg-surface/40">
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-surface border border-border/60">
            <button
              type="button"
              onClick={() => setDrawerTab('tasks')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                drawerTab === 'tasks'
                  ? 'bg-card text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock className="size-3.5" />
              <span>Tasks</span>
              <span className="text-4xs px-1.5 py-0.2 rounded-full bg-surface border border-border/60 text-muted-foreground">
                {(sessions || []).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDrawerTab('agents')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                drawerTab === 'agents'
                  ? 'bg-card text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sparkles className="size-3.5" />
              <span>Agents</span>
              <span className="text-4xs px-1.5 py-0.2 rounded-full bg-surface border border-border/60 text-muted-foreground">
                {(agents || []).length}
              </span>
            </button>
          </div>
        </div>

        {/* Tab 1: Recent Tasks / Conversation History */}
        {drawerTab === 'tasks' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search filter input */}
            <div className="p-3 pb-2 shrink-0">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search recent tasks…"
                  className="w-full pl-8 pr-3 py-1.5 text-ui-xs rounded-xl bg-surface/70 border border-border/70 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                />
              </div>
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-1 scrollbar-thin">
              {filteredSessions.length === 0 ? (
                <div className="py-12 text-center text-ui-xs text-muted-foreground">
                  {searchQuery ? 'No matching tasks found' : 'No tasks yet. Tap "+ New" above to start!'}
                </div>
              ) : (
                filteredSessions.map((sess) => {
                  const isCurrent = activeSessionId === sess.id;
                  const sessAgent = (agents || []).find((a) => a.id === sess.agentId);
                  const isGroup = sess.type === 'group';

                  return (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => handleSelectSession(sess.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all text-left cursor-pointer active:scale-98',
                        isCurrent
                          ? 'bg-primary/10 border border-primary/40 shadow-xs'
                          : 'border border-transparent hover:bg-surface hover:border-border/50'
                      )}
                    >
                      {/* Avatar */}
                      <div className="size-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-surface border border-border/60">
                        {isGroup ? (
                          <Users className="size-4 text-primary" />
                        ) : (
                          <AgentIcon
                            id={sess.agentId || 'alex'}
                            name={sessAgent?.name || 'Agent'}
                            avatar={sessAgent?.avatar}
                            size={28}
                          />
                        )}
                      </div>

                      {/* Title & metadata */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              'text-ui-xs truncate',
                              isCurrent ? 'font-bold text-foreground' : 'text-foreground/90 font-medium'
                            )}
                          >
                            {sess.title || 'Untitled task'}
                          </span>
                          <span className="text-4xs text-muted-foreground shrink-0 font-mono">
                            {relativeTime(sess.updatedAt || sess.createdAt)}
                          </span>
                        </div>
                        <span className="text-3xs text-muted-foreground truncate block">
                          {isGroup ? 'Group Conversation' : sessAgent?.name || 'Autonomous Agent'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Agents & Groups */}
        {drawerTab === 'agents' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-5 scrollbar-thin">
            {/* Agents Roster */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agents ({(agents || []).length})
                </span>
                {onOpenCreateAgent && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileDrawer();
                      onOpenCreateAgent();
                    }}
                    className="inline-flex items-center gap-1 text-3xs font-medium text-primary hover:text-primary/80 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>New Agent</span>
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {(agents || []).map((ag) => {
                  const isSelected = currentAgentId === ag.id && activeNavTab !== 'groups';
                  const avatarColor = getAgentAvatarColor(ag.avatar || ag.id);

                  return (
                    <button
                      key={ag.id}
                      type="button"
                      onClick={() => handleSelectAgent(ag.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2 rounded-xl transition-all text-left cursor-pointer active:scale-98',
                        isSelected
                          ? 'bg-primary/10 border border-primary/40 shadow-xs'
                          : 'border border-transparent hover:bg-surface hover:border-border/50'
                      )}
                    >
                      <div
                        className="size-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-0.5"
                        style={isSelected ? { outline: `2px solid ${avatarColor}` } : undefined}
                      >
                        <AgentIcon id={ag.id} name={ag.name} avatar={ag.avatar} size={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-ui-sm font-semibold text-foreground truncate">
                            {ag.name}
                          </span>
                          {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                        </div>
                        <span className="text-2xs text-muted-foreground truncate block">
                          {ag.role || 'Autonomous Agent'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Groups Roster */}
            {(groups || []).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between px-1">
                  <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Groups ({(groups || []).length})
                  </span>
                  {onOpenCreateGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        closeMobileDrawer();
                        onOpenCreateGroup();
                      }}
                      className="inline-flex items-center gap-1 text-3xs font-medium text-primary hover:text-primary/80 cursor-pointer"
                    >
                      <Plus className="size-3" />
                      <span>New Group</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {(groups || []).map((group) => {
                    const isSelected = activeNavTab === 'groups' && activeGroup?.id === group.id;
                    const displayMembers = (group.memberIds || []).slice(0, 3);

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleSelectGroup(group)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2 rounded-xl transition-all text-left cursor-pointer active:scale-98',
                          isSelected
                            ? 'bg-primary/10 border border-primary/40 shadow-xs'
                            : 'border border-transparent hover:bg-surface hover:border-border/50'
                        )}
                      >
                        <div className="size-9 rounded-xl bg-surface flex items-center justify-center shrink-0 -space-x-1.5 overflow-hidden">
                          {displayMembers.length > 0 ? (
                            displayMembers.map((mId) => {
                              const mem = (agents || []).find((a) => a.id === mId);
                              return (
                                <div key={mId} className="size-5 rounded-md overflow-hidden shrink-0">
                                  <AgentIcon id={mId} name={mem?.name || mId} avatar={mem?.avatar} size={18} />
                                </div>
                              );
                            })
                          ) : (
                            <Users className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-ui-sm font-semibold text-foreground truncate">
                              {group.name}
                            </span>
                            {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                          </div>
                          <span className="text-2xs text-muted-foreground truncate block">
                            {(group.memberIds || []).length} agents
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};

export default MobileAgentDrawer;
