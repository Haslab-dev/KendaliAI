import React, { useState, useRef, useEffect } from 'react';
import {
  Ellipsis,
  PanelRight,
  PanelLeft,
  Pencil,
  Trash2,
  SquareTerminal,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { ThemePicker } from './ThemePicker';
import { useAppStore } from '../../store/useAppStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useProfileStore } from '../../store/useProfileStore';
import { ProviderIcon } from '../agent/ProviderIcon';
import { AgentIcon } from '../shell/AgentIcon';

interface WorkspaceHeaderProps {
  title?: string;
  onRenameSession?: () => void;
  onDeleteSession?: () => void;
  onToggleSidePane?: () => void;
  isSidePaneOpen?: boolean;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  onRenameSession,
  onDeleteSession,
  onToggleSidePane,
  isSidePaneOpen,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const { mode, setMode } = useAppStore();
  const { activeSessionId, activeSession, deleteSession } = useSessionStore();
  const { terminalOpen, setTerminalOpen } = useAgentStore();
  const { agents, activeAgent, activeNavTab, setActiveNavTab } = useProfileStore();
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const sessionAgent =
    agents.find((a) => a.id === activeSession?.agentId) ||
    (activeSession?.agentId === activeAgent?.id ? activeAgent : null);

  let sessMeta: Record<string, any> = {};
  if (activeSession?.metadata) {
    try { sessMeta = JSON.parse(activeSession.metadata); } catch {}
  }
  const isAcp =
    !sessionAgent &&
    (sessMeta.engine === 'acp' ||
      Boolean(sessMeta.acpAgent) ||
      ['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'].includes(
        (activeSession?.agentId || '').toLowerCase()
      ));
  const resolvedAcp = sessMeta.acpAgent || activeSession?.agentId || 'agy';

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTaskMenuOpen(false);
      }
    };
    if (taskMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [taskMenuOpen]);

  const handleDelete = () => {
    setTaskMenuOpen(false);
    if (onDeleteSession) {
      onDeleteSession();
    } else if (activeSessionId) {
      deleteSession(activeSessionId);
    }
  };

  return (
    <header className="relative flex h-[var(--workspace-topbar-height,52px)] w-full shrink-0 border-b border-sidebar-border/30 bg-chrome select-none items-center justify-between px-3.5 z-40">
      {/* Left side: title + "..." menu */}
      <div className="flex min-w-0 items-center gap-2.5">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title="Toggle sidebar (⌘B)"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <PanelLeft className="size-4" />
          </button>
        )}

        {activeSession && (
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-transparent select-none">
            {isAcp ? (
              <ProviderIcon provider={resolvedAcp} size={30} />
            ) : (
              <AgentIcon
                id={sessionAgent?.id || activeSession.agentId || 'lutfi'}
                name={sessionAgent?.name}
                avatar={sessionAgent?.avatar}
                size={30}
              />
            )}
          </div>
        )}

        {title && (
          <span className="truncate text-ui-sm font-semibold text-foreground max-w-72 sm:max-w-96" title={title}>
            {title}
          </span>
        )}

        {activeSessionId && (
          <div className="relative flex items-center" ref={menuRef}>
            <button
              type="button"
              onClick={() => setTaskMenuOpen(!taskMenuOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              title="More actions"
            >
              <Ellipsis className="size-4" />
            </button>

            {taskMenuOpen && (
              <div className="dropdown-glass absolute left-0 top-full z-50 mt-1 w-48 rounded-xl p-1 shadow-xl">
                {onRenameSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskMenuOpen(false);
                      onRenameSession();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-foreground hover:bg-accent cursor-pointer"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                    <span>Rename task</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTaskMenuOpen(false);
                    setTerminalOpen(!terminalOpen);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-foreground hover:bg-accent cursor-pointer"
                >
                  <SquareTerminal className="size-3.5 text-muted-foreground" />
                  <span>Toggle terminal</span>
                </button>
                <div className="my-1 h-px bg-border/60" />
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>Delete task</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side tools */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Side-pane toggle */}
        {onToggleSidePane && (
          <button
            type="button"
            onClick={onToggleSidePane}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer',
              isSidePaneOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            title={isSidePaneOpen ? 'Close side pane' : 'Open side pane'}
          >
            <PanelRight className="size-4" />
          </button>
        )}

        {/* Theme & Palette Picker */}
        <div className="ml-0.5">
          <ThemePicker compact />
        </div>
      </div>
    </header>
  );
};
