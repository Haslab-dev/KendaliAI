import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { MarkdownView } from '../MarkdownView';
import { ToolExecutionCard, ToolExecution } from '../agent/ToolBlockViews';
import { WorkLogList } from '../agent/WorkLog';
import { ChatTopControls, MobileDrawerTrigger } from '../shell/ChatTopControls';
import {
  ArrowUp,
  Plus,
  Users,
  AtSign,
  Square,
  Sparkles,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Brain,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { SessionMessage, ToolCallRecord } from '../../types';
import { AgentIcon } from '../shell/AgentIcon';
import { relativeTime } from '../../lib/time';

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

export const GroupChatThread: React.FC = () => {
  const { activeGroup, agents } = useProfileStore();
  const {
    activeSession,
    messages,
    isLoadingMessages,
    isStreaming,
    streamingContent,
    streamingThought,
    streamingToolCalls,
    sendMessage,
    stopSession,
    createSessionForGroup,
  } = useSessionStore();

  const [input, setInput] = useState('');
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, 'up' | 'down'>>({});
  const [expandedWork, setExpandedWork] = useState<Record<string, boolean>>({});
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const [liveElapsed, setLiveElapsed] = useState(0);
  const streamStartRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Group members
  const memberAgents = agents.filter((a) =>
    activeGroup ? activeGroup.memberIds.includes(a.id) : false
  );

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

  // Track user scroll intent (and whether content passes under the top controls)
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    userScrolledUpRef.current = scrollHeight - (scrollTop + clientHeight) > 100;
    setHeaderScrolled(scrollTop > 24);
  }, []);

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (scrollRef.current && !userScrolledUpRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingThought, streamingToolCalls, isStreaming]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    const lastWord = val.split(/\s/).pop() || '';
    if (lastWord.startsWith('@')) {
      setShowMentionPopup(true);
    } else {
      setShowMentionPopup(false);
    }
  };

  const handleInsertMention = (handle: string) => {
    const words = input.split(/\s/);
    words.pop();
    words.push(`@${handle} `);
    setInput(words.join(' '));
    setShowMentionPopup(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isSending) return;
    const text = input.trim();
    setInput('');
    setShowMentionPopup(false);
    setIsSending(true);
    userScrolledUpRef.current = false;
    try {
      await sendMessage(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewChat = async () => {
    if (activeGroup) {
      await createSessionForGroup(activeGroup.id);
    }
  };

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
    <div className="flex-1 h-full flex flex-col min-w-0 bg-background relative overflow-hidden">
      {/* Mobile Drawer Trigger (hamburger with active dot, Muse AI parity) */}
      <MobileDrawerTrigger scrolled={headerScrolled} />

      {/* Floating controls (no header bar): top-right cluster + top-center group identity */}
      <ChatTopControls scrolled={headerScrolled}>
        <button
          onClick={handleNewChat}
          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New chat</span>
        </button>
      </ChatTopControls>

      {/* Floating group identity: enlarged stacked avatars + name beneath */}
      <div
        aria-label="Group members"
        title={`${activeGroup?.name || 'Group Chat'} — ${memberAgents.length} agents`}
        className="absolute left-1/2 top-4 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-1.5 transition-all duration-300 cursor-default select-none"
      >
        <div className="flex -space-x-2.5 shrink-0">
          {memberAgents.slice(0, 3).map((a, i) => (
            <div
              key={a.id}
              className="size-11 rounded-full flex items-center justify-center overflow-hidden shrink-0 bg-background ring-2 ring-background outline outline-1 outline-foreground/10"
              style={{ zIndex: 10 - i }}
            >
              <AgentIcon id={a.id} name={a.name} avatar={a.avatar} size={42} />
            </div>
          ))}
        </div>
        <span className="max-w-44 truncate rounded-full border border-border/40 bg-foreground/10 px-3 py-0.5 text-ui-xs font-semibold text-foreground backdrop-blur-md">
          {activeGroup?.name || 'Group Chat'}
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-8 pt-24 pb-6 space-y-6 scrollbar-thin scrollbar-thumb-border"
      >
        {messages.length === 0 ? (
          /* Empty / Initial State */
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto py-12">
            <div className="flex -space-x-3 mb-2">
              {memberAgents.map((a, i) => (
                <div
                  key={a.id}
                  className="w-14 h-14 rounded-3xl bg-muted border-4 border-background flex items-center justify-center text-2xl shadow-xl overflow-hidden"
                  style={{ zIndex: 10 - i }}
                >
                  <AgentIcon id={a.id} name={a.name} avatar={a.avatar} size={34} />
                </div>
              ))}
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {activeGroup?.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {memberAgents.map((a) => a.name).join(' and ')}
            </p>

            {/* Quick Action Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
              <button
                type="button"
                onClick={() => setInput('@all introduce yourselves')}
                className="px-3 py-1.5 rounded-full bg-muted/40 hover:bg-muted border border-border/50 text-xs text-foreground transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>@all introduce yourselves</span>
              </button>

              {memberAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setInput(`@${agent.name.toLowerCase().replace(/\s+/g, '-')} what can you help with?`)}
                  className="px-3 py-1.5 rounded-full bg-muted/40 hover:bg-muted border border-border/50 text-xs text-foreground transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <AgentIcon id={agent.id} name={agent.name} avatar={agent.avatar} size={14} />
                  <span>{agent.name}: what can you help with?</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const respondingAgent = !isUser
              ? memberAgents.find((a) => a.id === msg.agentId) || { id: msg.agentId || 'agent', name: msg.senderName || 'Agent', avatar: '🤖', engine: 'rakit' }
              : null;
            const isMsgLiked = likedMap[msg.id];
            const isCopied = copiedId === msg.id;

            if (isUser) {
              return (
                <div key={msg.id || index} className="group/user-row flex flex-col items-end max-w-3xl mx-auto w-full gap-1">
                  <div className="relative max-w-[80%] rounded-2xl bg-message px-4 py-3 text-message-foreground shadow-xs select-text">
                    <p className="whitespace-pre-wrap break-words text-ui-sm leading-relaxed [overflow-wrap:anywhere] select-text">
                      {msg.content}
                    </p>
                  </div>
                  <div className="flex w-full max-w-[80%] items-center justify-end gap-2 pr-1 text-2xs tabular-nums opacity-0 transition-opacity duration-200 group-hover/user-row:opacity-100 text-muted-foreground">
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
              );
            }

            /* Assistant Turn in Group Chat */
            const hasWork = Boolean(msg.thought || (msg.toolCalls && msg.toolCalls.length > 0));
            const wbId = `wb-g-${msg.id || index}`;
            const workOpen = expandedWork[wbId] !== undefined ? expandedWork[wbId] : false;

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
              <div
                key={msg.id || index}
                className="group/msg flex flex-col items-start max-w-3xl mx-auto w-full space-y-2.5"
              >
                {/* Sender Identity Header with Authentic Agent/ACP Icon */}
                <div className="flex items-center gap-2 px-1 select-none">
                  {respondingAgent && (
                    <AgentIcon
                      id={respondingAgent.id || ''}
                      name={respondingAgent.name}
                      avatar={respondingAgent.avatar}
                      size={24}
                    />
                  )}
                  <span className="text-xs font-semibold text-foreground">
                    {respondingAgent?.name || 'Agent'}
                  </span>
                </div>

                {/* WORKED-FOR ACCORDION */}
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

                    {/* Accordion Content */}
                    {workOpen && (
                      <div className="w-full space-y-2 my-0.5 pl-1">
                        {/* Thinking Block */}
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
                                <div className="ms-6 max-h-[360px] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground/85 py-1.5 pr-2 select-text scrollbar-thin">
                                  <MarkdownView content={msg.thought} muted />
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Tools in WorkLogList */}
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

                {/* Final Assistant Text */}
                {msg.content && (
                  <div className="w-full text-ui-base leading-relaxed text-foreground select-text py-0.5">
                    <MarkdownView content={msg.content} />
                  </div>
                )}

                {/* Message Action Footer */}
                <div className="flex w-full items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
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

                  <span className="ml-auto text-3xs tabular-nums text-muted-foreground/75 font-mono">
                    {relativeTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Live streaming delta in Group Chat */}
        {isStreaming && (
          <div className="flex flex-col items-start max-w-3xl mx-auto w-full space-y-3">
            {/* Live Working / Worked Header */}
            {(streamingThought || streamingToolCalls.length > 0) && (
              <div className="w-full flex flex-col items-start space-y-1.5 pt-0.5">
                <div className="flex h-6 min-w-0 items-center gap-2 px-1 text-ui-xs tabular-nums select-none">
                  <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                  <span className="font-medium live-tool-shine">
                    {liveElapsed > 0 ? `Working for ${liveElapsed}s` : 'Working…'}
                  </span>
                </div>

                {/* Live Thought */}
                {streamingThought && (
                  <div className="w-full pl-1">
                    <div className="flex items-center gap-1.5 text-ui-xs text-primary font-medium py-0.5 select-none">
                      <Brain className="size-3.5 text-primary animate-pulse shrink-0" />
                      <span className="live-tool-shine">
                        {liveElapsed > 0 ? `Thinking for ${liveElapsed}s` : 'Thinking…'}
                      </span>
                    </div>
                    <div className="ms-6 max-h-[360px] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground/85 py-1.5 pr-2 select-text scrollbar-thin">
                      <MarkdownView content={streamingThought} muted isStreaming />
                    </div>
                  </div>
                )}

                {/* Live Tool Calls */}
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

            {/* Live Stream Text */}
            {streamingContent && (
              <div className="w-full text-ui-base leading-relaxed text-foreground select-text py-0.5">
                <MarkdownView content={streamingContent} isStreaming />
              </div>
            )}

            {/* Fallback loader */}
            {!streamingThought && !streamingContent && streamingToolCalls.length === 0 && (
              <div className="flex items-center gap-2 py-2 text-ui-sm text-primary select-none">
                <Loader2 className="size-4 animate-spin" />
                <span className="live-tool-shine">Replying…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mention Auto-Complete Popover */}
      {showMentionPopup && (
        <div className="max-w-3xl mx-auto w-full px-4 relative">
          <div className="absolute bottom-2 left-6 w-64 rounded-xl bg-popover border border-border shadow-2xl p-1 z-50 animate-in fade-in-50 zoom-in-95">
            <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Mention an agent
            </div>
            <button
              type="button"
              onClick={() => handleInsertMention('all')}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 hover:bg-muted text-foreground cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold">Everyone</span>
              <span className="text-muted-foreground text-[10px]">@all</span>
            </button>
            {memberAgents.map((agent) => {
              const handle = agent.name.toLowerCase().replace(/\s+/g, '-');
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleInsertMention(handle)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 hover:bg-muted text-foreground cursor-pointer"
                >
                  <AgentIcon id={agent.id} name={agent.name} avatar={agent.avatar} size={16} />
                  <span className="font-semibold truncate">{agent.name}</span>
                  <span className="text-muted-foreground text-[10px]">@{handle}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Bottom Composer */}
      <div className="p-4 pb-20 md:pb-4 bg-gradient-to-t from-background via-background to-transparent shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto w-full rounded-2xl bg-card border border-border/60 hover:border-border focus-within:border-primary/60 transition-colors shadow-2xl p-3 flex flex-col gap-2"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message the group, @mention an agent or @all"
            rows={2}
            className="w-full bg-transparent border-0 resize-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none p-1"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="Attach file"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowMentionPopup(!showMentionPopup)}
                className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="Mention agent"
              >
                <AtSign className="w-4 h-4" />
              </button>
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={() => stopSession()}
                className="w-8 h-8 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 flex items-center justify-center transition-all cursor-pointer"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-primary-foreground flex items-center justify-center transition-all shadow-md shadow-primary/20 cursor-pointer"
                title="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default GroupChatThread;
