import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, Copy, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { SessionMessage } from '../../types';
import { MarkdownView } from '../MarkdownView';
import { cn } from '../../lib/cn';
import { formatDuration, relativeTime } from '../../lib/time';
import { WorkGroup } from './WorkLog';

/* Transcript — the agent task chat surface (forgeADE parity): right-aligned
 * user bubbles, per-turn "Worked for Ns" collapsible work groups (thoughts +
 * tool rows), streamed markdown responses, auto-scroll with jump-to-latest. */

export const Transcript: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const messages = useAppStore((s) => s.messages);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const turnStart = useAgentStore((s) => s.turnStart);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [tick, setTick] = useState(0);

  // Re-render every second while a turn runs so the elapsed timer advances.
  const running = isGenerating || !!turnStart[sessionId];
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Track scroll position for the jump-to-latest pill.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setPinnedToBottom(atBottom);
  };

  useEffect(() => {
    if (pinnedToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pinnedToBottom]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setPinnedToBottom(true);
  };

  // Group consecutive assistant messages into per-turn blocks so the work
  // log + final answer render as one "Worked for Ns" card per user prompt.
  const blocks = useMemo(() => buildBlocks(messages), [messages, tick]);

  if (messages.length === 0) {
    return (
      <div className="h-full min-h-0 flex-1">
        <TranscriptEmpty />
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto w-full space-y-5 px-4 pb-6 pt-5 sm:px-6" style={{ maxWidth: 'var(--chat-content-max-width)' }}>
          {blocks.map((block, i) => (
            <TurnBlock key={block.key} block={block} running={running && i === blocks.length - 1} turnStart={turnStart[sessionId]} />
          ))}
        </div>
      </div>

      {!pinnedToBottom && (
        <button
          onClick={scrollToBottom}
          className="animate-in fade-in slide-in-from-bottom-2 absolute bottom-3 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/70 bg-popover/90 px-3 text-ui-xs text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-popover"
        >
          <ArrowDown size={12} />
          Jump to latest
        </button>
      )}
    </div>
  );
};

/* ---- Turn blocking ------------------------------------------------------- */

interface TurnBlock {
  key: string;
  user?: SessionMessage;
  work: SessionMessage[];
}

function buildBlocks(messages: SessionMessage[]): TurnBlock[] {
  const blocks: TurnBlock[] = [];
  let current: TurnBlock | null = null;
  for (const m of messages) {
    if (m.role === 'user' || m.senderType === 'routine') {
      current = { key: m.id, user: m, work: [] };
      blocks.push(current);
    } else if (m.role === 'assistant') {
      if (!current) {
        current = { key: m.id, work: [] };
        blocks.push(current);
      }
      current.work.push(m);
    }
    // system / tool rows are folded into the surrounding block.
  }
  return blocks;
}

const TurnBlock: React.FC<{ block: TurnBlock; running: boolean; turnStart?: number }> = ({ block, running, turnStart }) => {
  const turnRunning = running && block.work.length > 0;
  const startedAt = turnStart || block.work[0]?.createdAt;
  const elapsed =
    startedAt && turnRunning
      ? formatDuration((Date.now() - (startedAt < 1e12 ? startedAt * 1000 : startedAt)))
      : null;

  // Merge the per-turn work: thoughts + tool calls across assistant rows.
  const thought = block.work.map((m) => m.thought || '').join('').trim() || undefined;
  const toolCalls = block.work.flatMap((m) => m.toolCalls || []);
  const finalText = block.work.map((m) => m.content || '').join('').trim();
  const lastWork = block.work[block.work.length - 1];

  return (
    <div className="space-y-2.5">
      {block.user && <UserBubble message={block.user} />}
      {(block.work.length > 0 || turnRunning) && (
        <WorkGroup
          runningLabel={turnRunning ? 'Working' : null}
          elapsed={elapsed}
          thought={thought}
          toolCalls={toolCalls}
        />
      )}
      {finalText && (
        <div className="group/response">
          <div className="markdown-content stream-in text-foreground">
            <MarkdownView content={finalText} isStreaming={turnRunning} />
          </div>
          <ResponseFooter message={lastWork} />
        </div>
      )}
    </div>
  );
};

const UserBubble: React.FC<{ message: SessionMessage }> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/user flex justify-end">
      <div className="max-w-[80%]">
        <div className="rounded-2xl bg-message px-3.5 py-2.5 text-message-foreground" style={{ borderRadius: '1.125rem' }}>
          <p className="whitespace-pre-wrap break-words text-ui-base leading-relaxed">{message.content}</p>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1.5 opacity-0 transition-opacity group-hover/user:opacity-100">
          <span className="text-3xs text-subtle-fg">{relativeTime(message.createdAt)}</span>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex items-center gap-1 rounded p-0.5 text-3xs text-subtle-fg transition-colors hover:text-foreground"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ResponseFooter: React.FC<{ message?: SessionMessage }> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  return (
    <div className="mt-1.5 flex items-center gap-2 opacity-0 transition-opacity group-hover/response:opacity-100">
      <button
        onClick={() => {
          if (message) navigator.clipboard?.writeText(message.content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="flex items-center gap-1 rounded p-0.5 text-3xs text-subtle-fg transition-colors hover:text-foreground"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        Copy
      </button>
      <button
        onClick={() => setVote(vote === 'up' ? null : 'up')}
        className={cn('rounded p-0.5 text-subtle-fg transition-colors hover:text-foreground', vote === 'up' && 'text-success')}
      >
        <ThumbsUp size={11} />
      </button>
      <button
        onClick={() => setVote(vote === 'down' ? null : 'down')}
        className={cn('rounded p-0.5 text-subtle-fg transition-colors hover:text-foreground', vote === 'down' && 'text-destructive')}
      >
        <ThumbsDown size={11} />
      </button>
      {message && <span className="text-3xs text-subtle-fg">{relativeTime(message.createdAt)}</span>}
    </div>
  );
};

/** Empty transcript state — the workspace is ready for instructions. */
export const TranscriptEmpty: React.FC<{ workspaceName?: string }> = ({ workspaceName }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
      <Sparkles size={22} />
    </span>
    <div>
      <h2 className="text-ui-lg font-semibold text-foreground">
        {workspaceName ? `Ready for instructions in ${workspaceName}` : 'Ready for instructions'}
      </h2>
      <p className="mt-1 max-w-sm text-ui-sm leading-relaxed text-muted-foreground">
        Describe a task and your agent will work through it — files, terminal, research — streaming every step here.
      </p>
    </div>
  </div>
);
