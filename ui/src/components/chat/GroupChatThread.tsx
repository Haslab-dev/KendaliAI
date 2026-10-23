import React, { useState, useEffect, useRef } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { MarkdownView } from '../MarkdownView';
import { ToolExecutionCard } from '../ToolExecutionCard';
import {
  ArrowUp,
  Plus,
  Users,
  AtSign,
  Square,
  Sparkles,
} from 'lucide-react';
import { SessionMessage } from '../../types';
import { AgentIcon } from '../shell/AgentIcon';

export const GroupChatThread: React.FC = () => {
  const { activeGroup, agents } = useProfileStore();
  const {
    activeSession,
    messages,
    isLoadingMessages,
    isStreaming,
    streamingContent,
    streamingToolCalls,
    sendMessage,
    stopSession,
    createSessionForGroup,
  } = useSessionStore();

  const [input, setInput] = useState('');
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group members
  const memberAgents = agents.filter((a) =>
    activeGroup ? activeGroup.memberIds.includes(a.id) : false
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isStreaming]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Show mention popup if last character is '@'
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

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-[#0c0c0e] relative overflow-hidden">
      {/* Top Header Bar */}
      <div className="h-14 px-4 sm:px-6 border-b border-border/30 flex items-center justify-between shrink-0 bg-[#101014]/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2 shrink-0">
            {memberAgents.slice(0, 3).map((a, i) => (
              <div
                key={a.id}
                className="w-7 h-7 rounded-full bg-muted border-2 border-[#101014] flex items-center justify-center text-xs overflow-hidden"
                style={{ zIndex: 10 - i }}
              >
                <AgentIcon id={a.id} name={a.name} avatar={a.avatar} isACP={a.engine === 'acp'} size={18} />
              </div>
            ))}
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {activeGroup?.name || 'Group Chat'}
            </h2>
            <p className="text-[11px] text-muted-foreground truncate">
              {memberAgents.length} agents {activeGroup?.brief ? `• ${activeGroup.brief}` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={handleNewChat}
          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New chat</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 scrollbar-thin scrollbar-thumb-border"
      >
        {messages.length === 0 ? (
          /* Empty / Initial State (Screenshot 4) */
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto py-12">
            <div className="flex -space-x-3 mb-2">
              {memberAgents.map((a, i) => (
                <div
                  key={a.id}
                  className="w-14 h-14 rounded-3xl bg-muted border-4 border-[#0c0c0e] flex items-center justify-center text-2xl shadow-xl overflow-hidden"
                  style={{ zIndex: 10 - i }}
                >
                  <AgentIcon id={a.id} name={a.name} avatar={a.avatar} isACP={a.engine === 'acp'} size={34} />
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
                onClick={() => setInput('@all introduce yourselves')}
                className="px-3 py-1.5 rounded-full bg-muted/40 hover:bg-muted border border-border/50 text-xs text-foreground transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>@all introduce yourselves</span>
              </button>

              {memberAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setInput(`@${agent.name.toLowerCase().replace(/\s+/g, '-')} what can you help with?`)}
                  className="px-3 py-1.5 rounded-full bg-muted/40 hover:bg-muted border border-border/50 text-xs text-foreground transition-colors flex items-center gap-1.5"
                >
                  <AgentIcon id={agent.id} name={agent.name} avatar={agent.avatar} isACP={agent.engine === 'acp'} size={14} />
                  <span>{agent.name}: what can you help with?</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const respondingAgent = !isUser
              ? memberAgents.find((a) => a.id === msg.agentId) || { id: msg.agentId || 'agent', name: msg.senderName || 'Agent', avatar: '🤖', engine: 'rakit' }
              : null;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl mx-auto w-full`}
              >
                {/* Sender identity */}
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  {!isUser && respondingAgent && (
                    <AgentIcon
                      id={respondingAgent.id || ''}
                      name={respondingAgent.name}
                      avatar={respondingAgent.avatar}
                      isACP={respondingAgent.engine === 'acp'}
                      size={14}
                    />
                  )}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {isUser ? 'You' : respondingAgent?.name || 'Agent'}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-primary text-white max-w-[85%] shadow-md shadow-primary/10'
                      : 'bg-[#141418] border border-border/50 text-foreground w-full'
                  }`}
                >
                  <MarkdownView content={msg.content} />
                </div>

                {/* Inline Tool Execution Cards */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="w-full space-y-2 mt-2">
                    {msg.toolCalls.map((tc) => (
                      <ToolExecutionCard key={tc.id} toolCall={tc} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live streaming delta */}
        {isStreaming && (
          <div className="flex flex-col items-start max-w-3xl mx-auto w-full">
            <div className="flex items-center gap-2 mb-1.5 px-1 text-xs text-primary font-semibold animate-pulse">
              <span>Agent replying...</span>
            </div>
            {streamingContent && (
              <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[#141418] border border-border/50 text-foreground w-full stream-in">
                <MarkdownView content={streamingContent} isStreaming />
              </div>
            )}
            {streamingToolCalls.length > 0 && (
              <div className="w-full space-y-2 mt-2">
                {streamingToolCalls.map((tc) => (
                  <ToolExecutionCard key={tc.id} toolCall={tc} />
                ))}
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
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 hover:bg-muted text-foreground"
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
                  className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 hover:bg-muted text-foreground"
                >
                  <AgentIcon id={agent.id} name={agent.name} avatar={agent.avatar} isACP={agent.engine === 'acp'} size={16} />
                  <span className="font-semibold truncate">{agent.name}</span>
                  <span className="text-muted-foreground text-[10px]">@{handle}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Bottom Composer */}
      <div className="p-4 bg-gradient-to-t from-[#0c0c0e] via-[#0c0c0e] to-transparent shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto w-full rounded-2xl bg-[#141418] border border-border/60 hover:border-border focus-within:border-primary/60 transition-colors shadow-2xl p-3 flex flex-col gap-2"
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
                className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                title="Attach file"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowMentionPopup(!showMentionPopup)}
                className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                title="Mention agent"
              >
                <AtSign className="w-4 h-4" />
              </button>
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
