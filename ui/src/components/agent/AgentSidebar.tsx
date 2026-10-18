import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Bot,
  Trash2,
  Files,
  ListTodo,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Session, SessionMetadata } from '../../types';
import { SidebarFileExplorer } from './SidebarFileExplorer';

function parseSessionMeta(metadataStr?: string): SessionMetadata {
  if (!metadataStr) return {};
  try {
    return JSON.parse(metadataStr);
  } catch {
    return {};
  }
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'now';
  const tsMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const diffSec = Math.floor((Date.now() - tsMs) / 1000);
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

interface ProjectGroup {
  name: string;
  workspacePath?: string;
  sessions: Session[];
}

export const AgentSidebar: React.FC<{
  onSelectFile?: (path: string) => void;
  activeFilePath?: string | null;
}> = ({ onSelectFile, activeFilePath }) => {
  const {
    sessions,
    activeSessionId,
    activeAgentSessionId,
    selectAgentSession,
    createAgentSession,
    deleteSession,
    activeWorkspacePath,
    isGenerating,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'tasks' | 'files'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: ⌘N (new task), ⌘K (search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createAgentSession(activeWorkspacePath);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createAgentSession, activeWorkspacePath]);

  // Filter agent sessions (exclude subtask_ internal workers from primary list)
  const agentSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (s.id.startsWith('subtask_')) return false;
      const meta = parseSessionMeta(s.metadata);
      return s.type === 'agent' || meta.mode === 'agent' || s.title?.startsWith('Task:');
    });
  }, [sessions]);

  // Group sessions by workspace / project
  const projectGroups = useMemo<ProjectGroup[]>(() => {
    const groupsMap = new Map<string, { workspacePath?: string; sessions: Session[] }>();

    // Current active workspace folder name
    const currentWsName = activeWorkspacePath
      ? activeWorkspacePath.split('/').filter(Boolean).pop() || 'Workspace'
      : 'General';

    // Ensure at least General / Active workspace group exists
    groupsMap.set(currentWsName, { workspacePath: activeWorkspacePath, sessions: [] });

    for (const sess of agentSessions) {
      const meta = parseSessionMeta(sess.metadata);
      const wsName = meta.workspaceName || (meta.workspace ? meta.workspace.split('/').filter(Boolean).pop() : undefined) || 'General';
      const wsPath = meta.workspace || '';

      if (!groupsMap.has(wsName)) {
        groupsMap.set(wsName, { workspacePath: wsPath, sessions: [] });
      }
      groupsMap.get(wsName)!.sessions.push(sess);
    }

    // Sort sessions in each group by updatedAt descending
    const result: ProjectGroup[] = [];
    groupsMap.forEach((val, name) => {
      val.sessions.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      result.push({
        name,
        workspacePath: val.workspacePath,
        sessions: val.sessions,
      });
    });

    return result;
  }, [agentSessions, activeWorkspacePath]);

  const toggleProjectCollapse = (name: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleCreateTask = async (wsPath?: string) => {
    await createAgentSession(wsPath || activeWorkspacePath);
  };

  const currentActiveId = activeAgentSessionId || activeSessionId;

  return (
    <aside className="w-[280px] shrink-0 h-full flex flex-col bg-panel border-r border-line select-none z-20">
      {/* Top Action Bar */}
      <div className="p-3 border-b border-line/70 flex flex-col gap-2 bg-rail/40">
        {/* + New task button */}
        <button
          onClick={() => handleCreateTask()}
          className="w-full flex items-center justify-between px-3 py-2 rounded-[8px] bg-white text-black dark:bg-[#007AFF] dark:text-white font-medium text-xs shadow-sm hover:opacity-90 active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-2">
            <Plus size={15} strokeWidth={2.5} />
            <span>New task</span>
          </div>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/20 font-semibold">
            ⌘N
          </kbd>
        </button>

        {/* Search Input */}
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-dim pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks or files..."
            className="w-full bg-inputbg text-hi text-[11px] font-sans pl-7 pr-8 py-1.5 rounded-[6px] border border-line focus:outline-none focus:border-[#007AFF] transition-colors"
          />
          <kbd className="absolute right-2 text-[9px] font-mono text-dim pointer-events-none">
            ⌘K
          </kbd>
        </div>

        {/* Tabs: Tasks vs Files (Sidebar File Explorer) */}
        <div className="flex items-center p-0.5 rounded-[6px] bg-raised border border-line/60 text-xs">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-[4px] font-medium transition-colors ${
              activeTab === 'tasks'
                ? 'bg-panel text-hi shadow-xs'
                : 'text-mid hover:text-hi'
            }`}
          >
            <ListTodo size={13} />
            <span>Tasks</span>
            {agentSessions.length > 0 && (
              <span className="text-[10px] text-dim px-1 rounded-full bg-white/5">
                {agentSessions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-[4px] font-medium transition-colors ${
              activeTab === 'files'
                ? 'bg-panel text-hi shadow-xs'
                : 'text-mid hover:text-hi'
            }`}
          >
            <Files size={13} />
            <span>Explorer</span>
          </button>
        </div>
      </div>

      {/* Main Content: Tasks List or Sidebar File Explorer */}
      {activeTab === 'files' ? (
        <div className="flex-1 min-h-0">
          <SidebarFileExplorer onSelectFile={onSelectFile} activeFilePath={activeFilePath} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-4">
          {/* Projects Header */}
          <div className="flex items-center justify-between px-2 pt-1 text-[11px] font-semibold text-dim uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <Folder size={12} />
              <span>Projects</span>
            </div>
            <button
              onClick={() => handleCreateTask()}
              className="hover:text-hi transition-colors p-0.5 rounded"
              title="Add task in workspace"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Project Folders */}
          {projectGroups.map((group) => {
            const isCollapsed = !!collapsedProjects[group.name];
            const filteredSessions = group.sessions.filter((s) => {
              if (!searchQuery.trim()) return true;
              return (s.title || '').toLowerCase().includes(searchQuery.toLowerCase());
            });

            return (
              <div key={group.name} className="space-y-1">
                {/* Project Header Row */}
                <button
                  type="button"
                  onClick={() => toggleProjectCollapse(group.name)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 text-mid hover:text-hi text-xs transition-colors group"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isCollapsed ? (
                      <ChevronRight size={13} className="text-dim group-hover:text-mid shrink-0" />
                    ) : (
                      <ChevronDown size={13} className="text-dim group-hover:text-mid shrink-0" />
                    )}
                    <span className="text-amber-400 font-semibold">📁</span>
                    <span className="font-semibold text-[11.5px] truncate text-hi">{group.name}</span>
                  </div>
                  <span className="text-[10px] text-dim px-1.5 py-0.2 rounded-full bg-white/5">
                    {group.sessions.length}
                  </span>
                </button>

                {/* Session Items inside this project */}
                {!isCollapsed && (
                  <div className="pl-3 space-y-0.5">
                    {filteredSessions.length === 0 ? (
                      <div className="px-3 py-1.5 text-[11px] text-dim italic">
                        No active tasks
                      </div>
                    ) : (
                      filteredSessions.map((sess) => {
                        const isActive = sess.id === currentActiveId;
                        const isRunning = isActive && isGenerating;
                        const timeBadge = formatRelativeTime(sess.updatedAt || sess.createdAt);

                        return (
                          <div
                            key={sess.id}
                            onClick={() => selectAgentSession(sess.id)}
                            className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-[6px] cursor-pointer text-xs transition-all ${
                              isActive
                                ? 'bg-[#007AFF]/15 text-[#007AFF] font-medium border border-[#007AFF]/30'
                                : 'text-mid hover:bg-white/5 hover:text-hi'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Status icon / Dot */}
                              <div className="relative shrink-0 flex items-center justify-center">
                                <Bot size={13} className={isActive ? 'text-[#007AFF]' : 'text-dim'} />
                                {isRunning && (
                                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-[#007AFF] animate-ping" />
                                )}
                              </div>

                              <span className="truncate text-[11.5px] flex-1">
                                {sess.title || 'Untitled task'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              {/* Time badge */}
                              <span className="text-[10px] text-dim font-mono group-hover:hidden">
                                {timeBadge}
                              </span>

                              {/* Delete button (visible on hover) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSession(sess.id);
                                }}
                                className="hidden group-hover:flex items-center justify-center p-1 rounded text-dim hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                title="Delete task"
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
            );
          })}
        </div>
      )}
    </aside>
  );
};
