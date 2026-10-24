import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BellOff,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Clock,
  Files,
  Folder,
  ListFilter,
  Maximize2,
  MessagesSquare,
  Minimize2,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Settings as SettingsIcon,
  SquareTerminal,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { isAgentTaskSession, parseSessionMetadata, Session } from '../../types';
import { navigate, navigateSettings } from '../../router';
import { relativeTime } from '../../lib/time';
import { cn } from '../../lib/cn';
import { AgentIcon } from '../shell/AgentIcon';
import { ThemeMode, resolveMode } from '../../lib/theme';

/* ForgeSidebar — ported 1:1 from forge-ade's AgentSidebar (ZCode parity):
 * window strip, top actions, list controls (view/sort menu, archive,
 * collapse), search, filter pills with counts, project groups with hover
 * actions, exact TaskRow (status dots, pin/snooze/archive/delete), and the
 * ProfileRow footer. Serves both modes: Agent (tasks) and Assistant (chats /
 * telegram / files). */

type SidebarTab = 'active' | 'pinned' | 'snoozed' | 'archived';
type ListSortBy = 'updated' | 'created';

const sidebarActionClasses =
  'flex h-7.5 w-full shrink-0 items-center justify-start gap-2.5 rounded-[6px] px-2.5 text-left text-ui-sm font-medium text-foreground/85 transition-colors cursor-pointer hover:bg-foreground/5 hover:text-foreground';

