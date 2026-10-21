import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  Bot,
  ChevronDown,
  Compass,
  FileText,
  FolderOpen,
  Hand,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore, ComposerTarget } from '../../store/useAgentStore';
import { parseSessionMetadata } from '../../types';
import { cn } from '../../lib/cn';
import { AgentIcon } from '../shell/AgentIcon';
import {
  ComposerControl,
  ComposerChevron,
  ComposerMenu,
  ComposerMenuItem,
  ComposerMenuLabel,
  ComposerMenuSearch,
  ComposerMenuCheck,
  ComposerKbd,
} from './composer-ui';

/* AgentComposer — ported from forge-ade's AgentTaskInputBar (t3 composer):
 * glass surface, stacked header slot (landing tray), auto-growing textarea,
 * left chip tray ([+ context] [mode] [agent] [model]), right send/stop
 * cluster. All menus drop UP (bottom-full) like the original. */

type ExecMode = 'ask' | 'code' | 'plan' | 'bypass';

const MODES: { id: ExecMode; label: string; short: string; desc: string; icon: any }[] = [
  { id: 'ask', label: 'Ask for approval', short: 'Ask', desc: 'Always ask before editing files or running commands', icon: Hand },
  { id: 'code', label: 'Approve edits', short: 'Edits', desc: 'Edit files freely, ask before running commands', icon: Pencil },
  { id: 'plan', label: 'Approve for me', short: 'Auto', desc: 'Only ask for actions detected as potentially unsafe', icon: ShieldCheck },
  { id: 'bypass', label: 'Full access', short: 'Full', desc: 'Unrestricted access to the filesystem and commands', icon: ShieldAlert },
];

