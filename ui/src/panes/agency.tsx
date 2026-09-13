import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
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
  Shield,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Shuffle,
  Clock,
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
  Hash,
  HelpCircle,
  Unlink,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AgentConfig, TelegramBotConfig } from '../types';
import { GrokAvatar, GROK_AVATARS } from '../components/GrokAvatar';

export interface OfficeWorker {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar: string;
  model?: string;
  description: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
  status: 'active' | 'busy' | 'standby';
  telegramBot?: {
    id?: string;
    username?: string;
    token?: string;
    status: 'connected' | 'unlinked' | 'error';
    mode?: 'direct' | 'topic_group';
    topicName?: string;
    topicId?: number;
    chatId?: string;
  };
  currentTask?: string;
  tasksCompleted?: number;
}

const DEFAULT_OFFICE_WORKERS: OfficeWorker[] = [
  {
    id: 'lead-frontend',
    name: 'Alex Rivera',
    role: 'Lead Frontend Dev',
    department: 'Engineering',
    avatar: 'blue-drop',
    model: 'gpt-4o',
    description: 'Lead web developer specialized in React, TypeScript, Tailwind CSS, and mobile-responsive architectures.',
    systemPrompt:
      'You are the Lead Frontend Developer of KendaliAI. You architect modern, responsive user interfaces with React, TypeScript, and Tailwind CSS. You write clean, decoupled components, handle state management gracefully, and ensure 60fps animations.',
    skills: ['react-19', 'typescript', 'tailwind-css', 'mobile-responsive', 'vite-build', 'ui-accessibility'],
    tools: ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
    status: 'busy',
    telegramBot: {
      id: 'tg-frontend',
      username: '@kendali_frontend_bot',
      status: 'connected',
      mode: 'direct',
    },
    currentTask: 'Refactoring mobile navigation drawer and Touch feedback',
    tasksCompleted: 88,
  },
  {
    id: 'lead-architecture',
    name: 'Elena Rostova',
    role: 'Lead Solution Architecture',
    department: 'Architecture',
    avatar: 'cyan-bubble',
    model: 'claude-3-7-sonnet',
    description: 'System architect designing modular component boundaries, git worktree branching, and RFC specifications.',
    systemPrompt:
      'You are the Lead Solution Architect of KendaliAI. You define architectural blueprints, evaluate trade-offs between speed and modularity, specify API protocols, and govern worktree branching policies.',
    skills: ['system-design', 'worktree-branching', 'domain-driven-design', 'rfc-specifications', 'security-boundaries'],
    tools: ['file.read', 'git_worktree', 'web.fetch', 'rag.query', 'telegram.send'],
    status: 'active',
    telegramBot: {
      id: 'tg-arch',
      username: '@kendali_arch_bot',
      status: 'connected',
      mode: 'topic_group',
      topicName: 'Architecture',
      topicId: 108,
    },
    currentTask: 'Drafting RFC for dynamic agent worker delegation protocol',
    tasksCompleted: 56,
  },
  {
    id: 'lead-backend',
    name: 'Marcus Chen',
    role: 'Lead Backend Dev',
    department: 'Engineering',
    avatar: 'green-cloud',
    model: 'qwen2.5-coder:latest',
    description: 'Distributed systems engineer handling Go microservices, SQLite persistence, and WebSocket streaming.',
    systemPrompt:
      'You are the Lead Backend Developer of KendaliAI. You design high-throughput Go HTTP/WebSocket servers, database persistence layers, background task workers, and external API gateways with zero runtime overhead.',
    skills: ['go-runtime', 'sqlite-database', 'websocket-streaming', 'concurrency-routines', 'rest-api'],
    tools: ['bash', 'file.write', 'file.read', 'git_worktree', 'exec.plugin', 'telegram.send'],
    status: 'active',
    telegramBot: {
      id: 'tg-backend',
      username: '@kendali_backend_bot',
      status: 'connected',
      mode: 'direct',
    },
    currentTask: 'Optimizing background task scheduler execution queue',
    tasksCompleted: 114,
  },
  {
    id: 'legal-counsel',
    name: 'Sarah Vance',
    role: 'Legal Counsel & Compliance',
    department: 'Legal',
    avatar: 'bronze-shield',
    model: 'gpt-4o',
    description: 'Corporate law, software licenses (Apache/MIT/GPL), GDPR privacy, and regulatory risk audits.',
    systemPrompt:
      'You are the Chief Legal Counsel & Compliance Officer of KendaliAI. You review licensing terms, analyze intellectual property implications, check terms of service, and highlight regulatory risks with structured legal opinions.',
    skills: ['contract-review', 'license-compliance', 'gdpr-privacy', 'ip-protection', 'risk-mitigation'],
    tools: ['file.read', 'web.fetch', 'rag.query', 'telegram.send'],
    status: 'active',
    telegramBot: {
      id: 'tg-legal',
      username: '@kendali_legal_bot',
      status: 'connected',
      mode: 'direct',
    },
    currentTask: 'Reviewing open-source dependency licenses in go.mod',
    tasksCompleted: 42,
  },
  {
    id: 'devops-lead',
    name: 'Darius Thorne',
    role: 'DevOps & Infrastructure Lead',
    department: 'Operations',
    avatar: 'orange-leaf',
    model: 'deepseek-chat',
    description: 'Automates CI/CD pipelines, Docker virtualization, server daemon supervisors, and Tailscale mesh networks.',
    systemPrompt:
      'You are the DevOps & Infrastructure Lead of KendaliAI. You automate build pipelines, manage process supervision, maintain remote access network tunnels, and ensure 99.99% uptime for background worker agents.',
    skills: ['docker-containers', 'ci-cd-pipelines', 'tailscale-mesh', 'systemd-supervisors', 'log-aggregation'],
    tools: ['bash', 'file.write', 'file.read', 'git_worktree', 'cron.schedule', 'telegram.send'],
    status: 'standby',
    telegramBot: {
      status: 'unlinked',
    },
    currentTask: 'Awaiting next automated deployment trigger',
    tasksCompleted: 39,
  },
  {
    id: 'chief-security',
    name: 'Kavita Patel',
    role: 'Chief Security & QA Officer',
    department: 'Security',
    avatar: 'ruby-capsule',
    model: 'gpt-4o',
    description: 'Audits git diffs for leaked secrets, enforces OWASP top 10 rules, and executes vulnerability test suites.',
    systemPrompt:
      'You are the Chief Security & QA Officer of KendaliAI. You inspect every pull request and git worktree for exposed API keys, memory leaks, SQL/command injection vectors, and unauthorized network egress.',
    skills: ['secret-scanning', 'owasp-defense', 'fuzz-testing', 'worktree-diff-audit', 'penetration-test'],
    tools: ['bash', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
    status: 'active',
    telegramBot: {
      id: 'tg-security',
      username: '@kendali_sec_bot',
      status: 'connected',
      mode: 'direct',
    },
    currentTask: 'Continuous background diff scanner active',
    tasksCompleted: 95,
  },
];

const FALLBACK_REGISTERED_BOTS: TelegramBotConfig[] = [
  {
    id: 'tg-frontend',
    name: 'Frontend Dev Bot (@kendali_frontend_bot)',
    token: '7192840192:AAFn...masked',
    agentId: 'lead-frontend',
    enabled: true,
    status: 'running',
    mode: 'direct',
  },
  {
    id: 'tg-arch',
    name: 'Architecture Bot (@kendali_arch_bot)',
    token: '6829104821:BBKx...masked',
    agentId: 'lead-architecture',
    enabled: true,
    status: 'running',
    mode: 'topic_group',
    topicName: 'Architecture',
    topicId: 108,
  },
  {
    id: 'tg-legal',
    name: 'Legal Counsel Bot (@kendali_legal_bot)',
    token: '5920194812:CCJm...masked',
    agentId: 'legal-counsel',
    enabled: true,
    status: 'running',
    mode: 'direct',
  },
  {
    id: 'tg-backend',
    name: 'Backend Dev Bot (@kendali_backend_bot)',
    token: '6192849102:DDLp...masked',
    agentId: 'lead-backend',
    enabled: true,
    status: 'running',
    mode: 'direct',
  },
  {
    id: 'tg-security',
    name: 'Chief Security Bot (@kendali_sec_bot)',
    token: '7829104821:EEQz...masked',
    agentId: 'chief-security',
    enabled: true,
    status: 'running',
    mode: 'direct',
  },
];

const DEPARTMENTS = ['All', 'Engineering', 'Architecture', 'Legal', 'Security', 'Operations'];

export const AgencyHQPane: React.FC = () => {
  const {
    createSession,
    setActiveAgent,
    agents,
    availableModels,
    defaultModel,
    loadModels,
    setActiveModel,
  } = useAppStore();

  // State
  const [workers, setWorkers] = useState<OfficeWorker[]>(() => {
    try {
      const saved = localStorage.getItem('kendali_office_workers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      return DEFAULT_OFFICE_WORKERS;
    } catch {
      return DEFAULT_OFFICE_WORKERS;
    }
  });

  const [telegramBots, setTelegramBots] = useState<TelegramBotConfig[]>(FALLBACK_REGISTERED_BOTS);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Modals
  const [showWorkerModal, setShowWorkerModal] = useState<boolean>(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);
  const [selectedWorkerForTg, setSelectedWorkerForTg] = useState<OfficeWorker | null>(null);
  const [showDelegateModal, setShowDelegateModal] = useState<boolean>(false);
  const [selectedWorkerForDelegate, setSelectedWorkerForDelegate] = useState<OfficeWorker | null>(null);

  // Form states for creating/editing worker
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formDepartment, setFormDepartment] = useState('Engineering');
  const [formAvatar, setFormAvatar] = useState('blue-drop');
  const [formModel, setFormModel] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSystemPrompt, setFormSystemPrompt] = useState('');
  const [formSkillsInput, setFormSkillsInput] = useState('react, typescript, ui');
  const [formTelegramBot, setFormTelegramBot] = useState('');

  // Delegation modal state
  const [taskPrompt, setTaskPrompt] = useState('');
  const [delegationNotice, setDelegationNotice] = useState<string | null>(null);

  // Telegram pairing modal tab & forms
  const [tgPairTab, setTgPairTab] = useState<'registered' | 'topic' | 'new_bot'>('registered');
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  // Topic config
  const [tgTopicParentBotId, setTgTopicParentBotId] = useState<string>('');
  const [tgTopicName, setTgTopicName] = useState<string>('');
  const [tgTopicId, setTgTopicId] = useState<string>('');
  const [tgChatId, setTgChatId] = useState<string>('');
  // New bot token config
  const [tgBotName, setTgBotName] = useState('');
  const [tgBotToken, setTgBotToken] = useState('');
  const [isLinkingTg, setIsLinkingTg] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Sync to localStorage whenever workers change
  useEffect(() => {
    localStorage.setItem('kendali_office_workers', JSON.stringify(workers));
  }, [workers]);

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Load telegram bots from backend
  const loadTelegramBots = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/telegram/bots');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setTelegramBots(data);
        } else {
          setTelegramBots(FALLBACK_REGISTERED_BOTS);
        }
      }
    } catch (err) {
      console.warn('Telegram bots fetch fallback:', err);
      setTelegramBots(FALLBACK_REGISTERED_BOTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTelegramBots();
  }, [loadTelegramBots]);

  // Helper to pick a random icon from the 10 Grok SVG presets
  const handlePickRandomIcon = () => {
    const randomIndex = Math.floor(Math.random() * GROK_AVATARS.length);
    const chosen = GROK_AVATARS[randomIndex];
    setFormAvatar(chosen.id);
    triggerToast(`Random avatar selected: ${chosen.name} (${chosen.role})`);
  };

  // Open Hire / Add Worker Modal
  const handleOpenAddModal = () => {
    setEditingWorkerId(null);
    setFormName('');
    setFormRole('');
    setFormDepartment('Engineering');
    // Randomize initial avatar from 10 presets for delight
    const randomPreset = GROK_AVATARS[Math.floor(Math.random() * GROK_AVATARS.length)];
    setFormAvatar(randomPreset.id);
    setFormModel('');
    setFormDescription('');
    setFormSystemPrompt(
      'You are an expert specialist worker agent. You report to the user and execute tasks autonomously.'
    );
    setFormSkillsInput('problem-solving, fast-execution, deep-analysis');
    setFormTelegramBot('');
    setShowWorkerModal(true);
  };

  // Open Edit Worker Modal
  const handleOpenEditModal = (worker: OfficeWorker) => {
    setEditingWorkerId(worker.id);
    setFormName(worker.name);
    setFormRole(worker.role);
    setFormDepartment(worker.department);
    setFormAvatar(worker.avatar);
    setFormModel(worker.model || '');
    setFormDescription(worker.description);
    setFormSystemPrompt(worker.systemPrompt);
    setFormSkillsInput(worker.skills.join(', '));
    setFormTelegramBot(worker.telegramBot?.username || '');
    setShowWorkerModal(true);
  };

  // Save Worker (Create or Update)
  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formRole.trim()) return;

    const skills = formSkillsInput
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);

    if (editingWorkerId) {
      // Update existing
      setWorkers((prev) =>
        prev.map((w) => {
          if (w.id === editingWorkerId) {
            return {
              ...w,
              name: formName.trim(),
              role: formRole.trim(),
              department: formDepartment,
              avatar: formAvatar,
              model: formModel.trim() || undefined,
              description: formDescription.trim(),
              systemPrompt: formSystemPrompt.trim(),
              skills,
              telegramBot: formTelegramBot
                ? {
                    ...w.telegramBot,
                    username: formTelegramBot.startsWith('@') ? formTelegramBot : `@${formTelegramBot}`,
                    status: 'connected',
                  }
                : w.telegramBot,
            };
          }
          return w;
        })
      );
      triggerToast(`Staff worker updated: ${formRole}`);
    } else {
      // Create new subordinate worker
      const newId = `worker-${Date.now()}`;
      const newWorker: OfficeWorker = {
        id: newId,
        name: formName.trim(),
        role: formRole.trim(),
        department: formDepartment,
        avatar: formAvatar,
        model: formModel.trim() || undefined,
        description: formDescription.trim() || `Specialized subordinate agent handling ${formRole}.`,
        systemPrompt:
          formSystemPrompt.trim() ||
          `You are ${formName.trim()}, the ${formRole.trim()} in the ${formDepartment} department. You execute technical, legal, or architectural tasks thoroughly and report back with clear deliverables.`,
        skills: skills.length ? skills : ['specialized-execution'],
        tools: ['bash', 'file.write', 'file.read', 'git_worktree', 'web.fetch', 'telegram.send'],
        status: 'active',
        telegramBot: formTelegramBot
          ? {
              username: formTelegramBot.startsWith('@') ? formTelegramBot : `@${formTelegramBot}`,
              status: 'connected',
              mode: 'direct',
            }
          : { status: 'unlinked' },
        currentTask: 'Ready for assignments',
        tasksCompleted: 0,
      };

      setWorkers((prev) => [newWorker, ...prev]);

      // Also register into backend /api/agents so it's fully accessible by runtime!
      try {
        await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newWorker.id,
            name: `${newWorker.role} (${newWorker.name})`,
            description: newWorker.description,
            model: newWorker.model || '',
            systemPrompt: newWorker.systemPrompt,
            skills: newWorker.skills,
            tools: newWorker.tools,
            avatar: newWorker.avatar,
            isDefault: false,
          }),
        });
      } catch (err) {
        console.warn('Agent saved to local state fallback:', err);
      }

      triggerToast(`New staff hired: ${newWorker.role} (${newWorker.name})`);
    }

    setShowWorkerModal(false);
  };

  // Delete worker
  const handleDeleteWorker = async (worker: OfficeWorker) => {
    if (!confirm(`Are you sure you want to dismiss ${worker.role} (${worker.name}) from the agency?`)) return;

    setWorkers((prev) => prev.filter((w) => w.id !== worker.id));
    triggerToast(`Dismissed ${worker.role}`);

    try {
      await fetch(`/api/agents?id=${worker.id}`, { method: 'DELETE' });
    } catch {}
  };

  // Start direct chat session with this specific agent worker
  const handleChatWithWorker = async (worker: OfficeWorker) => {
    if (worker.model) {
      setActiveModel(worker.model);
    }
    const sessionId = await createSession(worker.id);
    const matched = agents.find((a) => a.id === worker.id);
    if (matched) {
      setActiveAgent(matched);
    } else {
      setActiveAgent({
        id: worker.id,
        name: worker.role,
        description: worker.description,
        providerId: '',
        model: worker.model || '',
        systemPrompt: worker.systemPrompt,
        skills: worker.skills,
        tools: worker.tools,
        mcp: [],
        memoryScopes: ['user', 'workspace'],
        policy: {},
        avatar: worker.avatar,
        isDefault: false,
      });
    }
    window.location.hash = '#chat';
  };

  // Open Telegram connection modal for worker
  const handleOpenTelegramConnect = (worker: OfficeWorker) => {
    setSelectedWorkerForTg(worker);

    const existingBot = telegramBots.find(
      (b) => b.agentId === worker.id || b.id === worker.telegramBot?.id
    );

    if (existingBot) {
      setSelectedBotId(existingBot.id);
      if (existingBot.mode === 'topic_group' || worker.telegramBot?.mode === 'topic_group') {
        setTgPairTab('topic');
        setTgTopicParentBotId(existingBot.id);
        setTgTopicName(worker.telegramBot?.topicName || existingBot.topicName || worker.department || '');
        setTgTopicId(worker.telegramBot?.topicId?.toString() || existingBot.topicId?.toString() || '');
        setTgChatId(worker.telegramBot?.chatId || existingBot.chatId || '');
      } else {
        setTgPairTab('registered');
      }
    } else {
      setSelectedBotId(telegramBots[0]?.id || '');
      setTgPairTab('registered');
      setTgTopicParentBotId(telegramBots[0]?.id || '');
      setTgTopicName(worker.department || 'General');
      setTgTopicId('');
      setTgChatId('');
    }

    setTgBotName(worker.telegramBot?.username?.replace('@', '') || `${worker.id}_bot`);
    setTgBotToken('');
    setShowTelegramModal(true);
  };

  // Unlink Telegram bot from worker
  const handleUnlinkBot = async () => {
    if (!selectedWorkerForTg) return;

    setWorkers((prev) =>
      prev.map((w) =>
        w.id === selectedWorkerForTg.id
          ? {
              ...w,
              telegramBot: {
                status: 'unlinked',
              },
            }
          : w
      )
    );

    triggerToast(`Unlinked Telegram bot from ${selectedWorkerForTg.role}`);
    setShowTelegramModal(false);
  };

  // Save Telegram bot link (3 tabs: registered, topic, new_bot)
  const handleSaveTelegramBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerForTg) return;

    setIsLinkingTg(true);

    try {
      if (tgPairTab === 'registered') {
        const chosenBot = telegramBots.find((b) => b.id === selectedBotId) || telegramBots[0];
        if (!chosenBot) throw new Error('No registered bot selected');

        // Persist to backend
        await fetch('/api/telegram/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...chosenBot,
            agentId: selectedWorkerForTg.id,
            enabled: true,
          }),
        });

        // Update local worker state
        const cleanUsername = chosenBot.name.includes('(@')
          ? '@' + chosenBot.name.split('(@')[1].replace(')', '')
          : chosenBot.name.startsWith('@')
          ? chosenBot.name
          : `@${chosenBot.name}`;

        setWorkers((prev) =>
          prev.map((w) =>
            w.id === selectedWorkerForTg.id
              ? {
                  ...w,
                  telegramBot: {
                    id: chosenBot.id,
                    username: cleanUsername,
                    status: 'connected',
                    mode: chosenBot.mode || 'direct',
                    topicName: chosenBot.topicName,
                    topicId: chosenBot.topicId,
                  },
                }
              : w
          )
        );

        triggerToast(`Paired ${selectedWorkerForTg.role} to bot: ${cleanUsername}`);
      } else if (tgPairTab === 'topic') {
        const parentBot =
          telegramBots.find((b) => b.id === tgTopicParentBotId) || telegramBots[0];
        const topicName = tgTopicName.trim() || selectedWorkerForTg.department || 'Topic';
        const topicThreadId = tgTopicId ? parseInt(tgTopicId, 10) : undefined;

        // Persist to backend
        await fetch('/api/telegram/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...parentBot,
            agentId: selectedWorkerForTg.id,
            mode: 'topic_group',
            topicName,
            topicId: topicThreadId,
            chatId: tgChatId.trim(),
            enabled: true,
          }),
        });

        const cleanUsername = parentBot?.name?.includes('(@')
          ? '@' + parentBot.name.split('(@')[1].replace(')', '')
          : parentBot?.name || '@kendali_bot';

        setWorkers((prev) =>
          prev.map((w) =>
            w.id === selectedWorkerForTg.id
              ? {
                  ...w,
                  telegramBot: {
                    id: parentBot?.id,
                    username: cleanUsername,
                    status: 'connected',
                    mode: 'topic_group',
                    topicName,
                    topicId: topicThreadId,
                    chatId: tgChatId.trim(),
                  },
                }
              : w
          )
        );

        triggerToast(`Routed Telegram Topic '#${topicName}' to ${selectedWorkerForTg.role}`);
      } else if (tgPairTab === 'new_bot') {
        if (!tgBotToken.trim()) throw new Error('Bot token is required');

        const cleanUsername = tgBotName.trim().startsWith('@')
          ? tgBotName.trim()
          : `@${tgBotName.trim()}`;
        const newBotId = `tg-${Date.now()}`;

        await fetch('/api/telegram/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newBotId,
            name: `${selectedWorkerForTg.role} Bot (${cleanUsername})`,
            token: tgBotToken.trim(),
            agentId: selectedWorkerForTg.id,
            enabled: true,
            mode: 'direct',
          }),
        });

        setWorkers((prev) =>
          prev.map((w) =>
            w.id === selectedWorkerForTg.id
              ? {
                  ...w,
                  telegramBot: {
                    id: newBotId,
                    username: cleanUsername,
                    status: 'connected',
                    mode: 'direct',
                  },
                }
              : w
          )
        );

        triggerToast(`New bot created and linked: ${cleanUsername}`);
      }

      setShowTelegramModal(false);
      loadTelegramBots();
    } catch (err: any) {
      alert(`Failed to pair Telegram Bot: ${err.message}`);
    } finally {
      setIsLinkingTg(false);
    }
  };

  // Open Delegate Task modal
  const handleOpenDelegate = (worker: OfficeWorker) => {
    setSelectedWorkerForDelegate(worker);
    setTaskPrompt('');
    setDelegationNotice(null);
    setShowDelegateModal(true);
  };

  // Submit Delegated Task
  const handleDispatchTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerForDelegate || !taskPrompt.trim()) return;

    const worker = selectedWorkerForDelegate;
    const taskTitle = taskPrompt.slice(0, 50);

    setWorkers((prev) =>
      prev.map((w) =>
        w.id === worker.id
          ? {
              ...w,
              status: 'busy',
              currentTask: taskPrompt.trim(),
              tasksCompleted: (w.tasksCompleted || 0) + 1,
            }
          : w
      )
    );

    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: worker.id,
          prompt: taskPrompt.trim(),
          title: `${worker.role}: ${taskTitle}`,
        }),
      });
    } catch (err) {
      console.warn('Task created locally fallback:', err);
    }

    setDelegationNotice(`Task delegated to ${worker.name} (${worker.role}). Agent worker is executing.`);
    triggerToast(`Task delegated to ${worker.role}!`);
    setTimeout(() => {
      setShowDelegateModal(false);
    }, 1500);
  };

  // Filtered workers list
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const matchDept = selectedDepartment === 'All' || w.department === selectedDepartment;
      const matchQuery =
        !searchQuery ||
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchDept && matchQuery;
    });
  }, [workers, selectedDepartment, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = workers.length;
    const active = workers.filter((w) => w.status === 'active' || w.status === 'busy').length;
    const telegramConnected = workers.filter((w) => w.telegramBot?.status === 'connected').length;
    const totalSkills = new Set(workers.flatMap((w) => w.skills)).size;
    return { total, active, telegramConnected, totalSkills };
  }, [workers]);

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-semibold rounded-[8px] shadow-lg border border-white/10 animate-fade-in">
          <Check size={14} className="text-[#16A34A]" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-4 sm:px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
              Agency HQ
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#DCFCE7] text-[#16A34A]">
              Office Operational
            </span>
          </div>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Autonomous digital office · Grok-style companion bots with specialty personas &amp; Telegram routing
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadTelegramBots}
            title="Refresh office status"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] text-xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync Status</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>Hire Worker</span>
          </button>
        </div>
      </div>

      {/* Office KPI Cards */}
      <div className="w-full px-4 sm:px-6 lg:px-9 pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-3.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[#8A8A85]">
            <span className="text-[11px] font-medium uppercase tracking-wider">Workforce</span>
            <Users2 size={15} />
          </div>
          <div className="text-xl font-bold text-[#000000]">{stats.total} Staff</div>
          <div className="text-[10px] text-[#16A34A] font-medium">{stats.active} on duty now</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-3.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[#8A8A85]">
            <span className="text-[11px] font-medium uppercase tracking-wider">Telegram Bots</span>
            <Send size={15} className="text-[#007AFF]" />
          </div>
          <div className="text-xl font-bold text-[#000000]">{stats.telegramConnected} Connected</div>
          <div className="text-[10px] text-[#007AFF] font-medium">Direct &amp; Topic Routing</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-3.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[#8A8A85]">
            <span className="text-[11px] font-medium uppercase tracking-wider">Capabilities</span>
            <Zap size={15} className="text-amber-600" />
          </div>
          <div className="text-xl font-bold text-[#000000]">{stats.totalSkills} Skills</div>
          <div className="text-[10px] text-amber-600 font-medium">Across all departments</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-3.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[#8A8A85]">
            <span className="text-[11px] font-medium uppercase tracking-wider">Delegation</span>
            <Bot size={15} className="text-purple-600" />
          </div>
          <div className="text-xl font-bold text-[#000000]">Full Feature</div>
          <div className="text-[10px] text-purple-600 font-medium">Tools, Skills, Plugins</div>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div className="w-full px-4 sm:px-6 lg:px-9 pt-6 pb-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Department Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {DEPARTMENTS.map((dept) => {
            const isSelected = selectedDepartment === dept;
            return (
              <button
                key={dept}
                onClick={() => setSelectedDepartment(dept)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[6px] transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#0F0F0F] text-[#FFFFFF] shadow-sm'
                    : 'bg-[#FFFFFF] text-[#333333] border border-[#E5E7EB] hover:bg-gray-50'
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
          <input
            type="text"
            placeholder="Search staff, role, or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] placeholder:text-[#8A8A85] outline-none focus:border-[#0F0F0F] transition-colors"
          />
        </div>
      </div>

      {/* Main Staff Workers Grid */}
      <div className="w-full px-4 sm:px-6 lg:px-9 py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredWorkers.map((worker) => {
          const isTgLinked = worker.telegramBot?.status === 'connected';
          const isTopicGroup = worker.telegramBot?.mode === 'topic_group';

          return (
            <div
              key={worker.id}
              className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 flex flex-col justify-between gap-4 shadow-xs hover:border-[#BFDBFE] transition-all group relative"
            >
              {/* Top Row: Grok SVG Avatar, Identity, Status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-[10px] bg-[#F7F7F5] border border-[#E5E7EB] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform p-1">
                    <GrokAvatar id={worker.avatar} size={38} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-[15px] font-bold text-[#000000] font-sans tracking-tight truncate">
                      {worker.role}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-[#8A8A85] font-medium">{worker.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-[4px] font-semibold bg-[#F3F4F6] text-[#4B5563]">
                        {worker.department}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Pill */}
                <div className="shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[10px] font-bold uppercase tracking-wider ${
                      worker.status === 'busy'
                        ? 'bg-[#FEF3C7] text-[#D97706]'
                        : worker.status === 'active'
                        ? 'bg-[#DCFCE7] text-[#16A34A]'
                        : 'bg-[#F3F4F6] text-[#6B7280]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        worker.status === 'busy'
                          ? 'bg-[#D97706] animate-ping'
                          : worker.status === 'active'
                          ? 'bg-[#16A34A]'
                          : 'bg-[#9CA3AF]'
                      }`}
                    />
                    {worker.status}
                  </span>
                </div>
              </div>

              {/* Description & Current Task */}
              <div className="space-y-2">
                <p className="text-xs text-[#4B5563] leading-relaxed line-clamp-2">
                  {worker.description}
                </p>

                {worker.currentTask && (
                  <div className="p-2.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] flex items-start gap-2 text-[11px] text-[#333333]">
                    <Clock size={13} className="text-[#8A8A85] shrink-0 mt-0.5" />
                    <div className="flex-1 truncate">
                      <span className="font-semibold text-[#8A8A85]">Task: </span>
                      <span className="font-mono text-[#000000]">{worker.currentTask}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Model Assignment Pill */}
              <div className="flex items-center justify-between p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-blue-50 text-[#007AFF]">
                    <Cpu size={13} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A85]">
                        Model Persona
                      </span>
                      {worker.model ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-blue-100 text-blue-700">
                          Custom
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-gray-100 text-gray-500">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-semibold text-[#000000] truncate">
                      {worker.model || defaultModel || 'gpt-4o'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenEditModal(worker)}
                  className="shrink-0 px-2 py-1 text-[11px] font-semibold rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#333333] hover:bg-gray-100 cursor-pointer flex items-center gap-1"
                >
                  <Edit3 size={11} />
                  <span>Edit</span>
                </button>
              </div>

              {/* Telegram Connection Pill */}
              <div className="flex items-center justify-between p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      isTgLinked ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <Send size={13} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A85]">
                        Telegram
                      </span>
                      {isTgLinked && (
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            isTopicGroup ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {isTopicGroup ? 'Topic Group' : 'Direct Bot'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-semibold text-[#000000] truncate">
                      {isTgLinked
                        ? isTopicGroup
                          ? `${worker.telegramBot?.username || 'Bot'} #${worker.telegramBot?.topicName || 'Topic'}`
                          : worker.telegramBot?.username
                        : 'Not connected'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenTelegramConnect(worker)}
                  className={`shrink-0 px-2.5 py-1 text-[11px] font-bold rounded-[6px] border transition-all cursor-pointer ${
                    isTgLinked
                      ? 'border-[#BFDBFE] bg-[#EBF5FF] text-[#007AFF] hover:bg-blue-100'
                      : 'border-[#E5E7EB] bg-[#FFFFFF] text-[#333333] hover:bg-gray-100'
                  }`}
                >
                  {isTgLinked ? 'Config Bot' : 'Connect Bot'}
                </button>
              </div>

              {/* Skills Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {worker.skills.slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]"
                  >
                    #{skill}
                  </span>
                ))}
                {worker.skills.length > 4 && (
                  <span className="text-[10px] text-[#8A8A85] font-mono">
                    +{worker.skills.length - 4} more
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleChatWithWorker(worker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-bold rounded-[6px] hover:bg-black/90 transition-all cursor-pointer shadow-xs"
                    title={`Direct chat session with ${worker.role}`}
                  >
                    <MessageSquare size={13} />
                    <span>Chat</span>
                  </button>

                  <button
                    onClick={() => handleOpenDelegate(worker)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#000000] rounded-[6px] hover:bg-gray-50 transition-colors cursor-pointer"
                    title="Delegate specific background task"
                  >
                    <Briefcase size={13} className="text-[#007AFF]" />
                    <span>Delegate</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(worker)}
                    className="p-1.5 text-[#8A8A85] hover:text-[#000000] hover:bg-gray-100 rounded-[4px] transition-colors cursor-pointer"
                    title="Edit staff details"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteWorker(worker)}
                    className="p-1.5 text-[#8A8A85] hover:text-red-600 hover:bg-red-50 rounded-[4px] transition-colors cursor-pointer"
                    title="Dismiss worker"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredWorkers.length === 0 && (
          <div className="col-span-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-12 text-center flex flex-col items-center gap-3">
            <Users2 size={36} className="text-[#8A8A85]" />
            <h3 className="text-base font-bold text-[#000000]">No staff found</h3>
            <p className="text-xs text-[#8A8A85] max-w-md">
              No workers match the selected department "{selectedDepartment}" or query "{searchQuery}".
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-2 px-4 py-2 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] cursor-pointer"
            >
              Hire First Worker in this Department
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Hire / Edit Custom Worker with 10 Grok SVG Avatars   */}
      {/* ------------------------------------------------------------- */}
      {showWorkerModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] sticky top-0 bg-[#FFFFFF] z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[8px] bg-[#F7F7F5] border border-[#E5E7EB] flex items-center justify-center p-1">
                  <GrokAvatar id={formAvatar} size={28} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#000000]">
                    {editingWorkerId ? 'Edit Staff Worker' : 'Hire New Staff Worker'}
                  </h2>
                  <p className="text-[11px] text-[#8A8A85]">
                    Grok-style companion worker persona with Telegram connectivity
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWorkerModal(false)}
                className="p-1.5 text-[#8A8A85] hover:text-[#000000] rounded-md hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveWorker} className="p-6 space-y-4">
              {/* 10 Grok SVG Preset Icons + Shuffle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                    1. Choose Grok-Style Avatar (10 Specialty Presets)
                  </label>
                  <button
                    type="button"
                    onClick={handlePickRandomIcon}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#007AFF] hover:underline cursor-pointer bg-blue-50 px-2 py-0.5 rounded"
                  >
                    <Shuffle size={12} />
                    <span>🎲 Shuffle / Random Icon</span>
                  </button>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-3 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[10px]">
                  {GROK_AVATARS.map((preset) => {
                    const isSelected = formAvatar === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setFormAvatar(preset.id)}
                        className={`h-11 flex flex-col items-center justify-center rounded-[8px] transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#FFFFFF] ring-2 ring-[#007AFF] shadow-md scale-105'
                            : 'bg-white/80 hover:bg-white border border-[#E5E7EB]'
                        }`}
                        title={`${preset.name} — ${preset.role}`}
                      >
                        <GrokAvatar id={preset.id} size={26} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Identity: Role, Name, Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                    Role / Job Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lead Front End Dev"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                    Staff Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jordan Lee"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                  />
                </div>
              </div>

              {/* Department & Telegram Bot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                    Department
                  </label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                  >
                    {DEPARTMENTS.filter((d) => d !== 'All').map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                    Telegram Bot Username (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. @kendali_worker_bot"
                    value={formTelegramBot}
                    onChange={(e) => setFormTelegramBot(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                  />
                </div>
              </div>

              {/* Model Persona Selection */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                    Assigned Model Persona
                  </label>
                  <span className="text-[10px] text-[#8A8A85]">
                    System Default: <span className="font-mono font-bold text-[#000000]">{defaultModel || 'gpt-4o'}</span>
                  </span>
                </div>
                <select
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] font-mono outline-none focus:border-[#0F0F0F]"
                >
                  <option value="">(Inherit System Default: {defaultModel || 'gpt-4o'})</option>
                  {availableModels.map((m) => (
                    <option key={`${m.providerId}-${m.id}`} value={m.id}>
                      {m.name} ({m.providerName || m.providerType}) {m.isDefault ? '★ SYSTEM DEFAULT' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#8A8A85] mt-1">
                  Worker uses this model when chatting in web UI and when answering Telegram bot messages.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  Description &amp; Specialty
                </label>
                <input
                  type="text"
                  placeholder="e.g. In charge of UI design systems, React components, and responsive testing."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                />
              </div>

              {/* Skills Persona */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  Skills Persona (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. react-19, tailwind-css, state-management, responsive-ui"
                  value={formSkillsInput}
                  onChange={(e) => setFormSkillsInput(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs font-mono text-[#000000] outline-none focus:border-[#0F0F0F]"
                />
                <p className="text-[10px] text-[#8A8A85] mt-1">
                  Each worker operates with their own dedicated skillset persona.
                </p>
              </div>

              {/* System Prompt Persona */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  System Prompt / Personality Directive
                </label>
                <textarea
                  rows={3}
                  value={formSystemPrompt}
                  onChange={(e) => setFormSystemPrompt(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] font-mono outline-none focus:border-[#0F0F0F]"
                  placeholder="Directives on how this worker acts, codes, or reviews..."
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWorkerModal(false)}
                  className="px-4 py-2 border border-[#E5E7EB] text-xs font-semibold rounded-[6px] hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] hover:bg-black/90 shadow-sm cursor-pointer"
                >
                  {editingWorkerId ? 'Update Worker' : 'Hire Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Connect Telegram Bot (Registered Bot vs Topic Group)  */}
      {/* ------------------------------------------------------------- */}
      {showTelegramModal && selectedWorkerForTg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                  <Send size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#000000]">Connect Telegram Gateway</h2>
                  <p className="text-[11px] text-[#8A8A85]">
                    Pair bot or topic group to {selectedWorkerForTg.role}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTelegramModal(false)}
                className="p-1.5 text-[#8A8A85] hover:text-[#000000] rounded-md hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#E5E7EB] px-6 bg-[#FAFAFA]">
              <button
                type="button"
                onClick={() => setTgPairTab('registered')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  tgPairTab === 'registered'
                    ? 'border-[#007AFF] text-[#007AFF]'
                    : 'border-transparent text-[#8A8A85] hover:text-[#000000]'
                }`}
              >
                Registered Bots
              </button>
              <button
                type="button"
                onClick={() => setTgPairTab('topic')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  tgPairTab === 'topic'
                    ? 'border-[#007AFF] text-[#007AFF]'
                    : 'border-transparent text-[#8A8A85] hover:text-[#000000]'
                }`}
              >
                Forum Supergroup Topic
              </button>
              <button
                type="button"
                onClick={() => setTgPairTab('new_bot')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  tgPairTab === 'new_bot'
                    ? 'border-[#007AFF] text-[#007AFF]'
                    : 'border-transparent text-[#8A8A85] hover:text-[#000000]'
                }`}
              >
                + Register New Bot
              </button>
            </div>

            <form onSubmit={handleSaveTelegramBot} className="p-6 space-y-4 overflow-y-auto">
              {/* TAB 1: PICK FROM REGISTERED BOTS */}
              {tgPairTab === 'registered' && (
                <div className="space-y-3">
                  <div className="p-3 bg-[#EBF5FF] border border-[#BFDBFE] rounded-[8px] text-xs text-[#007AFF] leading-relaxed">
                    Select a bot from your registered bot list. Messages sent to this bot on Telegram will be routed directly to <strong>{selectedWorkerForTg.name} ({selectedWorkerForTg.role})</strong>.
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                      Choose Connected Bot:
                    </label>
                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                      {telegramBots.map((b) => {
                        const isSelected = selectedBotId === b.id;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBotId(b.id)}
                            className={`p-3 rounded-[8px] border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'border-[#007AFF] bg-blue-50/50 ring-1 ring-[#007AFF]'
                                : 'border-[#E5E7EB] bg-white hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-[#007AFF] flex items-center justify-center shrink-0">
                                <Send size={14} />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-[#000000] truncate">
                                  {b.name}
                                </span>
                                <div className="flex items-center gap-1.5 text-[10px] text-[#8A8A85]">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      b.status === 'running' ? 'bg-[#16A34A]' : 'bg-[#9CA3AF]'
                                    }`}
                                  />
                                  <span>{b.status === 'running' ? 'Running' : 'Stopped'}</span>
                                  <span>·</span>
                                  <span className="capitalize">{b.mode || 'direct'}</span>
                                </div>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-[#007AFF] text-white flex items-center justify-center shrink-0">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FORUM SUPERGROUP TOPIC ROUTING */}
              {tgPairTab === 'topic' && (
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-[8px] text-xs text-purple-900 leading-relaxed">
                    <strong>How Topic Groups work:</strong> In a Telegram Supergroup with Forum Topics turned on, you can have one master bot handle your whole team. Messages posted inside this specific Topic will be dispatched to <strong>{selectedWorkerForTg.role}</strong>.
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                      Parent Telegram Bot *
                    </label>
                    <select
                      value={tgTopicParentBotId}
                      onChange={(e) => setTgTopicParentBotId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                    >
                      {telegramBots.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                        Topic Name *
                      </label>
                      <div className="relative mt-1">
                        <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. Frontend-Dev"
                          value={tgTopicName}
                          onChange={(e) => setTgTopicName(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                        Thread ID (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 108"
                        value={tgTopicId}
                        onChange={(e) => setTgTopicId(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs font-mono text-[#000000] outline-none focus:border-[#0F0F0F]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                      Group Chat ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. -100192837465"
                      value={tgChatId}
                      onChange={(e) => setTgChatId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs font-mono text-[#000000] outline-none focus:border-[#0F0F0F]"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: REGISTER NEW BOT */}
              {tgPairTab === 'new_bot' && (
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-[8px] text-xs text-gray-700 leading-relaxed">
                    Create a new bot via <strong>@BotFather</strong> on Telegram and paste its API token below.
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                      Bot Username *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. @kendali_worker_bot"
                      value={tgBotName}
                      onChange={(e) => setTgBotName(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                      Bot Token (from @BotFather) *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={tgBotToken}
                      onChange={(e) => setTgBotToken(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs font-mono text-[#000000] outline-none focus:border-[#0F0F0F]"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between gap-2">
                {selectedWorkerForTg.telegramBot?.status === 'connected' ? (
                  <button
                    type="button"
                    onClick={handleUnlinkBot}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-[6px] transition-colors cursor-pointer"
                  >
                    <Unlink size={13} />
                    <span>Unlink Bot</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTelegramModal(false)}
                    className="px-4 py-2 border border-[#E5E7EB] text-xs font-semibold rounded-[6px] hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLinkingTg}
                    className="flex items-center gap-1.5 px-5 py-2 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] hover:bg-black/90 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <RefreshCw size={12} className={isLinkingTg ? 'animate-spin' : ''} />
                    <span>{isLinkingTg ? 'Pairing...' : 'Save & Link Bot'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Delegate Task to Worker                              */}
      {/* ------------------------------------------------------------- */}
      {showDelegateModal && selectedWorkerForDelegate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <Briefcase size={18} className="text-[#007AFF]" />
                <div>
                  <h2 className="text-base font-bold text-[#000000]">Delegate Task</h2>
                  <p className="text-[11px] text-[#8A8A85]">
                    Assign mission to {selectedWorkerForDelegate.role}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDelegateModal(false)}
                className="p-1.5 text-[#8A8A85] hover:text-[#000000] rounded-md hover:bg-gray-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDispatchTask} className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[8px]">
                <div className="w-10 h-10 rounded-[8px] bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0 p-1">
                  <GrokAvatar id={selectedWorkerForDelegate.avatar} size={30} />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#000000]">
                    {selectedWorkerForDelegate.name} ({selectedWorkerForDelegate.role})
                  </div>
                  <div className="text-[11px] text-[#8A8A85]">
                    Equipped with {selectedWorkerForDelegate.skills.length} skills &amp; {selectedWorkerForDelegate.tools.length} capability tools
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  Task Directive / Deliverable *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={`Describe what you want ${selectedWorkerForDelegate.role} to accomplish (e.g. Audit all licenses in dependencies, or Implement a responsive sticky navigation in React)...`}
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                />
              </div>

              {delegationNotice && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-[6px] flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[#16A34A]" />
                  <span>{delegationNotice}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDelegateModal(false)}
                  className="px-4 py-2 border border-[#E5E7EB] text-xs font-semibold rounded-[6px] hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] hover:bg-black/90 shadow-sm cursor-pointer"
                >
                  <Zap size={13} className="text-amber-400" />
                  <span>Dispatch Task</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
