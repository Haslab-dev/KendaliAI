import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Send,
  RefreshCw,
  Repeat,
  ChevronRight,
  Shield,
  Key,
  Bot,
  Settings,
  X,
  AlertCircle,
  Radio,
  CheckCircle2,
  Plus,
  Play,
  Square,
  Trash2,
  MessageSquare,
  HelpCircle,
  ExternalLink,
  Users2,
  Layers,
  Lock,
  Unlock,
  Copy,
  Check,
  Clock,
  UserCheck,
  UserX,
  Ticket,
  Search,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { TelegramBotConfig, TelegramAuthorizedUser, TelegramPendingRequest } from '../types';
import { GrokAvatar } from '../components/GrokAvatar';

interface TelegramMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  tag: string;
  timestamp: string;
}

interface SyncedSession {
  id: string;
  title: string;
  topic: string;
  syncedTime: string;
  botId?: string;
  messages: TelegramMessage[];
}

const DEFAULT_SYNCED_SESSIONS: SyncedSession[] = [
  {
    id: 's-landing',
    title: 'Landing page build',
    topic: 'Frontend Dev',
    syncedTime: '2m ago',
    botId: 'tg-frontend',
    messages: [
      {
        id: 'm1',
        sender: 'user',
        text: "What's the build status of the frontend?",
        tag: 'You · Telegram',
        timestamp: '2:40 PM',
      },
      {
        id: 'm2',
        sender: 'bot',
        text: 'Landing page deployed from worktree feature/landing-page — 12 commits, all checks green ✓',
        tag: '@kendali_frontend_bot',
        timestamp: '2:40 PM',
      },
    ],
  },
  {
    id: 's-legal',
    title: 'License & Compliance Audit',
    topic: 'Legal',
    syncedTime: '15m ago',
    botId: 'tg-legal',
    messages: [
      {
        id: 'm5',
        sender: 'user',
        text: 'Can we use the AGPL-3.0 library for backend embeddings?',
        tag: 'You · Telegram',
        timestamp: '1:15 PM',
      },
      {
        id: 'm6',
        sender: 'bot',
        text: 'Advising caution: AGPL-3.0 requires network-triggered source disclosure. Recommend Apache-2.0 or MIT alternatives like pgvector.',
        tag: '@kendali_legal_bot',
        timestamp: '1:16 PM',
      },
    ],
  },
];

interface BusEvent {
  id: string;
  event: string;
  time: string;
}

const INITIAL_EVENTS: BusEvent[] = [
  { id: '1', event: 'telegram.message ← @lutfiikbal "run scan"', time: '14:41:02' },
  { id: '2', event: 'agent.turn.start → coding-agent', time: '14:41:02' },
  { id: '3', event: 'telegram.message → @kendali_bot "100/100 Lighthouse score"', time: '14:42:15' },
];

