import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Brain, Check, Copy, Loader2, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { SessionMessage } from '../../types';
import { MarkdownView } from '../MarkdownView';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/time';
import { WorkLogList, WorkLogRow } from './worklog';
import { AgentComposer } from './AgentComposer';
import { ApprovalCard } from '../agentui/ApprovalCard';

/* AgentSessionView — ported from forge-ade's AgentActiveSessionView: the
 * centered chat lane, user bubbles (80% max, rounded-2xl bg-message), the
 * "Working for Ns"/"Worked for Ns" collapsible process group, the final
 * markdown response, and the hover-reveal action footer. */

export const ForgeAgentSession: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const messages = useAppStore((s) => s.messages);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const turnStart = useAgentStore((s) => s.turnStart);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [tick, setTick] = useState(0);

  const turnRunning = isGenerating || !!turnStart[sessionId];
  useEffect(() => {
    if (!turnRunning) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [turnRunning]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  useEffect(() => {
    if (pinnedToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pinnedToBottom]);

  const turns = useMemo(() => buildTurns(messages), [messages, tick]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Transcript */}
      <div ref={scrollRef} onScroll={onScroll} className="relative min-w-0 w-full flex-1 select-text overflow-y-auto overflow-x-hidden px-6 pb-6 pt-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="space-y-3 py-24 text-center text-foreground-subtlest">
            <Sparkles className="mx-auto h-9 w-9 opacity-70" />
            <p className="text-sm font-medium text-foreground-subtle">Ready for instructions</p>
            <p className="mx-auto max-w-sm text-xs text-foreground-subtlest">
              Type a task prompt below. The agent will explore files, execute tools, and propose changes.
            </p>
          </div>
        ) : (
          <div className="chat-content-lane mx-auto w-full min-w-0 max-w-[48rem] space-y-6">
            {turns.map((turn) => (
              <TurnBlock key={turn.key} turn={turn} running={turnRunning} turnStart={turnStart[sessionId]} sessionId={sessionId} />
            ))}
          </div>
        )}
      </div>

      {!pinnedToBottom && messages.length > 0 && (
        <button
          onClick={() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            setPinnedToBottom(true);
          }}
          className="animate-in fade-in absolute bottom-3 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/70 bg-popover/90 px-3 text-ui-xs text-foreground shadow-lg backdrop-blur-md"
        >
          <ArrowDown size={12} />
          Jump to latest
        </button>
      )}

      {/* Composer dock */}
      <div className="shrink-0 pb-3">
        <ApprovalCard sessionId={sessionId} />
        <div className="mx-auto w-full px-4 sm:px-6" style={{ maxWidth: 'calc(48rem + 3rem)' }}>
          <AgentComposer sessionId={sessionId} isCompact placeholder="Ask anything, @ files, /doc: for knowledge" />
        </div>
      </div>
    </div>
  );
};

/* ---- Turn model ----------------------------------------------------------- */

interface Turn {
  key: string;
  user?: SessionMessage;
  work: SessionMessage[];
}

function buildTurns(messages: SessionMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const m of messages) {
    if (m.role === 'user') {
      current = { key: m.id, user: m, work: [] };
      turns.push(current);
    } else if (m.role === 'assistant') {
      if (!current) {
        current = { key: m.id, work: [] };
        turns.push(current);
      }
      current.work.push(m);
    }
  }
  return turns;
}

