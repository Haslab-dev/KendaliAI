import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { MarkdownView } from '../MarkdownView';
import { AttachmentList } from './AttachmentList';
import { ToolExecutionCard, ToolExecution } from '../agent/ToolBlockViews';
import { WorkLogList } from '../agent/WorkLog';
import { ApprovalCard } from '../agentui/ApprovalCard';
import { AgentTaskInputBar, PromptSubmitOptions } from '../common/AgentTaskInputBar';
import { SubAgentPanel } from '../SubAgentPanel';
import { useAppStore } from '../../store/useAppStore';
import { ProfileBadge } from '../shell/ProfileBadge';
import { ChatTopControls, MobileDrawerTrigger } from '../shell/ChatTopControls';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Brain,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { relativeTime } from '../../lib/time';
import { cn } from '../../lib/cn';
import { ToolCallRecord } from '../../types';

interface ChatThreadProps {
  onToggleDrawer?: () => void;
  isDrawerOpen?: boolean;
}

function mapToolCallRecord(tc: ToolCallRecord): ToolExecution {
  const args = tc.arguments || {};
  let commandStr = '';
  if (typeof args === 'string') {
    commandStr = args;
  } else if (typeof args === 'object' && args !== null) {
    if (args.command || args.cmd || args.script || args.CommandLine) {
      commandStr = args.command || args.cmd || args.script || args.CommandLine;
    } else if (args.Path || args.path || args.filePath || args.FilePath || args.file) {
      commandStr = args.Path || args.path || args.filePath || args.FilePath || args.file;
    } else if (args.query || args.prompt || args.pattern) {
      commandStr = args.query || args.prompt || args.pattern;
    } else {
      commandStr = JSON.stringify(args);
    }
  }

  let status: ToolExecution['status'] = 'completed';
  if (tc.status === 'running') status = 'running';
  else if (tc.status === 'error' || tc.status === 'denied' || tc.status === 'failed') status = 'failed';
  else if (tc.status === 'success' || tc.status === 'completed') status = 'success';

  return {
    id: tc.id,
    toolName: tc.tool,
    command: commandStr,
    output: tc.output,
    status,
    durationMs: tc.durationMs,
  };
}

function formatMessageTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