export const TelegramPane: React.FC = () => {
  const { agents } = useAppStore();

  const [activeMainTab, setActiveMainTab] = useState<'bots' | 'access'>('bots');
  const [bots, setBots] = useState<TelegramBotConfig[]>([]);
  const [isLoadingBots, setIsLoadingBots] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synced sessions and events state for live preview
  const [sessions, setSessions] = useState<SyncedSession[]>(DEFAULT_SYNCED_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>(DEFAULT_SYNCED_SESSIONS[0].id);
  const [inputText, setInputText] = useState('');
  const [events, setEvents] = useState<BusEvent[]>(INITIAL_EVENTS);

  // Modal: Register Bot
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [formBotName, setFormBotName] = useState('');
  const [formBotToken, setFormBotToken] = useState('');
  const [formAgentId, setFormAgentId] = useState('lead-frontend');
  const [formMode, setFormMode] = useState<'direct' | 'topic_group'>('direct');
  const [formTopicName, setFormTopicName] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // -------------------------------------------------------------
  // ACCESS CONTROL & PAIRING STATE
  // -------------------------------------------------------------
  const [authRequired, setAuthRequired] = useState(true);
  const [authorizedUsers, setAuthorizedUsers] = useState<TelegramAuthorizedUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TelegramPendingRequest[]>([]);
  const [activePairingCode, setActivePairingCode] = useState<string | null>(null);
  const [codeCountdown, setCodeCountdown] = useState<number>(0);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Manual Add Modal
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [manualName, setManualName] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Load Bots
  const loadBots = useCallback(async () => {
    setIsLoadingBots(true);
    try {
      const res = await fetch('/api/telegram/bots');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setBots(data);
        }
      }
    } catch (err) {
      console.warn('Failed to load telegram bots:', err);
    } finally {
      setIsLoadingBots(false);
    }
  }, []);

  // 2. Load Auth Data
  const loadAuthData = useCallback(async () => {
    try {
      // Status
      const stRes = await fetch('/api/telegram/auth/status');
      if (stRes.ok) {
        const st = await stRes.json();
        setAuthRequired(st.authRequired !== false);
      }

      // Authorized Users
      const uRes = await fetch('/api/telegram/auth/users');
      if (uRes.ok) {
        const uList = await uRes.json();
        if (Array.isArray(uList)) setAuthorizedUsers(uList);
      }

      // Pending Requests
      const pRes = await fetch('/api/telegram/auth/pending');
      if (pRes.ok) {
        const pList = await pRes.json();
        if (Array.isArray(pList)) setPendingRequests(pList);
      }
    } catch (err) {
      console.warn('Failed to load auth data:', err);
    }
  }, []);

  useEffect(() => {
    loadBots();
    loadAuthData();
  }, [loadBots, loadAuthData]);

  // Periodic polling for pending requests when on access tab
  useEffect(() => {
    if (activeMainTab !== 'access') return;
    const interval = setInterval(loadAuthData, 5000);
    return () => clearInterval(interval);
  }, [activeMainTab, loadAuthData]);

  // Countdown timer for pairing code
  useEffect(() => {
    if (codeCountdown <= 0) {
      setActivePairingCode(null);
      return;
    }
    const timer = setInterval(() => {
      setCodeCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [codeCountdown]);

  // Toggle Auth Required
  const handleToggleAuthRequired = async () => {
    try {
      const next = !authRequired;
      setAuthRequired(next);
      await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authRequired: next }),
      });
      triggerToast(next ? '🔒 Telegram Authorization Enabled (Restricted Mode)' : '🔓 Telegram Authorization Disabled (Public Mode)');
      loadAuthData();
    } catch (err) {
      console.warn('Toggle auth failed:', err);
    }
  };

  // Generate 6-digit OTP Pairing Code
  const handleGeneratePairingCode = async () => {
    setIsGeneratingCode(true);
    try {
      const res = await fetch('/api/telegram/auth/code', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActivePairingCode(data.code);
        setCodeCountdown(data.expiresIn || 600);
        triggerToast(`Pairing code ${data.code} generated! Valid for 10 minutes.`);
      }
    } catch (err) {
      triggerToast('Failed to generate pairing code');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (!activePairingCode) return;
    navigator.clipboard.writeText(`/auth ${activePairingCode}`);
    setCopiedCode(true);
    triggerToast('Copied `/auth ' + activePairingCode + '` to clipboard');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Approve Pending Request
  const handleApproveRequest = async (req: TelegramPendingRequest) => {
    try {
      const res = await fetch('/api/telegram/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: req.userId }),
      });
      if (res.ok) {
        triggerToast(`✓ Approved ${req.firstName || req.username || req.userId}! Telegram confirmation sent.`);
        loadAuthData();
      }
    } catch (err) {
      triggerToast('Failed to approve request');
    }
  };

  // Deny Pending Request
  const handleDenyRequest = async (userId: number) => {
    try {
      const res = await fetch('/api/telegram/auth/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        triggerToast('Request dismissed');
        loadAuthData();
      }
    } catch (err) {
      triggerToast('Failed to deny request');
    }
  };

  // Revoke User Access
  const handleRevokeUser = async (u: TelegramAuthorizedUser) => {
    if (!confirm(`Revoke access for @${u.username || u.userId}? They will no longer be able to message the bot.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/telegram/auth/users?id=${u.userId}`, { method: 'DELETE' });
      if (res.ok) {
        triggerToast(`Revoked access for user ${u.username || u.userId}`);
        loadAuthData();
      }
    } catch (err) {
      triggerToast('Failed to revoke user');
    }
  };

  // Manual Add User
  const handleSaveManualUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = parseInt(manualUserId.trim(), 10);
    if (!uid && !manualUsername.trim()) {
      alert('Please provide either a Telegram numerical User ID or a Username.');
      return;
    }

    try {
      const res = await fetch('/api/telegram/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid || Date.now(),
          username: manualUsername.trim().replace(/^@/, ''),
          firstName: manualName.trim() || 'Manual User',
          authMethod: 'manual',
        }),
      });
      if (res.ok) {
        triggerToast('User added to authorized whitelist');
        setShowManualAddModal(false);
        setManualUserId('');
        setManualUsername('');
        setManualName('');
        loadAuthData();
      }
    } catch (err) {
      triggerToast('Failed to manually add user');
    }
  };

  // Toggle Bot Start/Stop
  const handleToggleBot = async (bot: TelegramBotConfig) => {
    const action = bot.status === 'running' ? 'stop' : 'start';
    const nextStatus = action === 'start' ? 'running' : 'stopped';

    setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, status: nextStatus } : b)));

    try {
      await fetch(`/api/telegram/bots/${bot.id}/${action}`, { method: 'POST' });
      triggerToast(`Bot ${bot.name} ${action}ed successfully`);
    } catch (err) {
      console.warn('Bot toggle fallback:', err);
    }
  };

  // Delete Bot
  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Are you sure you want to remove this Telegram bot?')) return;
    setBots((prev) => prev.filter((b) => b.id !== botId));
    try {
      await fetch(`/api/telegram/bots?id=${botId}`, { method: 'DELETE' });
      triggerToast('Bot removed');
    } catch (err) {
      console.warn('Delete bot fallback:', err);
    }
  };

  // Save new bot configuration
  const handleSaveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBotName.trim() || !formBotToken.trim()) return;

    setIsSubmitting(true);
    const newBot: TelegramBotConfig = {
      id: `tg-${formAgentId}-${Date.now().toString().slice(-4)}`,
      name: formBotName.trim(),
      token: formBotToken.trim(),
      agentId: formAgentId,
      enabled: true,
      status: 'running',
      mode: formMode,
      topicName: formTopicName.trim() || undefined,
      chatId: formChatId.trim() || undefined,
    };

    setBots((prev) => [newBot, ...prev]);
    setShowAddBotModal(false);
    setFormBotName('');
    setFormBotToken('');
    setFormTopicName('');
    setFormChatId('');

    try {
      await fetch('/api/telegram/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBot),
      });
      triggerToast(`New bot registered: ${newBot.name}`);
    } catch (err) {
      console.warn('Bot registered locally fallback:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Send simulated Telegram message
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: TelegramMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: inputText.trim(),
      tag: 'You · Telegram',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === activeSession.id ? { ...s, messages: [...s.messages, userMsg] } : s))
    );

    const newEvent: BusEvent = {
      id: `ev-${Date.now()}`,
      event: `telegram.message ← @you "${inputText.slice(0, 20)}..."`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setEvents((prev) => [newEvent, ...prev.slice(0, 5)]);

    const sentText = inputText;
    setInputText('');

    setTimeout(() => {
      const botMsg: TelegramMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'bot',
        text: `Echo: Dispatched turn for "${sentText}". Processing with specialized persona tools.`,
        tag: '@kendali_bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setSessions((prev) =>
        prev.map((s) => (s.id === activeSession.id ? { ...s, messages: [...s.messages, botMsg] } : s))
      );
    }, 900);
  };

  // Filtered Authorized Users
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return authorizedUsers;
    const q = userSearch.toLowerCase();
    return authorizedUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        String(u.userId).includes(q)
    );
  }, [authorizedUsers, userSearch]);

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] dark:bg-[#121212] flex flex-col font-sans select-none text-[#000000] dark:text-white transition-colors">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-semibold rounded-[8px] shadow-lg border border-white/10 animate-fade-in">
          <CheckCircle2 size={14} className="text-[#16A34A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="w-full bg-[#FFFFFF] dark:bg-[#18181A] border-b border-[#E5E7EB] dark:border-[#27272A] px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex flex-col gap-[2px]">
          <div className="flex items-center gap-2">
            <Send size={20} className="text-[#007AFF]" />
            <h1 className="text-[18px] sm:text-[20px] font-bold text-[#000000] dark:text-white font-sans tracking-tight">
              Telegram Gateway &amp; Security
            </h1>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                authRequired
                  ? 'bg-blue-100 dark:bg-blue-950/40 text-[#007AFF]'
                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-600'
              }`}
            >
              {authRequired ? '🔒 Restricted Auth' : '🔓 Public Mode'}
            </span>
          </div>
          <p className="text-[12px] text-[#8A8A85]">
            Multi-bot routing, forum topic supergroups, OTP pairing codes &amp; user authorization whitelist
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-center">
          <button
            onClick={() => {
              loadBots();
              loadAuthData();
            }}
            title="Refresh bots & auth status"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 text-xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={isLoadingBots ? 'animate-spin text-[#007AFF]' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setShowAddBotModal(true)}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-[#007AFF] hover:bg-[#0066D6] text-[#FFFFFF] text-xs font-bold rounded-[8px] transition-all shadow-sm cursor-pointer active:scale-95"
          >
            <Plus size={14} />
            <span>Add Telegram Bot</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="w-full bg-[#FFFFFF] dark:bg-[#18181A] border-b border-[#E5E7EB] dark:border-[#27272A] px-4 sm:px-8 flex items-center gap-6 text-xs font-bold font-sans overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveMainTab('bots')}
          className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-2 shrink-0 ${
            activeMainTab === 'bots'
              ? 'border-[#007AFF] text-[#007AFF]'
              : 'border-transparent text-[#8A8A85] hover:text-[#000000] dark:hover:text-white'
          }`}
        >
          <Bot size={15} />
          <span>Connected Bots ({bots.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('access')}
          className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-2 relative shrink-0 ${
            activeMainTab === 'access'
              ? 'border-[#007AFF] text-[#007AFF]'
              : 'border-transparent text-[#8A8A85] hover:text-[#000000] dark:hover:text-white'
          }`}
        >
          <Shield size={15} />
          <span>Access Control &amp; Pairing (OTP)</span>
          {pendingRequests.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-red-500 text-white font-bold animate-pulse">
              {pendingRequests.length} Pending
            </span>
          )}
          {authorizedUsers.length > 0 && (
            <span className="text-[10px] text-[#8A8A85]">
              ({authorizedUsers.length} users)
            </span>
          )}
        </button>
      </div>

      {/* ============================================================= */}
      {/* TAB 1: CONNECTED BOTS & ARCHITECTURE                          */}
      {/* ============================================================= */}
      {activeMainTab === 'bots' && (
        <div className="flex-1 w-full px-4 sm:px-8 py-5 sm:py-6 flex flex-col lg:flex-row gap-5 items-start">
          {/* Left Column: Registered Bots */}
          <div className="flex-1 w-full flex flex-col gap-4">
            <div className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-4 sm:p-5 shadow-2xs flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-[#007AFF]" />
                  <h2 className="text-sm font-bold text-[#000000] dark:text-white">
                    Registered Telegram Bots ({bots.length})
                  </h2>
                </div>
                <span className="text-[11px] text-[#8A8A85]">
                  Each staff agent pairs with a dedicated bot token or supergroup topic
                </span>
              </div>

              {/* Bots Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {bots.map((bot) => {
                  const isRunning = bot.status === 'running';

                  return (
                    <div
                      key={bot.id}
                      className="p-3.5 bg-[#F9FAFB] dark:bg-[#161618] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px] flex flex-col justify-between gap-3 hover:border-[#007AFF]/40 transition-colors shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <GrokAvatar id={bot.agentId} size={30} className="shrink-0 mt-0.5" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-[#000000] dark:text-white font-sans">
                              {bot.name}
                            </span>
                            <span className="text-[10px] text-[#8A8A85]">
                              Worker:{' '}
                              <strong className="text-[#000000] dark:text-white font-medium">
                                {bot.agentId}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isRunning
                              ? 'bg-[#DCFCE7] dark:bg-emerald-950/40 text-[#16A34A]'
                              : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isRunning ? 'bg-[#16A34A] animate-pulse' : 'bg-gray-400'
                            }`}
                          />
                          {bot.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85]">
                          {bot.mode === 'topic_group' ? '🔵 Forum Topics' : '🟢 Dedicated Bot'}
                        </span>
                        {bot.topicName && (
                          <span className="text-[10px] text-[#007AFF] font-medium">
                            Topic: #{bot.topicName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB] dark:border-[#2C2C2E]">
                        <button
                          onClick={() => handleToggleBot(bot)}
                          className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                            isRunning
                              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200'
                              : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200'
                          }`}
                        >
                          {isRunning ? <Square size={10} /> : <Play size={10} />}
                          <span>{isRunning ? 'Stop Bot' : 'Start Bot'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteBot(bot.id)}
                          className="p-1 text-[#8A8A85] hover:text-red-500 rounded transition-colors cursor-pointer"
                          title="Remove Bot"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Architecture Explainer */}
            <div className="w-full bg-[#EBF5FF] dark:bg-blue-950/20 border border-[#BFDBFE] dark:border-blue-900/40 rounded-[10px] p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-[#007AFF]" />
                <h3 className="text-sm font-bold text-[#000000] dark:text-white">
                  Multi-Bot vs Forum Supergroup Topics
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                <div className="p-3 bg-white/80 dark:bg-[#1C1C1E] rounded-[8px] border border-blue-200 dark:border-blue-900/30 space-y-1">
                  <div className="font-bold text-[#000000] dark:text-white flex items-center gap-1">
                    <span>🟢 Dedicated 1:1 Bots</span>
                  </div>
                  <p className="text-[11px] text-[#4B5563] dark:text-gray-300">
                    Create separate bots in @BotFather (e.g. <code>@kendali_frontend_bot</code>). Each staff worker binds to their dedicated bot token. You chat with that bot directly in Telegram.
                  </p>
                </div>

                <div className="p-3 bg-white/80 dark:bg-[#1C1C1E] rounded-[8px] border border-blue-200 dark:border-blue-900/30 space-y-1">
                  <div className="font-bold text-[#000000] dark:text-white flex items-center gap-1">
                    <span>🔵 Forum Topic Supergroups</span>
                  </div>
                  <p className="text-[11px] text-[#4B5563] dark:text-gray-300">
                    Add 1 bot to a Telegram Supergroup with <strong>Topics</strong> enabled. Create topics like <code>#Frontend</code> or <code>#Legal</code>. KendaliAI routes messages from topic threads to the right agent automatically!
                  </p>
                </div>
              </div>
            </div>

            {/* Event Stream Card */}
            <div className="w-full bg-[#0F0F0F] rounded-[10px] p-4 flex flex-col gap-2.5 text-white shadow-sm">
              <div className="text-[10px] font-bold text-[#A3A3A0] tracking-wider uppercase font-sans">
                LIVE TELEGRAM EVENT STREAM
              </div>
              <div className="flex flex-col gap-2 w-full pt-1">
                {events.map((ev) => (
                  <div key={ev.id} className="w-full flex items-center gap-2 text-[10px] font-mono">
                    <div className="w-[5px] h-[5px] rounded-full bg-[#16A34A] shrink-0" />
                    <span className="text-[#A3A3A0] flex-1 truncate">
                      {ev.event} · {ev.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Chat Preview Simulator */}
          <div className="w-full lg:w-[350px] shrink-0 bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] shadow-sm flex flex-col overflow-hidden">
            <div className="w-full bg-[#0F0F0F] p-[12px_16px] flex items-center justify-between text-[#FFFFFF]">
              <div className="flex items-center gap-2.5">
                <Send size={15} className="text-[#007AFF]" />
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold font-sans">
                    {activeSession.topic || 'Telegram Sync'}
                  </span>
                  <span className="text-[10px] text-[#16A34A]">
                    online · {activeSession.botId || '@kendali_bot'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-[360px] max-h-[420px] overflow-y-auto p-4 flex flex-col gap-3.5 bg-[#F7F7F5] dark:bg-[#141414] custom-scrollbar">
              {activeSession.messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1 max-w-[85%] ${
                      isUser ? 'self-end' : 'self-start'
                    }`}
                  >
                    <div
                      className={`p-[10px_14px] rounded-[12px] text-[12px] leading-relaxed ${
                        isUser
                          ? 'bg-[#007AFF] text-white rounded-br-[2px]'
                          : 'bg-[#FFFFFF] dark:bg-[#1C1C1E] text-[#000000] dark:text-white border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-bl-[2px] shadow-2xs'
                      }`}
                    >
                      {m.text}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A85] px-1 font-mono">
                      <span>{m.tag}</span>
                      <span>·</span>
                      <span>{m.timestamp}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-[#FFFFFF] dark:bg-[#1C1C1E] border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center gap-2">
              <input
                type="text"
                placeholder="Simulate Telegram message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
              />
              <button
                type="submit"
                className="p-2 bg-[#007AFF] text-white rounded-[6px] hover:bg-[#0066D6] transition-colors cursor-pointer"
              >
                <Send size={13} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: ACCESS CONTROL & PAIRING (OTP)                         */}
      {/* ============================================================= */}
      {activeMainTab === 'access' && (
        <div className="flex-1 w-full px-4 sm:px-8 py-5 sm:py-6 flex flex-col gap-6">
          {/* Security Policy Card */}
          <div className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${
                  authRequired
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-[#007AFF]'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600'
                }`}
              >
                {authRequired ? <Lock size={20} /> : <Unlock size={20} />}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-bold text-[#000000] dark:text-white font-sans">
                    Telegram Bot Access Control
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      authRequired
                        ? 'bg-blue-100 dark:bg-blue-950/60 text-[#007AFF]'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                    }`}
                  >
                    {authRequired ? 'Restricted Mode' : 'Public Open Mode'}
                  </span>
                </div>
                <p className="text-[12px] text-[#8A8A85] mt-0.5">
                  {authRequired
                    ? 'Only authorized Telegram users can chat or trigger tool calls. Unknown users are blocked and must pair via OTP or admin approval.'
                    : 'Warning: Public mode is enabled. Anyone discovering your bot username can send messages and trigger agent turns.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleToggleAuthRequired}
                className={`px-4 py-2 rounded-[8px] font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95 ${
                  authRequired
                    ? 'bg-gray-100 dark:bg-[#2C2C2E] text-[#000000] dark:text-white hover:bg-gray-200'
                    : 'bg-[#007AFF] hover:bg-[#0066D6] text-white'
                }`}
              >
                {authRequired ? 'Disable Auth (Public)' : 'Enable Auth (Restricted)'}
              </button>
            </div>
          </div>

          {/* OTP Pairing Code Generator Box */}
          <div className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#172033] dark:to-[#161a29] border border-blue-200 dark:border-blue-900/60 rounded-[12px] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm">
            <div className="flex items-start gap-3.5 max-w-xl">
              <div className="w-11 h-11 rounded-[10px] bg-[#007AFF] text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <Ticket size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-[15px] font-bold text-[#000000] dark:text-white">
                  Telegram OTP Pairing Code
                </h4>
                <p className="text-[12px] text-[#4B5563] dark:text-gray-300 leading-relaxed">
                  Generate a temporary 6-digit numeric OTP code. Send this code to your Telegram bot using{' '}
                  <code className="bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300 font-mono text-[11px] font-bold">
                    /auth &lt;code&gt;
                  </code>{' '}
                  to instantly pair your account forever.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
              {activePairingCode ? (
                <div className="flex flex-col items-center sm:items-end gap-1.5 w-full sm:w-auto">
                  <div className="flex items-center gap-2 bg-white dark:bg-[#1C1C1E] border-2 border-[#007AFF] px-4 py-2 rounded-[10px] shadow-sm">
                    <span className="font-mono text-2xl font-black tracking-widest text-[#007AFF]">
                      {activePairingCode.slice(0, 3)} {activePairingCode.slice(3)}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md text-[#8A8A85] hover:text-[#007AFF] transition-colors cursor-pointer"
                      title="Copy command"
                    >
                      {copiedCode ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8A8A85] font-sans">
                    <Clock size={12} className="text-[#007AFF]" />
                    <span>
                      Expires in{' '}
                      <strong className="text-[#000000] dark:text-white font-mono">
                        {Math.floor(codeCountdown / 60)}m {codeCountdown % 60}s
                      </strong>
                    </span>
                  </div>
                </div>
              ) : null}

              <button
                onClick={handleGeneratePairingCode}
                disabled={isGeneratingCode}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[8px] transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={13} className={isGeneratingCode ? 'animate-spin' : ''} />
                <span>{activePairingCode ? 'Regenerate Code' : 'Generate Pairing Code'}</span>
              </button>
            </div>
          </div>

          {/* Pending Access Requests (Approval Queue) */}
          <div className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <Users2 size={16} className="text-[#007AFF]" />
                <h4 className="text-sm font-bold text-[#000000] dark:text-white">
                  Pending Authorization Requests ({pendingRequests.length})
                </h4>
                {pendingRequests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/40 text-red-600">
                    Needs Approval
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#8A8A85]">
                Unauthorized users messaging your bot appear here for 1-click approval
              </span>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#8A8A85] flex flex-col items-center justify-center gap-1.5">
                <UserCheck size={24} className="text-emerald-500 opacity-60" />
                <span>No pending requests. All recent users have been processed.</span>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {pendingRequests.map((req) => (
                  <div
                    key={req.userId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#007AFF] font-bold flex items-center justify-center shrink-0 text-xs">
                        {(req.firstName || req.username || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#000000] dark:text-white">
                            {req.firstName} {req.lastName}
                          </span>
                          {req.username && (
                            <span className="text-xs text-[#007AFF] font-mono">
                              @{req.username}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#8A8A85] bg-gray-100 dark:bg-[#2C2C2E] px-1.5 py-0.2 rounded">
                            ID: {req.userId}
                          </span>
                        </div>
                        {req.lastMessage && (
                          <span className="text-[11px] text-[#8A8A85] truncate mt-0.5 italic">
                            "{req.lastMessage}"
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleApproveRequest(req)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[6px] text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
                      >
                        <Check size={13} />
                        <span>Approve Access</span>
                      </button>
                      <button
                        onClick={() => handleDenyRequest(req.userId)}
                        className="px-3 py-1.5 text-xs text-[#8A8A85] hover:text-red-500 rounded-[6px] transition-colors cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Authorized Users Whitelist */}
          <div className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <UserCheck size={16} className="text-[#007AFF]" />
                <h4 className="text-sm font-bold text-[#000000] dark:text-white">
                  Authorized Whitelist ({authorizedUsers.length})
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-7 pr-2.5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  />
                </div>
                <button
                  onClick={() => setShowManualAddModal(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-[#0F0F0F] dark:bg-white text-white dark:text-black rounded-[6px] text-xs font-bold cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Add User</span>
                </button>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8A8A85]">
                {authorizedUsers.length === 0
                  ? 'No authorized users yet. Generate a pairing code above to authorize your first Telegram account.'
                  : 'No users matching your filter.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredUsers.map((u) => (
                  <div
                    key={u.userId}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-xs">
                        {(u.firstName || u.username || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#000000] dark:text-white truncate">
                            {u.firstName} {u.lastName}
                          </span>
                          {u.username && (
                            <span className="text-xs text-[#007AFF] font-mono">
                              @{u.username}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#8A8A85] bg-gray-100 dark:bg-[#2C2C2E] px-1.5 py-0.2 rounded">
                            {u.userId}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase ${
                              u.authMethod === 'otp'
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-[#007AFF]'
                                : u.authMethod === 'admin_approval'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {u.authMethod === 'otp'
                              ? 'OTP Verified'
                              : u.authMethod === 'admin_approval'
                              ? 'Admin Approved'
                              : 'Manual'}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#8A8A85]">
                          Authorized{' '}
                          {u.createdAt ? new Date(u.createdAt * 1000).toLocaleDateString() : 'Active'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevokeUser(u)}
                      className="p-1.5 text-[#8A8A85] hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer shrink-0"
                      title="Revoke access"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Register New Telegram Bot (Multi-Bot Setup)             */}
      {/* ------------------------------------------------------------- */}
      {showAddBotModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[12px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-[#007AFF]" />
                <div>
                  <h2 className="text-base font-bold text-[#000000] dark:text-white">
                    Add Telegram Bot Setup
                  </h2>
                  <p className="text-[11px] text-[#8A8A85]">
                    Configure multi-bot pairing or Forum Supergroup topics
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddBotModal(false)}
                className="p-1.5 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBot} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Bot Name &amp; Handle *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Dev Bot (@kendali_frontend_bot)"
                  value={formBotName}
                  onChange={(e) => setFormBotName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Bot Token (from @BotFather) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  value={formBotToken}
                  onChange={(e) => setFormBotToken(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Assigned Staff Worker / Persona *
                </label>
                <select
                  value={formAgentId}
                  onChange={(e) => setFormAgentId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                >
                  <option value="lead-frontend">Lead Frontend Dev (Senior Dev)</option>
                  <option value="lead-backend">Lead Backend Dev</option>
                  <option value="lead-architecture">Lead Architecture</option>
                  <option value="legal-counsel">Legal Counsel &amp; Compliance</option>
                  <option value="devops-lead">DevOps &amp; Infrastructure Lead</option>
                  <option value="chief-security">Chief Security &amp; QA Officer</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Connection Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormMode('direct')}
                    className={`p-2.5 rounded-[6px] border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                      formMode === 'direct'
                        ? 'border-[#007AFF] bg-[#007AFF] text-white font-bold'
                        : 'border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] text-[#333333] dark:text-gray-300'
                    }`}
                  >
                    <span className="text-xs">🟢 Dedicated 1:1 Bot</span>
                    <span className="text-[10px] opacity-80">
                      Direct private chat with agent
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormMode('topic_group')}
                    className={`p-2.5 rounded-[6px] border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                      formMode === 'topic_group'
                        ? 'border-[#007AFF] bg-[#007AFF] text-white font-bold'
                        : 'border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] text-[#333333] dark:text-gray-300'
                    }`}
                  >
                    <span className="text-xs">🔵 Forum Supergroup Topic</span>
                    <span className="text-[10px] opacity-80">
                      Routes messages from Group Topics
                    </span>
                  </button>
                </div>
              </div>

              {formMode === 'topic_group' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-[8px]">
                  <div>
                    <label className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                      Topic Name / Slug
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Frontend Dev"
                      value={formTopicName}
                      onChange={(e) => setFormTopicName(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-[#1C1C1E] border border-blue-200 dark:border-blue-900 rounded text-xs text-[#000000] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                      Supergroup Chat ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="-1001234567890"
                      value={formChatId}
                      onChange={(e) => setFormChatId(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 bg-white dark:bg-[#1C1C1E] border border-blue-200 dark:border-blue-900 rounded text-xs font-mono text-[#000000] dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddBotModal(false)}
                  className="px-4 py-2 border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-semibold rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[6px] disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Plus size={13} />
                  <span>Register Bot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Manually Authorize Telegram User                       */}
      {/* ------------------------------------------------------------- */}
      {showManualAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[12px] w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-[#007AFF]" />
                <h3 className="text-sm font-bold text-[#000000] dark:text-white">
                  Add User to Whitelist
                </h3>
              </div>
              <button
                onClick={() => setShowManualAddModal(false)}
                className="p-1 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveManualUser} className="p-6 space-y-3.5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Telegram User ID *
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 123456789"
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Telegram Username (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. lutfiikbalmajid"
                  value={manualUsername}
                  onChange={(e) => setManualUsername(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Display Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lutfi Ikbal"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              <div className="pt-2 border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualAddModal(false)}
                  className="px-3.5 py-1.5 border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-semibold rounded-[6px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[6px] cursor-pointer"
                >
                  Authorize User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