const TurnBlock: React.FC<{ turn: Turn; running: boolean; turnStart?: number; sessionId: string }> = ({
  turn,
  running,
  turnStart,
}) => {
  const [workOpen, setWorkOpen] = useState(true);
  const isTurnRunning = running && !!turn.work.length;
  const startedAt = turnStart || turn.work[0]?.createdAt;
  const startedMs = startedAt ? (startedAt < 1e12 ? startedAt * 1000 : startedAt) : 0;
  const liveSec = startedMs && isTurnRunning ? Math.max(0, Math.round((Date.now() - startedMs) / 1000)) : 0;
  const workingLabel = liveSec > 0 ? `Working for ${liveSec}s` : 'Working…';

  // Final response text (outside the work group).
  const finalText = turn.work.map((m) => m.content || '').join('').trim();
  // Process items: thoughts + tool calls.
  const thought = turn.work.map((m) => m.thought || '').join('').trim();
  const toolCalls = turn.work.flatMap((m) => m.toolCalls || []);
  const hasWork = !!thought || toolCalls.length > 0;

  // "Worked for Ns": first work event → last work event, 1s minimum.
  const firstAt = turn.work[0]?.createdAt || 0;
  const lastAt = turn.work[turn.work.length - 1]?.createdAt || 0;
  const workedSecs = Math.max(1, Math.round((lastAt - firstAt) || 1));

  // Collapse automatically once the turn completes (forge behaviour).
  useEffect(() => {
    if (!isTurnRunning) setWorkOpen(false);
  }, [isTurnRunning]);

  return (
    <div className="group/msg w-full min-w-0 max-w-full space-y-4 scroll-mt-6">
      {turn.user && <UserBubble message={turn.user} />}

      {(turn.work.length > 0 || isTurnRunning) && (
        <>
          {/* 1. WORKED-FOR HEADER & PROCESS GROUP */}
          {hasWork ? (
            <div className="flex w-full min-w-0 max-w-full flex-col items-start space-y-2 border-b border-border/50 pb-2 pt-1">
              <button
                type="button"
                aria-expanded={workOpen}
                onClick={() => setWorkOpen((o) => !o)}
                className="group/wb flex h-6 w-fit min-w-0 cursor-pointer select-none items-baseline gap-2 px-1 text-ui-sm tabular-nums"
              >
                <span
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'block truncate',
                    isTurnRunning ? 'live-tool-shine' : 'text-muted-foreground group-hover/wb:text-foreground'
                  )}
                >
                  {isTurnRunning ? workingLabel : `Worked for ${workedSecs}s`}
                </span>
                {workOpen ? (
                  <ChevronDownSmall />
                ) : (
                  <ChevronRightSmall />
                )}
              </button>

              {workOpen && (
                <div className="my-1 w-full min-w-0 max-w-full space-y-2.5">
                  {thought && <ThoughtBlock thought={thought} />}
                  {toolCalls.length > 0 && (
                    <WorkLogList className="my-1 w-full">
                      {toolCalls.map((tc, i) => (
                        <WorkLogRow key={tc.id || i} tc={tc} />
                      ))}
                    </WorkLogList>
                  )}
                </div>
              )}
            </div>
          ) : isTurnRunning ? (
            <div className="flex w-fit select-none flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <span role="status" aria-live="polite" className="animated-gradient-text py-1 text-ui-lg font-medium">
                  {workingLabel}
                </span>
                <Loader2 className="size-4 animate-spin-slow text-foreground-subtle" />
              </div>
            </div>
          ) : null}

          {/* 2. FINAL RESPONSE — outside the collapsed work group */}
          {finalText && (
            <div className="w-full min-w-0 max-w-full space-y-3">
              <div className="markdown-content stream-in text-foreground">
                <MarkdownView content={finalText} isStreaming={isTurnRunning} />
              </div>
              <ActionFooter message={turn.work[turn.work.length - 1]} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ChevronDownSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-icon-muted opacity-0 transition-opacity group-hover/wb:opacity-100">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const ChevronRightSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-icon-muted">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/* ---- User bubble (Kybern style, forge exact) ------------------------------ */

const UserBubble: React.FC<{ message: SessionMessage }> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/user-row flex w-full min-w-0 max-w-full flex-col items-end gap-1">
      <div className="relative max-w-[80%] select-text rounded-2xl bg-message p-3 text-message-foreground">
        <p className="min-w-0 select-text whitespace-pre-wrap break-words text-ui-base font-normal leading-relaxed text-message-foreground [overflow-wrap:anywhere]">
          {message.content}
        </p>
      </div>
      <div className="flex w-full max-w-[80%] items-center justify-end gap-2 pe-1 text-xs tabular-nums opacity-0 transition-opacity duration-200 group-hover/user-row:opacity-100">
        <p className="text-fg-tertiary">{relativeTime(message.createdAt)}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Copy"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
};

/* ---- Thought row (trajectory reasoning) ----------------------------------- */

const ThoughtBlock: React.FC<{ thought: string }> = ({ thought }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-fit cursor-pointer select-none items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-ui-sm transition-colors hover:bg-accent/70"
      >
        <Brain className="size-4 shrink-0 text-trajectory-reasoning" />
        <span className="text-ui-sm text-secondary-label">Thought</span>
        {!open && <span className="truncate text-ui-xs text-fg-tertiary">· {thought.slice(0, 80)}…</span>}
      </button>
      {open && (
        <div className="ms-7 mt-0.5 max-h-96 cursor-auto select-text overflow-auto whitespace-pre-wrap break-words px-0.5 py-1 font-mono text-3xs leading-relaxed text-secondary-label">
          {thought}
        </div>
      )}
    </div>
  );
};

/* ---- Action footer (t3 assistant meta: hover-reveal) ---------------------- */

const ActionFooter: React.FC<{ message?: SessionMessage }> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  return (
    <div className="flex w-full min-w-0 max-w-full items-center gap-0.5 px-1 py-0.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/msg:opacity-100">
      <button
        type="button"
        onClick={() => {
          if (message) navigator.clipboard?.writeText(message.content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Copy response"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => setVote((v) => (v === 'up' ? null : 'up'))}
        className={cn('cursor-pointer rounded p-1.5 transition-colors hover:bg-accent', vote === 'up' ? 'text-success' : 'text-muted-foreground hover:text-foreground')}
        title="Good response"
      >
        <ThumbsUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setVote((v) => (v === 'down' ? null : 'down'))}
        className={cn('cursor-pointer rounded p-1.5 transition-colors hover:bg-accent', vote === 'down' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground')}
        title="Bad response"
      >
        <ThumbsDown className="size-3.5" />
      </button>
    </div>
  );
};
