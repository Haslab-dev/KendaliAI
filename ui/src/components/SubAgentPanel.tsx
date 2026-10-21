import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, CircleDot, Loader2, Send, Wrench, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { sendPanelInstruction } from '../hooks/useAgentSocket';
import { GrokAvatar } from './GrokAvatar';
import { MarkdownView } from './MarkdownView';
import { WorkLogList } from './agentui/WorkLog';
import { SessionMessage } from '../types';
import { IconButton } from './ui';

// Side panel into a background sub-agent session (forge-ade style): shows the
// live process (tool steps + streaming output) and accepts instructions sent
// directly to the sub-agent without leaving the main chat. Subtask sessions
// never render as a main-chat conversation — this panel is the only window.
export const SubAgentPanel: React.FC = () => {
  const {
    subagentPanelSessionId,
    subagentPanelSession,
    subagentPanelMessages,
    closeSubAgentPanel,
    agents,
    tasks,
  } = useAppStore();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const runningTask = useMemo(
    () => tasks.find((t) => t.sessionId === subagentPanelSessionId && t.status === 'running'),
    [tasks, subagentPanelSessionId]
  );

  const lastMsg = subagentPanelMessages[subagentPanelMessages.length - 1];
  const isStreaming = !!lastMsg && lastMsg.id.startsWith('panel-stream-');
  const isWorking = !!runningTask || isStreaming;

  const agent = agents.find((a) => a.id === subagentPanelSession?.agentId);
  const agentName = agent?.name || subagentPanelSession?.title?.replace(/^🛰\s*/, '') || 'Sub-Agent';
  const model = agent?.model || subagentPanelMessages.find((m) => m.model && m.model !== 'subagent')?.model;

  const totalSteps = useMemo(
    () => subagentPanelMessages.reduce((n, m) => n + (m.toolCalls?.length || 0), 0),
    [subagentPanelMessages]
  );

  // Keep the live tail pinned to the bottom while working.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [subagentPanelMessages]);

  if (!subagentPanelSessionId) return null;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendPanelInstruction(subagentPanelSessionId, trimmed);
    setInput('');
  };

  return (
    <div className="animate-in fade-in hidden h-full w-[380px] shrink-0 flex-col border-l border-border/70 bg-card lg:flex xl:w-[420px]">
      {/* Header */}
      <div className="flex shrink-0 select-none items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5">
        <GrokAvatar id={agent?.avatar || subagentPanelSession?.agentId || 'purple-pebble'} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-ui-sm font-semibold text-foreground">{agentName}</span>
            {model && (
              <span className="shrink-0 rounded border border-border/60 bg-accent/60 px-1.5 font-mono text-3xs text-muted-foreground">
                {model}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-3xs">
            {isWorking ? (
              <span className="flex items-center gap-1 font-semibold text-primary">
                <Loader2 size={9} className="animate-spin-slow" /> RUNNING
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-success">
                <CircleDot size={9} /> IDLE
              </span>
            )}
            {totalSteps > 0 && (
              <span className="flex items-center gap-1 text-subtle-fg">
                <Wrench size={8} /> {totalSteps} steps
              </span>
            )}
          </div>
        </div>
        <IconButton icon={X} size={15} tooltip="Close panel" onClick={closeSubAgentPanel} />
      </div>

      {/* Process tail */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {subagentPanelMessages.length === 0 && (
          <div className="py-8 text-center text-ui-xs text-muted-foreground">Loading sub-agent worklog…</div>
        )}
        {subagentPanelMessages.map((msg) => (
          <PanelMessage key={msg.id} msg={msg} senderName={agentName} isWorking={isWorking} />
        ))}
      </div>

      {/* Direct instruction input */}
      <div className="shrink-0 border-t border-border/60 px-3 py-2.5">
        <div className="flex items-end gap-1.5 rounded-2xl border border-border/70 bg-accent/50 px-2.5 py-1.5 transition-colors focus-within:border-primary/50">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Instruct ${agentName}…`}
            className="max-h-28 flex-1 resize-none bg-transparent py-1 text-ui-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`shrink-0 rounded-full p-1.5 transition-all ${
              input.trim() ? 'cursor-pointer bg-message text-message-foreground hover:scale-105' : 'cursor-not-allowed text-subtle-fg'
            }`}
            title="Send instruction to sub-agent"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="mt-1 px-1 font-mono text-3xs select-none text-subtle-fg">
          goes straight to the sub-agent session · Enter to send
        </div>
      </div>
    </div>
  );
};

const PanelMessage: React.FC<{ msg: SessionMessage; senderName: string; isWorking: boolean }> = ({
  msg,
  senderName,
  isWorking,
}) => {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl bg-foreground px-3 py-2 text-ui-sm leading-relaxed text-background"
          style={{ borderRadius: '1rem 1rem 0.25rem 1rem' }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  const isEmptyStreaming = !msg.content && !msg.thought && (!msg.toolCalls || msg.toolCalls.length === 0);

  return (
    <div className="flex flex-col gap-1.5">
      {msg.thought && (
        <details className="group text-ui-xs text-muted-foreground">
          <summary className="flex cursor-pointer select-none items-center gap-1 font-mono text-3xs transition-colors hover:text-primary">
            reasoning
          </summary>
          <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/60 p-2 font-mono text-3xs leading-relaxed">
            {msg.thought}
          </div>
        </details>
      )}

      {/* Process steps — t3 work-log rows */}
      {msg.toolCalls && msg.toolCalls.length > 0 && <WorkLogList toolCalls={msg.toolCalls} />}

      {msg.content && (
        <div className="rounded-2xl border border-border/60 bg-muted/60 px-3 py-2.5">
          <MarkdownView content={msg.content} isStreaming={msg.id.startsWith('panel-stream-')} />
        </div>
      )}

      {isEmptyStreaming && isWorking && (
        <div className="flex items-center gap-2 px-1 text-ui-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="ml-1 flex items-center gap-1">
            <Bot size={11} /> {senderName} is working…
          </span>
        </div>
      )}
    </div>
  );
};
