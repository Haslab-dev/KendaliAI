import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Moon, Sun, Paperclip, Mic, ArrowUp, Copy, Check,
  ChevronDown, ChevronUp, Search, Brain, Zap, Settings, Command, AlertCircle,
  CornerDownLeft, Terminal, Sparkles, Smartphone, Database, RefreshCw, FileText, X,
  ShieldCheck, GitFork, Code2, Clock, Bell, ExternalLink, Activity, BookOpen,
  Folder, Upload, Menu, Bot, Feather
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { useAgentSocket } from '../hooks/useAgentSocket';
import { ToolExecutionCard } from './ToolExecutionCard';
import { InstallPromptModal } from './InstallPromptModal';
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
    setActiveModel,
    providers,
    mcps,
    sessions,
    tasks,
    cancelTask,
    selectSession,
  } = useAppStore();

  const { sendMessage } = useAgentSocket();
  const [inputText, setInputText] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isSlashDismissed, setIsSlashDismissed] = useState(false);

  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isWorktreeDropdownOpen, setIsWorktreeDropdownOpen] = useState(false);
  const [activeWorktree, setActiveWorktree] = useState('Home');
  const [worktreesList, setWorktreesList] = useState<{ branch: string; path?: string }[]>([]);

  useEffect(() => {
    fetch('/api/worktrees')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setWorktreesList(data.map((w: any) => ({ branch: w.branch || w.name || 'feature' })));
        }
      })
      .catch(() => {});
  }, []);

  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const worktreeDropdownRef = useRef<HTMLDivElement>(null);

  const [activeReminder, setActiveReminder] = useState<{ title: string; time?: string; id?: string } | null>(null);

  useEffect(() => {
    const reminderHandler = (e: any) => {
      const payload = e.detail;
      if (payload) {
        setActiveReminder({
          title: payload.title || 'Scheduled Reminder',
          time: payload.time,
          id: payload.id,
        });
      }
    };
    window.addEventListener('kendali:reminder', reminderHandler);
    return () => window.removeEventListener('kendali:reminder', reminderHandler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setIsAgentDropdownOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (worktreeDropdownRef.current && !worktreeDropdownRef.current.contains(e.target as Node)) {
        setIsWorktreeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runningTasks = useMemo(() => {
    return (tasks || []).filter((t) => t.status === 'running');
  }, [tasks]);

  const handleQuickReview = () => {
    const reviewer = agents.find((a) => a.id === 'reviewer') || activeAgent;
    if (reviewer && reviewer.id !== activeAgent?.id) {
      setActiveAgent(reviewer);
    }
    sendMessage("Please perform a thorough code and security review on the current workspace and git diff using review_code and git_worktree tools. Report any vulnerabilities, hardcoded secrets, code quality issues, or bugs.");
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [ragNotice, setRagNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [allDocs, setAllDocs] = useState<{ id: string; title: string; chunkCount: number }[]>([]);

  // Load all documents for /doc: autocomplete and RAG context chips
  const docsFetchedAtRef = useRef(0);
  const refreshDocs = React.useCallback(() => {
    fetch('/api/documents')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setAllDocs(Array.isArray(data) ? data.map((d: any) => ({ id: d.id, title: d.title, chunkCount: d.chunkCount || 0 })) : []);
        docsFetchedAtRef.current = Date.now();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  useEffect(() => {
    if (inputText.startsWith('/doc') && Date.now() - docsFetchedAtRef.current > 10_000) {
      refreshDocs();
    }
  }, [inputText, refreshDocs]);

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
        refreshDocs();
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
      { id: 'coder', name: 'Coder Agent', description: 'Senior software engineer, architecture & code authoring', avatar: '🛠️', skills: ['coding', 'debugging'] },
      { id: 'planner', name: 'Planner Agent', description: 'Decomposition, milestones & autonomous workflows', avatar: '🧠', skills: ['planning', 'coordination'] },
      { id: 'reviewer', name: 'Reviewer Agent', description: 'Security audit, secret leaks & vulnerability reviews', avatar: '🛡️', skills: ['review', 'security'] },
      { id: 'assistant', name: 'Personal Assistant', description: 'Proactive daily coordinator & executive tasks', avatar: '⚡', skills: ['planning', 'coordination'] },
      { id: 'research', name: 'Research Agent', description: 'In-depth research, web investigation & fact-checking', avatar: '🔍', skills: ['deep-research', 'synthesis'] },
      { id: 'knowledge', name: 'Knowledge Agent', description: 'Second brain, documentation & concept retrieval', avatar: '📚', skills: ['knowledge-graph', 'notes'] },
    ];

    agentList.forEach((ag) => {
      list.push({
        key: `skill-${ag.id}`,
        prefix: `/skill:${ag.id}`,
        label: ag.name,
        desc: ag.description || `Specialized skill: ${(ag.skills || []).join(', ')}`,
        category: 'SKILL',
        icon: ag.avatar || '🤖',
      });
    });

    // 2. MCP Server integrations
    const mcpServers = (mcps && mcps.length > 0) ? mcps : [
      { id: 'github', name: 'github', status: 'ready', toolsCached: [{ name: 'get_issue' }] },
      { id: 'filesystem', name: 'filesystem', status: 'ready', toolsCached: [{ name: 'read_file' }] },
    ];

    mcpServers.forEach((m) => {
      const toolNames = (m.toolsCached || []).map((t: any) => t.name).slice(0, 3).join(', ');
      list.push({
        key: `mcp-${m.id}`,
        prefix: `/mcp:${m.name || m.id}`,
        label: `MCP: ${m.name || m.id}`,
        desc: toolNames ? `Tools: ${toolNames}...` : 'External Model Context Protocol server',
        category: 'MCP',
        icon: '🔌',
      });
    });

    // 3. Gateway Commands & Shortcuts
    list.push(
      {
        key: 'cmd-review',
        prefix: '/review',
        label: 'Security & Diff Review',
        desc: 'Run security scanner and git diff audit',
        category: 'COMMAND',
        icon: '🛡️',
        executeDirect: handleQuickReview,
      },
      {
        key: 'cmd-new',
        prefix: '/new',
        label: 'New Chat Session',
        desc: 'Start a fresh conversation thread',
        category: 'COMMAND',
        icon: '💬',
        executeDirect: () => createSession(),
      },
      {
        key: 'cmd-clear',
        prefix: '/clear',
        label: 'Clear Messages',
        desc: 'Clear message history of current session',
        category: 'COMMAND',
        icon: '🧹',
        executeDirect: () => activeSessionId && clearSessionMessages(activeSessionId),
      },
      {
        key: 'cmd-scheduler',
        prefix: '/scheduler',
        label: 'Scheduler & Crons',
        desc: 'Open background autonomous agent scheduler',
        category: 'COMMAND',
        icon: '⏱️',
        executeDirect: () => navigate('scheduler'),
      },
      {
        key: 'cmd-worktrees',
        prefix: '/worktrees',
        label: 'Git Worktrees',
        desc: 'Manage isolated parallel branch checkouts',
        category: 'COMMAND',
        icon: '🌿',
        executeDirect: () => navigate('worktrees'),
      }
    );

    // 4. Documents in RAG
    allDocs.forEach((d) => {
      list.push({
        key: `doc-${d.id}`,
        prefix: `/doc:${d.title}`,
        label: d.title,
        desc: `Inject ${d.chunkCount} vector chunks into context`,
        category: 'DOC',
        icon: '📄',
      });
    });

    return list;
  }, [agents, mcps, allDocs, createSession, activeSessionId, clearSessionMessages]);

  const isTypingSlash = inputText.startsWith('/') && !isSlashDismissed;
  const slashQuery = isTypingSlash ? inputText.slice(1).toLowerCase() : '';

  const filteredSuggestions = useMemo(() => {
    if (!isTypingSlash) return [];
    if (!slashQuery) return slashSuggestions;
    return slashSuggestions.filter(
      (s) =>
        s.prefix.toLowerCase().includes(slashQuery) ||
        s.label.toLowerCase().includes(slashQuery) ||
        s.desc.toLowerCase().includes(slashQuery)
    );
  }, [isTypingSlash, slashQuery, slashSuggestions]);

  const handleSelectSuggestion = (suggestion: SlashCommand) => {
    if (suggestion.executeDirect) {
      suggestion.executeDirect();
      setInputText('');
    } else {
      setInputText(`${suggestion.prefix} `);
      textareaRef.current?.focus();
    }
    setIsSlashDismissed(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredSuggestions[selectedSuggestionIndex] || filteredSuggestions[0];
        if (selected) handleSelectSuggestion(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSlashDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (!val.startsWith('/')) {
      setIsSlashDismissed(false);
    }
    setSelectedSuggestionIndex(0);

    // Auto-expand height
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isGenerating) return;

    sendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const effectiveModel = activeModel || activeAgent?.model || 'Claude Sonnet 4.6';
  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const isTelegramSession = currentSession?.channelId === 'telegram';
  const botLabel = isTelegramSession ? '@kendaliai_bot' : 'Telegram Bot';

  return (
    <main className="flex-1 h-full flex flex-col bg-[#F7F7F5] overflow-hidden relative">
      {/* Reminder high-priority banner */}
      {activeReminder && (
        <div className="bg-[#FFF5EB] border-b border-[#F5E3CF] px-4 py-2 z-30 select-none">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-[#D97706] animate-bounce" />
              <div className="flex items-center gap-1.5 font-funnel">
                <span className="font-bold text-[#D97706]">Reminder Alert:</span>
                <span className="text-[#333333] font-medium">{activeReminder.title}</span>
                {activeReminder.time && (
                  <span className="text-[10px] bg-[#FFFFFF] border border-[#E5E7EB] px-1.5 py-0.5 rounded text-[#8A8A85] font-mono">
                    {activeReminder.time}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setActiveReminder(null)}
              className="text-[#8A8A85] hover:text-[#000000] p-1 rounded hover:bg-[#FFFFFF] transition-colors"
              title="Dismiss reminder"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Chat Header matching refs/desktop/chat.html */}
      <div className="w-full h-[60px] shrink-0 flex flex-row gap-3 px-4 sm:px-6 items-center bg-[#FFFFFF] border-b border-[#E5E7EB] z-20 select-none">
        {/* Mobile menu trigger */}
        <button
          onClick={() => {
            const drawer = document.getElementById('kendali-mobile-drawer');
            if (drawer) drawer.classList.toggle('hidden');
          }}
          className="p-1.5 text-[#333333] hover:text-[#000000] md:hidden rounded hover:bg-[#F7F7F5]"
        >
          <Menu size={18} />
        </button>

        {/* Agent Avatar */}
        <div className="w-[30px] h-[30px] shrink-0 bg-[#0F0F0F] rounded-full flex items-center justify-center text-white">
          <Bot size={15} />
        </div>

        {/* Header Title */}
        <div className="flex flex-col gap-[1px] justify-start items-start">
          <div className="text-[14px] leading-tight text-[#000000] font-inter font-bold">
            {activeAgent?.name || 'Hermes Agent'}
          </div>
          <div className="text-[10px] leading-tight text-[#8A8A85] font-funnel font-normal">
            🛠️ {activeAgent?.id || 'Coder'} persona · {effectiveModel} · {messages.length} messages
          </div>
        </div>

        <div className="flex-1" />

        {/* Action Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Review Diff Chip */}
          <button
            onClick={handleQuickReview}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF5EB] border border-[#E5E7EB] hover:border-[#D97706] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
            title="Run code & security review on workspace diff"
          >
            <ShieldCheck size={13} className="text-[#333333]" />
            <span>Review Diff</span>
          </button>

          {/* Worktrees Chip */}
          <button
            onClick={() => navigate('worktrees')}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
            title="Git Worktrees & Branch Isolation"
          >
            <GitFork size={13} className="text-[#333333]" />
            <span>Worktrees</span>
          </button>

          {/* Files Chip */}
          <button
            onClick={() => navigate('editor')}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
            title="File Explorer & Code Editor"
          >
            <Folder size={13} className="text-[#333333]" />
            <span>Files</span>
          </button>

          {/* Model Chip & Dropdown */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
              title="Select LLM model"
            >
              <ChevronDown size={13} className={`text-[#333333] transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              <span className="font-medium max-w-[120px] truncate">Model: {effectiveModel}</span>
            </button>

            {isModelDropdownOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-xl p-1.5 z-50 animate-in fade-in duration-100">
                <div className="px-2.5 py-1 text-[10px] font-bold text-[#8A8A85] uppercase tracking-wider font-funnel border-b border-[#E5E7EB] mb-1">
                  Active Model Routing
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  {[
                    'Claude Sonnet 4.6',
                    'GPT-4o',
                    'DeepSeek V3',
                    'DeepSeek R1',
                    'Ollama (Local Qwen 2.5)',
                  ].map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setActiveModel(m);
                        setIsModelDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs rounded hover:bg-[#F7F7F5] transition-colors ${
                        effectiveModel === m ? 'font-bold text-[#007AFF] bg-[#EBF5FF]' : 'text-[#333333]'
                      }`}
                    >
                      <span className="font-mono text-[11px] truncate">{m}</span>
                      {effectiveModel === m && <Check size={12} className="text-[#007AFF]" />}
                    </button>
                  ))}
                </div>
                <div
                  onClick={() => {
                    setIsModelDropdownOpen(false);
                    navigate('providers');
                  }}
                  className="border-t border-[#E5E7EB] mt-1 pt-1.5 px-2.5 py-1 text-[11px] text-[#007AFF] hover:underline cursor-pointer flex items-center justify-between font-funnel"
                >
                  <span>Configure Providers...</span>
                  <ExternalLink size={11} />
                </div>
              </div>
            )}
          </div>

          {/* New Chat Button */}
          <button
            onClick={() => createSession()}
            className="w-8 h-8 rounded-[4px] border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F7F7F5] text-[#333333] flex items-center justify-center transition-colors shadow-2xs"
            title="New Chat Session"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-14 py-6 flex flex-col gap-5">
        {/* Parallel Running Background Tasks Banner */}
        {runningTasks.length > 0 && (
          <div className="w-full shrink-0 flex flex-row gap-2.5 p-[10px_14px] items-center bg-[#EBF5FF] border border-[#BFDBFE] rounded-[8px] shadow-2xs">
            <RefreshCw size={14} className="animate-spin text-[#007AFF] shrink-0" />
            <div className="text-[12px] text-[#333333] font-geist flex-1 truncate">
              {runningTasks[0].title} — running {Math.max(1, Math.round((Date.now() - runningTasks[0].startedAt) / 1000))}s
            </div>
            <button
              onClick={() => selectSession(runningTasks[0].sessionId)}
              className="px-2.5 py-1 bg-[#007AFF] text-white text-[11px] font-funnel font-bold rounded-[4px] transition-colors"
            >
              View
            </button>
            <button
              onClick={() => cancelTask(runningTasks[0].id)}
              className="px-2.5 py-1 bg-[#FFFFFF] border border-[#E5E7EB] text-[#333333] text-[11px] font-funnel rounded-[4px] hover:bg-[#F7F7F5] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Zero State View */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center my-auto py-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#0F0F0F] text-white mb-3 shadow-md">
              <Bot size={28} />
            </div>
            <h1 className="text-xl font-bold font-inter text-[#000000] mb-1">
              Hermes Agent Gateway
            </h1>
            <p className="text-xs text-[#8A8A85] font-funnel mb-6 max-w-sm">
              Local AI pairing & autonomous workflows connected to{' '}
              <span className="text-[#000000] font-semibold">{activeAgent?.name || 'Coder Persona'}</span>
            </p>

            {/* Quick Starters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
              {[
                {
                  title: 'Review Workspace Security',
                  desc: 'Run security scan and check for secrets in diff',
                  prompt: 'Please review the workspace and git diff for security vulnerabilities and code quality using review_code.',
                  icon: <ShieldCheck size={14} className="text-[#16A34A]" />,
                },
                {
                  title: 'Build Landing Page',
                  desc: 'Scaffold responsive layout with clean CSS',
                  prompt: 'Let\'s build a responsive modern landing page component with clean design tokens.',
                  icon: <Code2 size={14} className="text-[#007AFF]" />,
                },
                {
                  title: 'Create Background Agent Task',
                  desc: 'Run autonomous task in isolated worker pool',
                  prompt: 'Please create a background agent task to monitor our endpoint health every 5 minutes.',
                  icon: <Clock size={14} className="text-[#D97706]" />,
                },
                {
                  title: 'Git Worktree Branch',
                  desc: 'Create isolated worktree for parallel development',
                  prompt: 'Create a new git worktree for feature refactoring and report its status.',
                  icon: <GitFork size={14} className="text-[#8A8A85]" />,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  onClick={() => sendMessage(item.prompt)}
                  className="p-3 bg-[#FFFFFF] hover:bg-[#FFF5EB] border border-[#E5E7EB] hover:border-[#D97706] rounded-[8px] text-left cursor-pointer transition-all shadow-2xs group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{item.icon}</span>
                    <span className="text-xs font-bold font-funnel text-[#000000]">{item.title}</span>
                  </div>
                  <div className="text-[11px] text-[#8A8A85] font-geist">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message Stream */}
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          const isCurrentStreaming = isGenerating && isLastMessage && msg.role === 'assistant';

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="w-full flex flex-row justify-end items-start">
                <div className="w-full max-w-[520px] p-[12px_16px] bg-[#0F0F0F] text-[#FFFFFF] rounded-[8px] shadow-sm">
                  <div className="text-[13px]/[20px] font-geist whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="w-full flex flex-row gap-2.5 justify-start items-start">
              {/* Avatar */}
              <div className="w-[28px] h-[28px] shrink-0 bg-[#0F0F0F] rounded-full flex items-center justify-center text-white mt-0.5">
                <Bot size={14} />
              </div>

              {/* Agent Bubble Container */}
              <div className="flex-1 flex flex-col gap-2.5 min-w-0">
                {/* Collapsible Thought Process */}
                {msg.thought && (
                  <ThoughtProcessAccordion
                    thought={msg.thought}
                    isStreaming={isCurrentStreaming && !msg.content}
                  />
                )}

                {/* Tool Execution Cards */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1.5 my-1">
                    {msg.toolCalls.map((tc) => (
                      <ToolExecutionCard key={tc.id} toolCall={tc} />
                    ))}
                  </div>
                )}

                {/* Message Content with Markdown */}
                <div className="text-[13px]/[21px] text-[#000000] font-geist leading-relaxed break-words">
                  <MarkdownRenderer text={msg.content} />
                  {isCurrentStreaming && msg.content && (
                    <span className="inline-block w-1.5 h-3.5 bg-[#007AFF] animate-pulse ml-1 align-middle rounded-[1px]" />
                  )}
                  {isCurrentStreaming && !msg.content && !msg.thought && (!msg.toolCalls || msg.toolCalls.length === 0) && (
                    <div className="flex items-center gap-2 text-xs text-[#8A8A85] py-1 font-mono">
                      <RefreshCw size={12} className="animate-spin text-[#007AFF]" />
                      <span>{thinkingStatus || 'Agent thinking...'}</span>
                    </div>
                  )}
                </div>

                {/* Grounding RAG Chips */}
                {msg.ragSources && msg.ragSources.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {msg.ragSources.map((rs, idx) => (
                      <div
                        key={`${rs.title}-${idx}`}
                        className="flex items-center gap-1 px-2 py-0.5 bg-[#FFF5EB] rounded-[4px] text-[10px] text-[#F97316] font-funnel"
                        title={`RAG grounded: ${rs.title} (score: ${rs.score.toFixed(2)})`}
                      >
                        <BookOpen size={10} className="text-[#F97316]" />
                        <span>doc:{rs.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Token Count & Time Footer */}
                <div className="text-[10px] text-[#8A8A85] font-funnel">
                  {msg.tokens ? `${msg.tokens} tokens` : 'local execution'} ·{' '}
                  {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Prompt Bar matching refs/desktop/chat.html */}
      <div className="w-full shrink-0 p-[12px_16px_20px_16px] sm:p-[12px_56px_20px_56px] bg-[#F7F7F5] relative">
        {/* Slash Command Autocomplete Popover Modal */}
        {isTypingSlash && filteredSuggestions.length > 0 && (
          <SlashAutocompleteModal
            suggestions={filteredSuggestions}
            selectedIndex={selectedSuggestionIndex}
            onSelect={handleSelectSuggestion}
          />
        )}

        {/* Ingest Notification */}
        {ragNotice && (
          <div className="mb-2 p-2.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 text-[#333333] font-geist">
              {isUploadingDoc ? <RefreshCw size={13} className="animate-spin text-[#007AFF]" /> : <Database size={13} className="text-[#007AFF]" />}
              <span>{ragNotice.text}</span>
            </div>
            <button onClick={() => setRagNotice(null)} className="text-[#8A8A85] hover:text-[#000000]">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Input Box Card */}
        <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-3.5 shadow-sm flex flex-col gap-2.5 focus-within:border-[#007AFF] transition-colors">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".txt,.md,.pdf,.json,.csv,.js,.ts,.py,.go,.html,.yaml,.yml"
          />

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Message Hermes Agent… try /review, /scheduler, /skill:planner, /doc:api-spec"
            className="w-full bg-transparent text-[13px] text-[#000000] placeholder:text-[#8A8A85] font-geist resize-none outline-none min-h-[36px] max-h-40 leading-relaxed"
          />

          {/* Toolbar */}
          <div className="w-full flex items-center gap-2.5 flex-wrap pt-1 border-t border-[#F0F0EE]">
            {/* Attachment */}
            <button
              type="button"
              disabled={isUploadingDoc}
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-[#333333] hover:text-[#000000] rounded hover:bg-[#F7F7F5] transition-colors"
              title="Upload document to Vector RAG"
            >
              <Paperclip size={15} />
            </button>

            {/* Mic */}
            <button
              type="button"
              onClick={() => alert('Audio voice mode coming soon')}
              className="p-1 text-[#333333] hover:text-[#000000] rounded hover:bg-[#F7F7F5] transition-colors"
              title="Voice input"
            >
              <Mic size={15} />
            </button>

            {/* Upload code */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-[#333333] hover:text-[#000000] rounded hover:bg-[#F7F7F5] transition-colors"
              title="Upload file or manifest"
            >
              <Upload size={15} />
            </button>

            {/* Divider */}
            <div className="w-[1px] h-[16px] bg-[#E5E7EB]" />

            {/* Persona Selector Dropdown */}
            <div className="relative" ref={agentDropdownRef}>
              <button
                type="button"
                onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                className="flex items-center gap-1 text-[11px] text-[#333333] font-funnel hover:text-[#000000] px-1 py-0.5 rounded hover:bg-[#F7F7F5]"
              >
                <span>{activeAgent?.name || 'default'}</span>
                <ChevronDown size={11} className="text-[#8A8A85]" />
              </button>

              {isAgentDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-52 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <div className="px-2 py-1 text-[9px] font-bold text-[#8A8A85] uppercase tracking-wider font-funnel border-b border-[#E5E7EB] mb-1">
                    Select Agent Persona
                  </div>
                  {agents.map((ag) => (
                    <button
                      key={ag.id}
                      onClick={() => {
                        setActiveAgent(ag);
                        setIsAgentDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1 text-left text-xs rounded hover:bg-[#F7F7F5] ${
                        activeAgent?.id === ag.id ? 'font-bold text-[#007AFF]' : 'text-[#333333]'
                      }`}
                    >
                      <span className="truncate">{ag.name}</span>
                      {activeAgent?.id === ag.id && <Check size={12} className="text-[#007AFF]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Worktree / Workspace Selector */}
            <div className="relative" ref={worktreeDropdownRef}>
              <button
                type="button"
                onClick={() => setIsWorktreeDropdownOpen(!isWorktreeDropdownOpen)}
                className="flex items-center gap-1 text-[11px] text-[#333333] font-funnel hover:text-[#000000] px-1 py-0.5 rounded hover:bg-[#F7F7F5]"
              >
                <span>{activeWorktree}</span>
                <ChevronDown size={11} className="text-[#8A8A85]" />
              </button>

              {isWorktreeDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-48 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-xl p-1 z-50">
                  <div className="px-2 py-1 text-[9px] font-bold text-[#8A8A85] uppercase tracking-wider font-funnel border-b border-[#E5E7EB] mb-1">
                    Active Git Worktree
                  </div>
                  {['Home', ...worktreesList.map((w) => w.branch)].map((wt) => (
                    <button
                      key={wt}
                      onClick={() => {
                        setActiveWorktree(wt);
                        setIsWorktreeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1 text-left text-xs rounded hover:bg-[#F7F7F5] ${
                        activeWorktree === wt ? 'font-bold text-[#007AFF]' : 'text-[#333333]'
                      }`}
                    >
                      <span className="truncate font-mono text-[11px]">{wt}</span>
                      {activeWorktree === wt && <Check size={12} className="text-[#007AFF]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model Selector Tag */}
            <div className="flex items-center gap-1 text-[11px] text-[#333333] font-funnel">
              <span className="truncate max-w-[130px]">{effectiveModel}</span>
            </div>

            <div className="flex-1" />

            {/* Keyboard shortcut hint */}
            <div className="hidden sm:block text-[10px] text-[#8A8A85] font-funnel">
              Enter ↵ send · ⇧Enter newline
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isGenerating}
              className="w-[32px] h-[32px] shrink-0 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white rounded-[4px] flex items-center justify-center transition-colors"
              title="Send Message"
            >
              <ArrowUp size={15} />
            </button>
          </div>
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
    <div className="absolute bottom-full left-4 right-4 sm:left-14 sm:right-14 mb-2 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-2xl overflow-hidden z-40 animate-in fade-in duration-100">
      <div className="p-2 border-b border-[#E5E7EB] flex items-center justify-between text-[11px] text-[#8A8A85] font-funnel px-3 bg-[#F7F7F5]">
        <div className="flex items-center gap-1.5 font-funnel font-bold text-[#000000]">
          <Command size={12} className="text-[#007AFF]" />
          <span>Slash Commands & Agent Skills</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#8A8A85] font-funnel">
          <span>↑↓ Navigate</span>
          <span>•</span>
          <span>Tab / Enter Select</span>
          <span>•</span>
          <span>Esc Dismiss</span>
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
        {suggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={item.key}
              onClick={() => onSelect(item)}
              className={`flex items-center justify-between px-3 py-2 rounded-[6px] cursor-pointer transition-colors select-none ${
                isSelected
                  ? 'bg-[#FFF5EB] border border-[#F5E3CF]'
                  : 'hover:bg-[#F7F7F5] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="text-sm flex-shrink-0">{item.icon}</span>
                <div className="truncate">
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="font-bold text-[#000000]">{item.prefix}</span>
                    <span className="text-[#8A8A85] font-sans font-normal">— {item.label}</span>
                  </div>
                  <div className="text-[11px] text-[#8A8A85] font-geist truncate mt-0.5">
                    {item.desc}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider font-funnel bg-[#F7F7F5] text-[#8A8A85] border border-[#E5E7EB]">
                  {item.category}
                </span>
                {isSelected && (
                  <CornerDownLeft size={13} className="text-[#D97706]" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Collapsible Thought / Reasoning Process Accordion matching refs/desktop/chat.html
const ThoughtProcessAccordion: React.FC<{ thought: string; isStreaming?: boolean }> = ({
  thought,
  isStreaming = false,
}) => {
  const [isOpen, setIsOpen] = useState(isStreaming);

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
    <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] overflow-hidden my-1 shadow-2xs">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex flex-row gap-2 p-[10px_14px] items-center cursor-pointer select-none"
      >
        <Brain size={14} className={`text-[#007AFF] ${isStreaming ? 'animate-pulse' : ''}`} />
        <div className="text-[12px] text-[#333333] font-funnel font-bold">
          Thought process
        </div>
        <div className="text-[11px] text-[#007AFF] font-funnel">
          {isStreaming ? 'streaming · ' : ''}{wordCount} words
        </div>
        <div className="flex-1" />
        {isOpen ? (
          <ChevronUp size={14} className="text-[#8A8A85]" />
        ) : (
          <ChevronDown size={14} className="text-[#8A8A85]" />
        )}
      </div>

      {isOpen && (
        <div className="w-full p-[0px_14px_12px_14px]">
          <div className="text-[12px]/[19px] text-[#8A8A85] font-geist whitespace-pre-wrap">
            {thought}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 bg-[#007AFF] animate-pulse ml-1 align-middle" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Markdown Renderer with Code Block formatting & Copy
const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

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
    <div className="rounded-[8px] border border-[#E5E7EB] bg-[#0F0F0F] text-[#FFFFFF] overflow-hidden my-3 text-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#1F1F1F] border-b border-[#2E2E2E] text-[#8A8A85] font-mono text-[11px]">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-[#FFFFFF] transition-colors"
        >
          {copied ? <Check size={12} className="text-[#16A34A]" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 font-mono text-[#F7F7F5] overflow-x-auto text-[12px] leading-relaxed">
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
        <code key={i} className="bg-[#E5E7EB] text-[#0F0F0F] px-1.5 py-0.5 rounded text-xs font-mono">
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-[#000000]">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return chunk;
  });
}
