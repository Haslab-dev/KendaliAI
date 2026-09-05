import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Moon, Sun, Paperclip, Mic, ArrowUp, Copy, Check,
  ChevronDown, ChevronUp, Search, Brain, Zap, Settings, Command, AlertCircle,
  CornerDownLeft, Terminal, Sparkles, Smartphone, Database, RefreshCw, FileText, X
} from 'lucide-react';
import { Bot, Feather } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { useAgentSocket } from '../hooks/useAgentSocket';
import { ToolExecutionCard } from './ToolExecutionCard';
import { isReasoningModel } from '../types';

interface SlashCommand {
  key: string;
  prefix: string;
  label: string;
  desc: string;
  category: 'SKILL' | 'MCP' | 'COMMAND' | 'DOC';
  icon: string;
  executeDirect?: () => void;
}

export const ChatArea: React.FC = () => {
  const {
    activeAgent,
    setActiveAgent,
    agents,
    messages,
    isGenerating,
    thinkingStatus,
    theme,
    toggleTheme,
    createSession,
    clearSessionMessages,
    activeSessionId,
    activeModel,
    mcps,
    sessions,
  } = useAppStore();

  const { sendMessage } = useAgentSocket();
  const [inputText, setInputText] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isSlashDismissed, setIsSlashDismissed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [ragNotice, setRagNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [allDocs, setAllDocs] = useState<{ id: string; title: string; chunkCount: number }[]>([]);

  // Load all documents for /doc: autocomplete
  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAllDocs(Array.isArray(data) ? data.map((d: any) => ({ id: d.id, title: d.title, chunkCount: d.chunkCount || 0 })) : []))
      .catch(() => {});
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setRagNotice({ type: 'info', text: `Chunking & embedding "${file.name}" into Vector RAG...` });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', activeSessionId || '');
      formData.append('title', file.name);
      formData.append('source', 'upload');

      const res = await fetch('/api/documents/ingest', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setRagNotice({
          type: 'success',
          text: `Ingested "${file.name}" into knowledge base.`,
        });
        setTimeout(() => setRagNotice(null), 7000);
      } else {
        setRagNotice({
          type: 'error',
          text: `Failed to ingest: ${data.error || 'Unknown error'}`,
        });
      }
    } catch (err: any) {
      setRagNotice({
        type: 'error',
        text: `Upload error: ${err.message}`,
      });
    } finally {
      setIsUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, thinkingStatus]);

  // Catalog of Slash Commands (Skills, MCPs, Gateway actions)
  const slashSuggestions: SlashCommand[] = useMemo(() => {
    const list: SlashCommand[] = [];

    // 1. Agent Personas as Invocable Skills
    const agentList = agents.length > 0 ? agents : [
      { id: 'personal-assistant', name: 'Personal Assistant', description: 'Proactive daily coordinator & executive tasks', avatar: '', skills: ['planning', 'coordination'] },
      { id: 'research-agent', name: 'Research Agent', description: 'In-depth research, web investigation & fact-checking', avatar: '', skills: ['deep-research', 'synthesis'] },
      { id: 'knowledge-agent', name: 'Knowledge Agent', description: 'Second brain, documentation & concept retrieval', avatar: '', skills: ['knowledge-graph', 'notes'] },
      { id: 'coding-agent', name: 'Coding Agent', description: 'Senior software engineer, architecture & code authoring', avatar: '', skills: ['coding', 'debugging'] },
    ];

    agentList.forEach((ag) => {
      list.push({
        key: `skill-${ag.id}`,
        prefix: `/skill:${ag.id}`,
        label: ag.name,
        desc: ag.description || `Specialized skill: ${(ag.skills || []).join(', ')}`,
        category: 'SKILL',
        icon: ag.avatar || '',
      });
    });

    // 2. MCP Server integrations
    const mcpServers = (mcps && mcps.length > 0) ? mcps : [
      { id: 'github', name: 'github', status: 'ready', toolsCached: [{ name: 'get_issue' }] },
      { id: 'exa', name: 'exa', status: 'ready', toolsCached: [{ name: 'search' }] },
    ];

    mcpServers.forEach((m) => {
      const toolNames = (m.toolsCached || []).map((t: any) => t.name).slice(0, 3).join(', ');
      list.push({
        key: `mcp-${m.id}`,
        prefix: `/mcp:${m.name || m.id}`,
        label: `MCP: ${m.name || m.id}`,
        desc: toolNames ? `Tools: ${toolNames}...` : 'External Model Context Protocol server',
        category: 'MCP',
        icon: '',
      });
    });

    // 3. Gateway Commands & Shortcuts
    list.push(
      {
        key: 'cmd-new',
        prefix: '/new',
        label: 'New Chat Session',
        desc: 'Start a fresh conversation thread',
        category: 'COMMAND',
        icon: '',
        executeDirect: () => createSession(),
      },
      {
        key: 'cmd-clear',
        prefix: '/clear',
        label: 'Clear Messages',
        desc: 'Clear message history of current session',
        category: 'COMMAND',
        icon: '',
        executeDirect: () => activeSessionId && clearSessionMessages(activeSessionId),
      },
      {
        key: 'cmd-agent',
        prefix: '/agent',
        label: 'Switch Agent Persona',
        desc: 'Open Agent Personas pane',
        category: 'COMMAND',
        icon: '',
        executeDirect: () => navigate('agents'),
      },
      {
        key: 'cmd-providers',
        prefix: '/providers',
        label: 'OpenAI Providers & Models',
        desc: 'Configure custom OpenAI endpoints and probe /models',
        category: 'COMMAND',
        icon: '',
        executeDirect: () => navigate('providers'),
      }
    );

    // 4. Uploaded Documents — /doc:<title> RAG context recall
    allDocs.forEach((doc) => {
      list.push({
        key: `doc-${doc.id}`,
        prefix: `/doc:${doc.title}`,
        label: doc.title,
        desc: `Inject RAG context from this document (${doc.chunkCount} chunks)`,
        category: 'DOC',
        icon: '',
      });
    });

    return list;
  }, [agents, mcps, activeSessionId, allDocs, createSession, clearSessionMessages]);

  // Determine if slash popup should be visible and filter suggestions
  const isTypingSlash = inputText.startsWith('/') && !inputText.includes(' ') && !isSlashDismissed;
  const filteredSuggestions = useMemo(() => {
    if (!isTypingSlash) return [];
    const query = inputText.toLowerCase().slice(1);
    if (!query) return slashSuggestions;
    return slashSuggestions.filter(
      (s) =>
        s.prefix.toLowerCase().includes(query) ||
        s.label.toLowerCase().includes(query) ||
        s.desc.toLowerCase().includes(query)
    );
  }, [isTypingSlash, inputText, slashSuggestions]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [inputText]);

  const handleSelectSuggestion = (item: SlashCommand) => {
    if (item.executeDirect && inputText.trim() === item.prefix) {
      item.executeDirect();
      setInputText('');
      setIsSlashDismissed(false);
      return;
    }
    setInputText(item.prefix + ' ');
    setIsSlashDismissed(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isGenerating) return;
    sendMessage(inputText.trim());
    setInputText('');
    setIsSlashDismissed(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete Keyboard Navigation
    if (isTypingSlash && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        handleSelectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSlashDismissed(true);
        return;
      }
    }

    // Normal Send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (isSlashDismissed && !val.startsWith('/')) {
      setIsSlashDismissed(false);
    }
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isTelegramSession = activeSession?.channelId === 'telegram' || activeSessionId?.startsWith('tg-');
  let botLabel = 'Telegram Bot';
  if (activeSession?.metadata) {
    try {
      const meta = JSON.parse(activeSession.metadata);
      if (meta.botName) botLabel = `@${meta.botName}`;
    } catch {}
  } else if (activeSessionId?.startsWith('tg-')) {
    const parts = activeSessionId.replace('tg-', '').split('-');
    if (parts[0]) botLabel = `@${parts[0]}`;
  }

  return (
    <main className="flex-1 flex flex-col bg-app relative overflow-hidden">
      {/* Topbar */}
      <header className="h-[52px] border-b border-line flex items-center justify-between px-4 bg-app z-20 select-none">
        <div className="flex items-center gap-2">
          {/* Active Agent Selector */}
          <div
            onClick={() => navigate('agents')}
            className="flex items-center gap-2 px-3 py-1.5 bg-inputbg hover:bg-hoverbg border border-line rounded-xl cursor-pointer text-xs font-medium text-hi transition-colors"
            title="Switch Agent Persona"
          >
            <span className="text-mid"><Bot size={14} /></span>
            <span className="font-semibold">{activeAgent?.name || 'Personal Assistant'}</span>
          </div>

          {/* Model Selector & Filter Dropdown */}
          <ModelSelectorDropdown />

          {/* Telegram Sync Indicator */}
          {isTelegramSession && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-raised border bg-raised text-hi rounded-xl text-xs font-mono">
              <Smartphone size={12} className="text-hi animate-pulse" />
              <span>Synced with {botLabel}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => createSession()}
            className="w-8 h-8 rounded-lg border border-line hover:bg-raised text-mid hover:text-hi flex items-center justify-center transition-colors"
            title="New Chat (/new)"
          >
            <Plus size={15} />
          </button>
          <button
            onClick={() => activeSessionId && clearSessionMessages(activeSessionId)}
            className="w-8 h-8 rounded-lg border border-line hover:bg-raised text-mid hover:text-hi flex items-center justify-center transition-colors"
            title="Clear Messages (/clear)"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg border border-line hover:bg-raised text-mid hover:text-hi flex items-center justify-center transition-colors"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Zero State View */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center mt-12 mb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-raised border border-line text-hi mb-4">
                <Feather size={26} strokeWidth={1.5} />
              </div>
              <h1 className="text-2xl font-bold text-hi mb-1">KendaliAI</h1>
              <p className="text-sm text-mid mb-8 max-w-md">
                Personal AI Agent Gateway • Connected to{' '}
                <span className="text-hi font-semibold">{activeAgent?.name || 'Personal Assistant'}</span>
              </p>

              {/* Bootstrap Agents as Skills Shortcuts */}
              <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                {[
                  {
                    title: 'Coding Agent',
                    avatar: '',
                    desc: 'Senior software engineer & architecture',
                    command: '/skill:coding-agent refactor my component to use a clean state machine',
                  },
                  {
                    title: 'Research Agent',
                    avatar: '',
                    desc: 'In-depth investigation & web synthesis',
                    command: '/skill:research-agent compare local LLM runtimes Ollama vs vLLM',
                  },
                  {
                    title: 'Knowledge Agent',
                    avatar: '',
                    desc: 'Second brain, memory recall & notes',
                    command: '/skill:knowledge-agent summarize key ideas from my knowledge notes',
                  },
                  {
                    title: 'Personal Assistant',
                    avatar: '',
                    desc: 'Daily coordinator & task workflows',
                    command: '/skill:personal-assistant organize my priority tasks for today',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    onClick={() => sendMessage(item.command)}
                    className="p-3.5 bg-panel hover:bg-raised border border-line hover:border-mid rounded-xl text-left cursor-pointer transition-all shadow-sm group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-mid"><Bot size={14} /></span>
                      <span className="text-xs font-semibold text-hi group-hover:text-hi transition-colors">
                        {item.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-mid">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages Feed */}
          {messages.map((msg, index) => {
            const isLastMessage = index === messages.length - 1;
            const isCurrentStreaming = isGenerating && isLastMessage && msg.role === 'assistant';

            return (
              <div key={msg.id} className="flex gap-3.5 text-sm">
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                    msg.role === 'user' ? 'bg-hi text-app' : 'bg-raised text-mid border border-line'
                  }`}
                >
                  {msg.role === 'user' ? 'LI' : <Bot size={14} />}
                </div>

                {/* Message Content */}
                <div className="flex-1 space-y-1 overflow-hidden">
                  <div className="flex items-center justify-between text-xs font-medium text-mid">
                    <div className="flex items-center gap-2">
                      <span>{msg.role === 'user' ? 'You' : activeAgent?.name || 'KendaliAI'}</span>
                      {msg.channel === 'telegram' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-raised text-hi border bg-raised font-mono">
                          <Smartphone size={10} /> Telegram
                        </span>
                      )}
                      {msg.channel === 'web' && isTelegramSession && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-raised text-hi border bg-raised font-mono">
                          Web UI
                        </span>
                      )}
                    </div>
                    {msg.model && (
                      <span className="text-[10px] text-lo font-mono">
                        {msg.model}
                      </span>
                    )}
                  </div>

                  {/* Streaming / Persisted Thought Process Accordion */}
                  {msg.thought && (
                    <ThoughtProcessAccordion
                      thought={msg.thought}
                      isStreaming={isCurrentStreaming && !msg.content}
                    />
                  )}

                  {/* Streaming / Completed Tool Execution Cards */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-1.5 my-2">
                      {msg.toolCalls.map((tc) => (
                        <ToolExecutionCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}

                  {/* Message Text with Streaming Cursor */}
                  <div className="text-hi leading-relaxed break-words">
                    <MarkdownRenderer text={msg.content} />
                    {isCurrentStreaming && msg.content && (
                      <span className="inline-block w-2 h-4 bg-hi animate-pulse ml-1 align-middle rounded-[1px]" />
                    )}
                    {isCurrentStreaming && !msg.content && !msg.thought && (!msg.toolCalls || msg.toolCalls.length === 0) && (
                      <div className="flex items-center gap-2 text-xs text-mid py-1 font-mono">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-hi rounded-full animate-bounce" />
                          <span className="w-1.5 h-1.5 bg-hi rounded-full animate-bounce [animation-delay:0.2s]" />
                          <span className="w-1.5 h-1.5 bg-hi rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span>{thinkingStatus || 'Initializing agent...'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Bottom Prompt Bar */}
      <div className="p-4 pt-1 max-w-3xl w-full mx-auto relative">
        {/* Slash Command Autocomplete Popover Modal */}
        {isTypingSlash && filteredSuggestions.length > 0 && (
          <SlashAutocompleteModal
            suggestions={filteredSuggestions}
            selectedIndex={selectedSuggestionIndex}
            onSelect={handleSelectSuggestion}
          />
        )}

        {/* RAG Document Ingestion Notification Banner */}
        {ragNotice && (
          <div
            className={`mb-2 rounded-xl border text-xs shadow-lg transition-all ${
              ragNotice.type === 'error'
                ? 'bg-red-500/15 border-red-500/60 text-red-100'
                : 'bg-raised border-line text-hi'
            }`}
          >
            <div className="flex items-start justify-between gap-2 px-3.5 py-2.5">
              <div className="flex items-start gap-2 min-w-0">
                {isUploadingDoc ? (
                  <RefreshCw size={13} className="animate-spin text-hi flex-shrink-0 mt-0.5" />
                ) : ragNotice.type === 'error' ? (
                  <AlertCircle size={13} className="text-red-300 flex-shrink-0 mt-0.5" />
                ) : (
                  <Database size={13} className="text-hi flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  {ragNotice.type === 'error' && (
                    <div className="font-bold text-red-200 uppercase tracking-wider text-[10px] mb-0.5">
                      Error — action failed
                    </div>
                  )}
                  <div className={`whitespace-pre-wrap break-words ${ragNotice.type === 'error' ? 'max-h-40 overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed' : ''}`}>
                    {ragNotice.text}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setRagNotice(null)}
                className="text-mid hover:text-hi p-0.5 flex-shrink-0"
                title="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end bg-inputbg border border-line rounded-2xl p-2 gap-2 shadow-xl focus-within:border-mid transition-colors">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".txt,.md,.pdf,.json,.csv,.js,.ts,.py,.go,.html,.yaml,.yml"
          />

          <button
            type="button"
            disabled={isUploadingDoc}
            className="w-8 h-8 rounded-full flex items-center justify-center text-mid hover:text-hi transition-colors disabled:opacity-50"
            title="Upload document or code into Vector RAG memory"
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploadingDoc ? <RefreshCw size={15} className="animate-spin text-hi" /> : <Paperclip size={17} />}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeAgent?.name || 'KendaliAI'}... (Type '/' for skills & MCPs)`}
            className="flex-1 bg-transparent text-sm text-hi placeholder:text-lo outline-none resize-none max-h-40 min-h-[24px] py-1 leading-relaxed"
          />

          <button
            className="w-8 h-8 rounded-full flex items-center justify-center text-mid hover:text-hi transition-colors"
            title="Voice input"
            onClick={() => alert('Voice input coming soon')}
          >
            <Mic size={17} />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isGenerating}
            className="w-8 h-8 rounded-full bg-hi text-app flex items-center justify-center font-bold disabled:bg-hoverbg disabled:text-lo transition-colors"
            title="Send Message"
          >
            <ArrowUp size={16} />
          </button>
        </div>

        <div className="text-center text-[11px] text-lo mt-2">
          KendaliAI v0.5.0 — Personal AI Agent Gateway. Supports slash skills, MCP tools & bi-directional Telegram sync.
        </div>
      </div>
    </main>
  );
};

// Autocomplete Popover Modal for Slash Commands & Agent Skills
const SlashAutocompleteModal: React.FC<{
  suggestions: SlashCommand[];
  selectedIndex: number;
  onSelect: (item: SlashCommand) => void;
}> = ({ suggestions, selectedIndex, onSelect }) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 right-4 mb-2 bg-inputbg/95 backdrop-blur-md border border-line rounded-2xl shadow-2xl overflow-hidden z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="p-2 border-b border-line flex items-center justify-between text-[11px] text-mid font-medium px-3 bg-rail">
        <div className="flex items-center gap-1.5 font-mono">
          <Command size={12} className="text-hi" />
          <span>Slash Commands & Agent Skills</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-lo font-mono">
          <span>↑↓ Navigate</span>
          <span>•</span>
          <span>Tab / Enter Select</span>
          <span>•</span>
          <span>Esc Dismiss</span>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
        {suggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const badgeColor =
            item.category === 'SKILL'
              ? 'bg-raised text-hi bg-raised'
              : item.category === 'MCP'
              ? 'bg-raised text-hi bg-raised'
              : item.category === 'DOC'
              ? 'bg-raised text-hi bg-raised'
              : 'bg-raised text-hi bg-raised';

          return (
            <div
              key={item.key}
              onClick={() => onSelect(item)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors select-none ${
                isSelected
                  ? 'hover:bg-raised text-hi border bg-raised'
                  : 'text-mid hover:bg-raised border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <div className="truncate">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-semibold text-hi">{item.prefix}</span>
                    <span className="text-mid font-sans font-medium">— {item.label}</span>
                  </div>
                  <div className="text-[11px] text-mid truncate mt-0.5">
                    {item.desc}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${badgeColor}`}>
                  {item.category}
                </span>
                {isSelected && (
                  <CornerDownLeft size={13} className="text-mid" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Collapsible Thought / Reasoning Process Accordion
const ThoughtProcessAccordion: React.FC<{ thought: string; isStreaming?: boolean }> = ({
  thought,
  isStreaming = false,
}) => {
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Auto-expand when reasoning tokens are streaming
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  const wordCount = useMemo(
    () => thought.trim().split(/\s+/).filter(Boolean).length,
    [thought]
  );

  return (
    <div className="my-2 rounded-xl border bg-raised bg-raised   overflow-hidden text-xs transition-all shadow-md">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-hi hover:text-hi bg-raised hover:bg-raised transition-colors select-none text-left"
      >
        <div className="flex items-center gap-2 font-medium">
          <Brain size={14} className={`text-hi ${isStreaming ? 'animate-pulse' : ''}`} />
          <span className="font-semibold text-hi">
            {isStreaming ? 'Reasoning in progress...' : 'Reasoning Process'}
          </span>
          <span className="text-[10px] bg-raised text-hi border bg-raised px-1.5 py-0.5 rounded-full font-mono">
            {wordCount} words
          </span>
          {isStreaming && (
            <span className="text-[9px] bg-raised text-hi px-1.5 py-0.5 rounded uppercase font-bold tracking-wider animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-hi">
          <span>{isOpen ? 'Hide reasoning' : 'Show reasoning'}</span>
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 py-3 border-t bg-raised text-mid font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text max-h-80 overflow-y-auto custom-scrollbar italic bg-black/25">
          {thought}
          {isStreaming && (
            <span className="inline-block w-2 h-3.5 bg-hi animate-pulse ml-1 align-middle" />
          )}
        </div>
      )}
    </div>
  );
};

// Markdown Renderer with Code Block formatting & Copy
const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const firstLineEnd = part.indexOf('\n');
          const lang = part.slice(3, firstLineEnd).trim();
          const code = part.slice(firstLineEnd + 1, -3);

          return <CodeBlock key={index} code={code} language={lang} />;
        }

        // Inline formatting
        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderInlineMarkdown(part)}
          </p>
        );
      })}
    </div>
  );
};

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-line bg-panel overflow-hidden my-3 text-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-inputbg border-b border-line text-mid font-mono text-[11px]">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-hi transition-colors"
        >
          {copied ? <Check size={12} className="text-hi" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 font-mono text-mid overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInlineMarkdown(text: string): React.ReactNode {
  const chunks = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return chunks.map((chunk, i) => {
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return (
        <code key={i} className="bg-raised px-1.5 py-0.5 rounded text-xs font-mono text-hi">
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-hi">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return chunk;
  });
}

// Interactive Model Selector & Search Filter Dropdown
const ModelSelectorDropdown: React.FC = () => {
  const { providers, activeAgent, activeModel, setActiveModel } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effectiveModel = activeModel || activeAgent?.model || 'default';
  const isReasoning = isReasoningModel(effectiveModel);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filtered providers and enabled models
  const filteredProviders = useMemo(() => {
    const query = searchFilter.toLowerCase().trim();
    return providers
      .map((p) => {
        const enabledModels = (p.models || []).filter((m) => m.enabled !== false);
        const matchedModels = query
          ? enabledModels.filter(
              (m) =>
                m.id.toLowerCase().includes(query) ||
                (m.name && m.name.toLowerCase().includes(query)) ||
                p.name.toLowerCase().includes(query)
            )
          : enabledModels;
        return { ...p, matchedModels };
      })
      .filter((p) => p.matchedModels.length > 0);
  }, [providers, searchFilter]);

  const totalMatchedModels = useMemo(
    () => filteredProviders.reduce((acc, p) => acc + p.matchedModels.length, 0),
    [filteredProviders]
  );

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all select-none ${
          activeModel
            ? 'hover:bg-raised hover:bg-raised bg-raised text-hi shadow-sm'
            : 'bg-inputbg hover:bg-hoverbg border-line text-mid'
        }`}
        title="Select active model or filter catalog"
      >
        {isReasoning ? (
          <Brain size={14} className="text-hi animate-pulse" />
        ) : (
          <Zap size={14} className="text-mid" />
        )}
        <span className="font-mono max-w-[140px] truncate">{effectiveModel}</span>
        {isReasoning && (
          <span className="text-[9px] bg-raised text-hi px-1 rounded uppercase tracking-wider font-semibold">
            THINK
          </span>
        )}
        <ChevronDown size={12} className={`text-mid transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 bg-panel border border-line rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Filter Input */}
          <div className="p-2 border-b border-line">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-rail border border-line rounded-lg">
              <Search size={13} className="text-lo flex-shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter models..."
                className="bg-transparent text-xs text-hi placeholder:text-lo outline-none w-full"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="text-lo hover:text-mid text-[10px]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Models List */}
          <div className="max-h-64 overflow-y-auto custom-scrollbar p-1 text-xs">
            {/* Default Agent Option */}
            <button
              type="button"
              onClick={() => {
                setActiveModel(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                !activeModel ? 'hover:bg-raised text-hi font-semibold' : 'text-mid hover:bg-raised'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-mid"><Bot size={12} /></span>
                <div className="truncate">
                  <div className="text-xs">Agent Default</div>
                  <div className="text-[10px] text-lo font-mono truncate">
                    {activeAgent?.model || 'default'}
                  </div>
                </div>
              </div>
              {!activeModel && <Check size={14} className="text-hi flex-shrink-0" />}
            </button>

            {/* Grouped by Provider */}
            {filteredProviders.map((p) => (
              <div key={p.id} className="mt-2">
                <div className="px-2.5 py-1 text-[10px] font-bold text-lo uppercase tracking-wider bg-panel rounded">
                  {p.name} ({p.type})
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {p.matchedModels.map((m) => {
                    const isSelected = activeModel === m.id;
                    const reasoning = isReasoningModel(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setActiveModel(m.id);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'hover:bg-raised text-hi font-semibold'
                            : 'text-mid hover:bg-raised'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {reasoning ? (
                            <span title="Reasoning Model" className="text-mid"><Brain size={12} /></span>
                          ) : (
                            <Zap size={12} className="text-lo" />
                          )}
                          <span className="font-mono text-xs truncate">{m.id}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {reasoning && (
                            <span className="text-[9px] bg-raised text-hi border bg-raised px-1 rounded">
                              THINK
                            </span>
                          )}
                          {isSelected && <Check size={13} className="text-hi" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {totalMatchedModels === 0 && (
              <div className="py-6 text-center text-xs text-lo">
                No enabled models match "{searchFilter}"
              </div>
            )}
          </div>

          {/* Footer: Manage Providers link */}
          <div className="p-1.5 border-t border-line bg-panel">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('providers');
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-mid hover:text-hi hover:bg-hoverbg rounded-lg transition-colors"
            >
              <Settings size={12} />
              <span>Configure Providers & Models</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
