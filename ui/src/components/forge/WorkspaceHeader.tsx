import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ClipboardCheck,
  ClipboardCopy,
  Eraser,
  Folder,
  MessagesSquare,
  Pencil,
  PanelLeft,
  Sparkles,
  SquareTerminal,
  Trash2,
  GitBranch,
  Settings,
  X,
  Send,
  Bot,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { navigate, navigateSettings } from '../../router';
import { parseSessionMetadata } from '../../types';
import { ThemePicker } from '../common/ThemePicker';
import { ProviderIcon } from '../agent/ProviderIcon';

export const ForgeWorkspaceHeader: React.FC<{ onOpenGit?: () => void }> = ({ onOpenGit }) => {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const setAssistantSection = useAppStore((s) => s.setAssistantSection);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const clearSessionMessages = useAppStore((s) => s.clearSessionMessages);
  const sidebarCollapsed = useAgentStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAgentStore((s) => s.setSidebarCollapsed);
  const activeAgentSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const terminalOpen = useAgentStore((s) => s.terminalOpen);
  const toggleTerminal = useAgentStore((s) => s.toggleTerminal);
  const pinned = useAgentStore((s) => s.pinned);
  const archived = useAgentStore((s) => s.archived);
  const togglePinned = useAgentStore((s) => s.togglePinned);
  const toggleArchived = useAgentStore((s) => s.toggleArchived);
  const removeTask = useAgentStore((s) => s.removeTask);
  const renameTask = useAgentStore((s) => s.renameTask);

  const agentSession = sessions.find((s) => s.id === activeAgentSessionId) || null;
  const chatSession = sessions.find((s) => s.id === activeSessionId) || null;
  const session = mode === 'agent' ? agentSession : chatSession;
  const meta = parseSessionMetadata(session);
  const wsName = meta.workspaceName || (meta.workspace ? (meta.workspace as string).split('/').filter(Boolean).pop() : '') || '';

  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTaskMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(key);
      setTimeout(() => setCopiedItem(null), 1500);
    } catch {}
  };

  const handleSelectMode = (newMode: 'agent' | 'assistant') => {
    setMode(newMode);
    if (newMode === 'agent') {
      navigate('agent');
    } else {
      setAssistantSection('chats');
      navigate('assistant');
    }
  };

  const title = session?.title || (mode === 'agent' ? 'Agent Workspace' : 'Assistant');

  return (
    <header className="relative flex h-[52px] w-full shrink-0 select-none border-b border-border/60 bg-chrome shadow-2xs">
      <div className="flex h-full min-w-0 flex-1 items-center justify-between gap-3 px-3">
        {/* Left: Sidebar toggle + Title + Project badge */}
        <div className="flex min-w-0 items-center gap-2">
          {sidebarCollapsed && mode === 'agent' && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
              title="Show sidebar (⌘B)"
            >
              <PanelLeft className="size-4" />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <span className="max-w-72 truncate text-ui-sm font-semibold text-foreground">
              {title}
            </span>
            {wsName && (
              <span className="hidden items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-2xs font-mono text-muted-foreground sm:inline-flex">
                <Folder className="size-3 text-primary" />
                {wsName}
              </span>
            )}
          </div>

          {/* Session Actions Menu (...) */}
          {session && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setTaskMenuOpen((v) => !v)}
                className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
                title="Session options"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.75" />
                  <circle cx="12" cy="12" r="1.75" />
                  <circle cx="19" cy="12" r="1.75" />
                </svg>
              </button>

              {taskMenuOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-popover p-1 text-ui-xs shadow-xl">
                  <button
                    onClick={() => {
                      setTaskMenuOpen(false);
                      setDraftTitle(session.title);
                      setRenameOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-surface-hover"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setTaskMenuOpen(false);
                      togglePinned(session.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-surface-hover"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
                    </svg>
                    {pinned.has(session.id) ? 'Unpin' : 'Pin to top'}
                  </button>
                  <button
                    onClick={() => {
                      setTaskMenuOpen(false);
                      clearSessionMessages(session.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-surface-hover"
                  >
                    <Eraser className="size-3.5 text-muted-foreground" />
                    Clear messages
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button
                    onClick={() => copyText('id', session.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-surface-hover"
                  >
                    {copiedItem === 'id' ? <ClipboardCheck className="size-3.5 text-success" /> : <ClipboardCopy className="size-3.5 text-muted-foreground" />}
                    Copy Session ID
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button
                    onClick={() => {
                      setTaskMenuOpen(false);
                      removeTask(session.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                    Delete {mode === 'agent' ? 'task' : 'chat'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: The 2-Mode Segmented Switcher (Agent Mode ⇄ Assistant Mode) */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-xs">
          <button
            onClick={() => handleSelectMode('agent')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-ui-xs font-semibold transition-all ${
              mode === 'agent'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ProviderIcon provider="forge-ade" size={14} />
            <span>Agent Mode</span>
          </button>
          <button
            onClick={() => handleSelectMode('assistant')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-ui-xs font-semibold transition-all ${
              mode === 'assistant'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bot className="size-3.5" />
            <span>Assistant Mode</span>
          </button>
        </div>

        {/* Right: Quick Tools (Terminal, Settings, Theme Picker) */}
        <div className="flex shrink-0 items-center gap-1">
          {mode === 'agent' && (
            <button
              type="button"
              onClick={() => toggleTerminal()}
              className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
                terminalOpen ? 'bg-primary/10 text-primary' : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
              }`}
              title="Toggle Terminal Dock"
            >
              <SquareTerminal className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => navigateSettings('general')}
            className="flex size-8 items-center justify-center rounded-lg text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
            title="Settings (⌘,)"
          >
            <Settings className="size-4" />
          </button>

          <div className="ml-1">
            <ThemePicker compact />
          </div>
        </div>
      </div>

      {/* Rename Dialog */}
      {renameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-xl">
            <h3 className="text-ui-sm font-semibold text-foreground">Rename Session</h3>
            <input
              type="text"
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && session && draftTitle.trim()) {
                  renameTask(session.id, draftTitle.trim());
                  setRenameOpen(false);
                }
              }}
              className="mt-3 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-ui-xs text-foreground focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRenameOpen(false)}
                className="rounded-md border border-border px-3 py-1 text-ui-xs text-muted-foreground hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (session && draftTitle.trim()) {
                    renameTask(session.id, draftTitle.trim());
                    setRenameOpen(false);
                  }
                }}
                disabled={!draftTitle.trim()}
                className="rounded-md bg-primary px-3 py-1 text-ui-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
