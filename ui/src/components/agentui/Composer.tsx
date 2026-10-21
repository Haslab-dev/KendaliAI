import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Brain, ChevronDown, FolderOpen, Square, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore, ComposerTarget } from '../../store/useAgentStore';
import { parseSessionMetadata } from '../../types';
import { cn } from '../../lib/cn';
import { DropdownMenu, Badge, MenuItem, MenuLabel, MenuSeparator } from '../ui';
import { AgentIcon } from '../shell/AgentIcon';

/* Composer — the signature glass input (t3 parity): agent picker (native
 * personas + ACP roster with ACP badge), model picker, workspace chip, and
 * send/stop states. */

export const Composer: React.FC = () => {
  const activeSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const composerTarget = useAgentStore((s) => s.composerTarget);
  const setComposerTarget = useAgentStore((s) => s.setComposerTarget);
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const stopTask = useAgentStore((s) => s.stopTask);
  const acpSessions = useAgentStore((s) => s.acpSessions);
  const acpAgents = useAgentStore((s) => s.acpAgents);
  const sessions = useAppStore((s) => s.sessions);
  const agents = useAppStore((s) => s.agents);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const availableModels = useAppStore((s) => s.availableModels);
  const activeModel = useAppStore((s) => s.activeModel);
  const setActiveModel = useAppStore((s) => s.setActiveModel);

  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Draft persistence per session.
  useEffect(() => {
    if (activeSessionId) {
      setText(localStorage.getItem(`forge:draft:${activeSessionId}`) || '');
    }
  }, [activeSessionId]);
  useEffect(() => {
    if (activeSessionId) {
      if (text) localStorage.setItem(`forge:draft:${activeSessionId}`, text);
      else localStorage.removeItem(`forge:draft:${activeSessionId}`);
    }
  }, [text, activeSessionId]);

  // Auto-grow.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  const running = useMemo(() => {
    if (!activeSessionId) return false;
    const acp = acpSessions[activeSessionId];
    if (acp) return acp.status === 'running' || acp.status === 'awaiting_permission';
    return isGenerating;
  }, [activeSessionId, acpSessions, isGenerating]);

  const session = sessions.find((s) => s.id === activeSessionId);
  const sessionMeta = parseSessionMetadata(session);
  const sessionAgentId = sessionMeta.acpAgent || session?.agentId || composerTarget?.id || '';

  const submit = async () => {
    const value = text.trim();
    if (!value || !activeSessionId) return;
    setText('');
    localStorage.removeItem(`forge:draft:${activeSessionId}`);
    await sendPrompt(value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const nativeChoices = agents.length > 0 ? agents : [];
  const acpChoices = acpAgents;

  return (
    <div className="mx-auto w-full px-4 pb-4 sm:px-6" style={{ maxWidth: 'var(--chat-content-max-width)' }}>
      <div className="composer-surface p-1.5">
        <div className="flex items-end gap-1.5">
          {/* Agent picker */}
          <DropdownMenu
            width={250}
            side="top"
            trigger={
              <button
                className="mb-0.5 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-ui-xs font-medium text-muted-foreground transition-colors hover:bg-accent active:scale-[0.97] hover:text-foreground"
                title="Agent"
              >
                <AgentIcon id={sessionAgentId || 'agent'} isACP={composerTarget?.kind === 'acp' || sessionMeta.engine === 'acp'} size={12} />
                <span className="max-w-28 truncate">
                  {composerTarget?.kind === 'acp'
                    ? acpAgents.find((a) => a.id === composerTarget.id)?.name || composerTarget.id
                    : agents.find((a) => a.id === (sessionAgentId || composerTarget?.id))?.name || 'Agent'}
                </span>
                {composerTarget?.kind === 'acp' && (
                  <Badge variant="primary" className="px-1 py-0 text-3xs uppercase">
                    ACP
                  </Badge>
                )}
                <ChevronDown size={11} />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Forge agents</MenuLabel>
                {nativeChoices.map((a) => (
                  <MenuItem
                    key={a.id}
                    selected={composerTarget?.kind !== 'acp' && composerTarget?.id === a.id}
                    onClick={() => {
                      setComposerTarget({ kind: 'native', id: a.id, model: a.model || undefined });
                      close();
                    }}
                  >
                    <span className="flex w-full items-center gap-2">
                      <AgentIcon id={a.id} name={a.name} size={12} />
                      <span className="truncate">{a.name}</span>
                      <span className="ml-auto text-3xs text-subtle-fg">forge</span>
                    </span>
                  </MenuItem>
                ))}
                {acpChoices.length > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuLabel>ACP agents</MenuLabel>
                    {acpChoices.map((a) => (
                      <MenuItem
                        key={a.id}
                        selected={composerTarget?.kind === 'acp' && composerTarget.id === a.id}
                        onClick={() => {
                          if (!a.available) return;
                          setComposerTarget({ kind: 'acp', id: a.id, model: a.defaultModel });
                          close();
                        }}
                        className={cn(!a.available && 'opacity-45')}
                        title={a.available ? a.description : `${a.command} not found in PATH`}
                      >
                        <span className="flex w-full items-center gap-2">
                          <AgentIcon id={a.id} name={a.name} isACP size={12} />
                          <span className="truncate">{a.name}</span>
                          <span className="ml-auto flex items-center gap-1">
                            {!a.available && <span className="text-3xs text-subtle-fg">not installed</span>}
                            <Badge variant="primary" className="px-1 py-0 text-3xs uppercase">
                              ACP
                            </Badge>
                          </span>
                        </span>
                      </MenuItem>
                    ))}
                  </>
                )}
              </>
            )}
          </DropdownMenu>

          {/* Model picker (native engine only — ACP agents set model at start) */}
          {composerTarget?.kind !== 'acp' && (
            <DropdownMenu
              width={250}
              side="top"
              trigger={
                <button
                  className="mb-0.5 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-3xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Model"
                >
                  <Zap size={12} />
                  <span className="max-w-32 truncate">{activeModel || 'default'}</span>
                  <ChevronDown size={11} />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuLabel>Model</MenuLabel>
                  {availableModels.slice(0, 40).map((m) => (
                    <MenuItem
                      key={m.id}
                      selected={activeModel === m.id}
                      onClick={() => {
                        setActiveModel(m.id);
                        if (composerTarget) {
                          setComposerTarget({ ...composerTarget, model: m.id });
                        }
                        close();
                      }}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className="truncate">{m.name || m.id}</span>
                        <span className="text-3xs text-subtle-fg">{m.providerName}</span>
                      </span>
                    </MenuItem>
                  ))}
                </>
              )}
            </DropdownMenu>
          )}

          {/* Workspace chip */}
          {(sessionMeta.workspace || activeWorkspacePath) && (
            <button
              className="mb-0.5 hidden h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-3xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
              title={sessionMeta.workspace || activeWorkspacePath}
            >
              <FolderOpen size={12} />
              <span className="max-w-24 truncate">{sessionMeta.workspaceName || workspaceLeaf(activeWorkspacePath)}</span>
            </button>
          )}

          {/* Input */}
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={activeSessionId ? 'Describe the task… (@ for context, / for skills)' : 'Start a task to begin…'}
            className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-[0.9375rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
          />

          {/* Send / Stop */}
          {running ? (
            <button
              onClick={() => stopTask()}
              className="mb-0.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/90 text-white shadow-sm transition-transform hover:scale-105"
              title="Stop"
            >
              <Square size={12} className="fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() || !activeSessionId}
              className="mb-0.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-message text-message-foreground shadow-[inset_0_1px_rgb(255_255_255/16%)] transition-transform enabled:hover:scale-105 disabled:opacity-40"
              title="Send"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-center text-3xs text-subtle-fg">
        <Brain size={9} className="mr-1 inline" />
        Enter to send · Shift+Enter for a new line · the agent streams every step
      </p>
    </div>
  );
};

function workspaceLeaf(path: string): string {
  if (!path) return '';
  return path.split('/').filter(Boolean).pop() || path;
}
