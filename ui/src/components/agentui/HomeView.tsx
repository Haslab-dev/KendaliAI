import React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { parseSessionMetadata } from '../../types';
import { Composer } from './Composer';
import { ApprovalCard } from './ApprovalCard';

/* HomeView — the empty-state landing for the Agent workspace: brand glyph,
 * "What should we do in {workspace}?", and the centered glass composer. */

export const HomeView: React.FC = () => {
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const openNewTask = useAgentStore((s) => s.openNewTask);
  const acpAgents = useAgentStore((s) => s.acpAgents);
  const workspaceName = activeWorkspacePath ? activeWorkspacePath.split('/').filter(Boolean).pop() : '';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-2">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-composer">
          <Sparkles size={26} strokeWidth={2} />
        </span>
        <h1 className="text-ui-xl font-semibold tracking-tight text-foreground">
          {workspaceName ? `What should we do in ${workspaceName}?` : 'What should we do today?'}
        </h1>
        <p className="mt-1.5 max-w-md text-center text-ui-sm leading-relaxed text-muted-foreground">
          Start a task with a Forge agent or plug in an external ACP agent — Claude Code, Gemini, Codex — all streamed to your browser.
        </p>

        {acpAgents.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {acpAgents.map((a) => (
              <button
                key={a.id}
                onClick={() => openNewTask({ kind: 'acp', agentId: a.id })}
                title={a.description || a.command}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-ui-xs transition-colors ${
                  a.available
                    ? 'border-border bg-card text-foreground/85 hover:border-primary/40 hover:bg-primary/5'
                    : 'cursor-not-allowed border-border/60 bg-accent/40 text-subtle-fg'
                }`}
              >
                <Sparkles size={11} className={a.available ? 'text-primary' : ''} />
                {a.name}
                <span className="rounded border border-primary/30 bg-primary/15 px-1 py-px text-3xs font-semibold uppercase text-primary">
                  ACP
                </span>
                {!a.available && <span className="text-3xs">not installed</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pb-2">
        <HomeComposer />
      </div>
    </div>
  );
};

/* The home composer needs a target session to send into: pressing send on an
 * empty workspace opens the New Task modal. */
const HomeComposer: React.FC = () => {
  const activeAgentSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const openNewTask = useAgentStore((s) => s.openNewTask);
  const sessions = useAppStore((s) => s.sessions);
  const active = sessions.find((s) => s.id === activeAgentSessionId);
  const hasTranscript = !!active;

  if (hasTranscript) {
    return (
      <>
        <ApprovalCard sessionId={activeAgentSessionId!} />
        <Composer />
      </>
    );
  }

  return (
    <div className="mx-auto w-full px-4 pb-6 sm:px-6" style={{ maxWidth: 'var(--chat-content-max-width)' }}>
      <button
        onClick={() => openNewTask()}
        className="composer-surface flex w-full items-center gap-3 px-4 py-3.5 text-left transition-transform hover:scale-[1.005]"
      >
        <Plus size={16} className="shrink-0 text-muted-foreground" />
        <span className="text-ui-base text-muted-foreground">Describe a task to create a new one…</span>
        <span className="ml-auto shrink-0 rounded-md border border-border/70 bg-accent/60 px-2 py-0.5 font-mono text-3xs text-muted-foreground">
          ⌘N
        </span>
      </button>
    </div>
  );
};
