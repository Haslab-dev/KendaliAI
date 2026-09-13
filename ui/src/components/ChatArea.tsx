import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Moon, Sun, Paperclip, Mic, ArrowUp, Copy, Check,
  ChevronDown, ChevronUp, Search, Brain, Zap, Settings, Command, AlertCircle,
  CornerDownLeft, Terminal, Sparkles, Smartphone, Database, RefreshCw, FileText, X,
  ShieldCheck, GitFork, Code2, Clock, Bell, ExternalLink, Activity, BookOpen,
  Folder, Upload, Menu, Bot, Feather, Cpu, Send
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { useAgentSocket } from '../hooks/useAgentSocket';
import { ToolExecutionCard } from './ToolExecutionCard';
import { InstallPromptModal } from './InstallPromptModal';
import { GrokAvatar } from './GrokAvatar';
import { Sidebar } from './Sidebar';
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
    availableModels,
    defaultModel,
    loadModels,
    setDefaultModel,
    isLoadingModels,
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
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isWorktreeDropdownOpen, setIsWorktreeDropdownOpen] = useState(false);
  const [activeWorktree, setActiveWorktree] = useState('Home');
  const [worktreesList, setWorktreesList] = useState<{ branch: string; path?: string }[]>([]);

  useEffect(() => {
    loadModels(false);
  }, [loadModels]);

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

  const staffWorkersList = useMemo(() => {
    try {
      const saved = localStorage.getItem('kendali_office_workers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((w: any) => ({
            id: w.id,
            name: w.role || w.name,
            fullName: w.name,
            role: w.role,
            department: w.department,
            avatar: w.avatar || w.id,
            model: w.model,
            description: w.description,
            systemPrompt: w.systemPrompt,
            skills: w.skills || [],
            tools: w.tools || [],
            telegramBot: w.telegramBot,
          }));
        }
      }
    } catch {}
    return [
      { id: 'lead-frontend', name: 'Lead Frontend Dev', fullName: 'Alex Rivera', role: 'Lead Frontend Dev', department: 'Engineering', avatar: 'blue-drop', model: 'gpt-4o', description: 'React, TypeScript, and responsive UI' },
      { id: 'lead-architecture', name: 'Lead Architecture', fullName: 'Elena Rostova', role: 'Lead Solution Architecture', department: 'Architecture', avatar: 'cyan-bubble', model: 'claude-3-7-sonnet', description: 'System boundaries & RFC specs' },
      { id: 'lead-backend', name: 'Lead Backend Dev', fullName: 'Marcus Chen', role: 'Lead Backend Dev', department: 'Engineering', avatar: 'green-cloud', model: 'qwen2.5-coder:latest', description: 'Go server & SQLite runtime' },
      { id: 'legal-counsel', name: 'Legal Counsel', fullName: 'Sarah Vance', role: 'Legal Counsel & Compliance', department: 'Legal', avatar: 'bronze-shield', model: 'gpt-4o', description: 'Licenses & privacy compliance' },
      { id: 'chief-security', name: 'Chief Security', fullName: 'Kavita Patel', role: 'Chief Security & QA Officer', department: 'Security', avatar: 'ruby-capsule', model: 'gpt-4o', description: 'Secrets scanning & OWASP audits' },
      { id: 'devops-lead', name: 'DevOps Lead', fullName: 'Darius Thorne', role: 'DevOps & Infrastructure Lead', department: 'Operations', avatar: 'orange-leaf', model: 'deepseek-chat', description: 'Docker, CI/CD, and mesh networks' },
    ];
  }, []);

  const handleSwitchWorker = async (worker: any) => {
    if (worker.model) {
      setActiveModel(worker.model);
    }
    const matched = agents.find((a) => a.id === worker.id);
    if (matched) {
      setActiveAgent(matched);
      if (matched.model) setActiveModel(matched.model);
    } else {
      setActiveAgent({
        id: worker.id,
        name: worker.role || worker.name,
        description: worker.description || `Specialist Staff: ${worker.name}`,
        providerId: '',
        model: worker.model || '',
        systemPrompt: worker.systemPrompt || `You are ${worker.name}. Execute instructions thoroughly and report back clearly.`,
        skills: worker.skills || [],
        tools: worker.tools || ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
        mcp: [],
        memoryScopes: ['user', 'workspace'],
        policy: {},
        avatar: worker.avatar,
        isDefault: false,
      });
    }
    const existing = sessions.find((s) => s.agentId === worker.id);
    if (existing) {
      await selectSession(existing.id);
    } else {
      const newId = await createSession(worker.id);
      await selectSession(newId);
    }
    setIsAgentPickerOpen(false);
    setIsMobileDrawerOpen(false);
  };

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

  const effectiveModel = activeModel || activeAgent?.model || defaultModel || 'gpt-4o';

  const filteredModels = useMemo(() => {
    let list = availableModels;
    if (list.length === 0) {
      list = [
        { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', providerName: 'OpenAI Compatible', isDefault: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', providerName: 'OpenAI Compatible' },
        { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', providerId: 'anthropic', providerName: 'Anthropic' },
        { id: 'deepseek-chat', name: 'DeepSeek V3', providerId: 'deepseek', providerName: 'DeepSeek' },
        { id: 'qwen2.5-coder:latest', name: 'Qwen 2.5 Coder (Ollama)', providerId: 'ollama', providerName: 'Ollama Local' },
      ];
    }
    if (!modelSearch.trim()) return list;
    const q = modelSearch.toLowerCase().trim();
    return list.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.providerName || '').toLowerCase().includes(q)
    );
  }, [availableModels, modelSearch]);

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

      {/* Chat Header matching Grok Bot style */}
      <div className="w-full min-h-[64px] shrink-0 flex flex-row gap-3 px-3 sm:px-6 items-center bg-[#FFFFFF] border-b border-[#E5E7EB] z-20 select-none py-2">
        {/* Mobile menu trigger for Agents & Session History Drawer */}
        <button
          onClick={() => setIsMobileDrawerOpen(true)}
          className="p-2 text-[#333333] hover:text-[#000000] md:hidden rounded-lg hover:bg-[#F7F7F5] cursor-pointer shrink-0"
          title="Open Agents & Session History Drawer"
        >
          <Menu size={20} />
        </button>

        {/* Grok Specialist Agent Avatar + Switcher Trigger */}
        <div
          onClick={() => setIsAgentPickerOpen(true)}
          className="relative shrink-0 flex items-center justify-center cursor-pointer group"
          title="Click to switch specialist agent worker"
        >
          <GrokAvatar
            id={activeAgent?.avatar || activeAgent?.id || 'purple-pebble'}
            size={44}
            className="drop-shadow-xs transition-transform group-hover:scale-105"
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#16A34A] border-2 border-white ring-1 ring-emerald-500/20" title="Online" />
        </div>

        {/* Header Title & Role (Click to switch agent worker) */}
        <div
          onClick={() => setIsAgentPickerOpen(true)}
          className="flex flex-col gap-[2px] justify-start items-start min-w-0 cursor-pointer group/agent-title"
          title="Click to switch specialist agent worker"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] sm:text-[16px] leading-tight text-[#000000] font-sans font-bold tracking-tight truncate group-hover/agent-title:text-[#007AFF] transition-colors">
              {activeAgent?.name || 'Chief of Staff'}
            </span>
            <ChevronDown size={14} className="text-[#8A8A85] group-hover/agent-title:text-[#007AFF] transition-colors shrink-0" />
            <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold font-sans uppercase tracking-wider bg-blue-50 text-[#007AFF] border border-blue-100 truncate">
              {activeAgent?.role || activeAgent?.department || 'Specialist'}
            </span>
          </div>
          <div className="text-[11px] leading-tight text-[#8A8A85] font-sans truncate max-w-[170px] sm:max-w-md">
            {activeAgent?.description || 'Autonomous specialist agent'} · <span className="font-mono text-[#4B5563]">{effectiveModel}</span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[6px] text-[11px] font-sans text-[#333333] transition-all shadow-2xs cursor-pointer"
              title="Select LLM model"
            >
              <Cpu size={13} className="text-[#007AFF]" />
              <span className="font-semibold max-w-[130px] truncate">{effectiveModel}</span>
              {defaultModel === effectiveModel && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-bold uppercase">
                  Default
                </span>
              )}
              <ChevronDown size={12} className={`text-[#8A8A85] transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelDropdownOpen && (
              <div className="absolute right-0 mt-1 w-80 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] shadow-2xl p-2.5 z-50 animate-in fade-in duration-100 flex flex-col gap-2">
                {/* Header with Refresh */}
                <div className="flex items-center justify-between px-1 pb-1.5 border-b border-[#E5E7EB]">
                  <div className="flex items-center gap-1.5">
                    <Cpu size={14} className="text-[#007AFF]" />
                    <span className="text-xs font-bold text-[#000000] font-sans">
                      Select LLM Model
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadModels(true);
                    }}
                    disabled={isLoadingModels}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#007AFF] hover:underline cursor-pointer p-1 rounded hover:bg-blue-50 transition-colors"
                    title="Probe connected providers for latest models"
                  >
                    <RefreshCw size={11} className={isLoadingModels ? 'animate-spin' : ''} />
                    <span>{isLoadingModels ? 'Fetching...' : 'Fetch Models'}</span>
                  </button>
                </div>

                {/* Model Search */}
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
                  <input
                    type="text"
                    placeholder="Search model (e.g. gpt-4o, qwen, claude)..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full pl-7 pr-2.5 py-1 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                  />
                </div>

                {/* Models List Grouped by Provider */}
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                  {filteredModels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#8A8A85]">
                      No matching models found. Try fetching or enter custom ID below.
                    </div>
                  ) : (
                    filteredModels.map((m) => {
                      const isSelected = effectiveModel === m.id || effectiveModel === m.name;
                      const isDefault = defaultModel === m.id;

                      return (
                        <div
                          key={`${m.providerId}-${m.id}`}
                          onClick={() => {
                            setActiveModel(m.id);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`group/item w-full flex items-center justify-between p-2 rounded-[6px] text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/70 border border-[#007AFF]/30'
                              : 'hover:bg-[#F7F7F5] border border-transparent'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono text-xs truncate ${isSelected ? 'font-bold text-[#007AFF]' : 'text-[#000000]'}`}>
                                {m.name || m.id}
                              </span>
                              {isDefault && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold uppercase shrink-0">
                                  Default
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#8A8A85] truncate">
                              {m.providerName || m.providerId} · {m.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isDefault && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDefaultModel(m.id, m.providerId);
                                }}
                                className="opacity-0 group-hover/item:opacity-100 text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold transition-all"
                                title="Set as default model for all purposes"
                              >
                                Set Default
                              </button>
                            )}
                            {isSelected && (
                              <Check size={14} className="text-[#007AFF]" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Custom Model Quick Enter */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!customModelInput.trim()) return;
                    setActiveModel(customModelInput.trim());
                    setCustomModelInput('');
                    setIsModelDropdownOpen(false);
                  }}
                  className="pt-2 border-t border-[#E5E7EB] flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    placeholder="Enter custom model ID..."
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    className="flex-1 px-2.5 py-1 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs font-mono text-[#000000] outline-none focus:border-[#0F0F0F]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] hover:bg-black/90 cursor-pointer"
                  >
                    Apply
                  </button>
                </form>

                {/* Configure Providers Link */}
                <div
                  onClick={() => {
                    setIsModelDropdownOpen(false);
                    navigate('providers');
                  }}
                  className="border-t border-[#E5E7EB] pt-1.5 px-1 text-[11px] text-[#007AFF] hover:underline cursor-pointer flex items-center justify-between font-sans"
                >
                  <span>Manage Providers &amp; API Keys...</span>
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

        {/* Zero State View with Big Grok Bot Avatar */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center my-auto py-10 animate-fade-in">
            <div className="relative mb-5 group cursor-pointer" onClick={() => setIsAgentPickerOpen(true)} title="Switch Specialist Agent Worker">
              <GrokAvatar
                id={activeAgent?.avatar || activeAgent?.id || 'purple-pebble'}
                size={96}
                className="drop-shadow-xl transition-all duration-300 group-hover:scale-108"
              />
              <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#16A34A] border-3 border-white ring-2 ring-emerald-500/20" title="Online" />
            </div>
            <h1 className="text-2xl font-bold font-sans text-[#000000] mb-1.5 tracking-tight flex items-center justify-center gap-2">
              <span>{activeAgent?.name || 'Chief of Staff'}</span>
              <button
                onClick={() => setIsAgentPickerOpen(true)}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#007AFF] border border-blue-100 hover:bg-blue-100 cursor-pointer"
                title="Switch agent"
              >
                Change Agent
              </button>
            </h1>
            <p className="text-xs text-[#8A8A85] font-sans mb-7 max-w-md leading-relaxed">
              {activeAgent?.description || 'Autonomous specialist agent equipped with dedicated skills, tools, and Telegram gateway routing.'}
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
            <div key={msg.id} className="w-full flex flex-row gap-3.5 justify-start items-start">
              {/* Big Grok Avatar */}
              <div className="shrink-0 mt-0.5 relative group">
                <GrokAvatar
                  id={activeAgent?.avatar || activeAgent?.id || 'purple-pebble'}
                  size={38}
                  className="drop-shadow-xs transition-transform group-hover:scale-105"
                />
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
            placeholder={`Message ${activeAgent?.name || 'Chief of Staff'}… try /review, /scheduler, /skill:planner`}
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

      {/* ------------------------------------------------------------- */}
      {/* MOBILE SLIDE-OVER DRAWER (Agent Workers & Session History)     */}
      {/* ------------------------------------------------------------- */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Container */}
          <div className="relative w-[85vw] max-w-[320px] h-full bg-[#FFFFFF] dark:bg-[#141414] shadow-2xl z-10 flex flex-col transform transition-transform duration-200">
            <Sidebar isMobile onClose={() => setIsMobileDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MOBILE / DESKTOP SPECIALIST AGENT WORKER PICKER SHEET         */}
      {/* ------------------------------------------------------------- */}
      {isAgentPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsAgentPickerOpen(false)}
          />

          {/* Sheet Modal */}
          <div className="relative w-full sm:max-w-lg bg-[#FFFFFF] dark:bg-[#1C1C1E] rounded-t-[18px] sm:rounded-[14px] shadow-2xl border border-[#E5E7EB] dark:border-[#2C2C2E] max-h-[85vh] flex flex-col z-10 overflow-hidden">
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div>
                <h3 className="text-sm font-bold text-[#000000] dark:text-white font-sans">
                  Switch Specialist Agent Worker
                </h3>
                <p className="text-[11px] text-[#8A8A85]">
                  Each worker operates with dedicated specialty skills, model &amp; Telegram bot
                </p>
              </div>
              <button
                onClick={() => setIsAgentPickerOpen(false)}
                className="p-1.5 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Workers List */}
            <div className="overflow-y-auto custom-scrollbar p-3 space-y-2 max-h-[60vh]">
              {staffWorkersList.map((worker: any) => {
                const isCurrent = activeAgent?.id === worker.id;
                const botUsername = worker.telegramBot?.username;
                const isBotConnected = worker.telegramBot?.status === 'connected';

                return (
                  <div
                    key={worker.id}
                    onClick={() => handleSwitchWorker(worker)}
                    className={`flex items-center justify-between p-3 rounded-[10px] border cursor-pointer transition-all ${
                      isCurrent
                        ? 'border-[#007AFF] bg-blue-50/70 dark:bg-blue-950/30 shadow-xs ring-1 ring-[#007AFF]/30'
                        : 'border-[#E5E7EB] dark:border-[#2C2C2E] bg-[#FFFFFF] dark:bg-[#18181B] hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <GrokAvatar id={worker.avatar || worker.id} size={40} />
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-black" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#000000] dark:text-white font-sans truncate">
                            {worker.role || worker.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                            {worker.department}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#8A8A85] truncate font-sans">
                          {worker.fullName ? `${worker.fullName} · ` : ''}{worker.description}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-900/30 text-[#007AFF] font-bold">
                            ⚡ {worker.model || defaultModel || 'gpt-4o'}
                          </span>
                          {isBotConnected && (
                            <span className="text-[9px] font-mono text-[#16A34A] flex items-center gap-0.5">
                              <Send size={9} />
                              {botUsername || 'Bot Linked'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      {isCurrent ? (
                        <div className="w-6 h-6 rounded-full bg-[#007AFF] text-white flex items-center justify-center">
                          <Check size={14} strokeWidth={2.5} />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="px-2.5 py-1 text-[11px] font-bold rounded-[6px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-[#333333] dark:text-white hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          Chat
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="p-3 bg-[#F9FAFB] dark:bg-[#141414] border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsAgentPickerOpen(false);
                  navigate('agency');
                }}
                className="text-xs font-bold text-[#007AFF] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Manage Staff in Agency HQ →</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-[6px] border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#18181B] text-[#333333] dark:text-white hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