export const ChatThread: React.FC<ChatThreadProps> = () => {
  const { activeAgent } = useProfileStore();
  const {
    activeSession,
    messages,
    isLoadingMessages,
    isStreaming,
    streamingContent,
    streamingThought,
    streamingToolCalls,
    sendMessage,
  } = useSessionStore();
  const { tasks, openSubAgentPanel, loadTasks } = useAppStore();
  const runningSubagents = useMemo(
    () => tasks.filter((t) => t.parentSessionId === activeSession?.id && t.status === 'running'),
    [tasks, activeSession?.id]
  );

  // Fallback poll while sub-agents run (event-driven updates are primary).
  useEffect(() => {
    if (runningSubagents.length === 0) return;
    const timer = setInterval(() => {
      void loadTasks();
    }, 5000);
    return () => clearInterval(timer);
  }, [runningSubagents.length, loadTasks]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, 'up' | 'down'>>({});
  const [expandedWork, setExpandedWork] = useState<Record<string, boolean>>({});
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const [liveElapsed, setLiveElapsed] = useState(0);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const streamStartRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Live timer counter when streaming
  useEffect(() => {
    if (isStreaming) {
      if (!streamStartRef.current) streamStartRef.current = Date.now();
      const interval = setInterval(() => {
        setLiveElapsed(Math.max(1, Math.round((Date.now() - (streamStartRef.current || Date.now())) / 1000)));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      streamStartRef.current = null;
      setLiveElapsed(0);
    }
  }, [isStreaming]);

  // Track user scroll position (and whether content passes under the top controls)
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    userScrolledUpRef.current = distanceFromBottom > 100;
    setHeaderScrolled(scrollTop > 24);
  }, []);

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (scrollRef.current && !userScrolledUpRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingThought, streamingToolCalls, isStreaming]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleThumb = (id: string, dir: 'up' | 'down') => {
    setLikedMap((prev) => ({
      ...prev,
      [id]: prev[id] === dir ? undefined! : dir,
    }));
  };

  const handleFollowUp = async (text: string, options?: PromptSubmitOptions) => {
    if (!activeSession) return;
    userScrolledUpRef.current = false;
    await sendMessage(text, {
      agentId: activeSession.agentId || activeAgent?.id,
      model: options?.model,
      engine: options?.engineKind,
      acpAgent: options?.engineKind === 'acp' ? options.engineId : undefined,
      attachments: options?.attachments,
    });
  };

  const toggleWork = (wbId: string) => {
    setExpandedWork((prev) => ({
      ...prev,
      [wbId]: prev[wbId] === undefined ? true : !prev[wbId],
    }));
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? true : !prev[id],
    }));
  };

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? true : !prev[id],
    }));
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-background text-foreground select-none relative overflow-hidden">
      {/* Mobile Drawer Trigger (hamburger with active dot, Muse AI parity) */}
      <MobileDrawerTrigger scrolled={headerScrolled} />
      {/* Floating controls (no header bar): top-right cluster + top-center profile */}
      <ChatTopControls showSessionMenu scrolled={headerScrolled} />
      <ProfileBadge scrolled={headerScrolled} />

      <div className="flex w-full min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-6 pt-24 pb-4 scrollbar-thin scrollbar-thumb-border"
      >
        <div className="chat-content-lane space-y-6">
          {isLoadingMessages && messages.length === 0 ? (
            <div className="py-20 text-center text-ui-xs text-muted-foreground animate-pulse">
              Loading transcript...
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            /* ForgeADE Empty State parity */
            <div className="py-24 text-center text-muted-foreground space-y-3">
              <Sparkles className="w-9 h-9 text-muted-foreground/60 mx-auto opacity-70" />
              <p className="font-medium text-sm text-foreground">Ready for instructions</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Type a task prompt below. The agent will explore files, execute tools, reasoning blocks, and propose changes.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isMsgLiked = likedMap[msg.id];
                const isCopied = copiedId === msg.id;

                const prevMsg = index > 0 ? messages[index - 1] : null;
                const showTimestamp =
                  !prevMsg ||
                  (msg.createdAt && prevMsg.createdAt && msg.createdAt - prevMsg.createdAt > 15 * 60 * 1000);

                if (isUser) {
                  return (
                    <React.Fragment key={msg.id || index}>
                      {showTimestamp && (
                        <div className="w-full flex items-center justify-center my-3 text-3xs font-medium text-muted-foreground/60 select-none">
                          <span>{formatMessageTime(msg.createdAt)}</span>
                        </div>
                      )}
                      {/* User Message Bubble (Muse AI style: vibrant blue pill with white text) */}
                      <div className="group/user-row flex flex-col items-end w-full gap-1">
                        <AttachmentList attachments={msg.attachments} />
                        <div className="relative max-w-[85%] sm:max-w-[75%] rounded-[20px] rounded-br-[4px] bg-[#0084ff] px-4 py-2.5 text-white shadow-sm select-text">
                          <p className="whitespace-pre-wrap break-words text-ui-sm leading-relaxed [overflow-wrap:anywhere] select-text font-normal">
                            {msg.content}
                          </p>
                        </div>
                        <div className="flex w-full max-w-[85%] sm:max-w-[75%] items-center justify-end gap-2 pr-1 text-2xs tabular-nums opacity-0 transition-opacity duration-200 group-hover/user-row:opacity-100 text-muted-foreground">
                          <span>{relativeTime(msg.createdAt)}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, msg.id || `u-${index}`)}
                            className="rounded p-1 hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                            title="Copy message"
                          >
                            {copiedId === (msg.id || `u-${index}`) ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                }

                /* ASSISTANT MESSAGE TURN */
                const hasWork = Boolean(msg.thought || (msg.toolCalls && msg.toolCalls.length > 0));
                const wbId = `wb-${msg.id || index}`;
                const workOpen = expandedWork[wbId] !== undefined ? expandedWork[wbId] : false;

                // Compute work duration in seconds
                let workSecs = 0;
                if (msg.durationMs && msg.durationMs > 0) {
                  workSecs = Math.max(1, Math.round(msg.durationMs / 1000));
                } else if (msg.toolCalls && msg.toolCalls.length > 0) {
                  const totalToolMs = msg.toolCalls.reduce((sum, t) => sum + (t.durationMs || 0), 0);
                  workSecs = totalToolMs > 0 ? Math.round(totalToolMs / 1000) : Math.max(msg.toolCalls.length * 2, 2);
                } else if (msg.thought) {
                  workSecs = 2;
                }

                return (
                  <div key={msg.id || index} className="group/msg flex flex-col items-start w-full space-y-3">
                    {/* WORKED-FOR ACCORDION (ForgeADE parity) */}
                    {hasWork && (
                      <div className="w-full flex flex-col items-start space-y-1.5 pt-0.5">
                        <button
                          type="button"
                          aria-expanded={workOpen}
                          onClick={() => toggleWork(wbId)}
                          className="group/wb flex h-6 min-w-0 items-center gap-1.5 px-1 text-ui-xs tabular-nums cursor-pointer w-fit select-none rounded hover:bg-accent/50 transition-colors"
                        >
                          <span className="text-muted-foreground group-hover/wb:text-foreground font-medium">
                            Worked for {workSecs}s
                          </span>
                          {workOpen ? (
                            <ChevronDown className="size-3 text-muted-foreground opacity-60" />
                          ) : (
                            <ChevronRight className="size-3 text-muted-foreground opacity-60" />
                          )}
                        </button>

                        {/* Accordion Content (Block Thinking & Block Tools) */}
                        {workOpen && (
                          <div className="w-full space-y-2 my-0.5 pl-1">
                            {/* Block Thinking (Brain icon + Thought row + Clean indent) */}
                            {msg.thought && (() => {
                              const isThoughtOpen = expandedThoughts[msg.id] ?? false;
                              return (
                                <div className="w-full">
                                  <button
                                    type="button"
                                    aria-expanded={isThoughtOpen}
                                    onClick={() => toggleThought(msg.id)}
                                    className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-ui-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground cursor-pointer select-none"
                                  >
                                    <Brain className="size-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium text-foreground/80">Thought · {workSecs}s</span>
                                    {isThoughtOpen ? (
                                      <ChevronDown className="size-3 opacity-60 rotate-90 transition-transform" />
                                    ) : (
                                      <ChevronRight className="size-3 opacity-60 transition-transform" />
                                    )}
                                  </button>
                                  {isThoughtOpen && (
                                    <div className="ms-6 max-h-[360px] overflow-y-auto whitespace-pre-wrap font-mono text-[length:var(--font-size-code,12px)] leading-relaxed text-muted-foreground/85 py-1.5 pr-2 select-text scrollbar-thin">
                                      <MarkdownView content={msg.thought} muted />
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Block Tools (WorkLogList with ToolExecutionCard) */}
                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                              <WorkLogList className="w-full my-1">
                                {msg.toolCalls.map((tc, idx) => {
                                  const toolExec = mapToolCallRecord(tc);
                                  const isToolOpen = expandedTools[tc.id] !== undefined
                                    ? expandedTools[tc.id]
                                    : (tc.status === 'error' || idx === msg.toolCalls!.length - 1);
                                  return (
                                    <ToolExecutionCard
                                      key={tc.id}
                                      tool={toolExec}
                                      isOpen={isToolOpen}
                                      onToggle={() => toggleTool(tc.id)}
                                    />
                                  );
                                })}
                              </WorkLogList>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Markdown Assistant Content (Muse AI parity: speech bubble card on mobile) */}
                    {msg.content && (
                      <div className="w-full text-ui-base leading-relaxed text-foreground select-text py-0.5 rounded-[20px] rounded-tl-[4px] bg-card/60 sm:bg-transparent border sm:border-0 border-border/40 p-3.5 sm:p-0 shadow-xs sm:shadow-none">
                        <MarkdownView content={msg.content} />
                      </div>
                    )}

                    {/* Message Action Footer Row */}
                    <div className="flex w-full items-center gap-1 opacity-70 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity duration-200">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                        title="Copy response"
                      >
                        {isCopied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleThumb(msg.id, 'up')}
                        className={`rounded p-1 transition-colors hover:bg-accent cursor-pointer ${
                          isMsgLiked === 'up' ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="Good response"
                      >
                        <ThumbsUp className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleThumb(msg.id, 'down')}
                        className={`rounded p-1 transition-colors hover:bg-accent cursor-pointer ${
                          isMsgLiked === 'down' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="Bad response"
                      >
                        <ThumbsDown className="size-3.5" />
                      </button>

                      {msg.model && (
                        <span className="ml-1 text-3xs font-mono text-muted-foreground/60 border border-border/40 rounded px-1 py-0.5">
                          {msg.model}
                        </span>
                      )}

                      <span className="ml-auto text-3xs tabular-nums text-muted-foreground/75 font-mono">
                        {relativeTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Streaming Live Turn (ForgeADE live progress) */}
              {isStreaming && (
                <div className="flex flex-col items-start w-full space-y-3">
                  {/* Live Working / Worked Header */}
                  {(streamingThought || streamingToolCalls.length > 0) && (
                    <div className="w-full flex flex-col items-start space-y-1.5 pt-0.5">
                      <div className="flex h-6 min-w-0 items-center gap-2 px-1 text-ui-xs tabular-nums select-none">
                        <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                        <span className="font-medium live-tool-shine">
                          {liveElapsed > 0 ? `Working for ${liveElapsed}s` : 'Working…'}
                        </span>
                      </div>

                      {/* Live Streaming Thought */}
                      {streamingThought && (
                        <div className="w-full pl-1">
                          <div className="flex items-center gap-1.5 text-ui-xs text-primary font-medium py-0.5 select-none">
                            <Brain className="size-3.5 text-primary animate-pulse shrink-0" />
                            <span className="live-tool-shine">
                              {liveElapsed > 0 ? `Thinking for ${liveElapsed}s` : 'Thinking…'}
                            </span>
                          </div>
                          <div className="ms-6 max-h-[360px] overflow-y-auto whitespace-pre-wrap font-mono text-[length:var(--font-size-code,12px)] leading-relaxed text-muted-foreground/85 py-1.5 pr-2 select-text scrollbar-thin">
                            <MarkdownView content={streamingThought} muted isStreaming />
                          </div>
                        </div>
                      )}

                      {/* Live Streaming Tool Calls (WorkLogList with ToolExecutionCard) */}
                      {streamingToolCalls.length > 0 && (
                        <WorkLogList className="w-full my-1 pl-1">
                          {streamingToolCalls.map((tc) => {
                            const toolExec = mapToolCallRecord(tc);
                            const isOpen = expandedTools[tc.id] ?? (tc.status === 'running' || tc.status === 'error');
                            return (
                              <ToolExecutionCard
                                key={tc.id}
                                tool={toolExec}
                                isOpen={isOpen}
                                onToggle={() => toggleTool(tc.id)}
                              />
                            );
                          })}
                        </WorkLogList>
                      )}
                    </div>
                  )}

                  {/* Live Streaming Text Response */}
                  {streamingContent && (
                    <div className="w-full text-ui-base leading-relaxed text-foreground select-text py-0.5">
                      <MarkdownView content={streamingContent} isStreaming />
                    </div>
                  )}

                  {/* Fallback spinner if turn just started */}
                  {!streamingThought && !streamingContent && streamingToolCalls.length === 0 && (
                    <div className="flex items-center gap-2 py-2 text-ui-sm text-primary select-none">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="live-tool-shine">Thinking…</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {runningSubagents.length > 0 && (
        <div className="w-full shrink-0 px-3 pt-1 sm:px-6">
          <button
            type="button"
            onClick={() => openSubAgentPanel(runningSubagents[0].sessionId)}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1.5 text-left text-ui-xs text-foreground transition-colors hover:bg-accent"
          >
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="font-medium">
              {runningSubagents.length} sub-agent{runningSubagents.length > 1 ? 's' : ''} running in parallel
            </span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Docked Floating Bottom Composer + Approval Card */}
      <div className="pt-2 pb-20 md:pb-5 px-3 sm:px-6 bg-background transition-colors w-full shrink-0">
        {activeSession?.id && <ApprovalCard sessionId={activeSession.id} />}
        <AgentTaskInputBar
          placeholder="Ask for follow-up changes"
          onSubmitPrompt={handleFollowUp}
        />
      </div>
      </div>

      {/* Live sub-agent panel (desktop); hidden until a task is focused */}
      <SubAgentPanel />
      </div>
    </div>
  );
};

export default ChatThread;
