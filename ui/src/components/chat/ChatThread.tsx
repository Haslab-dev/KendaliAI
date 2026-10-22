import React, { useState, useEffect, useRef } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { MarkdownView } from '../MarkdownView';
import { ToolExecutionCard } from '../ToolExecutionCard';
import {
  ArrowUp,
  Square,
  Plus,
  Brain,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Check,
  X,
  FileCode,
  SlidersHorizontal,
} from 'lucide-react';

interface ChatThreadProps {
  onToggleDrawer?: () => void;
  isDrawerOpen?: boolean;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  onToggleDrawer,
  isDrawerOpen,
}) => {
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
    stopSession,
  } = useSessionStore();

  const { defaultModel, availableModels } = useAppStore();
  const { permissions, respondPermission } = useAgentStore();

  const [input, setInput] = useState('');
  const [showThinking, setShowThinking] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages / stream
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingToolCalls, isStreaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text, { agentId: activeAgent?.id });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const sessionPermissions = activeSession?.id ? permissions[activeSession.id] || [] : [];
  const activeModel = activeAgent?.model || defaultModel || 'Auto';

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-[#0c0c0e] relative overflow-hidden">
      {/* Top Header Bar */}
      <div className="h-14 px-4 border-b border-border/30 flex items-center justify-between shrink-0 bg-[#101014]/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-semibold shrink-0">
            {activeAgent?.avatar?.slice(0, 2) || '🤖'}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {activeSession?.title || 'Chat'}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{activeAgent?.name || 'Agent'}</span>
              <span>•</span>
              <span className="font-mono text-[10px] bg-muted/60 px-1.5 py-0.2 rounded">
                {activeModel}
              </span>
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2">
          {onToggleDrawer && (
            <button
              onClick={onToggleDrawer}
              className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${
                isDrawerOpen ? 'bg-muted text-foreground' : ''
              }`}
              title="Toggle Context Drawer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 scrollbar-thin scrollbar-thumb-border"
      >
        {isLoadingMessages && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground animate-pulse">
            Loading transcript...
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl mx-auto w-full`}
                >
                  {/* Sender identity */}
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {isUser ? 'You' : activeAgent?.name || 'Agent'}
                    </span>
                    {msg.createdAt && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Thinking / Reasoning Block */}
                  {msg.thought && (
                    <div className="w-full mb-3 rounded-xl bg-violet-950/20 border border-violet-800/30 p-3 text-xs text-violet-200/90 space-y-1.5">
                      <div
                        onClick={() => setShowThinking(!showThinking)}
                        className="flex items-center gap-2 font-medium cursor-pointer select-none text-violet-300"
                      >
                        <Brain className="w-3.5 h-3.5 text-violet-400" />
                        <span>Reasoning Process</span>
                        {showThinking ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </div>
                      {showThinking && (
                        <div className="text-[11px] text-muted-foreground/90 whitespace-pre-wrap font-mono pl-5 pt-1 border-l border-violet-800/40">
                          {msg.thought}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#18181b] text-foreground border border-border/40 max-w-[85%]'
                        : 'bg-transparent text-foreground w-full'
                    }`}
                  >
                    <MarkdownView content={msg.content} />
                  </div>

                  {/* Inline Tool Calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="w-full space-y-2 mt-2">
                      {msg.toolCalls.map((tc) => (
                        <ToolExecutionCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Currently Streaming Message */}
            {isStreaming && (
              <div className="flex flex-col items-start max-w-3xl mx-auto w-full">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-xs font-semibold text-primary animate-pulse">
                    {activeAgent?.name || 'Agent'} (working...)
                  </span>
                </div>

                {/* Streaming Thinking */}
                {streamingThought && (
                  <div className="w-full mb-3 rounded-xl bg-violet-950/20 border border-violet-800/30 p-3 text-xs text-violet-200/90 space-y-1.5">
                    <div className="flex items-center gap-2 font-medium text-violet-300">
                      <Brain className="w-3.5 h-3.5 text-violet-400 animate-spin-slow" />
                      <span>Thinking...</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono pl-5 pt-1 border-l border-violet-800/40">
                      {streamingThought}
                    </div>
                  </div>
                )}

                {/* Streaming Text */}
                {streamingContent && (
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed text-foreground w-full stream-in">
                    <MarkdownView content={streamingContent} isStreaming />
                  </div>
                )}

                {/* Streaming Tools */}
                {streamingToolCalls.length > 0 && (
                  <div className="w-full space-y-2 mt-2">
                    {streamingToolCalls.map((tc) => (
                      <ToolExecutionCard key={tc.id} toolCall={tc} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pending Interactive Permissions (ACP or Sensitive Operations) */}
            {sessionPermissions.map((req) => (
              <div
                key={req.requestId}
                className="max-w-3xl mx-auto w-full rounded-2xl bg-amber-950/20 border border-amber-600/40 p-4 space-y-3 animate-in fade-in-50"
              >
                <div className="flex items-center gap-2.5 text-amber-400 text-xs font-semibold">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <span>Permission Required</span>
                </div>
                <p className="text-xs text-foreground font-medium">{req.title || 'Tool execution requires permission'}</p>
                <div className="flex items-center gap-2 pt-1">
                  {req.options.map((opt) => (
                    <button
                      key={opt.optionId}
                      onClick={() => respondPermission(req.sessionId, req.requestId, opt.optionId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        opt.kind.includes('allow')
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-muted hover:bg-muted/80 text-foreground'
                      }`}
                    >
                      {opt.label || opt.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Floating Bottom Composer */}
      <div className="p-4 bg-gradient-to-t from-[#0c0c0e] via-[#0c0c0e] to-transparent shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto w-full rounded-2xl bg-[#141418] border border-border/60 hover:border-border focus-within:border-primary/60 transition-colors shadow-2xl p-3 flex flex-col gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeAgent?.name || 'Agent'}...`}
            rows={2}
            className="w-full bg-transparent border-0 resize-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none p-1"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                title="Attach file"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{activeModel}</span>
              </div>
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={() => stopSession()}
                className="w-8 h-8 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 flex items-center justify-center transition-all"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-white flex items-center justify-center transition-all shadow-md shadow-primary/20"
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