export const AgentComposer: React.FC<{
  /** Session to send into. Home view passes its target task id (may be null). */
  sessionId: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  isCompact?: boolean;
  /** Landing tray (workspace chip) rendered as the stacked header slot. */
  headerNode?: React.ReactNode;
}> = ({ sessionId, placeholder = 'Ask anything, @ files, /doc: for knowledge', autoFocus, isCompact = false, headerNode }) => {
  const composerTarget = useAgentStore((s) => s.composerTarget);
  const setComposerTarget = useAgentStore((s) => s.setComposerTarget);
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const stopTask = useAgentStore((s) => s.stopTask);
  const acpSessions = useAgentStore((s) => s.acpSessions);
  const acpAgents = useAgentStore((s) => s.acpAgents);
  const toggleAutoApprove = useAgentStore((s) => s.toggleAutoApprove);
  const executionMode = useAgentStore((s) => s.executionMode);
  const setExecutionMode = useAgentStore((s) => s.setExecutionMode);
  const sessions = useAppStore((s) => s.sessions);
  const agents = useAppStore((s) => s.agents);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const availableModels = useAppStore((s) => s.availableModels);
  const activeModel = useAppStore((s) => s.activeModel);
  const setActiveModel = useAppStore((s) => s.setActiveModel);
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);

  const [prompt, setPrompt] = useState('');
  const [openMenu, setOpenMenu] = useState<null | 'context' | 'mode' | 'agent' | 'model'>(null);
  const [modelSearch, setModelSearch] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click (forge parity).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Draft persistence per session.
  useEffect(() => {
    setPrompt(sessionId ? localStorage.getItem(`forge:draft:${sessionId}`) || '' : '');
  }, [sessionId]);
  useEffect(() => {
    if (!sessionId) return;
    if (prompt) localStorage.setItem(`forge:draft:${sessionId}`, prompt);
    else localStorage.removeItem(`forge:draft:${sessionId}`);
  }, [prompt, sessionId]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [prompt]);

  const running = useMemo(() => {
    if (!sessionId) return false;
    const acp = acpSessions[sessionId];
    if (acp) return acp.status === 'running' || acp.status === 'awaiting_permission';
    return isGenerating;
  }, [sessionId, acpSessions, isGenerating]);

  const session = sessions.find((s) => s.id === sessionId);
  const sessionMeta = parseSessionMetadata(session);
  const sessionAgentId = sessionMeta.acpAgent || session?.agentId || composerTarget?.id || '';
  const sessionIsACP = sessionMeta.engine === 'acp' || !!acpSessions[sessionId || ''];
  const currentMode = MODES.find((m) => m.id === executionMode) || MODES[1];
  const isFullAccess = executionMode === 'bypass';

  const agentName =
    composerTarget?.kind === 'acp'
      ? acpAgents.find((a) => a.id === composerTarget.id)?.name || composerTarget.id
      : agents.find((a) => a.id === sessionAgentId)?.name || 'Agent';

  const wsName = sessionMeta.workspaceName || (activeWorkspacePath ? activeWorkspacePath.split('/').filter(Boolean).pop() : '') || '';

  const submit = async () => {
    const value = prompt.trim();
    if (!value || !sessionId) return;
    setPrompt('');
    localStorage.removeItem(`forge:draft:${sessionId}`);
    await sendPrompt(value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (running) return; // forge: Enter queues/steers while running — send covers it via API
      submit();
    }
  };

  const insertTag = (tag: string) => {
    setPrompt((p) => (p ? `${p} ${tag}` : `${tag} `));
    setOpenMenu(null);
    taRef.current?.focus();
  };

  const filteredModels = useMemo(
    () => availableModels.filter((m) => (m.name || m.id).toLowerCase().includes(modelSearch.toLowerCase())).slice(0, 60),
    [availableModels, modelSearch]
  );
  const groupedModels = useMemo(() => {
    const byProvider = new Map<string, typeof filteredModels>();
    for (const m of filteredModels) {
      const key = m.providerName || 'Other';
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key)!.push(m);
    }
    return Array.from(byProvider.entries());
  }, [filteredModels]);

  const closeAll = () => setOpenMenu(null);

  return (
    <div ref={rootRef} className="relative">
      {/* Stacked header slot (landing tray) */}
      {headerNode && (
        <div className="chat-composer-stacked-top mx-auto -mb-px w-14/15 min-w-0 rounded-t-2xl border border-b-0 border-border/70">
          {headerNode}
        </div>
      )}

      {/* Main composer surface */}
      <div className={cn('composer-surface', isCompact ? 'p-1' : 'p-1.5', headerNode && 'rounded-tl-none rounded-tr-none')}>
        {/* Textarea */}
        <div className="px-1.5">
          <textarea
            ref={taRef}
            rows={isCompact ? 1 : 2}
            autoFocus={autoFocus}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={running ? 'Keep typing to queue follow-up changes' : placeholder}
            className={cn(
              'w-full resize-none border-0 bg-transparent font-sans leading-relaxed text-foreground placeholder:text-placeholder/75 focus:outline-none',
              isCompact ? 'min-h-[30px] text-ui-sm' : 'text-[0.9375rem]'
            )}
          />
        </div>

        {/* Footer: left chip tray … right actions */}
        <div className={cn('flex min-w-0 flex-nowrap items-center justify-between px-2', isCompact ? 'gap-1 pb-0.5 pt-0.5' : 'gap-2 pb-1.5 pt-1 sm:px-3')}>

          {/* Left controls */}
          <div className="relative -m-1 flex min-w-0 flex-1 items-center gap-1 overflow-visible p-1">
            {/* [+] context */}
            <div className="relative shrink-0">
              <ComposerControl
                pressed={openMenu === 'context'}
                aria-label="Add context"
                title="Add context"
                className="w-7 justify-center px-0"
                onClick={() => setOpenMenu(openMenu === 'context' ? null : 'context')}
              >
                <Plus aria-hidden="true" />
              </ComposerControl>
              {openMenu === 'context' && (
                <ComposerMenu label="Add context" className="absolute bottom-full left-0 mb-2 w-56">
                  <ComposerMenuItem onClick={() => insertTag('/doc:')}>
                    <BookOpen className="size-3.5 text-muted-foreground" />
                    <span>Knowledge (/doc:)</span>
                  </ComposerMenuItem>
                  <ComposerMenuItem onClick={() => insertTag('@agent')}>
                    <Bot className="size-3.5 text-muted-foreground" />
                    <span>Mention agent (@)</span>
                  </ComposerMenuItem>
                  <ComposerMenuItem onClick={() => insertTag('$terminal')}>
                    <Terminal className="size-3.5 text-muted-foreground" />
                    <span>Terminal output</span>
                  </ComposerMenuItem>
                  <ComposerMenuItem onClick={() => insertTag('#file')}>
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span>Workspace file</span>
                  </ComposerMenuItem>
                  <div className="mx-1 my-1 h-px bg-border/60" />
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-ui-xs text-fg-tertiary">Tools & skills stream into the transcript</span>
                    <ComposerKbd>Esc</ComposerKbd>
                  </div>
                </ComposerMenu>
              )}
            </div>

            {/* Permission mode chip */}
            <div className="relative flex shrink-0 items-center">
              <ComposerControl
                pressed={openMenu === 'mode'}
                aria-label={`Permission mode: ${currentMode.label}`}
                title={`Permission mode: ${currentMode.label} (${currentMode.desc})`}
                className={cn('min-w-0', isFullAccess && 'text-full-access [&_svg:not([class*="opacity-"])]:text-full-access')}
                onClick={() => setOpenMenu(openMenu === 'mode' ? null : 'mode')}
              >
                <currentMode.icon aria-hidden="true" />
                <span className="min-w-0 truncate text-ui-xs leading-none">{currentMode.short}</span>
                <ComposerChevron className={cn(isFullAccess && 'text-full-access')} />
              </ComposerControl>
              {openMenu === 'mode' && (
                <ComposerMenu label="Permission mode" className="absolute bottom-full left-0 mb-2 w-64">
                  <ComposerMenuLabel>Permission mode</ComposerMenuLabel>
                  {MODES.map((m) => {
                    const isSelected = m.id === executionMode;
                    const isModeFull = m.id === 'bypass';
                    return (
                      <ComposerMenuItem
                        key={m.id}
                        role="menuitemradio"
                        selected={isSelected}
                        className={cn('items-start gap-2.5 py-1.5', isModeFull && 'text-full-access')}
                        onClick={() => {
                          setExecutionMode(m.id);
                          // Full access on a live ACP session = auto-approve.
                          if (sessionId && acpSessions[sessionId]) {
                            if (isModeFull !== !!acpSessions[sessionId].autoApprove) toggleAutoApprove(sessionId);
                          }
                          closeAll();
                        }}
                      >
                        <m.icon className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between text-ui-sm font-medium">
                            <span>{m.label}</span>
                            {isSelected && <ComposerMenuCheck />}
                          </span>
                          <span className={cn('mt-0.5 block text-ui-xs leading-snug', isModeFull ? 'text-current opacity-80' : 'text-fg-tertiary')}>
                            {m.desc}
                          </span>
                        </span>
                      </ComposerMenuItem>
                    );
                  })}
                </ComposerMenu>
              )}
            </div>

            {/* Agent orchestrator picker */}
            <div className="relative flex min-w-[36px] max-w-[150px] shrink items-center">
              <ComposerControl
                pressed={openMenu === 'agent'}
                aria-label={`Agent: ${agentName}`}
                title={`Agent Orchestrator: ${agentName}`}
                className="w-full min-w-0 max-w-full shrink items-center justify-between gap-1 px-1.5 sm:px-2"
                onClick={() => setOpenMenu(openMenu === 'agent' ? null : 'agent')}
              >
                <AgentIcon id={sessionAgentId || 'agent'} isACP={sessionIsACP || composerTarget?.kind === 'acp'} size={14} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left text-ui-xs leading-none">{agentName}</span>
                <ComposerChevron className="shrink-0" />
              </ComposerControl>
              {openMenu === 'agent' && (
                <ComposerMenu label="Agent" className="absolute bottom-full left-0 mb-2 w-64">
                  <ComposerMenuLabel>ACP agents</ComposerMenuLabel>
                  {acpAgents.map((a) => (
                    <ComposerMenuItem
                      key={a.id}
                      selected={composerTarget?.kind === 'acp' && composerTarget.id === a.id}
                      disabled={!a.available}
                      className={cn('justify-between', !a.available && 'opacity-45')}
                      title={a.available ? a.description : `${a.command} not found in PATH`}
                      onClick={() => {
                        if (!a.available) return;
                        setComposerTarget({ kind: 'acp', id: a.id, model: a.defaultModel });
                        closeAll();
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <AgentIcon id={a.id} name={a.name} isACP size={14} className="size-3.5 shrink-0" />
                        <span className="truncate">{a.name}</span>
                        <span className="rounded border border-primary/30 bg-primary/15 px-1 py-px text-3xs font-semibold uppercase text-primary">ACP</span>
                      </span>
                      {composerTarget?.kind === 'acp' && composerTarget.id === a.id ? (
                        <ComposerMenuCheck />
                      ) : (
                        !a.available && <span className="text-3xs text-fg-tertiary">not installed</span>
                      )}
                    </ComposerMenuItem>
                  ))}
                  <ComposerMenuLabel>Forge agents</ComposerMenuLabel>
                  {agents.map((a) => (
                    <ComposerMenuItem
                      key={a.id}
                      selected={composerTarget?.kind !== 'acp' && (composerTarget?.id || sessionAgentId) === a.id}
                      onClick={() => {
                        setComposerTarget({ kind: 'native', id: a.id, model: a.model || undefined });
                        closeAll();
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <AgentIcon id={a.id} name={a.name} size={14} className="size-3.5 shrink-0" />
                        <span className="truncate">{a.name}</span>
                      </span>
                      {(composerTarget?.kind !== 'acp' ? composerTarget?.id : sessionAgentId) === a.id && <ComposerMenuCheck />}
                    </ComposerMenuItem>
                  ))}
                </ComposerMenu>
              )}
            </div>

            {/* Model picker (hidden for ACP sessions — the agent owns its model) */}
            {!sessionIsACP && composerTarget?.kind !== 'acp' && (
              <div className="relative flex shrink-0 items-center">
                <ComposerControl
                  pressed={openMenu === 'model'}
                  aria-label={`Model: ${activeModel || 'default'}`}
                  title="Model"
                  className="min-w-0 font-mono text-3xs"
                  onClick={() => {
                    setModelSearch('');
                    setOpenMenu(openMenu === 'model' ? null : 'model');
                  }}
                >
                  <Zap aria-hidden="true" />
                  <span className="min-w-0 max-w-32 truncate">{activeModel || 'default'}</span>
                  <ComposerChevron />
                </ComposerControl>
                {openMenu === 'model' && (
                  <ComposerMenu label="Model" className="absolute bottom-full left-0 mb-2 w-72">
                    <ComposerMenuSearch value={modelSearch} onChange={setModelSearch} placeholder="Search models…" />
                    <div className="max-h-56 overflow-y-auto p-1 pt-0.5">
                      {groupedModels.length === 0 && (
                        <div className="px-2 py-1.5 text-ui-xs italic text-fg-tertiary">No models match</div>
                      )}
                      {groupedModels.map(([provider, models]) => (
                        <div key={provider}>
                          <div className="px-2 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-tertiary">{provider}</div>
                          {models.map((m) => {
                            const isSelected = activeModel === m.id;
                            return (
                              <ComposerMenuItem
                                key={m.id}
                                role="menuitemradio"
                                selected={isSelected}
                                className="justify-between"
                                onClick={() => {
                                  setActiveModel(m.id);
                                  if (composerTarget) setComposerTarget({ ...composerTarget, model: m.id } as ComposerTarget);
                                  closeAll();
                                }}
                              >
                                <span className="truncate">{m.name || m.id}</span>
                                {isSelected && <ComposerMenuCheck />}
                              </ComposerMenuItem>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </ComposerMenu>
                )}
              </div>
            )}

            {/* Workspace chip (session view) */}
            {wsName && (
              <ComposerControl
                className="hidden shrink-0 font-mono text-3xs text-muted-foreground/70 sm:flex"
                title={sessionMeta.workspace || activeWorkspacePath}
                onClick={() => {}}
              >
                <FolderOpen aria-hidden="true" />
                <span className="max-w-24 truncate">{wsName}</span>
              </ComposerControl>
            )}
          </div>

          {/* Right controls: send / stop (+ steer while running) */}
          <div className="relative ml-auto flex shrink-0 items-center gap-1.5">
            {running ? (
              <div className="flex shrink-0 items-center gap-1.5">
                {prompt.trim() && (
                  <button
                    type="button"
                    onClick={submit}
                    aria-label="Steer agent now"
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full bg-message-action px-2.5 text-ui-xs font-medium text-message-action-foreground shadow-xs transition-colors hover:bg-message-action-hover"
                    title="Steer running agent immediately"
                  >
                    <Compass className="size-3" />
                    <span>Steer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => stopTask(sessionId || undefined)}
                  aria-label="Stop execution"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs transition-colors hover:bg-destructive"
                  title="Stop execution"
                >
                  <Square className="size-2.5 fill-current" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!prompt.trim()}
                aria-label="Send message"
                className={cn(
                  'relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-message-action text-message-action-foreground shadow-xs transition-all duration-150 hover:scale-105 hover:bg-message-action-hover active:scale-100',
                  'shadow-[inset_0_1px_rgb(255_255_255/16%)] disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none disabled:hover:scale-100',
                  isCompact ? 'size-7' : 'size-8'
                )}
                title="Send"
              >
                <ArrowUp className={isCompact ? 'size-3.5' : 'size-4'} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Approval card (ACP permission) renders above via ApprovalCard in parent */}
      {openMenu === null && null}
    </div>
  );
};