function HighlightMatch({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>;
  const escaped = query.trim().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="rounded-xs bg-primary/25 px-0.5 font-semibold text-primary">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export const ForgeSidebar: React.FC = () => {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const assistantSection = useAppStore((s) => s.assistantSection);
  const setAssistantSection = useAppStore((s) => s.setAssistantSection);
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const selectSession = useAppStore((s) => s.selectSession);
  const createGeneralChat = useAppStore((s) => s.createGeneralChat);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const acpSessions = useAgentStore((s) => s.acpSessions);
  const activeAgentSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const setActiveAgentSession = useAgentStore((s) => s.setActiveAgentSession);
  const pinned = useAgentStore((s) => s.pinned);
  const archived = useAgentStore((s) => s.archived);
  const togglePinned = useAgentStore((s) => s.togglePinned);
  const toggleArchived = useAgentStore((s) => s.toggleArchived);
  const removeTask = useAgentStore((s) => s.removeTask);
  const openNewTask = useAgentStore((s) => s.openNewTask);
  const setSidebarCollapsed = useAgentStore((s) => s.setSidebarCollapsed);
  const loadWorkspaceInfo = useAppStore((s) => s.loadWorkspaceInfo);

  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('active');
  const [listView, setListView] = useState<'project' | 'timeline'>('project');
  const [sortBy, setSortBy] = useState<ListSortBy>('updated');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Snoozed (24h) — forge parity, localStorage-backed.
  const [snoozedMap, setSnoozedMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('forge:snoozed-sessions') || '{}');
    } catch {
      return {};
    }
  });
  const persistSnoozed = (next: Record<string, number>) => {
    setSnoozedMap(next);
    localStorage.setItem('forge:snoozed-sessions', JSON.stringify(next));
  };
  const toggleSnooze = (id: string) => {
    const next = { ...snoozedMap };
    if (next[id] && next[id] > Date.now()) delete next[id];
    else next[id] = Date.now() + 24 * 60 * 60 * 1000;
    persistSnoozed(next);
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setFilterMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ⌘N / ⌘B shortcuts (forge parity).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (mode === 'assistant') void newChat();
        else openNewTask();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, openNewTask]);

  const isTask = useMemo(() => new Set(sessions.filter(isAgentTaskSession).map((s) => s.id)), [sessions]);
  const snoozeActive = (id: string) => (snoozedMap[id] || 0) > Date.now();

  const newChat = async () => {
    await createGeneralChat();
    navigate('assistant');
  };

  const matchesBase = (s: Session) => {
    if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  };
  const matchesTab = (s: Session) => {
    if (sidebarTab === 'pinned' && !pinned.has(s.id)) return false;
    if (sidebarTab === 'archived' && !archived.has(s.id)) return false;
    if (sidebarTab === 'snoozed' && !snoozeActive(s.id)) return false;
    if (sidebarTab === 'active' && (archived.has(s.id) || snoozeActive(s.id))) return false;
    return true;
  };

  const sorted = (list: Session[]) =>
    [...list].sort((a, b) =>
      sidebarTab === 'active' && pinned.has(a.id) !== pinned.has(b.id)
        ? pinned.has(a.id)
          ? -1
          : 1
        : sortBy === 'created'
          ? (b.createdAt || 0) - (a.createdAt || 0)
          : (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    );

  // Agent mode: tasks grouped by workspace folder (Projects).
  const taskGroups = useMemo(() => {
    const groups = new Map<string, { name: string; path: string; sessions: Session[] }>();
    for (const s of sessions) {
      if (!isTask.has(s.id) || !matchesBase(s) || !matchesTab(s)) continue;
      const meta = parseSessionMetadata(s);
      const ws = (meta.workspace as string) || '';
      const name = meta.workspaceName || (ws ? ws.split('/').filter(Boolean).pop() : '') || 'General';
      if (!groups.has(name)) groups.set(name, { name, path: ws, sessions: [] });
      groups.get(name)!.sessions.push(s);
    }
    for (const g of groups.values()) g.sessions = sorted(g.sessions);
    return Array.from(groups.values()).sort(
      (a, b) => (b.sessions[0]?.updatedAt || 0) - (a.sessions[0]?.updatedAt || 0)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, isTask, searchQuery, sidebarTab, sortBy, pinned, archived, snoozedMap]);

  // Agent mode: flat timeline list.
  const taskTimeline = useMemo(
    () => sorted(sessions.filter((s) => isTask.has(s.id) && matchesBase(s) && matchesTab(s))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, isTask, searchQuery, sidebarTab, sortBy, pinned, archived, snoozedMap]
  );

  // Assistant mode: chats only (direct/group/general).
  const chats = useMemo(
    () => sorted(sessions.filter((s) => !isTask.has(s.id) && !s.id.startsWith('subtask_') && matchesBase(s) && matchesTab(s))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, isTask, searchQuery, sidebarTab, sortBy, pinned, archived, snoozedMap]
  );

  const openTask = async (s: Session) => {
    await setActiveAgentSession(s.id);
    navigate('agent');
  };
  const openChat = async (s: Session) => {
    await selectSession(s.id);
    setMode('assistant');
    setAssistantSection('chats');
    navigate('assistant');
  };

  const pinnedCount = useMemo(
    () => sessions.filter((s) => (mode === 'agent' ? isTask.has(s.id) : !isTask.has(s.id) && !s.id.startsWith('subtask_')) && pinned.has(s.id)).length,
    [sessions, isTask, pinned, mode]
  );
  const archivedCount = useMemo(
    () => sessions.filter((s) => (mode === 'agent' ? isTask.has(s.id) : !isTask.has(s.id) && !s.id.startsWith('subtask_')) && archived.has(s.id)).length,
    [sessions, isTask, archived, mode]
  );
  const snoozedCount = useMemo(
    () => sessions.filter((s) => (mode === 'agent' ? isTask.has(s.id) : !isTask.has(s.id) && !s.id.startsWith('subtask_')) && snoozeActive(s.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, isTask, snoozedMap, mode]
  );
  const runningCount = useMemo(
    () => Object.values(acpSessions).filter((a) => a.running).length + (isGenerating ? 1 : 0),
    [acpSessions, isGenerating]
  );

  const statusOf = (s: Session): 'idle' | 'running' | 'attention' => {
    const acp = acpSessions[s.id];
    if (acp) {
      if (acp.status === 'running') return 'running';
      if (acp.status === 'awaiting_permission' || acp.status === 'error') return 'attention';
      return 'idle';
    }
    if (isTask.has(s.id)) return isGenerating && activeSessionId === s.id ? 'running' : 'idle';
    return 'idle';
  };

  // Appearance cycle: light → dark → system (forge ProfileRow).
  const NEXT_MODE: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };
  const themeLabel =
    themeMode === 'dark' ? 'Dark theme' : themeMode === 'light' ? 'Light theme' : 'Follow system';

  const isEmpty =
    mode === 'agent'
      ? listView === 'project'
        ? taskGroups.length === 0
        : taskTimeline.length === 0
      : chats.length === 0;

  return (
    <aside
      data-testid="workspace-sidebar"
      className="flex h-full w-[264px] shrink-0 select-none flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-foreground transition-colors"
    >
      {/* Window strip: brand glyph + sidebar collapse (web parity of the
          macOS drag strip). */}
      <div className="flex shrink-0 items-center gap-0.5 pl-3 pr-2" style={{ height: 44 }}>
        <button
          onClick={() => {
            setMode('agent');
            navigate('agent');
          }}
          className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-foreground/5"
          title="KendaliAI Agent"
        >
          <svg width={18} height={18} viewBox="0 0 48 48" fill="currentColor" className="text-foreground" aria-hidden="true">
            <path d="M24 3c1.6 10.6 6.4 16.7 20 21-13.6 4.3-18.4 10.4-20 21-1.6-10.6-6.4-16.7-20-21 13.6-4.3 18.4-10.4 20-21Z" />
            <circle cx="39.5" cy="8.5" r="3.2" />
          </svg>
          <span className="text-ui-sm font-semibold tracking-tight text-foreground">KendaliAI</span>
        </button>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          aria-label="Hide sidebar"
          title="Hide sidebar (⌘B)"
          className="ml-auto flex size-7 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      {/* Top actions */}
      <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1">
        <button
          type="button"
          onClick={() => (mode === 'assistant' ? newChat() : openNewTask())}
          className={sidebarActionClasses}
        >
          <Plus className="size-4 shrink-0 text-foreground" />
          <span className="min-w-0 flex-1 truncate">{mode === 'assistant' ? 'New chat' : 'New task'}</span>
          <span className="ml-auto shrink-0 text-ui-xs font-normal text-foreground-subtlest">⌘N</span>
        </button>

        <button
          type="button"
          onClick={() => searchRef.current?.focus()}
          className={sidebarActionClasses}
          title="Search sessions"
        >
          <Search className="size-4 shrink-0 text-foreground/75" />
          <span className="min-w-0 flex-1 truncate">Search</span>
          <span className="ml-auto shrink-0 text-ui-xs font-normal text-foreground-subtlest">⌘K</span>
        </button>

        {mode === 'agent' ? (
          <>
            <button
              type="button"
              onClick={() => {
                useAgentStore.getState().setTerminalOpen(true);
                navigate('agent');
              }}
              className={sidebarActionClasses}
              title="Shell Terminal (dock)"
            >
              <SquareTerminal className="size-4 shrink-0 text-foreground/75" />
              <span className="min-w-0 flex-1 truncate">Terminal</span>
            </button>
            <button
              type="button"
              onClick={() => navigateSettings('scheduler')}
              className={sidebarActionClasses}
              title="Automations & routines"
            >
              <CalendarClock className="size-4 shrink-0 text-foreground/75" />
              <span className="min-w-0 flex-1 truncate">Automations</span>
            </button>
          </>
        ) : (
          /* Assistant sections: Chats / Telegram / Files */
          <div className="mt-1 flex items-center gap-1 px-0.5 text-ui-xs">
            {([
              { id: 'chats', label: 'Chats', Icon: MessagesSquare },
              { id: 'telegram', label: 'Telegram', Icon: null },
              { id: 'files', label: 'Files', Icon: Files },
            ] as const).map((sec) => {
              const selected = assistantSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setAssistantSection(sec.id);
                    navigate('assistant');
                  }}
                  className={cn(
                    'flex h-6 flex-1 items-center justify-center gap-1 rounded-full px-2 font-medium capitalize transition-colors',
                    selected ? 'bg-foreground/15 text-foreground' : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
                  )}
                >
                  {sec.id === 'telegram' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M21.9 4.6 18.9 19c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.2.3-.5.5-.9.5l.3-4.7L18.4 6.6c.3-.3-.1-.5-.5-.2L7.3 13l-4.5-1.4c-1-.3-1-1 .2-1.4L20.6 3.2c.8-.3 1.5.2 1.3 1.4Z" />
                    </svg>
                  ) : sec.Icon ? (
                    <sec.Icon className="size-3" />
                  ) : null}
                  {sec.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* List controls */}
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <div className="relative" ref={filterMenuRef}>
          <button
            type="button"
            onClick={() => setFilterMenuOpen((p) => !p)}
            aria-haspopup="menu"
            aria-expanded={filterMenuOpen}
            title="View & sort"
            className={cn(
              'flex size-5 items-center justify-center rounded transition-colors',
              filterMenuOpen ? 'bg-surface-hover text-foreground' : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
            )}
          >
            <ListFilter className="size-3.5" />
          </button>
          {filterMenuOpen && (
            <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
              <div className="px-2.5 pb-1 pt-0.5 text-ui-sm font-medium text-foreground-subtle">View</div>
              {([
                { id: 'project', label: 'By project', Icon: Folder },
                { id: 'timeline', label: 'Timeline', Icon: Clock },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={listView === opt.id}
                  onClick={() => {
                    setListView(opt.id);
                    setFilterMenuOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-ui-sm text-foreground transition-colors hover:bg-foreground/5"
                >
                  <opt.Icon className="size-4 shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1">{opt.label}</span>
                  {listView === opt.id && <Check className="size-3.5 shrink-0 text-foreground" />}
                </button>
              ))}
              <div className="mx-1 my-1 h-px bg-border" />
              <div className="px-2.5 pb-1 pt-0.5 text-ui-sm font-medium text-foreground-subtle">Sort by</div>
              {([
                { id: 'updated', label: 'Updated' },
                { id: 'created', label: 'Created' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortBy === opt.id}
                  onClick={() => {
                    setSortBy(opt.id);
                    setFilterMenuOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-ui-sm text-foreground transition-colors hover:bg-foreground/5"
                >
                  <Clock className="size-4 shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1">{opt.label}</span>
                  {sortBy === opt.id && <Check className="size-3.5 shrink-0 text-foreground" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={sidebarTab === 'archived' ? 'Show active sessions' : 'Show archived sessions'}
            className={cn(
              'flex size-5 items-center justify-center rounded transition-colors',
              sidebarTab === 'archived' ? 'bg-surface-hover text-foreground' : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
            )}
            onClick={() => setSidebarTab(sidebarTab === 'archived' ? 'active' : 'archived')}
          >
            <Archive className="size-3.5" />
          </button>
          <button
            type="button"
            title={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
            className="flex size-5 items-center justify-center rounded text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground"
            onClick={() => setAllCollapsed((p) => !p)}
          >
            {allCollapsed ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="px-2.5 pb-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={mode === 'assistant' ? 'Search chats...' : 'Search tasks...'}
            className="h-7 w-full rounded-md border border-border/60 bg-surface pl-7 pr-6 text-ui-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1 overflow-x-auto px-2.5 pb-2 text-ui-xs no-scrollbar">
        {(['active', 'pinned', 'snoozed', 'archived'] as SidebarTab[]).map((tab) => {
          const count = tab === 'pinned' ? pinnedCount : tab === 'snoozed' ? snoozedCount : tab === 'archived' ? archivedCount : 0;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSidebarTab(tab)}
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 capitalize transition-colors',
                sidebarTab === tab ? 'bg-foreground/15 font-medium text-foreground' : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
              )}
            >
              {tab} {count > 0 ? `(${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between px-3.5 pb-2 text-ui-xs font-semibold uppercase tracking-wider text-foreground-subtlest">
        <span>
          {mode === 'assistant'
            ? assistantSection === 'chats'
              ? 'Chats'
              : assistantSection === 'telegram'
                ? 'Telegram'
                : 'Files'
            : listView === 'project'
              ? 'Projects'
              : 'Timeline'}
        </span>
        {runningCount > 0 && (
          <span className="flex items-center gap-1.5 text-ui-xs font-normal lowercase tracking-normal text-foreground-subtlest">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {runningCount} running
          </span>
        )}
      </div>

      {/* List body */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
        {isEmpty && <p className="px-2.5 py-1 text-ui-xs text-foreground-subtlest">No {mode === 'assistant' ? 'chats' : 'tasks'}</p>}

        {mode === 'agent' && listView === 'timeline' && (
          <div className="flex flex-col gap-0.5">
            {taskTimeline.map((s) => (
              <TaskRow
                key={s.id}
                session={s}
                activeSessionId={activeAgentSessionId}
                isArchived={archived.has(s.id)}
                isPinned={pinned.has(s.id)}
                isSnoozed={snoozeActive(s.id)}
                status={statusOf(s)}
                onSelect={openTask}
                onDelete={removeTask}
                onToggleArchive={toggleArchived}
                onTogglePin={togglePinned}
                onToggleSnooze={toggleSnooze}
                showProject
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}

        {mode === 'agent' && listView === 'project' && (
          <>
            {taskGroups.map((group) => {
              const isCollapsed = allCollapsed || collapsedGroups[group.name];
              return (
                <div key={group.name} className="flex flex-col gap-0.5">
                  <div className="group flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups((p) => ({ ...p, [group.name]: !p[group.name] }))}
                      className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-left transition-colors hover:bg-foreground/5"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3 shrink-0 text-foreground-subtlest" />
                      ) : (
                        <ChevronDown className="size-3 shrink-0 text-foreground-subtlest" />
                      )}
                      <Folder className="size-3.5 shrink-0 text-foreground-subtle" />
                      <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground/90">{group.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="New task in this workspace"
                        onClick={() => {
                          if (group.path) void useAppStore.getState().switchWorkspace(group.path);
                          openNewTask();
                        }}
                        className="flex size-6 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground"
                      >
                        <CirclePlus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-0.5 pl-2">
                      {group.sessions.map((s) => (
                        <TaskRow
                          key={s.id}
                          session={s}
                          activeSessionId={activeAgentSessionId}
                          isArchived={archived.has(s.id)}
                          isPinned={pinned.has(s.id)}
                          isSnoozed={snoozeActive(s.id)}
                          status={statusOf(s)}
                          onSelect={openTask}
                          onDelete={removeTask}
                          onToggleArchive={toggleArchived}
                          onTogglePin={togglePinned}
                          onToggleSnooze={toggleSnooze}
                          searchQuery={searchQuery}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* General fallback group when no workspace metadata exists */}
            {taskGroups.length === 0 && taskTimeline.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {taskTimeline.map((s) => (
                  <TaskRow
                    key={s.id}
                    session={s}
                    activeSessionId={activeAgentSessionId}
                    isArchived={archived.has(s.id)}
                    isPinned={pinned.has(s.id)}
                    isSnoozed={snoozeActive(s.id)}
                    status={statusOf(s)}
                    onSelect={openTask}
                    onDelete={removeTask}
                    onToggleArchive={toggleArchived}
                    onTogglePin={togglePinned}
                    onToggleSnooze={toggleSnooze}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'assistant' &&
          assistantSection === 'chats' &&
          chats.map((s) => (
            <TaskRow
              key={s.id}
              session={s}
              activeSessionId={activeSessionId}
              isArchived={archived.has(s.id)}
              isPinned={pinned.has(s.id)}
              isSnoozed={snoozeActive(s.id)}
              status={statusOf(s)}
              onSelect={openChat}
              onDelete={removeTask}
              onToggleArchive={toggleArchived}
              onTogglePin={togglePinned}
              onToggleSnooze={toggleSnooze}
              searchQuery={searchQuery}
            />
          ))}

        {mode === 'assistant' && assistantSection === 'telegram' && (
          <div className="px-2.5 py-2 text-ui-xs leading-relaxed text-foreground-subtle">
            Telegram bots stream into this workspace. Manage connections in
            <button className="ml-1 text-primary hover:underline" onClick={() => navigateSettings('telegram')}>
              Settings → Telegram
            </button>
            .
          </div>
        )}

        {mode === 'assistant' && assistantSection === 'files' && (
          <div className="px-2.5 py-2 text-ui-xs leading-relaxed text-foreground-subtle">
            The workspace file explorer opens in the main pane. Switch roots from
            <button className="ml-1 text-primary hover:underline" onClick={() => loadWorkspaceInfo()}>
              the explorer header
            </button>
            .
          </div>
        )}
      </div>

      {/* Profile footer (ZCode parity): theme cycle, version, settings */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        <button
          type="button"
          aria-label={`Appearance: ${themeLabel}`}
          title={`${themeLabel} — click for ${NEXT_MODE[themeMode]}`}
          onClick={() => setThemeMode(NEXT_MODE[themeMode])}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {resolveMode(themeMode) === 'dark' ? (
            <MoonIcon />
          ) : themeMode === 'light' ? (
            <SunIcon />
          ) : (
            <LaptopIcon />
          )}
        </button>

        <div className="flex items-center gap-1.5">
          <span
            title="KendaliAI v0.6.1"
            className="cursor-default select-none rounded border border-border/50 bg-surface px-1.5 py-0.5 font-mono text-ui-xs font-medium text-foreground-subtle transition-colors hover:text-foreground"
          >
            v0.6.1
          </span>
          <button
            type="button"
            aria-label="Settings"
            title="Settings (⌘,)"
            onClick={() => navigateSettings('general')}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <SettingsIcon className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

/* Small inline icons to avoid extra imports (Sun/Moon/Laptop). */
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);
const LaptopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />
  </svg>
);

/* ---- TaskRow — exact forge-ade port -------------------------------------- */

const TaskRow: React.FC<{
  session: Session;
  activeSessionId: string | null;
  isArchived: boolean;
  isPinned: boolean;
  isSnoozed: boolean;
  status: 'idle' | 'running' | 'attention';
  onSelect: (s: Session) => void;
  onDelete: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleSnooze: (id: string) => void;
  showProject?: boolean;
  searchQuery?: string;
}> = ({
  session,
  activeSessionId,
  isArchived,
  isPinned,
  isSnoozed,
  status,
  onSelect,
  onDelete,
  onToggleArchive,
  onTogglePin,
  onToggleSnooze,
  showProject,
  searchQuery,
}) => {
  const isActive = session.id === activeSessionId;
  const isRunning = status === 'running';
  const isAwaitingApproval = status === 'attention';
  const meta = parseSessionMetadata(session);
  const isACP = meta.engine === 'acp';
  const agentId = meta.acpAgent || session.agentId || '';
  const isGroup = session.type === 'group';
  const projectLeaf = (meta.workspace as string)
    ? (meta.workspace as string).split('/').filter(Boolean).pop()
    : undefined;

  const displayTitle = session.title || 'New Session';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(session);
        }
      }}
      className={cn(
        'group/task-item flex cursor-pointer select-none items-center gap-2 rounded-[8px] py-1.5 pl-2.5 pr-2 transition-colors',
        isActive
          ? 'bg-foreground/10 font-medium text-foreground'
          : 'text-foreground/80 hover:bg-foreground/10 hover:text-foreground',
        isArchived && !isActive ? 'opacity-65' : '',
        isSnoozed && !isActive ? 'opacity-50' : ''
      )}
    >
      {/* Agent icon & status dot (forge: ping for thinking, bounce for approval) */}
      <div className="flex shrink-0 items-center gap-1">
        <div className="relative flex size-3.5 shrink-0 items-center justify-center">
          <AgentIcon
            id={agentId}
            name={session.title}
            isACP={isACP}
            size={13}
            className={cn('transition-opacity', isActive ? 'opacity-100' : 'opacity-70 group-hover/task-item:opacity-100')}
          />
          {isAwaitingApproval ? (
            <span
              className="absolute -right-1 -top-1 size-2 animate-bounce rounded-full bg-amber-500 ring-2 ring-background"
              title="Permission required"
            />
          ) : isRunning ? (
            <span className="absolute -right-0.5 -top-0.5 size-1.5 animate-pulse rounded-full bg-primary" />
          ) : null}
        </div>
        {isGroup && <MessagesSquare className="size-3 shrink-0 text-foreground-subtle" />}
      </div>

      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 truncate text-ui-sm',
          isActive ? 'font-medium text-foreground' : 'font-normal text-foreground/95'
        )}
        title={displayTitle}
      >
        <span className="truncate">
          <HighlightMatch text={displayTitle} query={searchQuery} />
        </span>
        {isPinned && <Pin className="size-2.5 shrink-0 rotate-45 fill-primary text-primary" />}
      </span>

      {isAwaitingApproval && (
        <span className="shrink-0 rounded border border-amber-500/25 bg-amber-500/15 px-1 py-0.2 text-[10px] font-medium leading-none text-amber-500">
          Approval
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {showProject && projectLeaf ? (
          <span className="whitespace-nowrap text-ui-xs text-foreground-subtle group-hover/task-item:hidden">{projectLeaf}</span>
        ) : null}
        <span className="whitespace-nowrap text-ui-xs text-foreground-subtle group-hover/task-item:hidden">
          {relativeTime(session.updatedAt || session.createdAt)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(session.id);
          }}
          className={cn(
            'size-5 items-center justify-center rounded p-0.5 transition-colors',
            isPinned
              ? 'flex text-primary hover:bg-white/5 hover:text-primary'
              : 'hidden text-foreground-subtle hover:bg-white/5 hover:text-foreground group-hover/task-item:flex'
          )}
          title={isPinned ? 'Unpin task' : 'Pin task to top'}
        >
          <Pin className={cn('size-3', isPinned && 'fill-primary')} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSnooze(session.id);
          }}
          className={cn(
            'size-5 items-center justify-center rounded p-0.5 transition-colors',
            isSnoozed
              ? 'flex text-amber-500 hover:text-amber-400 hover:bg-white/5'
              : 'hidden text-foreground-subtle hover:bg-white/5 hover:text-foreground group-hover/task-item:flex'
          )}
          title={isSnoozed ? 'Unsnooze task' : 'Snooze task for 24h'}
        >
          <BellOff className="size-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(session.id);
          }}
          className="hidden size-5 items-center justify-center rounded p-0.5 text-foreground-subtle transition-colors hover:bg-white/5 hover:text-foreground group-hover/task-item:flex"
          title={isArchived ? 'Unarchive task' : 'Archive task'}
        >
          <Archive className={cn('size-3.5', isArchived && 'text-foreground')} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.id);
          }}
          className="hidden size-5 items-center justify-center rounded p-0.5 text-foreground-subtle transition-colors hover:bg-white/5 hover:text-destructive group-hover/task-item:flex"
          title="Delete task"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
};
