import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowDown,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GitBranch,
  Loader2,
  PanelRight,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  FileDiff as FileDiffIcon,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { SessionMessage, ToolCallRecord } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolExecutionCard, ToolSkillBlock, ToolExecution } from './ToolBlockViews';
import { WorkLogList } from './WorkLog';
import { ApprovalCard } from '../agentui/ApprovalCard';
import { FloatingTaskTracker } from './FloatingTaskTracker';
import { AgentHomeView } from './AgentHomeView';
import { AgentTaskInputBar } from './AgentTaskInputBar';
import { BranchSelector } from './BranchSelector';
import { AgentRightSidebar, RightSidebarTab } from './AgentRightSidebar';
import { relativeTime } from '../../lib/time';
import { buildTimelineForTurn, TimelineItem } from '../../lib/timeline';
import { cn } from '../../lib/cn';

interface AgentActiveSessionViewProps {
  sessionId: string;
}

export const AgentActiveSessionView: React.FC<AgentActiveSessionViewProps> = ({ sessionId }) => {
  const sessions = useAppStore((s) => s.sessions);
  const messages = useAppStore((s) => s.messages);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const turnStart = useAgentStore((s) => s.turnStart);

  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>('git');
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [liveSec, setLiveSec] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentSession = sessions.find((s) => s.id === sessionId);
  const isTurnRunning = isGenerating || !!turnStart[sessionId];

  // Timer counter for active turn
  useEffect(() => {
    if (!isTurnRunning) {
      setLiveSec(0);
      return;
    }
    const startedAt = turnStart[sessionId] || Date.now();
    const interval = setInterval(() => {
      setLiveSec(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTurnRunning, turnStart, sessionId]);

  // Auto-scroll when pinned
  useEffect(() => {
    if (pinnedToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pinnedToBottom, isTurnRunning]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setPinnedToBottom(true);
    }
  };

  const openRightSidebarWithTab = (tab: RightSidebarTab) => {
    setRightSidebarTab(tab);
    setRightSidebarOpen(true);
  };

  const turnGroups = useMemo(() => buildTurnGroups(messages), [messages]);

  if (messages.length === 0) {
    return <AgentHomeView sessionId={sessionId} />;
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* Center Chat Lane */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Messages Transcript */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative min-w-0 flex-1 select-text overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4 sm:px-8"
        >
          {messages.length === 0 ? (
            <div className="space-y-3 py-24 text-center text-muted-foreground">
              <Sparkles className="mx-auto h-9 w-9 opacity-70 text-primary" />
              <p className="text-sm font-medium text-foreground">Ready for instructions</p>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                Type a task prompt below. The agent will explore files, execute tools, reasoning blocks, and propose git changes.
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full min-w-0 max-w-[48rem] space-y-6">
              {turnGroups.map((turn, i) => (
                <AgentTurnBlock
                  key={turn.key || i}
                  turn={turn}
                  isTurnRunning={isTurnRunning && i === turnGroups.length - 1}
                  liveSec={liveSec}
                />
              ))}
            </div>
          )}
        </div>

        {/* Floating task tracker if scrolled up */}
        {!pinnedToBottom && (
          <FloatingTaskTracker
            running={isTurnRunning}
            elapsedSeconds={liveSec}
            onScrollToBottom={scrollToBottom}
          />
        )}

        {/* Composer Dock */}
        <div className="shrink-0 pb-3 bg-background border-t border-border/30 pt-2">
          <ApprovalCard sessionId={sessionId} />
          <div className="mx-auto w-full px-4 sm:px-6 max-w-[50rem]">
            <AgentTaskInputBar
              sessionId={sessionId}
              placeholder="Ask anything, @ threads or files, $ skills, or / commands"
              isCompact={false}
              fillWidth
            />
          </div>
        </div>
      </div>

      {/* Right Drawer (Git Client, Diff Viewer, Subagents) */}
      {rightSidebarOpen && (
        <AgentRightSidebar
          initialTab={rightSidebarTab}
          onClose={() => setRightSidebarOpen(false)}
        />
      )}
    </div>
  );
};

/* ---- Turn Grouping & Presentation ---- */

interface TurnGroup {
  key: string;
  userMessage?: SessionMessage;
  assistantMessages: SessionMessage[];
}

function buildTurnGroups(messages: SessionMessage[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;

  for (const m of messages) {
    if (m.role === 'user') {
      current = { key: m.id, userMessage: m, assistantMessages: [] };
      groups.push(current);
    } else if (m.role === 'assistant') {
      if (!current) {
        current = { key: m.id, assistantMessages: [] };
        groups.push(current);
      }
      current.assistantMessages.push(m);
    }
  }

  return groups;
}

const AgentTurnBlock: React.FC<{
  turn: TurnGroup;
  isTurnRunning: boolean;
  liveSec: number;
}> = ({ turn, isTurnRunning, liveSec }) => {
  const [workOpen, setWorkOpen] = useState(isTurnRunning);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  // Auto-collapse when turn transitions from running to finished
  const prevRunningRef = useRef(isTurnRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isTurnRunning) {
      setWorkOpen(false);
    } else if (!prevRunningRef.current && isTurnRunning) {
      setWorkOpen(true);
    }
    prevRunningRef.current = isTurnRunning;
  }, [isTurnRunning]);

  const { processItems, finalItems } = useMemo(
    () => buildTimelineForTurn(turn.assistantMessages, isTurnRunning),
    [turn.assistantMessages, isTurnRunning]
  );

  // Extract thoughts, tool executions, and skills
  const thoughts = useMemo(() => {
    return processItems
      .filter((it) => it.kind === 'thought' && it.thought)
      .map((it) => it.thought!);
  }, [processItems]);

  const toolExecutions = useMemo(() => {
    return processItems
      .filter((it) => it.kind === 'tool' && it.tool)
      .map((it) => it.tool!);
  }, [processItems]);

  const skillTools = useMemo(() => {
    return toolExecutions.filter((t) => (t.toolName || '').toLowerCase().includes('skill'));
  }, [toolExecutions]);

  const regularTools = useMemo(() => {
    return toolExecutions.filter((t) => !(t.toolName || '').toLowerCase().includes('skill'));
  }, [toolExecutions]);

  const finalText = useMemo(() => {
    return finalItems.map((it) => it.text || '').join('\n\n').trim();
  }, [finalItems]);

  const hasWork = thoughts.length > 0 || toolExecutions.length > 0 || (isTurnRunning && !finalText);

  // Calculate total seconds worked
  const workSecs = useMemo(() => {
    const fromThoughts = thoughts.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
    if (fromThoughts > 0) return fromThoughts;
    const fromTools = Math.round(
      toolExecutions.reduce((acc, t) => acc + (t.durationMs || 0), 0) / 1000
    );
    if (fromTools > 0) return fromTools;
    return Math.max(toolExecutions.length * 2, 2);
  }, [thoughts, toolExecutions]);

  const toggleThought = (id: string) => {
    setExpandedThoughts((p) => ({ ...p, [id]: !p[id] }));
  };

  const toggleTool = (id: string) => {
    setExpandedTools((p) => ({ ...p, [id]: !p[id] }));
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {/* 1. User Message Bubble */}
      {turn.userMessage && <AgentUserBubble message={turn.userMessage} />}

      {/* 2. Assistant Turn */}
      {(turn.assistantMessages.length > 0 || isTurnRunning) && (
        <div className="w-full min-w-0 space-y-3">
          {/* Pinned Skills at top if any */}
          {skillTools.length > 0 && (
            <div className="w-full min-w-0 space-y-2">
              {skillTools.map((st) => (
                <ToolSkillBlock
                  key={st.id}
                  tool={st}
                  isOpen={expandedTools[st.id] ?? true}
                  onToggle={() => toggleTool(st.id)}
                />
              ))}
            </div>
          )}

          {/* WORKED ACCORDION GROUP (Thinking + Tools Calling) */}
          {hasWork ? (
            <div className="w-full min-w-0 max-w-full flex flex-col items-start space-y-2 border-b border-border/40 pb-2 pt-1">
              {/* Accordion Toggle Header */}
              <button
                type="button"
                aria-expanded={workOpen}
                onClick={() => setWorkOpen((prev) => !prev)}
                className="group/wb flex h-6 min-w-0 items-center gap-2 px-1 text-ui-xs tabular-nums cursor-pointer w-fit select-none rounded hover:bg-accent/50 transition-colors"
              >
                {isTurnRunning ? (
                  <span className="flex items-center gap-1.5 font-medium text-primary">
                    <Loader2 className="size-3 animate-spin" />
                    {liveSec > 0 ? `Working for ${liveSec}s` : 'Working…'}
                  </span>
                ) : (
                  <span className="text-muted-foreground group-hover/wb:text-foreground">
                    Worked for {workSecs}s
                  </span>
                )}
                {workOpen ? (
                  <ChevronDown className="size-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3 text-muted-foreground" />
                )}
              </button>

              {/* Accordion Body: Thinking + Tools Calling */}
              {workOpen && (
                <div className="w-full min-w-0 max-w-full space-y-2.5 my-1 pl-1">
                  {/* Thinking Blocks */}
                  {thoughts.map((th) => {
                    const isStreamingThis = isTurnRunning && th.id === thoughts[thoughts.length - 1]?.id;
                    const isOpen = expandedThoughts[th.id] ?? (isStreamingThis || thoughts.length === 1);
                    const durationText = th.durationSeconds && th.durationSeconds > 0
                      ? `${th.durationSeconds}s`
                      : 'a few seconds';

                    return (
                      <div key={th.id} className="w-full min-w-0 max-w-full">
                        <button
                          type="button"
                          onClick={() => toggleThought(th.id)}
                          className="flex items-center gap-2 text-ui-xs text-muted-foreground hover:text-foreground cursor-pointer select-none py-1"
                        >
                          <Brain className="size-3.5 text-muted-foreground shrink-0" />
                          <span className={cn('font-medium', isStreamingThis && 'text-primary')}>
                            {isStreamingThis
                              ? (liveSec > 0 ? `Thinking for ${liveSec}s` : 'Thinking…')
                              : `Thought · ${durationText}`}
                          </span>
                          {isOpen ? <ChevronDown className="size-3 opacity-70" /> : <ChevronRight className="size-3 opacity-70" />}
                        </button>

                        {isOpen && (
                          <div className="ml-5 max-h-72 overflow-y-auto rounded-lg border border-border/40 bg-chrome/40 p-2.5 text-ui-xs leading-relaxed text-muted-foreground select-text scrollbar-thin">
                            <MarkdownRenderer content={th.thoughtText} muted />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Regular Tool Calls List */}
                  {regularTools.length > 0 && (
                    <WorkLogList className="w-full my-1">
                      {regularTools.map((t, idx) => {
                        const isOpen = expandedTools[t.id] ?? (t.status === 'failed' || idx === regularTools.length - 1);
                        return (
                          <ToolExecutionCard
                            key={t.id}
                            tool={t}
                            isOpen={isOpen}
                            onToggle={() => toggleTool(t.id)}
                          />
                        );
                      })}
                    </WorkLogList>
                  )}
                </div>
              )}
            </div>
          ) : isTurnRunning ? (
            <div className="flex items-center gap-2 py-2 text-ui-sm text-primary">
              <Loader2 className="size-4 animate-spin" />
              <span>Thinking & running agent…</span>
            </div>
          ) : null}

          {/* 3. FINAL RESPONSE — OUTSIDE the collapsed work group */}
          {finalText && (
            <div className="w-full min-w-0 space-y-3 pt-1">
              <div className="text-ui-base text-foreground select-text leading-relaxed">
                <MarkdownRenderer content={finalText} />
              </div>
              <AgentActionFooter
                content={finalText}
                timestamp={turn.assistantMessages[turn.assistantMessages.length - 1]?.createdAt}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ---- User Message Bubble ---- */
const AgentUserBubble: React.FC<{ message: SessionMessage }> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex w-full flex-col items-end gap-1">
      <div className="relative max-w-[85%] rounded-2xl bg-message px-4 py-2.5 text-message-foreground shadow-xs select-text">
        <p className="whitespace-pre-wrap break-words text-ui-sm leading-relaxed [overflow-wrap:anywhere]">
          {message.content}
        </p>
      </div>
      <div className="flex items-center gap-2 pr-1 opacity-0 group-hover:opacity-100 transition-opacity text-2xs text-muted-foreground">
        <span>{relativeTime(message.createdAt)}</span>
        <button onClick={handleCopy} className="hover:text-foreground cursor-pointer" title="Copy text">
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </button>
      </div>
    </div>
  );
};

/* ---- Action Footer ---- */
const AgentActionFooter: React.FC<{ content: string; timestamp?: number }> = ({ content, timestamp }) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1.5 pt-1 text-2xs text-muted-foreground">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 rounded p-1 hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
        title="Copy response"
      >
        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>

      <button
        onClick={() => setLiked((p) => (p === 'up' ? null : 'up'))}
        className={cn(
          'rounded p-1 hover:bg-accent transition-colors cursor-pointer',
          liked === 'up' ? 'text-success' : 'hover:text-foreground'
        )}
        title="Helpful response"
      >
        <ThumbsUp className="size-3" />
      </button>

      <button
        onClick={() => setLiked((p) => (p === 'down' ? null : 'down'))}
        className={cn(
          'rounded p-1 hover:bg-accent transition-colors cursor-pointer',
          liked === 'down' ? 'text-destructive' : 'hover:text-foreground'
        )}
        title="Not helpful"
      >
        <ThumbsDown className="size-3" />
      </button>

      {timestamp && (
        <span className="ml-auto text-3xs font-mono text-muted-foreground/70">
          {relativeTime(timestamp)}
        </span>
      )}
    </div>
  );
};

export default AgentActiveSessionView;
