import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Trash2, Moon, Sun, Paperclip, Mic, ArrowUp, ArrowDown, Copy, Check,
  ChevronDown, ChevronUp, Search, Brain, Zap, Settings, Command, AlertCircle,
  CornerDownLeft, Terminal, Sparkles, Smartphone, Database, RefreshCw, FileText, X,
  ShieldCheck, GitFork, Code2, Clock, Bell, ExternalLink, Activity, BookOpen,
  Folder, Upload, Menu, Bot, Feather, Cpu, Send, MessageSquare, Users, AtSign,
  Square, Smile, CheckSquare
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate, navigateSettings } from '../router';
import { useAgentSocket } from '../hooks/useAgentSocket';
import { ToolExecutionCard } from './ToolExecutionCard';
import { InstallPromptModal } from './InstallPromptModal';
import { GrokAvatar } from './GrokAvatar';
import { Sidebar } from './Sidebar';
import { MarkdownView } from './MarkdownView';
import { GroupMembersModal } from './GroupMembersModal';
import { isReasoningModel, SessionMessage, AgentConfig } from '../types';

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
    typingAgent,
    theme,
    toggleTheme,
    createSession,
    createGeneralChat,
    telegramAgents,
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
    discussionActive,
    discussionRound,
    stopDiscussion,
    reactToMessage,
    openSubAgentPanel,
    deleteMessages,
  } = useAppStore();

  const { sendMessage } = useAgentSocket();
  const [inputText, setInputText] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isSlashDismissed, setIsSlashDismissed] = useState(false);
  const [isGroupMembersModalOpen, setIsGroupMembersModalOpen] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

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
      { id: 'lead-frontend', name: 'Lead Frontend Dev', fullName: 'Alex Rivera', role: 'Lead Frontend Dev', department: 'Engineering', avatar: 'blue-drop', model: 'gpt-6-astra', description: 'React, TypeScript, and responsive UI' },
      { id: 'lead-architecture', name: 'Lead Architecture', fullName: 'Elena Rostova', role: 'Lead Solution Architecture', department: 'Architecture', avatar: 'cyan-bubble', model: 'glm-5-3-flash', description: 'System boundaries & RFC specs' },
      { id: 'lead-backend', name: 'Lead Backend Dev', fullName: 'Marcus Chen', role: 'Lead Backend Dev', department: 'Engineering', avatar: 'green-cloud', model: 'codestral-latest', description: 'Go server & SQLite runtime' },
      { id: 'legal-counsel', name: 'Legal Counsel', fullName: 'Sarah Vance', role: 'Legal Counsel & Compliance', department: 'Legal', avatar: 'bronze-shield', model: 'gpt-5-6-luna', description: 'Licenses & privacy compliance' },
      { id: 'chief-security', name: 'Chief Security', fullName: 'Kavita Patel', role: 'Chief Security & QA Officer', department: 'Security', avatar: 'ruby-capsule', model: 'gpt-oss-120b', description: 'Secrets scanning & OWASP audits' },
      { id: 'devops-lead', name: 'DevOps Lead', fullName: 'Darius Thorne', role: 'DevOps & Infrastructure Lead', department: 'Operations', avatar: 'orange-leaf', model: 'deepseek-v4-flash', description: 'Docker, CI/CD, and mesh networks' },
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabledRef = useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);

  // ----- WhatsApp-style message selection & deletion -----
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelection = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteSingle = useCallback(
    (id: string) => {
      if (!activeSessionId) return;
      if (window.confirm('Hapus pesan ini?')) {
        deleteMessages(activeSessionId, [id]);
      }
    },
    [activeSessionId, deleteMessages]
  );

  const handleBulkDelete = useCallback(() => {
    if (!activeSessionId || selectedIds.size === 0) return;
    if (window.confirm(`Hapus ${selectedIds.size} pesan?`)) {
      deleteMessages(activeSessionId, [...selectedIds]);
      exitSelection();
    }
  }, [activeSessionId, selectedIds, deleteMessages, exitSelection]);

  const selectAllMessages = useCallback(() => {
    setSelectedIds(
      new Set(messages.filter((m) => !m.id.startsWith('asst-stream-')).map((m) => m.id))
    );
  }, [messages]);

  // Leaving a session cancels any in-progress selection.
  useEffect(() => {
    exitSelection();
  }, [activeSessionId, exitSelection]);

  // Detect user manual scroll to disable auto-scroll when user scrolls up
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const threshold = 90;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distanceFromBottom <= threshold;

    if (isProgrammaticScrollRef.current) return;

    if (isAtBottom) {
      isAutoScrollEnabledRef.current = true;
      setShowScrollBottomBtn(false);
    } else {
      // User manually scrolled up: pause auto-scroll and show jump button
      isAutoScrollEnabledRef.current = false;
      setShowScrollBottomBtn(true);
    }
  }, []);

  // When switching chat sessions, reset auto-scroll and jump to bottom
  useEffect(() => {
    isAutoScrollEnabledRef.current = true;
    setShowScrollBottomBtn(false);
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        isProgrammaticScrollRef.current = true;
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 50);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [activeSessionId]);

  // Non-jittery, non-flickering throttled streaming auto-scroll
  // Uses direct scrollTop inside requestAnimationFrame only when user has NOT scrolled up
  useEffect(() => {
    if (!isAutoScrollEnabledRef.current) return;

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el || !isAutoScrollEnabledRef.current) return;

      isProgrammaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;

      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 40);
    });

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [messages, isGenerating, thinkingStatus]);
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
    const mcpServers = (mcps && mcps.length > 0) ? mcps : [];

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
    if (isTypingMention && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionSuggestions[selectedMentionIndex] || mentionSuggestions[0];
        if (selected) handleSelectMention(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        return;
      }
    }

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

    // Force re-enable auto-scroll when user sends a new message
    isAutoScrollEnabledRef.current = true;
    setShowScrollBottomBtn(false);

    sendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setTimeout(() => {
      if (scrollContainerRef.current) {
        isProgrammaticScrollRef.current = true;
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 50);
      }
    }, 30);
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
  const sessionType: 'direct' | 'group' | 'general' | 'agent' =
    currentSession?.type || (currentSession?.agentId ? 'direct' : 'general');
  const isDirect = sessionType === 'direct';
  const isGroup = sessionType === 'group';
  const isGeneral = sessionType === 'general';

  const partnerAgent = isDirect
    ? agents.find((a) => a.id === currentSession?.agentId) || activeAgent
    : null;

  const isTgConnected = partnerAgent
    ? partnerAgent.telegramConnected || !!telegramAgents[partnerAgent.id]?.connected
    : false;

  // Mention (@) Autocomplete logic
  const atLastIndex = inputText.lastIndexOf('@');
  const isTypingMention =
    atLastIndex !== -1 &&
    !inputText.slice(atLastIndex).includes(' ') &&
    !isTypingSlash;
  const mentionQuery = isTypingMention ? inputText.slice(atLastIndex + 1).toLowerCase() : '';

  const mentionSuggestions = useMemo(() => {
    if (!isTypingMention) return [];
    let candidateAgents = agents;
    if (isGroup) {
      const partIds = currentSession?.participants
        ? currentSession.participants
            .filter((p) => p.participantType === 'agent' || !p.participantType)
            .map((p) => p.participantId)
        : [];
      candidateAgents = agents.filter((a) => partIds.includes(a.id));
    } else if (isDirect && currentSession?.agentId) {
      candidateAgents = agents.filter((a) => a.id === currentSession.agentId);
    }
    if (!mentionQuery) return candidateAgents;
    return candidateAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(mentionQuery) ||
        (a.role || '').toLowerCase().includes(mentionQuery) ||
        a.id.toLowerCase().includes(mentionQuery)
    );
  }, [isTypingMention, agents, isGroup, isDirect, currentSession, mentionQuery]);

  const handleSelectMention = (agent: AgentConfig) => {
    const beforeAt = inputText.slice(0, atLastIndex);
    const nextInput = `${beforeAt}@${agent.name} `;
    setInputText(nextInput);
    textareaRef.current?.focus();
  };

  return (
    <main className="flex-1 h-full flex flex-col bg-accent/60 dark:bg-background overflow-hidden relative">
      {/* Reminder high-priority banner */}
      {activeReminder && (
        <div className="bg-warning/10 border-b border-warning/25 px-4 py-2 z-30 select-none">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-warning animate-bounce" />
              <div className="flex items-center gap-1.5 font-funnel">
                <span className="font-bold text-warning">Reminder Alert:</span>
                <span className="text-foreground/85 font-medium">{activeReminder.title}</span>
                {activeReminder.time && (
                  <span className="text-[10px] bg-card border border-border px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                    {activeReminder.time}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setActiveReminder(null)}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-card transition-colors"
              title="Dismiss reminder"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp-Style Responsive Chat Header */}
      <div className="w-full min-h-[60px] shrink-0 flex flex-row gap-2.5 sm:gap-3 px-3 sm:px-6 items-center bg-card border-b border-border/70 z-20 select-none py-2">
        {/* Mobile menu trigger */}
        <button
          onClick={() => setIsMobileDrawerOpen(true)}
          className="p-1.5 text-foreground/85 hover:text-foreground md:hidden rounded-lg hover:bg-accent/60 dark:hover:bg-popover cursor-pointer shrink-0"
          title="Open Chats Drawer"
        >
          <Menu size={20} />
        </button>

        {/* CASE 1: DIRECT CHAT WITH AGENT PERSON */}
        {isDirect && (
          <>
            <div
              onClick={() => setIsAgentPickerOpen(true)}
              className="relative shrink-0 flex items-center justify-center cursor-pointer group"
              title="Click to switch specialist agent worker"
            >
              <GrokAvatar
                id={partnerAgent?.avatar || partnerAgent?.id || 'purple-pebble'}
                size={40}
                className="drop-shadow-xs transition-transform group-hover:scale-105"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-white dark:border-black" title="Online" />
            </div>

            <div
              onClick={() => setIsAgentPickerOpen(true)}
              className="flex flex-col justify-center min-w-0 flex-1 cursor-pointer group/agent-title overflow-hidden"
              title="Click to switch specialist agent worker"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] sm:text-[16px] leading-tight text-foreground font-sans font-bold tracking-tight truncate group-hover/agent-title:text-primary transition-colors">
                  {partnerAgent?.name || 'Specialist Agent'}
                </span>
                <ChevronDown size={13} className="text-muted-foreground group-hover/agent-title:text-primary transition-colors shrink-0" />
                <span className="hidden xs:inline-block text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.2 rounded-full font-bold font-sans uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-primary border border-blue-100 dark:border-blue-900/40 shrink-0">
                  {partnerAgent?.role || partnerAgent?.department || 'Specialist'}
                </span>
                {isTgConnected && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-info/10 text-info shrink-0 font-mono"
                    title="Telegram Bot Linked"
                  >
                    <Send size={8} /> TG Bot
                  </span>
                )}
              </div>
              <div className="text-[11px] leading-tight font-sans truncate flex items-center gap-1 mt-0.5">
                {isGenerating ? (
                  <span className="text-primary font-medium flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{partnerAgent?.name || 'Agent'} is typing...</span>
                  </span>
                ) : (
                  <>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">● Online</span>
                    <span className="hidden sm:inline text-muted-foreground">· {partnerAgent?.description || 'Autonomous specialist agent'}</span>
                  </>
                )}
              </div>
            </div>

            {/* Read-only Model Pill (NO model selection dropdown - Agent Person owns AI configuration) */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-black/5 dark:bg-white/5 border border-border/70 rounded-[6px] text-[11px] font-mono text-muted-foreground shrink-0" title={`Configured Model: ${partnerAgent?.model || 'gpt-4o'}`}>
              <Cpu size={12} className="text-primary" />
              <span>{partnerAgent?.model || 'gpt-4o'}</span>
            </div>
          </>
        )}

        {/* CASE 2: GROUP CHAT WITH MULTIPLE AGENT PERSONS */}
        {isGroup && (
          <>
            <div
              onClick={() => setIsGroupMembersModalOpen(true)}
              className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center shrink-0 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
              title="Click to manage group members"
            >
              <Users size={18} className="text-primary" />
            </div>

            <div
              onClick={() => setIsGroupMembersModalOpen(true)}
              className="flex flex-col justify-center min-w-0 flex-1 cursor-pointer group/group-title overflow-hidden"
              title="Click to manage group members"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] sm:text-[16px] leading-tight text-foreground font-sans font-bold tracking-tight truncate group-hover/group-title:text-primary transition-colors">
                  {currentSession?.title || 'Group Chat'}
                </span>
                <span className="text-[9px] sm:text-[10px] px-2 py-0.2 rounded-full font-bold font-sans uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-primary border border-blue-100 dark:border-blue-900/40 shrink-0">
                  Group
                </span>
              </div>
              <div className="text-[11px] leading-tight font-sans truncate flex items-center gap-1 mt-0.5">
                {isGenerating ? (
                  <span className="text-primary font-medium flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{typingAgent?.name ? `${typingAgent.name} is typing...` : 'Team is replying...'}</span>
                  </span>
                ) : (
                  <div className="text-primary hover:underline flex items-center gap-1">
                    <Users size={11} />
                    <span>{currentSession?.participants?.length || 0} Agent Persons + You · Manage Members</span>
                  </div>
                )}
              </div>
            </div>

            {/* Manage Members Button */}
            <button
              type="button"
              onClick={() => setIsGroupMembersModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-primary border border-blue-200 dark:border-blue-900/60 rounded-[6px] text-[11px] font-bold transition-colors cursor-pointer shrink-0"
              title="Add or remove agent persons"
            >
              <Users size={13} />
              <span className="hidden sm:inline">Manage Members</span>
            </button>
          </>
        )}

        {/* CASE 3: GENERAL CHAT (TRADITIONAL CHAT WITH MODEL SELECTION) */}
        {isGeneral && (
          <>
            <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-warning" />
            </div>

            <div className="flex flex-col justify-center min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] sm:text-[16px] leading-tight text-foreground font-sans font-bold tracking-tight truncate">
                  {currentSession?.title || 'General Chat'}
                </span>
                <span className="text-[9px] sm:text-[10px] px-2 py-0.2 rounded-full font-bold font-sans uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-warning border border-amber-200 dark:border-amber-900/40 shrink-0">
                  General
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground truncate font-sans mt-0.5">
                Traditional multi-model chat
              </span>
            </div>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={() => createGeneralChat()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-[6px] text-[11px] font-semibold text-foreground/85 transition-colors cursor-pointer shrink-0"
              title="Start fresh general chat"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">New Chat</span>
            </button>

            {/* Model Selector Dropdown - PRESERVED & EXPOSED ONLY IN GENERAL CHAT */}
            <div className="relative shrink-0" ref={modelDropdownRef}>
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 bg-card border border-border hover:border-border-strong rounded-[6px] text-[11px] font-sans text-foreground/85 transition-all shadow-2xs cursor-pointer"
                title={`Active Model: ${effectiveModel} (Click to change)`}
              >
                <Cpu size={13} className="text-primary shrink-0" />
                <span className="font-mono font-semibold max-w-[70px] xs:max-w-[90px] sm:max-w-[130px] truncate">
                  {effectiveModel}
                </span>
                <ChevronDown size={11} className={`text-muted-foreground shrink-0 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelDropdownOpen && (
                <div className="fixed sm:absolute inset-x-3 sm:inset-auto top-[62px] sm:top-auto sm:right-0 sm:mt-1 sm:w-80 bg-card border border-border rounded-[10px] shadow-2xl p-2.5 z-50 animate-in fade-in duration-100 flex flex-col gap-2 max-w-sm mx-auto sm:max-w-none">
                  {/* Header with Refresh */}
                  <div className="flex items-center justify-between px-1 pb-1.5 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <Cpu size={14} className="text-primary" />
                      <span className="text-xs font-bold text-foreground font-sans">
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
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline cursor-pointer p-1 rounded hover:bg-primary/10 transition-colors"
                      title="Probe connected providers for latest models"
                    >
                      <RefreshCw size={11} className={isLoadingModels ? 'animate-spin' : ''} />
                      <span>{isLoadingModels ? 'Fetching...' : 'Fetch Models'}</span>
                    </button>
                  </div>

                  {/* Model Search */}
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search model (e.g. gpt-4o, qwen, claude)..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-1 bg-accent/60 dark:bg-card border border-border rounded-[6px] text-xs text-foreground outline-none focus:border-foreground/60"
                    />
                  </div>

                  {/* Models List Grouped by Provider */}
                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                    {filteredModels.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No matching models found. Try fetching or enter custom ID below.
                      </div>
                    ) : (
                      filteredModels.map((m) => {
                        const isSelected = effectiveModel === m.id || effectiveModel === m.name;
                        const isSysDefault = defaultModel === m.id;

                        return (
                          <div
                            key={`${m.providerId}-${m.id}`}
                            onClick={() => {
                              setActiveModel(m.id);
                              setIsModelDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between p-2 rounded-[8px] cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900'
                                : 'hover:bg-gray-50 dark:hover:bg-white/5 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Cpu size={13} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-mono font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                    {m.name}
                                  </span>
                                  {isSysDefault && (
                                    <span className="text-[8px] font-bold px-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 uppercase">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground truncate font-sans">
                                  {m.providerName || m.providerType}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {!isSysDefault && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDefaultModel(m.id, m.providerId);
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground hover:text-foreground font-semibold transition-colors"
                                  title="Set as system default model"
                                >
                                  Set Default
                                </button>
                              )}
                              {isSelected && <Check size={14} className="text-primary" />}
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
                    className="pt-2 border-t border-border flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      placeholder="Enter custom model ID..."
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      className="flex-1 px-2.5 py-1 bg-accent/60 dark:bg-card border border-border rounded-[6px] text-xs font-mono text-foreground outline-none focus:border-foreground/60"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-foreground text-background text-xs font-bold rounded-[6px] hover:bg-black/90 cursor-pointer"
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
                    className="border-t border-border pt-1.5 px-1 text-[11px] text-primary hover:underline cursor-pointer flex items-center justify-between font-sans"
                  >
                    <span>Manage Providers &amp; API Keys...</span>
                    <ExternalLink size={11} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Universal Action Chips */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => {
              useAppStore.getState().setMode('agent');
              navigate('agent');
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md border border-border-default bg-toolbar-control text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            title="Switch to Agent workspace (forge tasks)"
          >
            <Sparkles size={13} className="text-primary" />
            <span className="hidden sm:inline">Agent Mode</span>
          </button>

          <button
            onClick={handleQuickReview}
            className="hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-warning/10 border border-border hover:border-warning/60 rounded-[6px] text-[11px] font-sans text-foreground/85 transition-colors shadow-2xs cursor-pointer"
            title="Run code & security review on workspace diff"
          >
            <ShieldCheck size={13} className="text-warning" />
            <span>Review Diff</span>
          </button>

          <button
            onClick={() => navigateSettings('worktrees')}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:border-border-strong rounded-[6px] text-[11px] font-sans text-foreground/85 transition-colors shadow-2xs cursor-pointer"
            title="Git Worktrees & Branch Isolation"
          >
            <GitFork size={13} className="text-foreground/85" />
            <span>Worktrees</span>
          </button>
        </div>
      </div>

      {/* WhatsApp-style selection action bar */}
      {selectionMode && (
        <div className="w-full shrink-0 flex items-center gap-2 px-3 sm:px-6 py-2 bg-info/10 border-b border-info/30 z-30 animate-in fade-in slide-in-from-top-1 duration-100">
          <button
            onClick={exitSelection}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Batalkan seleksi"
          >
            <X size={17} className="text-foreground/85 dark:text-white" />
          </button>
          <span className="text-xs font-bold text-foreground flex-1 font-sans">
            {selectedIds.size} pesan dipilih
          </span>
          <button
            onClick={selectAllMessages}
            className="text-[11px] font-bold text-primary px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
          >
            Pilih Semua
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[11px] font-bold transition-colors ${
              selectedIds.size > 0
                ? 'bg-red-500 text-white hover:bg-red-600 cursor-pointer'
                : 'bg-black/10 dark:bg-white/10 text-muted-foreground cursor-not-allowed'
            }`}
          >
            <Trash2 size={13} />
            Hapus
          </button>
        </div>
      )}

      {/* Messages Scroll Area Container */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-14 py-6 flex flex-col gap-5 custom-scrollbar"
        >
          {/* Parallel Running Background Tasks Banner */}
          {runningTasks.length > 0 && (
            <div className="w-full shrink-0 flex flex-row gap-2.5 p-[10px_14px] items-center bg-info/10 border border-info/30 rounded-[8px] shadow-2xs">
              <RefreshCw size={14} className="animate-spin text-primary shrink-0" />
              <div className="text-[12px] text-foreground/85 font-geist flex-1 truncate">
                {runningTasks[0].title} — running {Math.max(1, Math.round((Date.now() - runningTasks[0].startedAt) / 1000))}s
                {runningTasks.length > 1 && (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white align-middle">
                    +{runningTasks.length - 1} background
                  </span>
                )}
              </div>
              <button
                onClick={() => openSubAgentPanel(runningTasks[0].sessionId)}
                className="px-2.5 py-1 bg-primary text-white text-[11px] font-funnel font-bold rounded-[4px] hover:bg-primary/85 transition-colors"
                title="Step into the sub-agent: live process + direct instructions"
              >
                Enter
              </button>
              <button
                onClick={() => cancelTask(runningTasks[0].id)}
                className="px-2.5 py-1 bg-card border border-border text-foreground/85 text-[11px] font-funnel rounded-[4px] hover:bg-accent/60 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Zero State View matching session type */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center my-auto py-10 animate-fade-in">
              {isDirect ? (
                <>
                  <div className="relative mb-5 group cursor-pointer" onClick={() => setIsAgentPickerOpen(true)} title="Switch Specialist Agent Worker">
                    <GrokAvatar
                      id={partnerAgent?.avatar || partnerAgent?.id || 'purple-pebble'}
                      size={96}
                      className="drop-shadow-xl transition-all duration-300 group-hover:scale-108"
                    />
                    <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-success border-3 border-white ring-2 ring-emerald-500/20" title="Online" />
                  </div>
                  <h1 className="text-2xl font-bold font-sans text-foreground mb-1.5 tracking-tight flex items-center justify-center gap-2">
                    <span>{partnerAgent?.name || 'Agent Person'}</span>
                  </h1>
                  <p className="text-xs text-muted-foreground font-sans mb-7 max-w-md leading-relaxed">
                    {partnerAgent?.description || 'Autonomous specialist agent equipped with dedicated skills, tools, and continuous memory.'}
                  </p>
                </>
              ) : isGroup ? (
                <>
                  <div
                    className="w-24 h-24 rounded-full bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-200 dark:border-blue-900 flex items-center justify-center mb-5 cursor-pointer shadow-lg"
                    onClick={() => setIsGroupMembersModalOpen(true)}
                    title="Manage group members"
                  >
                    <Users size={44} className="text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold font-sans text-foreground mb-1.5 tracking-tight">
                    {currentSession?.title || 'Group Chat Room'}
                  </h1>
                  <p className="text-xs text-muted-foreground font-sans mb-4 max-w-md leading-relaxed">
                    This group includes {currentSession?.participants?.length || 0} Agent Persons and you. Mention an agent using <span className="font-mono font-bold text-primary">@AgentName</span> to address them directly, or ask open questions to the room.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsGroupMembersModalOpen(true)}
                    className="mb-7 px-3.5 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-primary border border-blue-200 dark:border-blue-900/60 rounded-[8px] text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    + View &amp; Manage Members
                  </button>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-900 flex items-center justify-center mb-5 shadow-lg">
                    <Bot size={40} className="text-warning" />
                  </div>
                  <h1 className="text-2xl font-bold font-sans text-foreground mb-1.5 tracking-tight">
                    General Chat
                  </h1>
                  <p className="text-xs text-muted-foreground font-sans mb-7 max-w-md leading-relaxed">
                    Traditional ad-hoc session. You can switch models freely using the model selector dropdown in the header.
                  </p>
                </>
              )}

              {/* Quick Starters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
                {[
                  {
                    title: 'Review Workspace Security',
                    desc: 'Run security scan and check for secrets in diff',
                    prompt: 'Please review the workspace and git diff for security vulnerabilities and code quality using review_code.',
                    icon: <ShieldCheck size={14} className="text-success" />,
                  },
                  {
                    title: 'Build UI Component',
                    desc: 'Scaffold responsive layout with clean CSS',
                    prompt: 'Let\'s build a responsive modern interface component with clean design tokens.',
                    icon: <Code2 size={14} className="text-primary" />,
                  },
                  {
                    title: 'Create Automated Routine',
                    desc: 'Schedule recurring automation task',
                    prompt: 'Please set up an automated routine to monitor workspace health every 30 minutes.',
                    icon: <Clock size={14} className="text-warning" />,
                  },
                  {
                    title: 'Git Worktree Branch',
                    desc: 'Create isolated worktree for development',
                    prompt: 'Create a new git worktree for feature development and report its status.',
                    icon: <GitFork size={14} className="text-muted-foreground" />,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    onClick={() => sendMessage(item.prompt)}
                    className="p-3 bg-card hover:bg-warning/10 dark:hover:bg-warning/10 border border-border hover:border-warning/60 rounded-[8px] text-left cursor-pointer transition-all shadow-2xs group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{item.icon}</span>
                      <span className="text-xs font-bold font-funnel text-foreground">{item.title}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-geist">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message Stream */}
          {messages.map((msg, index) => {
            const isLastMessage = index === messages.length - 1;
            const isCurrentStreaming = isGenerating && isLastMessage && msg.role === 'assistant';
            return (
              <ChatMessageItem
                key={msg.id || `msg-${index}`}
                msg={msg}
                isCurrentStreaming={isCurrentStreaming}
                activeAgent={activeAgent}
                agents={agents}
                thinkingStatus={thinkingStatus}
                onReact={(msgId, emo) => activeSessionId && reactToMessage(activeSessionId, msgId, emo)}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(msg.id)}
                onToggleSelect={toggleSelect}
                onDelete={handleDeleteSingle}
                onStartSelect={enterSelection}
              />
            );
          })}

          {/* Typing Indicator when waiting for first assistant token/turn */}
          {isGenerating && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="w-full flex flex-row gap-3 justify-start items-start animate-fade-in pl-1">
              <div className="shrink-0 mt-1">
                <GrokAvatar
                  id={typingAgent?.avatar || activeAgent?.avatar || 'purple-pebble'}
                  size={38}
                  className="drop-shadow-xs"
                />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[13px] font-bold text-primary font-sans">
                    {typingAgent?.name || activeAgent?.name || 'Agent'}
                  </span>
                </div>
                <div className="p-[10px_16px] bg-card dark:bg-card rounded-[16px] rounded-tl-[4px] border border-border shadow-2xs flex items-center gap-2.5">
                  <span className="text-[12px] text-muted-foreground font-geist">
                    {thinkingStatus || `${typingAgent?.name || 'Agent'} is typing...`}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-1 shrink-0" />
        </div>

        {/* Floating Jump to Bottom Button when scrolled up */}
        {showScrollBottomBtn && (
          <button
            type="button"
            onClick={() => {
              isAutoScrollEnabledRef.current = true;
              setShowScrollBottomBtn(false);
              const el = scrollContainerRef.current;
              if (el) {
                isProgrammaticScrollRef.current = true;
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                setTimeout(() => {
                  isProgrammaticScrollRef.current = false;
                }, 400);
              }
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-foreground text-background rounded-full shadow-lg border border-black/10 dark:border-white/20 text-xs font-semibold flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-bottom-2 z-20 hover:scale-105 cursor-pointer select-none"
          >
            <ArrowDown size={13} />
            <span>Jump to bottom</span>
            {isGenerating && (
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse ml-0.5" />
            )}
          </button>
        )}
      </div>

      {/* WhatsApp-Style Clean Floating Input Bar */}
      <div className="w-full shrink-0 px-3 sm:px-14 py-2 sm:py-3 bg-card border-t border-border/70 relative select-none pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        {/* Mention Autocomplete Popover Modal */}
        {isTypingMention && mentionSuggestions.length > 0 && (
          <MentionAutocompleteModal
            agents={mentionSuggestions}
            selectedIndex={selectedMentionIndex}
            onSelect={handleSelectMention}
          />
        )}

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
          <div className="max-w-4xl mx-auto mb-2 p-2.5 bg-accent/60 border border-border rounded-[12px] text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2 text-foreground/85 font-sans">
              {isUploadingDoc ? <RefreshCw size={14} className="animate-spin text-primary" /> : <Database size={14} className="text-primary" />}
              <span className="truncate">{ragNotice.text}</span>
            </div>
            <button onClick={() => setRagNotice(null)} className="text-muted-foreground hover:text-foreground cursor-pointer ml-2">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Hidden File Input for Attachments */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".txt,.md,.pdf,.json,.csv,.js,.ts,.py,.go,.html,.yaml,.yml"
        />

        {/* WhatsApp-Style Row */}
        <div className="w-full max-w-4xl mx-auto flex items-end gap-2">
          {/* Main Input Pill Container */}
          <div className="flex-1 min-w-0 bg-accent/60 border border-border rounded-[24px] px-3.5 py-1.5 shadow-2xs flex items-end gap-2 focus-within:border-primary/60 focus-within:bg-card dark:focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15 transition-all">
            {/* Attachment Button */}
            <button
              type="button"
              disabled={isUploadingDoc}
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-foreground/5 transition-colors shrink-0 mb-0.5 cursor-pointer"
              title="Upload document to Vector RAG"
            >
              {isUploadingDoc ? <RefreshCw size={18} className="animate-spin text-primary" /> : <Paperclip size={18} />}
            </button>

            {/* Auto-growing Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={
                isGroup
                  ? 'Message the group room (@ to mention specific agent)…'
                  : isDirect
                  ? `Message ${partnerAgent?.name || 'agent'}…`
                  : 'Type a message, slash command (/), or discuss…'
              }
              className="flex-1 min-w-0 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground font-sans resize-none outline-none py-1.5 max-h-36 custom-scrollbar leading-relaxed"
              style={{ minHeight: '26px' }}
            />

            {/* Quick Mention Trigger */}
            <button
              type="button"
              onClick={() => {
                setInputText((prev) => prev + '@');
                textareaRef.current?.focus();
              }}
              className="p-1.5 text-muted-foreground hover:text-primary rounded-full hover:bg-primary/10 transition-colors shrink-0 mb-0.5 cursor-pointer"
              title="Mention an agent person (@)"
            >
              <AtSign size={16} />
            </button>

            {/* Quick Slash Commands Trigger */}
            <button
              type="button"
              onClick={() => {
                if (!inputText.startsWith('/')) {
                  setInputText('/' + inputText);
                  textareaRef.current?.focus();
                }
              }}
              className="p-1.5 text-muted-foreground hover:text-primary rounded-full hover:bg-primary/10 transition-colors shrink-0 mb-0.5 cursor-pointer"
              title="Slash commands & skills (/)"
            >
              <Command size={16} />
            </button>
          </div>

          {/* Circular Send / Stop Button */}
          {isGenerating || discussionActive ? (
            <button
              onClick={() => activeSessionId && stopDiscussion(activeSessionId)}
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all bg-red-600 hover:bg-red-700 text-white scale-100 active:scale-95 cursor-pointer shadow-red-500/30"
              title="Stop Diskusi / Intervensi"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all ${
                inputText.trim()
                  ? 'bg-primary hover:bg-primary/85 text-white scale-100 active:scale-95 cursor-pointer shadow-blue-500/20'
                  : 'bg-accent text-subtle-fg cursor-not-allowed opacity-70'
              }`}
              title="Send Message"
            >
              <ArrowUp size={20} strokeWidth={2.4} />
            </button>
          )}
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
          <div className="relative w-[85vw] max-w-[320px] h-full bg-card shadow-2xl z-10 flex flex-col transform transition-transform duration-200">
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
          <div className="relative w-full sm:max-w-lg bg-card rounded-t-[18px] sm:rounded-[14px] shadow-2xl border border-border max-h-[85vh] flex flex-col z-10 overflow-hidden">
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-foreground font-sans">
                  Switch Specialist Agent Worker
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Each worker operates with dedicated specialty skills, model &amp; Telegram bot
                </p>
              </div>
              <button
                onClick={() => setIsAgentPickerOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5 cursor-pointer"
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
                        ? 'border-primary bg-blue-50/70 dark:bg-blue-950/30 shadow-xs ring-1 ring-primary/30'
                        : 'border-border bg-card dark:bg-card hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <GrokAvatar id={worker.avatar || worker.id} size={40} />
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-black" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground font-sans truncate">
                            {worker.role || worker.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                            {worker.department}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate font-sans">
                          {worker.fullName ? `${worker.fullName} · ` : ''}{worker.description}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-900/30 text-primary font-bold">
                            ⚡ {worker.model || defaultModel || 'gpt-4o'}
                          </span>
                          {isBotConnected && (
                            <span className="text-[9px] font-mono text-success flex items-center gap-0.5">
                              <Send size={9} />
                              {botUsername || 'Bot Linked'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      {isCurrent ? (
                        <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                          <Check size={14} strokeWidth={2.5} />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="px-2.5 py-1 text-[11px] font-bold rounded-[6px] border border-border text-foreground/85 dark:text-white hover:bg-foreground/5"
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
            <div className="p-3 bg-accent/40 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsAgentPickerOpen(false);
                  navigate('agents');
                }}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Manage Agent Persons →</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-[6px] border border-border bg-card text-foreground/85 dark:text-white hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Members Management Modal */}
      <GroupMembersModal
        isOpen={isGroupMembersModalOpen}
        onClose={() => setIsGroupMembersModalOpen(false)}
        session={currentSession || null}
      />
    </main>
  );
};

// Autocomplete Popover Modal for Mentioning Agent Persons (@)
const MentionAutocompleteModal: React.FC<{
  agents: AgentConfig[];
  selectedIndex: number;
  onSelect: (agent: AgentConfig) => void;
}> = ({ agents, selectedIndex, onSelect }) => {
  if (agents.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 right-4 sm:left-14 sm:right-14 mb-2 bg-card border border-border rounded-[10px] shadow-2xl overflow-hidden z-40 animate-in fade-in duration-100 max-h-60 overflow-y-auto custom-scrollbar p-1">
      <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AtSign size={12} className="text-primary" />
          <span>Mention Agent Person</span>
        </div>
        <span className="font-mono text-[9px]">↑↓ Navigate · Tab / Enter Select</span>
      </div>

      <div className="space-y-0.5 pt-1">
        {agents.map((agent, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent)}
              className={`flex items-center justify-between px-2.5 py-2 rounded-[6px] cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-primary'
                  : 'hover:bg-foreground/5 text-foreground'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <GrokAvatar id={agent.avatar || agent.id} size={28} />
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold font-sans truncate">@{agent.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate font-sans">
                    ({agent.role || agent.department || 'Specialist'})
                  </span>
                </div>
              </div>

              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-accent text-muted-foreground shrink-0 ml-2">
                {agent.model || 'gpt-4o'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
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
    <div className="absolute bottom-full left-4 right-4 sm:left-14 sm:right-14 mb-2 bg-card border border-border rounded-[8px] shadow-2xl overflow-hidden z-40 animate-in fade-in duration-100">
      <div className="p-2 border-b border-border flex items-center justify-between text-[11px] text-muted-foreground font-funnel px-3 bg-accent/60">
        <div className="flex items-center gap-1.5 font-funnel font-bold text-foreground">
          <Command size={12} className="text-primary" />
          <span>Slash Commands & Agent Skills</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-funnel">
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
                  ? 'bg-warning/10 border border-warning/25'
                  : 'hover:bg-accent/60 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="text-sm flex-shrink-0">{item.icon}</span>
                <div className="truncate">
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="font-bold text-foreground">{item.prefix}</span>
                    <span className="text-muted-foreground font-sans font-normal">— {item.label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-geist truncate mt-0.5">
                    {item.desc}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider font-funnel bg-accent/60 text-muted-foreground border border-border">
                  {item.category}
                </span>
                {isSelected && (
                  <CornerDownLeft size={13} className="text-warning" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const cleanThoughtText = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/<｜(?:begin|end) of sentence｜>/g, '')
    .replace(/<｜thought｜>[\s\S]*?<\/｜thought｜>/g, '')
    .replace(/<｜thought｜>[\s\S]*/g, '')
    .replace(/<｜DSML.*?｜>/g, '')
    .replace(/<(?:\|\||｜｜)DSML(?:\|\||｜｜)\s*calls>[\s\S]*?<\/(?:\|\||｜｜)DSML(?:\|\||｜｜)\s*calls>/gi, '')
    .replace(/<(?:\|\||｜｜)DSML(?:\|\||｜｜)[\s\S]*?<\/(?:\|\||｜｜)DSML(?:\|\||｜｜)[^>]*>/gi, '')
    .replace(/<\/?(?:\|\||｜｜)DSML(?:\|\||｜｜)[^>]*>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<\/?tool_call>/gi, '')
    .trim();
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

  const cleanedThought = useMemo(() => cleanThoughtText(thought), [thought]);
  const wordCount = useMemo(
    () => cleanedThought.split(/\s+/).filter(Boolean).length,
    [cleanedThought]
  );

  if (!cleanedThought && !isStreaming) {
    return null;
  }

  return (
    <div className="w-full bg-card dark:bg-card border border-border rounded-[8px] overflow-hidden my-1 shadow-2xs">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex flex-row gap-2 p-[10px_14px] items-center cursor-pointer select-none"
      >
        <Brain size={14} className={`text-primary ${isStreaming ? 'animate-pulse' : ''}`} />
        <div className="text-[12px] text-foreground/85 font-funnel font-bold">
          Thought process
        </div>
        <div className="text-[11px] text-primary font-funnel">
          {isStreaming ? 'streaming · ' : ''}{wordCount} words
        </div>
        <div className="flex-1" />
        {isOpen ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </div>

      {isOpen && (
        <div className="w-full p-[0px_14px_12px_14px]">
          <div className="text-[12px]/[19px] text-muted-foreground dark:text-muted-foreground font-geist whitespace-pre-wrap">
            {cleanedThought}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 bg-primary animate-pulse ml-1 align-middle" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// WhatsApp-Style Chat Message Item with Agent Person Identity & Routine badges
interface ChatMessageItemProps {
  msg: SessionMessage;
  isCurrentStreaming: boolean;
  activeAgent: any;
  agents: AgentConfig[];
  thinkingStatus: string;
  onReact?: (messageId: string, emoji: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onStartSelect?: (messageId: string) => void;
}

// Circular checkbox shown in WhatsApp-style multi-select mode, anchored to
// the side opposite the bubble (left for sent, right for received).
const SelectCheckbox: React.FC<{
  isSelected: boolean;
  onToggle: () => void;
  side: 'left' | 'right';
}> = ({ isSelected, onToggle, side }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={`absolute ${side === 'left' ? 'left-2' : 'right-2'} top-1/2 -translate-y-1/2 z-20 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
      isSelected
        ? 'bg-primary border-primary'
        : 'border-border-strong bg-white/90 dark:bg-black/50 hover:border-primary/60'
    }`}
    title={isSelected ? 'Batalkan pilihan' : 'Pilih pesan'}
  >
    {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
  </button>
);

// Hover toolbar over a message: quick reactions + kebab menu offering
// "select" (enters multi-select mode) and "delete".
const MessageHoverBar: React.FC<{
  msg: SessionMessage;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
  onStartSelect: (messageId: string) => void;
}> = ({ msg, onReact, onDelete, onStartSelect }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="select-none pointer-events-auto opacity-0 group-hover/msg:opacity-100 transition-opacity absolute -top-3.5 right-2 z-10 flex items-center gap-0.5 bg-white dark:bg-accent border border-gray-200 dark:border-neutral-700 rounded-full px-1.5 py-0.5 shadow-md">
      {['😂', '👍', '❤️', '🔥', '🤔', '🎉'].map((emo) => (
        <button
          key={emo}
          type="button"
          onClick={() => onReact?.(msg.id, emo)}
          className="select-none hover:scale-125 transition-transform text-[13px] px-1 py-0.5 rounded cursor-pointer leading-none"
          title={`React ${emo}`}
        >
          {emo}
        </button>
      ))}
      <span className="w-px h-3.5 bg-gray-200 dark:bg-neutral-700 mx-0.5" />
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          title="Menu pesan"
        >
          <ChevronDown size={13} className="text-muted-foreground" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 w-36 bg-card border border-border rounded-[10px] shadow-2xl z-40 py-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onStartSelect(msg.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground/85 hover:bg-foreground/5 cursor-pointer text-left"
              >
                <CheckSquare size={13} className="text-primary" />
                Pilih pesan
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(msg.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer text-left"
              >
                <Trash2 size={13} />
                Hapus
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ChatMessageItem = React.memo<ChatMessageItemProps>(({
  msg,
  isCurrentStreaming,
  activeAgent,
  agents,
  thinkingStatus,
  onReact,
  selectionMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onStartSelect,
}) => {
  const deletable = !msg.id.startsWith('asst-stream-');

  if (msg.role === 'user') {
    return (
      <div className="w-full relative flex flex-col items-end animate-fade-in group">
        {selectionMode && deletable && (
          <SelectCheckbox isSelected={!!isSelected} onToggle={() => onToggleSelect?.(msg.id)} side="left" />
        )}
        <div className="relative group/msg max-w-[560px] w-full flex flex-col items-end">
          {!selectionMode && deletable && onReact && onDelete && onStartSelect && (
            <MessageHoverBar msg={msg} onReact={onReact} onDelete={onDelete} onStartSelect={onStartSelect} />
          )}
          <div
            onClick={selectionMode && deletable ? () => onToggleSelect?.(msg.id) : undefined}
            className={`w-full p-[12px_16px] bg-foreground text-white rounded-[16px] rounded-tr-[4px] shadow-sm border border-transparent dark:border-border ${
              selectionMode && deletable ? 'cursor-pointer' : ''
            }`}
          >
            <div className="text-[13px]/[21px] font-geist whitespace-pre-wrap break-words">
              {msg.content}
            </div>
            <div className="text-[10px] text-white/50 text-right mt-1 font-mono">
              {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {msg.reactions.map((r, idx) => (
              <span
                key={idx}
                onClick={() => onReact && onReact(msg.id, r.emoji)}
                title={r.senderName ? `Reacted by ${r.senderName} (click to react)` : undefined}
                className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full bg-accent text-foreground border border-neutral-700/60 select-none shadow-2xs hover:scale-105 cursor-pointer transition-transform"
              >
                <span>{r.emoji}</span>
                {r.senderName && <span className="text-[9px] text-neutral-400">{r.senderName.split(' ')[0]}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Assistant / Agent Person Message
  const senderAgent =
    agents.find((a) => a.id === msg.senderId) ||
    (msg.senderName ? agents.find((a) => a.name === msg.senderName) : null) ||
    activeAgent;

  const senderName = msg.senderName || senderAgent?.name || 'Agent Assistant';
  const senderAvatar = msg.senderAvatar || senderAgent?.avatar || 'purple-pebble';
  const senderRole = senderAgent?.role || senderAgent?.department;
  const isRoutine = msg.content?.startsWith('[Routine') || msg.id?.startsWith('routine-');

  return (
    <div className="w-full relative flex flex-row gap-3 justify-start items-start animate-fade-in">
      {selectionMode && deletable && (
        <SelectCheckbox isSelected={!!isSelected} onToggle={() => onToggleSelect?.(msg.id)} side="right" />
      )}
      {/* Grok Avatar of the specific Agent Person */}
      <div className="shrink-0 mt-1 relative group">
        <GrokAvatar
          id={senderAvatar}
          size={38}
          className="drop-shadow-xs transition-transform group-hover:scale-105"
        />
      </div>

      {/* Bubble Container */}
      <div className="flex-1 flex flex-col gap-1 min-w-0 max-w-[720px]">
        {/* Sender Name & Role Pill Header */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[13px] font-bold text-primary font-sans">
            {senderName}
          </span>
          {senderRole && (
            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider bg-accent text-muted-foreground">
              {senderRole}
            </span>
          )}
          {isRoutine && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
              <Clock size={9} /> Routine
            </span>
          )}
        </div>

        {/* Message Card Container with Hover Reactions */}
        <div className="relative group/msg w-full">
          {!selectionMode && deletable && onDelete && onStartSelect && (
            <MessageHoverBar msg={msg} onReact={onReact} onDelete={onDelete} onStartSelect={onStartSelect} />
          )}

          {/* Message Card */}
          <div
            onClick={selectionMode && deletable ? () => onToggleSelect?.(msg.id) : undefined}
            className={`w-full p-[12px_16px] bg-card dark:bg-card rounded-[16px] rounded-tl-[4px] border border-border shadow-2xs ${
              selectionMode && deletable ? 'cursor-pointer' : ''
            }`}
          >
            {/* Collapsible Thought Process */}
            {msg.thought && (
              <ThoughtProcessAccordion
                thought={msg.thought}
                isStreaming={isCurrentStreaming && !msg.content}
              />
            )}

            {/* Tool Execution Cards */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="space-y-1.5 my-1.5">
                {msg.toolCalls.map((tc) => (
                  <ToolExecutionCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}

            {/* Message Content with Markdown */}
            <div className="text-[13px]/[21px] text-foreground dark:text-foreground font-geist leading-relaxed break-words">
              <MarkdownView content={msg.content} isStreaming={isCurrentStreaming} />
              {isCurrentStreaming && msg.content && (
                <span className="inline-block w-1.5 h-3.5 bg-primary animate-pulse ml-1 align-middle rounded-[1px]" />
              )}
              {isCurrentStreaming && !msg.content && !msg.thought && (!msg.toolCalls || msg.toolCalls.length === 0) && (
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground py-1 font-geist">
                  <span>{thinkingStatus || `${senderName} is typing...`}</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                  </span>
                </div>
              )}
            </div>

            {/* Sub-agent report: clickable entry into the background worklog */}
            {msg.model === 'subagent' && msg.content?.includes('subtask_') &&
              (() => {
                const m = msg.content.match(/subtask_[a-z0-9]+/i);
                if (!m) return null;
                return (
                  <button
                    type="button"
                    onClick={() => useAppStore.getState().openSubAgentPanel(m[0])}
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-primary border border-blue-200 dark:border-blue-900/60 rounded-[6px] text-[10px] font-bold transition-colors cursor-pointer"
                    title="Step into the sub-agent: live process + direct instructions"
                  >
                    <Bot size={11} />
                    Step into sub-agent ({m[0]})
                  </button>
                );
              })()}

            {/* Grounding RAG Chips */}
            {msg.ragSources && msg.ragSources.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {msg.ragSources.map((rs, idx) => (
                  <div
                    key={`${rs.title}-${idx}`}
                    className="flex items-center gap-1 px-2 py-0.5 bg-warning/10 dark:bg-amber-950/30 rounded-[4px] text-[10px] text-agentorange font-funnel border border-amber-500/10"
                    title={`RAG grounded: ${rs.title} (score: ${rs.score.toFixed(2)})`}
                  >
                    <BookOpen size={10} className="text-agentorange" />
                    <span>doc:{rs.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Token Count & Time Footer */}
            <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between pt-2 border-t border-border mt-2">
              <span>{msg.model || senderAgent?.model || 'gpt-4o'}</span>
              <span>
                {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        {/* Message Reaction Chips */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5 px-1">
            {msg.reactions.map((r, idx) => (
              <span
                key={idx}
                onClick={() => onReact && onReact(msg.id, r.emoji)}
                title={r.senderName ? `Reacted by ${r.senderName} (click to react)` : undefined}
                className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full bg-card text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-border select-none shadow-2xs hover:scale-105 cursor-pointer transition-transform"
              >
                <span>{r.emoji}</span>
                {r.senderName && <span className="text-[9px] text-neutral-500 dark:text-neutral-400">{r.senderName.split(' ')[0]}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

