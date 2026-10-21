import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  Square,
  MoreVertical,
  Search,
  CheckCheck,
  Brain,
  Bot,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  Image as ImageIcon,
  Settings,
} from 'lucide-react';
import { TelegramIcon } from './AssistantIcons';
import { GrokAvatar } from '../GrokAvatar';
import { useAppStore } from '../../store/useAppStore';
import { useAgentSocket } from '../../hooks/useAgentSocket';
import { MarkdownRenderer } from '../agent/MarkdownRenderer';
import { SessionMessage, ToolCallRecord } from '../../types';
import { relativeTime } from '../../lib/time';
import { navigateSettings } from '../../router';

interface WhatsAppChatAreaProps {
  onOpenTelegramModal: () => void;
}

export const WhatsAppChatArea: React.FC<WhatsAppChatAreaProps> = ({ onOpenTelegramModal }) => {
  const {
    activeSessionId,
    sessions,
    messages,
    isGenerating,
    thinkingStatus,
    activeAgent,
    agents,
    activeModel,
    clearSessionMessages,
    telegramAgents,
  } = useAppStore();

  const { sendMessage } = useAgentSocket();

  const [inputText, setInputText] = useState('');
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const currentAgent =
    agents.find((a) => a.id === currentSession?.agentId) ||
    agents.find((a) => currentSession?.title.toLowerCase().includes(a.name.toLowerCase())) ||
    activeAgent;
  const agentAvatar = currentAgent?.avatar || currentAgent?.id || currentSession?.agentId || 'purple-pebble';
  const isTelegramSession =
    currentSession?.channelId?.includes('telegram') || currentSession?.id.includes('tg_');

  // Check if active agent has an active Telegram bot
  const tgInfo = activeAgent ? telegramAgents[activeAgent.id] : null;

  // Auto-scroll to bottom
  useEffect(() => {
    if (pinnedToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating, pinnedToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
  };

  const handleSend = () => {
    if (!inputText.trim() || isGenerating) return;
    sendMessage(inputText.trim());
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 1500);
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts((p) => ({ ...p, [id]: !p[id] }));
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* WhatsApp Chat Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-chrome px-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <GrokAvatar id={agentAvatar} size={40} />
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
            {isTelegramSession && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-sky-500 text-white shadow-xs">
                <TelegramIcon size={10} />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-ui-sm font-semibold text-foreground">
              {currentSession?.title || currentAgent?.name || 'Kendali Assistant'}
            </h2>
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <span className="text-emerald-500 font-medium">online</span>
              {currentAgent?.role && (
                <>
                  <span>•</span>
                  <span className="font-medium text-foreground-subtle truncate max-w-[150px]">{currentAgent.role}</span>
                </>
              )}
              {tgInfo?.connected && (
                <>
                  <span>•</span>
                  <span className="text-sky-500 font-medium">Bot: @{tgInfo.botName}</span>
                </>
              )}
              {activeModel && (
                <>
                  <span>•</span>
                  <span className="font-mono text-muted-foreground/70">{activeModel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenTelegramModal}
            className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-2xs font-semibold text-sky-500 hover:bg-sky-500/20"
            title="Telegram Bot Settings"
          >
            <TelegramIcon size={14} className="shrink-0" />
            <span className="hidden sm:inline">Telegram Bot</span>
          </button>

          {activeSessionId && (
            <button
              onClick={() => clearSessionMessages(activeSessionId)}
              className="flex size-8 items-center justify-center rounded-full text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
              title="Clear Conversation"
            >
              <Trash2 className="size-4" />
            </button>
          )}

          <button
            onClick={() => navigateSettings('general')}
            className="flex size-8 items-center justify-center rounded-full text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            title="Settings (⌘,)"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area (WhatsApp Style) */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto px-4 py-5 select-text space-y-3 bg-gradient-to-b from-background via-background/95 to-background"
      >
        {/* Date Divider */}
        <div className="flex items-center justify-center my-2">
          <span className="rounded-full border border-border/60 bg-card px-3 py-0.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground shadow-xs">
            TODAY
          </span>
        </div>

        {messages.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground space-y-2">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <Sparkles className="size-6" />
            </div>
            <p className="text-ui-sm font-medium text-foreground">Welcome to Assistant Mode</p>
            <p className="text-ui-xs max-w-sm mx-auto">
              Chat naturally with your AI assistant, execute commands, or link Telegram bot for omni-channel messaging.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const hasThought = !!msg.thought;
            const hasTools = !!(msg.toolCalls && msg.toolCalls.length > 0);

            return (
              <div
                key={msg.id}
                className={`group flex w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                {/* Speech Bubble */}
                <div
                  className={`relative max-w-[82%] sm:max-w-[75%] rounded-2xl p-3 shadow-xs transition-shadow ${
                    isUser
                      ? 'rounded-tr-xs bg-primary/15 text-foreground border border-primary/25'
                      : 'rounded-tl-xs bg-card border border-border/70 text-foreground'
                  }`}
                >
                  {/* Sender Name (for group or assistant) */}
                  {!isUser && (
                    <div className="mb-1 flex items-center justify-between text-2xs font-semibold text-primary">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GrokAvatar id={agentAvatar} size={15} className="shrink-0" />
                        <span className="truncate">{msg.senderName || currentAgent?.name || 'Kendali AI'}</span>
                      </div>
                      {isTelegramSession && (
                        <span className="ml-2 flex items-center gap-1 text-sky-500 text-3xs font-mono shrink-0">
                          <TelegramIcon size={10} /> Telegram
                        </span>
                      )}
                    </div>
                  )}

                  {/* Collapsible Thinking Block */}
                  {hasThought && (
                    <div className="mb-2 rounded-lg border border-border/50 bg-background/60 p-2 text-ui-xs">
                      <button
                        type="button"
                        onClick={() => toggleThought(msg.id)}
                        className="flex w-full items-center justify-between font-medium text-muted-foreground hover:text-foreground"
                      >
                        <span className="flex items-center gap-1.5 text-2xs">
                          <Brain className="size-3 text-primary" />
                          <span>Thought process</span>
                        </span>
                        {expandedThoughts[msg.id] ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronRight className="size-3" />
                        )}
                      </button>
                      {expandedThoughts[msg.id] && (
                        <div className="mt-1.5 border-t border-border/30 pt-1 text-2xs text-muted-foreground/90 max-h-40 overflow-y-auto">
                          <MarkdownRenderer content={msg.thought || ''} muted />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Body */}
                  <div className="select-text">
                    {isUser ? (
                      <p className="whitespace-pre-wrap break-words text-ui-sm leading-relaxed [overflow-wrap:anywhere]">
                        {msg.content}
                      </p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>

                  {/* Compact Tool Executions */}
                  {hasTools && (
                    <div className="mt-2 space-y-1 border-t border-border/40 pt-1.5">
                      {msg.toolCalls!.map((tc, idx) => (
                        <div
                          key={tc.id || idx}
                          className="flex items-center gap-1.5 rounded bg-background/50 px-2 py-0.5 font-mono text-2xs text-muted-foreground"
                        >
                          <span className="font-semibold text-emerald-500">✓</span>
                          <span>Ran: {tc.tool}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timestamp & Delivery Indicators (WhatsApp Style) */}
                  <div className="mt-1 flex items-center justify-end gap-1 text-3xs text-muted-foreground/80 select-none">
                    <span>{relativeTime(msg.createdAt)}</span>
                    {isUser && <CheckCheck className="size-3.5 text-sky-400" />}
                  </div>
                </div>

                {/* Hover Copy Action */}
                <div className="mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title="Copy text"
                  >
                    {copiedMsgId === msg.id ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* WhatsApp Typing Dots */}
        {isGenerating && (
          <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs border border-border/70 bg-card px-4 py-2.5 w-fit shadow-xs">
            <span className="text-ui-xs text-muted-foreground">Assistant is typing</span>
            <div className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '200ms' }} />
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Composer Bar */}
      <div className="shrink-0 border-t border-border bg-chrome p-3">
        <div className="relative mx-auto flex max-w-4xl items-center gap-2">
          {/* Attachment Button */}
          <div className="relative">
            <button
              onClick={() => setAttachmentMenuOpen((o) => !o)}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              title="Add attachment"
            >
              <Paperclip className="size-5" />
            </button>

            {attachmentMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-border bg-popover p-1 shadow-lg">
                <button
                  onClick={() => {
                    setAttachmentMenuOpen(false);
                    setInputText((prev) => `${prev} /doc: `);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-ui-xs text-foreground hover:bg-surface-hover"
                >
                  <FileText className="size-4 text-primary" />
                  Knowledge Document
                </button>
                <button
                  onClick={() => {
                    setAttachmentMenuOpen(false);
                    setInputText((prev) => `${prev} \`\`\`\n\n\`\`\``);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-ui-xs text-foreground hover:bg-surface-hover"
                >
                  <Code2 className="size-4 text-emerald-500" />
                  Code Snippet
                </button>
                <button
                  onClick={() => {
                    setAttachmentMenuOpen(false);
                    onOpenTelegramModal();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-ui-xs text-foreground hover:bg-surface-hover"
                >
                  <TelegramIcon className="size-4 text-sky-500" />
                  Telegram Bot Settings
                </button>
              </div>
            )}
          </div>

          {/* Text Input Container (WhatsApp Pill Shape) */}
          <div className="flex flex-1 items-center rounded-2xl border border-border/80 bg-background px-3 py-1.5 shadow-xs focus-within:border-primary">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="max-h-28 w-full resize-none bg-transparent text-ui-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>

          {/* Send / Mic / Stop Button (WhatsApp Green Circle) */}
          {isGenerating ? (
            <button
              onClick={() => {}}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive text-white shadow-md hover:opacity-90"
              title="Stop Generating"
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : inputText.trim() ? (
            <button
              onClick={handleSend}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition-transform hover:scale-105 hover:bg-emerald-700"
              title="Send Message"
            >
              <Send className="size-4.5" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground hover:text-foreground"
              title="Microphone"
            >
              <Mic className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
