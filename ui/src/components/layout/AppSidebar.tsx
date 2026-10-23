import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import {
  Plus,
  Search,
  CalendarClock,
  UserRound,
  Users,
  Share2,
  ListFilter,
  Check,
  Archive,
  Pin,
  BellOff,
  Trash2,
  X,
  PanelLeft,
  RotateCcw,
  Square,
  Clock,
  CirclePlus,
  CheckCircle2,
  Terminal,
  FolderGit2,
  Code2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/time';
import { ProfileRow } from '../shell/ProfileRow';
import { AgentIcon } from '../shell/AgentIcon';
import { ProviderIcon } from '../agent/ProviderIcon';
import { Session } from '../../types';

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type SidebarTab = 'active' | 'pinned' | 'snoozed' | 'archived';
type ListSortBy = 'updated' | 'created';

function loadSnoozedSessions(): Record<string, number> {
  try {
    const raw = localStorage.getItem('kendali:snoozed-sessions');
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveSnoozedSessions(record: Record<string, number>) {
  try {
    localStorage.setItem('kendali:snoozed-sessions', JSON.stringify(record));
  } catch {}
}

function loadArchivedSessions(): Set<string> {
  try {
    const raw = localStorage.getItem('kendali:archived-sessions');
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveArchivedSessions(set: Set<string>) {
  try {
    localStorage.setItem('kendali:archived-sessions', JSON.stringify(Array.from(set)));
  } catch {}
}

function HighlightMatch({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>;
  const escaped = query.trim().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="bg-primary/25 text-primary rounded-xs px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  collapsed,
  onToggleCollapse,
}) => {
  const {
    activeAgent,
    selectedAgentId,
    selectAgent,
    activeGroup,
    selectedGroupId,
    activeNavTab,
    setActiveNavTab,
    agents,
    groups,
    selectGroup,
  } = useProfileStore();

  const {
    activeSessionId,
    selectSession,
    deleteSession,
    pinSession,
    getAgentSessions,
    createSessionForGroup,
    sessions: allStoreSessions,
    searchQuery,
    setSearchQuery,
    stopSession,
  } = useSessionStore();

  const { themeMode, setThemeMode } = useAppStore();

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('active');
  const [sortBy, setSortBy] = useState<ListSortBy>('updated');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [snoozedMap, setSnoozedMap] = useState<Record<string, number>>(loadSnoozedSessions);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(loadArchivedSessions);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    if (filterMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [filterMenuOpen]);

  // Global keyboard shortcuts (⌘N for New Task, ⌘K for search)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewTask();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNewTask = async () => {
    if (activeNavTab === 'groups' && activeGroup) {
      const newSid = await createSessionForGroup(activeGroup.id);
      await selectSession(newSid);
    } else {
      selectSession(null);
      setActiveNavTab('chat');
      useAgentStore.getState().setComposerTarget({ kind: 'native', id: 'rakit-kode' });
    }
  };

  const togglePin = async (sessId: string, currentPin: boolean) => {
    await pinSession(sessId, !currentPin);
  };

  const toggleSnooze = (sessId: string) => {
    setSnoozedMap((prev) => {
      const next = { ...prev };
      if (next[sessId] && next[sessId] > Date.now()) {
        delete next[sessId];
      } else {
        next[sessId] = Date.now() + 24 * 60 * 60 * 1000;
      }
      saveSnoozedSessions(next);
      return next;
    });
  };

  const toggleArchive = (sessId: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessId)) {
        next.delete(sessId);
      } else {
        next.add(sessId);
      }
      saveArchivedSessions(next);
      return next;
    });
  };

  // Helper to extract group member IDs (max 3 displayed)
  const getSessionGroupMembers = (sess: Session): string[] => {
    if (sess.metadata) {
      try {
        const meta = JSON.parse(sess.metadata);
        if (Array.isArray(meta.memberIds) && meta.memberIds.length > 0) {
          return meta.memberIds;
        }
        if (meta.groupId) {
          const found = groups.find((g) => g.id === meta.groupId);
          if (found && found.memberIds.length > 0) {
            return found.memberIds;
          }
        }
      } catch {}
    }
    if (sess.participants && sess.participants.length > 0) {
      const fromParts = sess.participants.map((p) => p.participantId).filter(Boolean);
      if (fromParts.length > 0) return fromParts;
    }
    const grp = groups.find((g) => g.id === sess.agentId);
    if (grp && grp.memberIds.length > 0) {
      return grp.memberIds;
    }
    return [];
  };

  // Group chat sessions belong exclusively to Groups mode.
  // Each agent has their own isolated sessions in Chat mode.
  const baseSessions = useMemo(() => {
    // 1. If currently in Groups mode or a group agent is selected: show only sessions for this group agent
    if (activeNavTab === 'groups' || (!selectedAgentId && activeGroup)) {
      const gId = activeGroup?.id || selectedGroupId;
      if (!gId) return [];
      return allStoreSessions.filter((s) => {
        if (s.type !== 'group') return false;
        if (s.agentId === gId) return true;
        if (s.metadata) {
          try {
            const m = JSON.parse(s.metadata);
            if (m.groupId === gId) return true;
          } catch {}
        }
        return false;
      });
    }

    // 2. Chat mode: show strictly only sessions belonging to the currently selected agent
    const targetAgentId = selectedAgentId || activeAgent?.id || agents[0]?.id || 'lutfi';
    return allStoreSessions.filter((s) => s.type !== 'group' && s.agentId === targetAgentId);
  }, [activeNavTab, selectedAgentId, activeGroup, selectedGroupId, activeAgent, agents, allStoreSessions]);

  // Tab counts
  const pinnedCount = useMemo(() => baseSessions.filter((s) => s.pinned).length, [baseSessions]);
  const snoozedCount = useMemo(() => baseSessions.filter((s) => (snoozedMap[s.id] || 0) > Date.now()).length, [baseSessions, snoozedMap]);
  const archivedCount = useMemo(() => baseSessions.filter((s) => archivedIds.has(s.id)).length, [baseSessions, archivedIds]);

  // Filtered and sorted flat session list (no project grouping!)
  const filteredSessions = useMemo(() => {
    return baseSessions
      .filter((sess) => {
        const isArchived = archivedIds.has(sess.id);
        const isSnoozed = (snoozedMap[sess.id] || 0) > Date.now();
        const isPinned = sess.pinned;

        // Search match
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const title = sess.title || '';
          if (!title.toLowerCase().includes(q)) {
            return false;
          }
        }

        if (sidebarTab === 'pinned') return isPinned;
        if (sidebarTab === 'snoozed') return isSnoozed;
        if (sidebarTab === 'archived') return isArchived;

        // Default 'active' tab hides archived and snoozed
        if (isArchived || isSnoozed) return false;
        return true;
      })
      .sort((a, b) => {
        if (sidebarTab === 'active') {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
        }
        if (sortBy === 'created') {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
  }, [baseSessions, searchQuery, sidebarTab, sortBy, archivedIds, snoozedMap]);

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col items-center py-3 select-none">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
          title="Expand sidebar"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  const sidebarActionClasses =
    'flex h-7.5 w-full shrink-0 items-center justify-start gap-2.5 rounded-[6px] px-2.5 text-left text-ui-sm font-medium text-foreground/85 transition-colors cursor-pointer hover:bg-foreground/5 hover:text-foreground';

  return (
    <aside className="w-64 shrink-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col select-none text-sidebar-foreground transition-colors overflow-hidden">
      {/* Top Window Strip / Collapse Button */}
      <div className="flex shrink-0 items-center justify-between px-3 h-9 border-b border-sidebar-border">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground truncate max-w-[180px]">
          {activeNavTab === 'groups'
            ? activeGroup?.name || 'Group Tasks'
            : activeAgent?.name || 'Workspace'}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Hide sidebar (⌘B)"
          title="Hide sidebar (⌘B)"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors cursor-pointer"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      {/* Top actions: + New task, Search, Profile, Groups, Connections, Automations, Git Client, Editor */}
      <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5 border-b border-sidebar-border">
        {/* + New task */}
        <button
          type="button"
          onClick={handleNewTask}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'chat' && !activeSessionId ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
        >
          <Plus className="size-4 shrink-0 text-foreground" />
          <span className="min-w-0 flex-1 truncate">New task</span>
          <span className="ml-auto shrink-0 text-ui-xs font-normal text-muted-foreground">⌘N</span>
        </button>

        {/* Search */}
        <button
          type="button"
          onClick={() => searchInputRef.current?.focus()}
          className={sidebarActionClasses}
          title="Search tasks (⌘K)"
        >
          <Search className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Search</span>
          <span className="ml-auto shrink-0 text-ui-xs font-normal text-muted-foreground">⌘K</span>
        </button>

        {/* Profile (agent profile) */}
        <button
          type="button"
          onClick={() => setActiveNavTab('agent')}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'agent' ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
          title="Profile (Agent Profile)"
        >
          <UserRound className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Profile</span>
        </button>

        {/* Groups */}
        <button
          type="button"
          onClick={() => {
            selectSession(null);
            selectGroup(null);
            setActiveNavTab('groups');
          }}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'groups' && !activeGroup && !activeSessionId ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
          title="Groups"
        >
          <Users className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Groups</span>
        </button>

        {/* Connections */}
        <button
          type="button"
          onClick={() => setActiveNavTab('connections')}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'connections' ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
          title="Connections"
        >
          <Share2 className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Connections</span>
        </button>

        {/* Automations */}
        <button
          type="button"
          onClick={() => setActiveNavTab('automations')}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'automations' ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
          title="Automations"
        >
          <CalendarClock className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Automations</span>
        </button>

        {/* Git Client */}
        <button
          type="button"
          onClick={() => setActiveNavTab('git')}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'git' ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
          title="Git Client"
        >
          <FolderGit2 className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Git Client</span>
        </button>

        {/* Simple Editor */}
        <button
          type="button"
          onClick={() => setActiveNavTab('editor')}
          className={cn(
            sidebarActionClasses,
            activeNavTab === 'editor' ? 'bg-foreground/10 text-foreground font-semibold' : ''
          )}
          title="Simple Editor (File Explorer & Shell)"
        >
          <Code2 className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Editor</span>
        </button>
      </div>

      {/* Scrollable Tasks Area */}
      <div className="relative flex min-h-0 flex-1 flex-col pt-1.5">
        {/* Unified Search & List Controls Bar */}
        <div className="flex items-center gap-1.5 px-2.5 pb-2">
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full h-7 rounded-md bg-card/60 border border-border/70 pl-7 pr-6 text-ui-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden focus:border-primary/50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="relative shrink-0" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => setFilterMenuOpen(!filterMenuOpen)}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border border-border/70 transition-colors cursor-pointer',
                filterMenuOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              )}
              title="View & sort"
            >
              <ListFilter className="size-3.5" />
            </button>

            {filterMenuOpen && (
              <div className="dropdown-glass absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl p-1 shadow-xl">
                <div className="px-2.5 pb-1 pt-0.5 text-ui-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sort by
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSortBy('updated');
                    setFilterMenuOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-foreground hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-muted-foreground" />
                    <span>Updated</span>
                  </span>
                  {sortBy === 'updated' && <Check className="size-3 text-foreground" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortBy('created');
                    setFilterMenuOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-foreground hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <CirclePlus className="size-3.5 text-muted-foreground" />
                    <span>Created</span>
                  </span>
                  {sortBy === 'created' && <Check className="size-3 text-foreground" />}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidebarTab(sidebarTab === 'archived' ? 'active' : 'archived')}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 transition-colors cursor-pointer',
              sidebarTab === 'archived' ? 'bg-accent text-foreground border-primary/40' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            )}
            title="Archived tasks"
          >
            <Archive className="size-3.5" />
          </button>
        </div>

        {/* Filter Segmented Tabs: Active, Pinned, Snoozed, Archived */}
        <div className="flex items-center gap-1 px-2.5 pb-2 text-ui-xs overflow-x-auto scrollbar-none">
          {(['active', 'pinned', 'snoozed', 'archived'] as const).map((tab) => {
            const isSelected = sidebarTab === tab;
            const count = tab === 'pinned' ? pinnedCount : tab === 'snoozed' ? snoozedCount : tab === 'archived' ? archivedCount : 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setSidebarTab(tab)}
                className={cn(
                  'px-2 py-0.5 rounded-full capitalize transition-colors cursor-pointer shrink-0 text-ui-xs',
                  isSelected
                    ? 'bg-foreground/15 text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                )}
              >
                {tab} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Tasks Section Header */}
        <div className="flex items-center justify-between px-3.5 pb-1 text-ui-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
          <span>Tasks</span>
          <span className="text-[10px] lowercase text-muted-foreground font-normal">
            {filteredSessions.length} {filteredSessions.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {/* Flat Task List (NO project groupings!) */}
        <div className="flex-1 overflow-y-auto px-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-border">
          {filteredSessions.length === 0 ? (
            <div className="py-10 text-center text-ui-xs text-muted-foreground/60">
              No tasks found
            </div>
          ) : (
            filteredSessions.map((sess) => {
              const isActive = activeSessionId === sess.id;
              const isRunning = sess.status === 'running' || sess.status === 'starting';
              const isPinned = sess.pinned;
              const isSnoozed = (snoozedMap[sess.id] || 0) > Date.now();
              const isArchived = archivedIds.has(sess.id);
              const isGroup = sess.type === 'group';
              const groupMembers = isGroup ? getSessionGroupMembers(sess) : [];
              const displayGroupMembers = groupMembers.slice(0, 3);

              let sessMeta: Record<string, any> = {};
              if (sess.metadata) {
                try {
                  sessMeta = JSON.parse(sess.metadata);
                } catch {}
              }

              const isAcpSession =
                sessMeta.engine === 'acp' ||
                Boolean(sessMeta.acpAgent) ||
                ['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'].includes((sess.agentId || '').toLowerCase()) ||
                (sess.lastMessage?.channel === 'acp');

              const resolvedAcpAgent =
                sessMeta.acpAgent ||
                (['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'].includes((sess.agentId || '').toLowerCase())
                  ? sess.agentId
                  : undefined) ||
                (sess.lastMessage?.agentId && ['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'].includes(sess.lastMessage.agentId.toLowerCase())
                  ? sess.lastMessage.agentId
                  : undefined);

              const sessionAgent = !isGroup
                ? agents.find((a) => a.id === sess.agentId) || (isAcpSession ? null : activeAgent)
                : null;

              let displayTitle = sess.title || 'Untitled task';
              // If group session title is just the group's name, don't repeat the group name for every session!
              if (
                isGroup &&
                (displayTitle.toLowerCase() === (activeGroup?.name || '').toLowerCase() ||
                  displayTitle.toLowerCase() === 'group chat')
              ) {
                if (sess.lastMessage?.content) {
                  displayTitle = sess.lastMessage.content.replace(/[\r\n]+/g, ' ').slice(0, 36);
                } else {
                  const groupSessList = filteredSessions.filter((s) => s.type === 'group');
                  const idx = groupSessList.indexOf(sess);
                  displayTitle = idx >= 0 ? `Topic #${groupSessList.length - idx}` : 'Discussion';
                }
              }

              return (
                <div
                  key={sess.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveNavTab('chat');
                    selectSession(sess.id);
                  }}
                  className={cn(
                    'group/session-item flex cursor-pointer items-center gap-2 rounded-[8px] py-1.5 pl-2.5 pr-2 transition-colors select-none',
                    isActive
                      ? 'bg-foreground/[0.08] text-foreground font-medium'
                      : 'text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground',
                    isArchived && !isActive && 'opacity-60',
                    isSnoozed && !isActive && 'opacity-50'
                  )}
                >
                  {/* Task Icon: Stacked Member Avatars (max 3) for Groups, AgentIcon for Direct Tasks */}
                  {isGroup ? (
                    <div className="flex -space-x-1.5 shrink-0 items-center">
                      {displayGroupMembers.length > 0 ? (
                        displayGroupMembers.map((memberId, i) => {
                          const member = agents.find((a) => a.id === memberId);
                          return (
                            <div
                              key={memberId}
                              className="size-4.5 rounded-full border border-sidebar bg-muted/60 flex items-center justify-center overflow-hidden shrink-0 shadow-xs"
                              style={{ zIndex: 10 - i }}
                              title={member?.name || memberId}
                            >
                              <AgentIcon
                                id={memberId}
                                name={member?.name || memberId}
                                avatar={member?.avatar}
                                size={11}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="size-4.5 rounded-full border border-sidebar bg-muted flex items-center justify-center">
                          <Users className="size-2.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex size-4 shrink-0 items-center justify-center">
                      {isAcpSession ? (
                        <ProviderIcon
                          provider={resolvedAcpAgent || sess.agentId || 'agy'}
                          size={14}
                          className="shrink-0"
                        />
                      ) : (
                        <AgentIcon
                          id={sess.agentId || activeAgent?.id || 'agent'}
                          name={sessionAgent?.name}
                          avatar={sessionAgent?.avatar}
                          isACP={false}
                          size={14}
                        />
                      )}
                      {isRunning && (
                        <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-emerald-500 ring-1 ring-sidebar" />
                      )}
                    </div>
                  )}

                  {/* Title */}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-ui-sm flex items-center gap-1.5',
                      isActive ? 'font-medium text-foreground' : 'font-normal text-foreground/90'
                    )}
                    title={displayTitle}
                  >
                    <span className="truncate">
                      <HighlightMatch text={displayTitle} query={searchQuery} />
                    </span>
                    {isPinned && (
                      <Pin className="size-2.5 text-primary shrink-0 rotate-45 fill-primary" />
                    )}
                  </span>

                  {/* Right side: Timestamp & Hover Action Buttons */}
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Time elapsed label */}
                    <span className="text-ui-xs text-muted-foreground group-hover/session-item:hidden">
                      {relativeTime(sess.updatedAt || sess.createdAt)}
                    </span>

                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(sess.id, isPinned);
                      }}
                      className={cn(
                        'size-5 items-center justify-center rounded p-0.5 transition-colors cursor-pointer',
                        isPinned
                          ? 'flex text-primary hover:bg-foreground/5'
                          : 'hidden text-muted-foreground hover:text-foreground hover:bg-foreground/5 group-hover/session-item:flex'
                      )}
                      title={isPinned ? 'Unpin task' : 'Pin task to top'}
                    >
                      <Pin className={cn('size-3', isPinned && 'fill-primary')} />
                    </button>

                    {/* Snooze button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSnooze(sess.id);
                      }}
                      className={cn(
                        'size-5 items-center justify-center rounded p-0.5 transition-colors cursor-pointer',
                        isSnoozed
                          ? 'flex text-amber-500 hover:bg-foreground/5'
                          : 'hidden text-muted-foreground hover:text-foreground hover:bg-foreground/5 group-hover/session-item:flex'
                      )}
                      title={isSnoozed ? 'Unsnooze task' : 'Snooze task for 24h'}
                    >
                      <BellOff className="size-3" />
                    </button>

                    {/* Archive button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleArchive(sess.id);
                      }}
                      className={cn(
                        'size-5 items-center justify-center rounded p-0.5 transition-colors cursor-pointer',
                        isArchived
                          ? 'flex text-primary hover:bg-foreground/5'
                          : 'hidden text-muted-foreground hover:text-foreground hover:bg-foreground/5 group-hover/session-item:flex'
                      )}
                      title={isArchived ? 'Unarchive task' : 'Archive task'}
                    >
                      <Archive className="size-3" />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(sess.id);
                      }}
                      className="hidden size-5 items-center justify-center rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-foreground/5 group-hover/session-item:flex cursor-pointer transition-colors"
                      title="Delete task"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer ProfileRow */}
      <ProfileRow
        theme={themeMode}
        onToggleTheme={(next) => setThemeMode(next)}
        onOpenSettings={() => setActiveNavTab('settings')}
      />
    </aside>
  );
};

export default AppSidebar;
