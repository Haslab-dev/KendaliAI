import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Folder,
  ChevronDown,
  Check,
  Search,
  Plus,
  MessageSquareOff,
  GitBranch,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { GitService, GitBranchInfo } from '../../services/gitService';
import { parseSessionMetadata } from '../../types';
import { AgentTaskInputBar } from './AgentTaskInputBar';
import { cn } from '../../lib/cn';

interface AgentHomeViewProps {
  sessionId?: string | null;
  onOpenTerminal?: () => void;
}

export const AgentHomeView: React.FC<AgentHomeViewProps> = ({ sessionId }) => {
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const switchWorkspace = useAppStore((s) => s.switchWorkspace);
  const workspacePresets = useAppStore((s) => s.workspacePresets);
  const sessions = useAppStore((s) => s.sessions);
  const activeAgent = useAppStore((s) => s.activeAgent);
  const activeModel = useAppStore((s) => s.activeModel);
  const defaultModel = useAppStore((s) => s.defaultModel);

  const startTask = useAgentStore((s) => s.startTask);
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const composerTarget = useAgentStore((s) => s.composerTarget);

  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [gitBranch, setGitBranch] = useState('main');
  const [isBranchesLoading, setIsBranchesLoading] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentWorkspaceName = useMemo(() => {
    if (!activeWorkspacePath) return 'General';
    return activeWorkspacePath.split('/').filter(Boolean).pop() || 'General';
  }, [activeWorkspacePath]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsWorkspaceDropdownOpen(false);
        setIsBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load git branch for active workspace
  const loadGitBranches = async () => {
    if (!activeWorkspacePath) return;
    setIsBranchesLoading(true);
    try {
      const res = await GitService.getBranches(activeWorkspacePath);
      setBranches(res.branches || []);
      setGitBranch(res.current || 'main');
    } catch {
      setBranches([]);
    } finally {
      setIsBranchesLoading(false);
    }
  };

  useEffect(() => {
    void loadGitBranches();
  }, [activeWorkspacePath]);

  const handleCheckoutBranch = async (targetBranch: string) => {
    if (targetBranch === gitBranch || switchingBranch || !activeWorkspacePath) {
      setIsBranchDropdownOpen(false);
      return;
    }
    setSwitchingBranch(targetBranch);
    try {
      await GitService.checkout(targetBranch, activeWorkspacePath);
      setGitBranch(targetBranch);
      setIsBranchDropdownOpen(false);
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setSwitchingBranch(null);
    }
  };

  // Compile unique workspaces from presets and session history
  const allWorkspaces = useMemo(() => {
    const set = new Set<string>();
    if (activeWorkspacePath) set.add(activeWorkspacePath);
    (workspacePresets || []).forEach((p) => {
      if (p.path) set.add(p.path);
    });
    (sessions || []).forEach((s) => {
      const ws = parseSessionMetadata(s).workspace;
      if (ws) set.add(ws);
    });
    return Array.from(set);
  }, [activeWorkspacePath, workspacePresets, sessions]);

  const filteredWorkspaces = useMemo(() => {
    if (!workspaceSearch.trim()) return allWorkspaces;
    const q = workspaceSearch.toLowerCase();
    return allWorkspaces.filter((ws) => {
      const name = ws.split('/').filter(Boolean).pop() || ws;
      return name.toLowerCase().includes(q) || ws.toLowerCase().includes(q);
    });
  }, [allWorkspaces, workspaceSearch]);

  const handleSelectWorkspace = (wsPath: string) => {
    void switchWorkspace(wsPath);
    setIsWorkspaceDropdownOpen(false);
  };

  const handlePromptSubmit = async (promptText: string) => {
    let targetSessionId = sessionId;
    if (targetSessionId) {
      const curr = sessions.find((s) => s.id === targetSessionId);
      const meta = curr ? parseSessionMetadata(curr) : {};
      const sessionEngine = meta.engine === 'acp' ? 'acp' : 'native';
      const targetKind = composerTarget?.kind === 'acp' ? 'acp' : 'native';
      const sessionAgentId = meta.engine === 'acp' ? meta.acpAgent : curr?.agentId;
      const targetAgentId = composerTarget?.id || activeAgent?.id;

      if (sessionEngine !== targetKind || (targetAgentId && sessionAgentId && sessionAgentId !== targetAgentId)) {
        targetSessionId = null;
      }
    }

    if (!targetSessionId) {
      targetSessionId = await startTask({
        kind: composerTarget?.kind === 'acp' ? 'acp' : 'native',
        agentId: composerTarget?.id || activeAgent?.id || 'personal-assistant',
        cwd: activeWorkspacePath || undefined,
        model: activeModel || composerTarget?.model || defaultModel || undefined,
      });
    }
    if (targetSessionId) {
      await sendPrompt(promptText);
    }
  };

  // Landing Tray stacked above composer (Folder + Branch chips)
  const landingTray = (
    <div
      ref={dropdownRef}
      className="flex min-h-8 w-full flex-nowrap items-center gap-x-1.5 px-3 py-1 text-ui-xs text-muted-foreground select-none"
    >
      {/* Folder / Project Selector Chip */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsWorkspaceDropdownOpen((prev) => !prev);
            setIsBranchDropdownOpen(false);
          }}
          className={cn(
            'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-6',
            isWorkspaceDropdownOpen && 'bg-accent text-foreground'
          )}
          title="Switch workspace folder"
        >
          <Folder className="size-3.5 shrink-0 text-primary" />
          <span className="max-w-[180px] truncate">{currentWorkspaceName}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>

        {/* Project Selector Dropdown */}
        {isWorkspaceDropdownOpen && (
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border bg-popover/98 p-1 text-ui-sm text-foreground shadow-2xl backdrop-blur-xl">
            <div className="border-b border-border/60 px-3 pb-1.5 pt-2">
              <div className="relative">
                <Search className="absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  value={workspaceSearch}
                  onChange={(e) => setWorkspaceSearch(e.target.value)}
                  placeholder="Search projects…"
                  aria-label="Search projects"
                  className="h-6.5 w-full bg-transparent pl-5 text-ui-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-48 space-y-0.5 overflow-y-auto p-1 scrollbar-thin">
              {filteredWorkspaces.map((ws) => {
                const name = ws.split('/').filter(Boolean).pop() || ws;
                const isCurrent = ws === activeWorkspacePath || name === currentWorkspaceName;
                return (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => handleSelectWorkspace(ws)}
                    className={cn(
                      'flex min-h-7 w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-left text-ui-sm transition-colors',
                      isCurrent
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-foreground hover:bg-accent'
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate pr-1">
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                    </span>
                    {isCurrent && <Check className="size-3.5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>

            <div className="mx-1 my-1 h-px bg-border/50" />

            <div className="space-y-0.5 p-1 pt-0">
              <button
                type="button"
                onClick={() => {
                  setIsWorkspaceDropdownOpen(false);
                  const path = prompt('Enter folder path:');
                  if (path) void switchWorkspace(path.trim());
                }}
                className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-ui-sm text-foreground transition-colors hover:bg-accent"
              >
                <Plus className="size-3.5 text-muted-foreground" />
                <span>Open folder…</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsWorkspaceDropdownOpen(false);
                  void switchWorkspace('');
                }}
                className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-ui-sm text-foreground transition-colors hover:bg-accent"
              >
                <MessageSquareOff className="size-3.5 text-muted-foreground" />
                <span>General (Work outside project)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Git Branch Selector Chip */}
      {activeWorkspacePath && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsBranchDropdownOpen((prev) => !prev);
              setIsWorkspaceDropdownOpen(false);
            }}
            className={cn(
              'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-6',
              isBranchDropdownOpen && 'bg-accent text-foreground'
            )}
            title="Git branch"
          >
            <GitBranch className="size-3 shrink-0 text-primary" />
            <span className="max-w-[150px] truncate">{gitBranch}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>

          {isBranchDropdownOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-xl border border-border bg-popover/98 p-1 text-ui-sm text-foreground shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Branches</span>
                {isBranchesLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="max-h-48 space-y-0.5 overflow-y-auto p-1 scrollbar-thin">
                {branches.length === 0 && !isBranchesLoading && (
                  <div className="px-2 py-1.5 text-ui-xs italic text-muted-foreground">
                    No branches found
                  </div>
                )}
                {branches.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    disabled={switchingBranch !== null}
                    onClick={() => void handleCheckoutBranch(b.name)}
                    className={cn(
                      'flex min-h-7 w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-left transition-colors hover:bg-accent disabled:opacity-50',
                      b.name === gitBranch ? 'bg-primary/10 font-medium text-primary' : 'text-foreground'
                    )}
                  >
                    <span className="truncate">{b.name}</span>
                    {switchingBranch === b.name ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    ) : b.name === gitBranch ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex flex-1 h-full w-full select-none flex-col overflow-hidden bg-background transition-colors">
      <div className="flex min-h-0 w-full flex-1">
        {/* Centered Draft Body */}
        <div className="z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
          <div className="my-auto flex w-full max-w-[48rem] flex-col items-center justify-center gap-6">
            {/* Forge Spark Glyph & Heading */}
            <div className="flex w-full select-none flex-col items-center gap-4 text-center">
              <div className="text-foreground">
                <svg width={56} height={56} viewBox="0 0 48 48" fill="currentColor" className="shrink-0" aria-hidden="true">
                  <path d="M24 3c1.6 10.6 6.4 16.7 20 21-13.6 4.3-18.4 10.4-20 21-1.6-10.6-6.4-16.7-20-21 13.6-4.3 18.4-10.4 20-21Z" />
                  <circle cx="39.5" cy="8.5" r="3.2" />
                </svg>
              </div>

              <h2 className="text-[26px] font-normal leading-[1.15] tracking-[-0.015em] text-foreground sm:text-[30px]">
                What should we do in{' '}
                <button
                  type="button"
                  onClick={() => setIsWorkspaceDropdownOpen((prev) => !prev)}
                  className="cursor-pointer rounded text-inherit underline decoration-dotted decoration-[1.5px] underline-offset-[6px] transition-colors hover:text-foreground/70"
                >
                  {currentWorkspaceName}
                </button>
                ?
              </h2>
            </div>

            {/* Centered Composer with Landing Tray */}
            <div className="w-full pt-2 select-text">
              <AgentTaskInputBar
                placeholder="Ask anything, @ threads or files, $ skills, or / commands"
                autoFocus={true}
                isCompact={false}
                headerNode={landingTray}
                showContextStrip={false}
                onSubmitPrompt={handlePromptSubmit}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentHomeView;
