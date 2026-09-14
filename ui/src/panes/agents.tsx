import React, { useState, useEffect, useMemo } from 'react';
import {
  Users2,
  Bot,
  Send,
  Plus,
  Search,
  RefreshCw,
  Edit3,
  Trash2,
  MessageSquare,
  Sparkles,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Briefcase,
  Terminal,
  FileCode,
  Globe,
  Radio,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  Zap,
  Unlink,
  CheckCheck,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AgentConfig, TelegramBotConfig } from '../types';
import { GrokAvatar, GROK_AVATARS } from '../components/GrokAvatar';
import { navigate } from '../router';

interface AgentPerson extends AgentConfig {
  role?: string;
  department?: string;
  avatar: string;
  model: string;
  telegramBot?: TelegramBotConfig;
}

const DEPARTMENTS = [
  'All',
  'Executive',
  'Engineering',
  'Architecture',
  'Security',
  'Operations',
  'Legal',
  'Intelligence',
];

export const AgentsPane: React.FC = () => {
  const {
    agents,
    loadAgents,
    setActiveAgent,
    activeAgent,
    createSession,
    availableModels,
    providers,
    loadModels,
    loadProviders,
    defaultModel,
    setActiveModel,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentPerson | null>(null);

  // Form State
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formDepartment, setFormDepartment] = useState('Engineering');
  const [formAvatar, setFormAvatar] = useState('purple-pebble');
  const [formModel, setFormModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formSystemPrompt, setFormSystemPrompt] = useState('');
  const [formSkillsInput, setFormSkillsInput] = useState('');
  const [formTools, setFormTools] = useState<string[]>([
    'bash',
    'file.write',
    'file.read',
    'git_worktree',
    'web.fetch',
    'telegram.send',
  ]);
  const [formTelegramBot, setFormTelegramBot] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Configured Telegram Bots from /api/telegram/bots
  const [configuredBots, setConfiguredBots] = useState<TelegramBotConfig[]>([]);

  // Telegram pairing modal state
  const [showTgModal, setShowTgModal] = useState(false);
  const [selectedAgentForTg, setSelectedAgentForTg] = useState<AgentPerson | null>(null);
  const [selectedBotIdToLink, setSelectedBotIdToLink] = useState<string>('');
  const [isAddNewBotMode, setIsAddNewBotMode] = useState<boolean>(false);
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgBotUsername, setTgBotUsername] = useState('');
  const [isSavingTg, setIsSavingTg] = useState(false);

  const loadConfiguredBots = React.useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/bots');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setConfiguredBots(data);
        }
      }
    } catch (err) {
      console.warn('Failed to load telegram bots:', err);
    }
  }, []);

  useEffect(() => {
    loadAgents();
    loadProviders();
    loadModels(false);
    loadConfiguredBots();
  }, [loadAgents, loadProviders, loadModels, loadConfiguredBots]);

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Group available models by provider for intuitive selection
  const groupedModels = useMemo(() => {
    const map = new Map<string, { providerName: string; models: { id: string; name: string }[] }>();

    // 1. Gather from availableModels
    availableModels.forEach((m) => {
      const provName = m.providerName || m.providerType || 'Connected Provider';
      if (!map.has(provName)) {
        map.set(provName, { providerName: provName, models: [] });
      }
      const grp = map.get(provName)!;
      if (!grp.models.some((item) => item.id === m.id)) {
        grp.models.push({ id: m.id, name: m.name });
      }
    });

    // 2. Gather from providers store
    providers.forEach((p) => {
      const provName = p.name || p.type;
      if (!map.has(provName)) {
        map.set(provName, { providerName: provName, models: [] });
      }
      const grp = map.get(provName)!;
      p.models?.forEach((m) => {
        if (!grp.models.some((item) => item.id === m.id)) {
          grp.models.push({ id: m.id, name: m.name || m.id });
        }
      });
    });

    // 3. Fallback standard models if providers aren't connected yet
    if (map.size === 0) {
      map.set('High-Context Providers', {
        providerName: 'High-Context Providers',
        models: [
          { id: 'gpt-6-astra', name: 'GPT-6 Astra (1.05M)' },
          { id: 'gpt-5-6-luna', name: 'GPT-5.6 Luna (1.05M)' },
          { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (1M)' },
          { id: 'glm-5-3-flash', name: 'GLM 5.3 Flash (1M)' },
          { id: 'codestral-latest', name: 'Codestral Latest (256K)' },
          { id: 'gemma-4-31b', name: 'Gemma 4 31B (256K)' },
          { id: 'gpt-oss-120b', name: 'GPT-OSS 120B (128K)' },
          { id: 'qwen-3.8-27b', name: 'Qwen 3.8 27B (128K)' },
          { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (200K)' },
          { id: 'gpt-4o', name: 'GPT-4o (128K)' },
        ],
      });
    }

    return Array.from(map.values());
  }, [availableModels, providers]);

  // Context limits helper for pill displays
  const getModelContextLabel = (m: string) => {
    const low = (m || '').toLowerCase();
    if (low.includes('astra') || low.includes('luna') || low.includes('gpt-6') || low.includes('gpt-5-6')) return '1.05M';
    if (low.includes('deepseek-v4') || low.includes('glm-5') || low.includes('mimo') || low.includes('super') || low.includes('gemini')) return '1M';
    if (low.includes('gemma-4') || low.includes('codestral')) return '256K';
    if (low.includes('claude-3')) return '200K';
    if (low.includes('128') || low.includes('qwen-3') || low.includes('oss') || low.includes('minimax') || low.includes('gpt-4o') || low.includes('nemotron')) return '128K';
    return '32K';
  };

  // Filtered agents
  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      const matchesSearch =
        searchQuery === '' ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.role && a.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.department && a.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.model && a.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (a.skills && a.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesDept =
        selectedDept === 'All' ||
        (a.department && a.department.toLowerCase() === selectedDept.toLowerCase()) ||
        (selectedDept === 'Executive' && (a.id === 'personal-assistant' || a.department === 'Executive'));

      return matchesSearch && matchesDept;
    });
  }, [agents, searchQuery, selectedDept]);

  // Open modal for new agent
  const handleOpenCreateModal = () => {
    setEditingAgent(null);
    setFormId(`agent-${Date.now()}`);
    setFormName('');
    setFormRole('');
    setFormDepartment('Engineering');
    setFormAvatar('purple-pebble');
    setFormModel(defaultModel || 'gpt-6-astra');
    setIsCustomModel(false);
    setFormDescription('');
    setFormSystemPrompt('');
    setFormSkillsInput('planning, problem-solving, collaboration');
    setFormTools(['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send']);
    setFormTelegramBot('');
    setShowModal(true);
  };

  // Open modal for editing existing agent
  const handleOpenEditModal = (agent: AgentPerson) => {
    setEditingAgent(agent);
    setFormId(agent.id);
    setFormName(agent.name);
    setFormRole(agent.role || agent.name);
    setFormDepartment(agent.department || 'Engineering');
    setFormAvatar(agent.avatar || 'purple-pebble');
    setFormModel(agent.model || defaultModel || 'gpt-6-astra');
    setIsCustomModel(false);
    setFormDescription(agent.description || '');
    setFormSystemPrompt(agent.systemPrompt || '');
    setFormSkillsInput((agent.skills || []).join(', '));
    setFormTools(agent.tools || ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send']);
    const linked = configuredBots.find((b) => b.agentId === agent.id);
    setFormTelegramBot(linked ? linked.id : (agent.telegramBot?.username || ''));
    setShowModal(true);
  };

  // Save Agent Person (POST /api/agents)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formId.trim()) {
      alert('Agent Name and ID are required');
      return;
    }

    const skills = formSkillsInput
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);

    // If a configured bot is chosen in the dropdown
    const chosenBot = configuredBots.find((b) => b.id === formTelegramBot);

    const payload: AgentPerson = {
      id: formId.trim(),
      name: formName.trim(),
      role: formRole.trim() || formName.trim(),
      department: formDepartment,
      avatar: formAvatar,
      model: formModel.trim() || defaultModel || 'gpt-6-astra',
      description: formDescription.trim() || `Agent Person: ${formRole || formName}`,
      systemPrompt:
        formSystemPrompt.trim() ||
        `You are ${formName.trim()}, the ${formRole.trim()} in the ${formDepartment} department. Execute assigned duties thoroughly, maintain system standards, and communicate clearly.`,
      skills: skills.length > 0 ? skills : ['general-execution'],
      tools: formTools,
      providerId: '',
      mcp: [],
      memoryScopes: ['user', 'workspace'],
      policy: {},
      isDefault: editingAgent ? editingAgent.isDefault : false,
      telegramBot: chosenBot
        ? {
            username: chosenBot.name?.startsWith('@') ? chosenBot.name : `@${chosenBot.name || chosenBot.id}`,
            status: 'connected',
            mode: 'direct',
          }
        : editingAgent?.telegramBot,
    };

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Also sync Telegram Bot assignment if specified
        if (formTelegramBot && chosenBot) {
          if (chosenBot.agentId !== payload.id) {
            await fetch('/api/telegram/bots', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...chosenBot, agentId: payload.id, enabled: true }),
            });
          }
        } else if (!formTelegramBot) {
          // If explicitly unlinked in edit modal
          const prevBot = configuredBots.find((b) => b.agentId === payload.id);
          if (prevBot) {
            await fetch('/api/telegram/bots', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...prevBot, agentId: '' }),
            });
          }
        }

        setShowModal(false);
        await Promise.all([loadAgents(), loadConfiguredBots()]);
        triggerToast(`Saved Agent Person: ${payload.name}`);

        // Update active agent if edited
        if (activeAgent?.id === payload.id) {
          setActiveAgent(payload);
          if (payload.model) setActiveModel(payload.model);
        }
      } else {
        alert('Failed to save agent person to database.');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving agent person.');
    }
  };

  // Delete agent
  const handleDelete = async (agent: AgentPerson) => {
    if (agent.id === 'personal-assistant') {
      alert('Personal Assistant is the core default coordinator and cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to dismiss ${agent.name} (${agent.role || agent.id})?`)) return;

    try {
      const res = await fetch(`/api/agents?id=${agent.id}`, { method: 'DELETE' });
      if (res.ok) {
        // Unlink bot if one was attached
        const attachedBot = configuredBots.find((b) => b.agentId === agent.id);
        if (attachedBot) {
          await fetch('/api/telegram/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...attachedBot, agentId: '' }),
          });
          await loadConfiguredBots();
        }
        await loadAgents();
        triggerToast(`Dismissed ${agent.name}`);
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  // Chat 1:1 with this specific agent person
  const handleChat = async (agent: AgentPerson) => {
    setActiveAgent(agent);
    if (agent.model) {
      setActiveModel(agent.model);
    }
    await createSession(agent.id);
    navigate('chat');
  };

  // Open Telegram pairing modal
  const handleOpenTgModal = (agent: AgentPerson) => {
    setSelectedAgentForTg(agent);
    const existing = configuredBots.find((b) => b.agentId === agent.id);
    setSelectedBotIdToLink(existing ? existing.id : '');
    setIsAddNewBotMode(configuredBots.length === 0);
    setTgBotUsername('');
    setTgBotToken('');
    setShowTgModal(true);
  };

  // Save Telegram bot for agent (supports linking from configured bots or registering new one)
  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentForTg) return;

    setIsSavingTg(true);
    try {
      if (isAddNewBotMode) {
        if (!tgBotToken.trim()) {
          alert('Telegram bot token is required');
          setIsSavingTg(false);
          return;
        }

        const res = await fetch('/api/telegram/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: tgBotToken.trim(),
            name: tgBotUsername ? (tgBotUsername.startsWith('@') ? tgBotUsername : `@${tgBotUsername}`) : `Bot for ${selectedAgentForTg.name}`,
            agentId: selectedAgentForTg.id,
            enabled: true,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to register Telegram Bot with token');
        }
        triggerToast(`✓ New Telegram Bot registered & linked to ${selectedAgentForTg.name}`);
      } else {
        // Link existing bot or unlink
        if (selectedBotIdToLink) {
          const botToLink = configuredBots.find((b) => b.id === selectedBotIdToLink);
          if (botToLink) {
            // Unlink any other bot currently bound to this agent
            for (const b of configuredBots) {
              if (b.agentId === selectedAgentForTg.id && b.id !== selectedBotIdToLink) {
                await fetch('/api/telegram/bots', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...b, agentId: '' }),
                });
              }
            }

            // Link the selected bot
            const res = await fetch('/api/telegram/bots', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...botToLink,
                agentId: selectedAgentForTg.id,
                enabled: true,
              }),
            });

            if (!res.ok) throw new Error('Failed to link Telegram Bot');
            triggerToast(`✓ Linked ${botToLink.name || botToLink.id} to ${selectedAgentForTg.name}`);
          }
        } else {
          // Unlink all bots from this agent
          for (const b of configuredBots) {
            if (b.agentId === selectedAgentForTg.id) {
              await fetch('/api/telegram/bots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...b, agentId: '' }),
              });
            }
          }
          triggerToast(`Unlinked Telegram Bot from ${selectedAgentForTg.name}`);
        }
      }

      setShowTgModal(false);
      await Promise.all([loadConfiguredBots(), loadAgents()]);
    } catch (err: any) {
      alert(err.message || 'Error configuring Telegram bot.');
    } finally {
      setIsSavingTg(false);
    }
  };

  const stats = useMemo(() => {
    const total = agents.length;
    const telegramConfigured = configuredBots.length;
    const telegramActive = configuredBots.filter((b) => b.status === 'running' || b.enabled).length;
    const depts = new Set(agents.map((a) => a.department || 'General')).size;
    return { total, telegramConfigured, telegramActive, depts };
  }, [agents, configuredBots]);

  const AVAILABLE_TOOLS = [
    { id: 'bash', label: 'Shell / Bash Exec' },
    { id: 'file.write', label: 'File Writer' },
    { id: 'file.read', label: 'File Reader' },
    { id: 'git_worktree', label: 'Git Worktrees' },
    { id: 'web.fetch', label: 'Web Browser / Fetch' },
    { id: 'rag.query', label: 'Vector RAG Query' },
    { id: 'telegram.send', label: 'Telegram Dispatch' },
    { id: 'review_code', label: 'Code Reviewer' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAFAFA] dark:bg-[#0A0A0A] overflow-y-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-[#007AFF] text-white px-4 py-2.5 rounded-[8px] text-xs font-bold shadow-xl animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
          <CheckCircle2 size={15} />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="p-6 pb-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#121212]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[8px] bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-[#007AFF]">
                <Users2 size={18} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#000000] dark:text-white font-sans">
                  Agent Persons
                </h1>
                <p className="text-xs text-[#8A8A85] font-sans">
                  Autonomous office staff, coordinators & specialists with dedicated AI configurations
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Hire Button */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-[8px] bg-gray-50 dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-[#8A8A85]">
              <span><strong>{stats.total}</strong> Staff</span>
              <span>·</span>
              <span><strong>{stats.depts}</strong> Depts</span>
              <span>·</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                <strong>{stats.telegramConfigured}</strong> Telegram {stats.telegramConfigured === 1 ? 'Bot' : 'Bots'} ({stats.telegramActive} Active)
              </span>
            </div>

            <button
              onClick={handleOpenCreateModal}
              className="px-3.5 py-2 rounded-[8px] bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold font-sans flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Hire Agent Person</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5">
          {/* Department Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {DEPARTMENTS.map((dept) => {
              const isSelected = selectedDept === dept;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-3 py-1 rounded-[6px] text-xs font-bold font-sans transition-all whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-xs'
                      : 'text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                  }`}
                >
                  {dept}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
            <input
              type="text"
              placeholder="Search agent, role, skill, model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
            />
          </div>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="p-6">
        {filteredAgents.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#141414] rounded-[12px] border border-[#E5E7EB] dark:border-[#2C2C2E]">
            <Users2 size={36} className="mx-auto text-[#8A8A85] opacity-50 mb-3" />
            <div className="text-sm font-bold text-[#000000] dark:text-white">No Agent Persons Found</div>
            <p className="text-xs text-[#8A8A85] mt-1 max-w-sm mx-auto">
              No staff members match the selected filters. Hire a new agent person or clear your search.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 px-3.5 py-1.5 bg-[#007AFF] text-white text-xs font-bold rounded-[6px] cursor-pointer"
            >
              Hire Agent Person
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => {
              const p = agent as AgentPerson;
              const linkedBot = configuredBots.find((b) => b.agentId === p.id);
              const botDisplay = linkedBot ? (linkedBot.name?.startsWith('@') ? linkedBot.name : `@${linkedBot.name.replace('@', '')}`) : (p.telegramBot?.username || null);
              const isBotActive = linkedBot ? (linkedBot.status === 'running' || linkedBot.enabled) : (p.telegramBot?.status === 'connected');
              const modelName = p.model || defaultModel || 'gpt-6-astra';
              const contextTag = getModelContextLabel(modelName);

              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-[#161618] rounded-[12px] border border-[#E5E7EB] dark:border-[#2C2C2E] hover:border-gray-300 dark:hover:border-gray-700 p-4 transition-all shadow-xs hover:shadow-sm flex flex-col justify-between"
                >
                  {/* Top: Avatar & Identification */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <GrokAvatar id={p.avatar || p.id} size={44} />
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#161618]" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#000000] dark:text-white font-sans truncate">
                              {p.name}
                            </span>
                            {p.department && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-gray-100 dark:bg-[#27272A] text-gray-600 dark:text-gray-300 uppercase">
                                {p.department}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[#007AFF] font-medium truncate font-sans">
                            {p.role || p.name}
                          </span>
                        </div>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="p-1 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                          title="Edit Agent Person"
                        >
                          <Edit3 size={13} />
                        </button>
                        {p.id !== 'personal-assistant' && (
                          <button
                            onClick={() => handleDelete(p)}
                            className="p-1 text-[#8A8A85] hover:text-red-500 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                            title="Dismiss Agent Person"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[#8A8A85] mt-2.5 line-clamp-2 font-sans leading-relaxed">
                      {p.description || 'No description provided.'}
                    </p>

                    {/* Model Pill & Telegram Bot */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 text-[#007AFF] text-[10px] font-mono font-semibold">
                        <Cpu size={11} />
                        <span className="truncate max-w-[140px]">{modelName}</span>
                        <span className="text-[9px] px-1 rounded bg-blue-200/60 dark:bg-blue-800/60 text-blue-900 dark:text-blue-200">
                          {contextTag}
                        </span>
                      </div>

                      {botDisplay ? (
                        <div
                          onClick={() => handleOpenTgModal(p)}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-semibold cursor-pointer hover:underline"
                          title={`Telegram Bot: ${botDisplay}. Click to manage or reassign.`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isBotActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                          <Send size={10} />
                          <span className="truncate max-w-[120px]">{botDisplay}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenTgModal(p)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-[10px] font-sans cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                          title="Link a configured Telegram Bot"
                        >
                          <Send size={10} />
                          <span>Link Bot</span>
                        </button>
                      )}
                    </div>

                    {/* Skills Chips */}
                    {p.skills && p.skills.length > 0 && (
                      <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                        {p.skills.slice(0, 4).map((sk) => (
                          <span
                            key={sk}
                            className="text-[9px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-[#202022] text-[#6B7280] dark:text-[#9CA3AF] font-mono"
                          >
                            #{sk}
                          </span>
                        ))}
                        {p.skills.length > 4 && (
                          <span className="text-[9px] text-gray-400">+{p.skills.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action: Chat */}
                  <div className="mt-4 pt-3 border-t border-[#F3F4F6] dark:border-[#242426] flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-sans">
                      {p.tools?.length || 0} Tools Enabled
                    </span>

                    <button
                      onClick={() => handleChat(p)}
                      className="px-3 py-1.5 rounded-[6px] bg-[#0F0F0F] dark:bg-white hover:bg-black/80 dark:hover:bg-white/90 text-white dark:text-black text-xs font-bold font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MessageSquare size={12} />
                      <span>Chat</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT AGENT PERSON MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white dark:bg-[#18181B] rounded-[16px] border border-[#E5E7EB] dark:border-[#2C2C2E] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users2 size={18} className="text-[#007AFF]" />
                <h2 className="text-sm font-bold text-[#000000] dark:text-white font-sans">
                  {editingAgent ? `Edit Agent Person: ${editingAgent.name}` : 'Hire New Agent Person'}
                </h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Name & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Rivera, Personal Assistant"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                    Role / Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lead Frontend Dev, Executive Coordinator"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  />
                </div>
              </div>

              {/* Department & ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                    Department
                  </label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  >
                    {DEPARTMENTS.filter((d) => d !== 'All').map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                    Agent ID (Slug) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingAgent}
                    placeholder="e.g. lead-frontend, personal-assistant"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF] disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Visual Grok Avatar Selector (NO EMOJIS!) */}
              <div>
                <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans flex items-center justify-between">
                  <span>Visual Persona Avatar</span>
                  <span className="text-[10px] text-gray-400 font-normal">Clean SVG Grok Avatars</span>
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mt-2">
                  {GROK_AVATARS.map((av) => {
                    const isSelected = formAvatar === av.id;
                    return (
                      <div
                        key={av.id}
                        onClick={() => setFormAvatar(av.id)}
                        className={`p-1.5 rounded-[8px] flex flex-col items-center justify-center cursor-pointer transition-all border ${
                          isSelected
                            ? 'border-[#007AFF] bg-blue-50/80 dark:bg-blue-950/40 shadow-xs ring-2 ring-[#007AFF]/40'
                            : 'border-[#E5E7EB] dark:border-[#2C2C2E] hover:border-gray-400 bg-[#F7F7F5] dark:bg-[#242426]'
                        }`}
                        title={`${av.name} (${av.role})`}
                      >
                        <GrokAvatar id={av.id} size={30} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Provider & Model Selector (DYNAMIC POPULATION FROM CONNECTED PROVIDERS) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                    Assigned AI Model (From Configured Providers) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomModel(!isCustomModel)}
                    className="text-[10px] text-[#007AFF] hover:underline cursor-pointer"
                  >
                    {isCustomModel ? 'Select from provider models' : 'Type custom model ID'}
                  </button>
                </div>

                {isCustomModel ? (
                  <input
                    type="text"
                    placeholder="Enter custom model ID (e.g. gpt-6-astra, deepseek-v4-flash)..."
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full mt-1.5 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  />
                ) : (
                  <select
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  >
                    {groupedModels.map((group) => (
                      <optgroup key={group.providerName} label={`── ${group.providerName} ──`}>
                        {group.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id} [{getModelContextLabel(m.id)}]
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Brief summary of duties and responsibilities"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              {/* System Prompt Instructions */}
              <div>
                <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                  Persona & System Prompt Instructions
                </label>
                <textarea
                  rows={4}
                  placeholder="Define persona, expertise, behavioral rules, constraints, and standard operating procedures..."
                  value={formSystemPrompt}
                  onChange={(e) => setFormSystemPrompt(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF] resize-y leading-relaxed"
                />
              </div>

              {/* Skills */}
              <div>
                <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                  Skills & Responsibilities (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. react-19, typescript, code-review, system-design"
                  value={formSkillsInput}
                  onChange={(e) => setFormSkillsInput(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              {/* Capabilities & Tools */}
              <div>
                <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                  Enabled Tools & Capabilities
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
                  {AVAILABLE_TOOLS.map((t) => {
                    const isChecked = formTools.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 p-2 rounded-[6px] border text-xs cursor-pointer select-none transition-colors ${
                          isChecked
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-[#007AFF] font-bold'
                            : 'bg-[#F7F7F5] dark:bg-[#242426] border-[#E5E7EB] dark:border-[#2C2C2E] text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormTools([...formTools, t.id]);
                            } else {
                              setFormTools(formTools.filter((id) => id !== t.id));
                            }
                          }}
                          className="rounded text-[#007AFF]"
                        />
                        <span className="text-[11px] truncate">{t.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Telegram Bot (Select from configured bots) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                    Assigned Telegram Bot (Optional)
                  </label>
                  <span className="text-[10px] text-[#8A8A85]">
                    {configuredBots.length} {configuredBots.length === 1 ? 'bot' : 'bots'} configured
                  </span>
                </div>
                <select
                  value={formTelegramBot}
                  onChange={(e) => setFormTelegramBot(e.target.value)}
                  className="w-full px-3 py-2 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                >
                  <option value="">-- No Telegram Bot Linked --</option>
                  {configuredBots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name || bot.id} {bot.agentId && bot.agentId !== formId ? `(Assigned to: ${bot.agentId})` : bot.agentId === formId ? '✓ (Currently Assigned)' : ''} [{bot.status || (bot.enabled ? 'running' : 'stopped')}]
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#8A8A85] mt-1">
                  Select from existing Telegram bots to route messages directly to this agent person.
                </p>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-[6px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-[6px] bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold font-sans cursor-pointer shadow-sm"
                >
                  {editingAgent ? 'Save Changes' : 'Hire Agent Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TELEGRAM BOT PAIRING MODAL */}
      {showTgModal && selectedAgentForTg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white dark:bg-[#18181B] rounded-[16px] border border-[#E5E7EB] dark:border-[#2C2C2E] shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send size={16} className="text-[#007AFF]" />
                <h2 className="text-sm font-bold text-[#000000] dark:text-white font-sans">
                  Link Telegram Bot: {selectedAgentForTg.name}
                </h2>
              </div>
              <button
                onClick={() => setShowTgModal(false)}
                className="p-1 rounded text-[#8A8A85] hover:text-[#000000] dark:hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTelegram} className="p-5 space-y-4">
              {!isAddNewBotMode ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                      Select Configured Bot *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddNewBotMode(true)}
                      className="text-[10px] text-[#007AFF] hover:underline cursor-pointer"
                    >
                      + Connect New Bot Token
                    </button>
                  </div>

                  {configuredBots.length === 0 ? (
                    <div className="p-3 rounded-[8px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
                      No configured Telegram bots found yet. Click <strong>+ Connect New Bot Token</strong> to add one from @BotFather.
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedBotIdToLink}
                        onChange={(e) => setSelectedBotIdToLink(e.target.value)}
                        className="w-full px-3 py-2 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                      >
                        <option value="">-- No Bot (Unlink Bot) --</option>
                        {configuredBots.map((bot) => (
                          <option key={bot.id} value={bot.id}>
                            {bot.name || bot.id} {bot.agentId && bot.agentId !== selectedAgentForTg.id ? `(assigned to ${bot.agentId})` : bot.agentId === selectedAgentForTg.id ? '✓ (currently linked)' : ''} [{bot.status || (bot.enabled ? 'running' : 'stopped')}]
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-[#8A8A85] mt-1.5 leading-relaxed">
                        Choose an existing configured Telegram bot. No manual API token input required.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-[#333333] dark:text-gray-300 font-sans">
                      Connect New Telegram Bot
                    </label>
                    {configuredBots.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsAddNewBotMode(false)}
                        className="text-[10px] text-[#007AFF] hover:underline cursor-pointer"
                      >
                        ← Select from configured bots ({configuredBots.length})
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 font-sans">Bot Token (from @BotFather) *</label>
                    <input
                      type="password"
                      required
                      placeholder="e.g. 7123456789:AAH..."
                      value={tgBotToken}
                      onChange={(e) => setTgBotToken(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 font-sans">Bot Handle / Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. @MyStaffAgentBot"
                      value={tgBotUsername}
                      onChange={(e) => setTgBotUsername(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-[6px] bg-[#F7F7F5] dark:bg-[#242426] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-[8px] border border-blue-100 dark:border-blue-900/40 text-xs text-[#007AFF] leading-relaxed">
                When linked, messages sent to this Telegram Bot will automatically route directly to{' '}
                <strong>{selectedAgentForTg.name}</strong>, using their persona, rules, and assigned model.
              </div>

              <div className="pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTgModal(false)}
                  className="px-4 py-1.5 rounded-[6px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTg}
                  className="px-4 py-1.5 rounded-[6px] bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold font-sans cursor-pointer disabled:opacity-50"
                >
                  {isSavingTg ? 'Saving...' : isAddNewBotMode ? 'Register & Link' : 'Save Bot Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
