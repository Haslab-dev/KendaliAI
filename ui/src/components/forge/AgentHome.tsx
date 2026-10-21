import React, { useState } from 'react';
import { Folder, ChevronDown } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { AgentComposer } from './AgentComposer';
import { ApprovalCard } from '../agentui/ApprovalCard';

/* AgentHomeView — ported from forge-ade's AgentHomeView: the Kybern empty
 * landing (brand spark + "What should we do in {project}?" heading with the
 * dotted-underline project button) and the centered composer with the
 * workspace landing tray. */

export const ForgeAgentHome: React.FC = () => {
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const activeAgentSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const startTask = useAgentStore((s) => s.startTask);
  const composerTarget = useAgentStore((s) => s.composerTarget);

  const hasActiveTask = !!activeAgentSessionId && sessions.some((s) => s.id === activeAgentSessionId);
  const workspaceName = activeWorkspacePath ? activeWorkspacePath.split('/').filter(Boolean).pop() : 'General';

  // The home composer submits into the active task when one exists; otherwise
  // it creates a native task first, then forwards the prompt (forge behaviour:
  // first message creates the session).
  const handleSubmitFirst = async (text: string) => {
    if (hasActiveTask && activeAgentSessionId) {
      await sendPrompt(text);
      return;
    }
    const id = await startTask({
      kind: composerTarget?.kind === 'acp' ? 'acp' : 'native',
      agentId: composerTarget?.id || 'personal-assistant',
      cwd: activeWorkspacePath || undefined,
      model: composerTarget?.model,
    });
    if (id) {
      await sendPrompt(text);
    }
  };

  const landingTray = (
    <div className="flex min-h-8 w-full flex-nowrap items-center gap-x-1.5 px-3 py-1 text-ui-xs text-muted-foreground">
      <div className="relative">
        <span className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-normal text-muted-foreground/70">
          <Folder className="size-3.5 shrink-0" />
          <span className="max-w-[180px] truncate">{workspaceName}</span>
        </span>
      </div>
      <span className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-normal text-muted-foreground/50">
        {composerTarget?.kind === 'acp' ? 'ACP session starts on send' : 'Forge session starts on send'}
      </span>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 select-none flex-col overflow-hidden bg-background transition-colors">
      <div className="flex min-h-0 w-full flex-1">
        {/* Centered draft body */}
        <div className="z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
          <div className="my-auto flex w-full max-w-[48rem] flex-col items-center justify-center gap-6">
            {/* Brand glyph + heading */}
            <div className="flex w-full select-none flex-col items-center gap-4 text-center">
              <div className="text-foreground">
                <svg width={56} height={56} viewBox="0 0 48 48" fill="currentColor" className="shrink-0" aria-hidden="true">
                  <path d="M24 3c1.6 10.6 6.4 16.7 20 21-13.6 4.3-18.4 10.4-20 21-1.6-10.6-6.4-16.7-20-21 13.6-4.3 18.4-10.4 20-21Z" />
                  <circle cx="39.5" cy="8.5" r="3.2" />
                </svg>
              </div>
              <h2 className="text-[26px] font-normal leading-[1.15] tracking-[-0.015em] text-foreground/95 sm:text-[30px]">
                What should we do in{' '}
                <span className="cursor-pointer rounded-xs text-inherit underline decoration-dotted decoration-[1.5px] underline-offset-[6px] transition-colors duration-150 ease-out hover:text-foreground/70">
                  {workspaceName}
                </span>
                ?
              </h2>
            </div>

            {/* Centered composer with landing tray */}
            <div className="w-full pt-2 select-text">
              {hasActiveTask && <ApprovalCard sessionId={activeAgentSessionId!} />}
              <div className={hasActiveTask ? 'mb-2' : ''}>
                <HomeComposer sessionId={hasActiveTask ? activeAgentSessionId : null} onSubmitFirst={handleSubmitFirst} headerNode={landingTray} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* Home composer wrapper: renders AgentComposer and intercepts the first send
 * when no task is active yet. AgentComposer sends via the store, so on the
 * home view we always route through onSubmitFirst. */
const HomeComposer: React.FC<{
  sessionId: string | null;
  onSubmitFirst: (text: string) => Promise<void>;
  headerNode: React.ReactNode;
}> = ({ sessionId, onSubmitFirst, headerNode }) => {
  if (sessionId) {
    return <AgentComposer sessionId={sessionId} autoFocus headerNode={headerNode} />;
  }
  return <HomeOnlyComposer onSubmitFirst={onSubmitFirst} headerNode={headerNode} />;
};

const HomeOnlyComposer: React.FC<{
  onSubmitFirst: (text: string) => Promise<void>;
  headerNode: React.ReactNode;
}> = ({ onSubmitFirst, headerNode }) => {
  const [text, setText] = useState('');
  const running = useAppStore((s) => s.isGenerating);
  return (
    <div className="composer-surface relative rounded-3xl p-1.5">
      {headerNode && <div className="chat-composer-stacked-top mx-auto -mb-px w-14/15 rounded-t-2xl border border-b-0 border-border/70">{headerNode}</div>}
      <div className="px-1.5 pt-1">
        <textarea
          rows={2}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !running) {
                const value = text.trim();
                setText('');
                void onSubmitFirst(value);
              }
            }
          }}
          placeholder="Ask anything, @ files, /doc: for knowledge"
          className="w-full resize-none border-0 bg-transparent font-sans text-[0.9375rem] leading-relaxed text-foreground placeholder:text-placeholder/75 focus:outline-none"
        />
      </div>
      <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2 px-3 pb-1.5 pt-1">
        <div className="flex items-center gap-1.5 pl-1 text-ui-xs text-fg-tertiary">
          <ChevronDown className="size-3" />
          Enter to start the task · the agent streams every step
        </div>
        <button
          type="button"
          disabled={!text.trim() || running}
          aria-label="Send message"
          className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-message-action text-message-action-foreground shadow-[inset_0_1px_rgb(255_255_255/16%)] transition-all duration-150 hover:scale-105 hover:bg-message-action-hover disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none"
          title="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 7-7 7 7M12 19V5" />
          </svg>
        </button>
      </div>
    </div>
  );
};
