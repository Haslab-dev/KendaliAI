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
  Edit2,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { TelegramBotConfig, TelegramAuthorizedUser, TelegramPendingRequest, SessionMessage } from '../types';
import { GrokAvatar } from '../components/GrokAvatar';

export const TelegramPane: React.FC = () => {
  const { agents, sessions, loadSessions, logs, loadLogs, availableModels, defaultModel } = useAppStore();

  const [activeMainTab, setActiveMainTab] = useState<'bots' | 'access'>('bots');
  const [bots, setBots] = useState<TelegramBotConfig[]>([]);
  const [isLoadingBots, setIsLoadingBots] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Real Telegram Sessions & Messages State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [tgMessages, setTgMessages] = useState<SessionMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Modal: Add or Edit Bot
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [formBotName, setFormBotName] = useState('');
  const [formBotToken, setFormBotToken] = useState('');
  const [formAgentId, setFormAgentId] = useState('lead-frontend');
  const [formModel, setFormModel] = useState('');
  const [formMode, setFormMode] = useState<'direct' | 'topic_group'>('direct');
  const [formTopicName, setFormTopicName] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [isSubmittingBot, setIsSubmittingBot] = useState(false);

  // Token testing state inside modal
  const [isTestingToken, setIsTestingToken] = useState(false);
  const [tokenTestResult, setTokenTestResult] = useState<{ valid: boolean; username?: string; error?: string } | null>(null);

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
    setTimeout(() => setToastMessage(null), 3500);
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
    loadSessions();
    loadLogs();
  }, [loadBots, loadAuthData, loadSessions, loadLogs]);

  // Periodic polling for pending requests & logs
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeMainTab === 'access') {
        loadAuthData();
      } else {
        loadLogs();
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [activeMainTab, loadAuthData, loadLogs]);

  // Real Telegram Sessions filter
  const telegramSessions = useMemo(() => {
    return sessions.filter((s) => s.id.startsWith('tg-') || (s as any).channelId === 'telegram' || (s as any).channel === 'telegram');
  }, [sessions]);

  const activeTgSession = useMemo(() => {
    if (selectedSessionId) {
      const found = telegramSessions.find((s) => s.id === selectedSessionId);
      if (found) return found;
    }
    return telegramSessions[0] || null;
  }, [telegramSessions, selectedSessionId]);

  // Load Real Messages for active session
  const loadActiveMessages = useCallback(async (sid: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/sessions/${sid}/messages`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTgMessages(data);
        }
      }
    } catch (err) {
      console.warn('Failed to load messages for session:', sid, err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeTgSession) {
      loadActiveMessages(activeTgSession.id);
    } else {
      setTgMessages([]);
    }
  }, [activeTgSession?.id, loadActiveMessages]);

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

  // Revoke Authorized User
  const handleRevokeUser = async (userId: number) => {
    if (!confirm(`Are you sure you want to revoke Telegram user ${userId}?`)) return;
    try {
      const res = await fetch(`/api/telegram/auth/users?userId=${userId}`, { method: 'DELETE' });
      if (res.ok) {
        triggerToast('Access revoked');
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
      triggerToast('Please provide a User ID or Username');
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

  // Toggle Bot Start/Stop with Real Error Handling
  const handleToggleBot = async (bot: TelegramBotConfig) => {
    const action = bot.status === 'running' ? 'stop' : 'start';
    try {
      const res = await fetch(`/api/telegram/bots/${bot.id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const errText = await res.text();
        triggerToast(`❌ Failed to ${action} bot: ${errText || 'Invalid token or network error'}`);
        loadBots();
        return;
      }
      triggerToast(`✓ Bot ${bot.name} ${action === 'start' ? 'started' : 'stopped'} successfully`);
      loadBots();
    } catch (err: any) {
      triggerToast(`Network error toggling bot: ${err.message || ''}`);
      loadBots();
    }
  };

  // Test Existing Bot Connection
  const handleTestExistingBot = async (bot: TelegramBotConfig) => {
    try {
      triggerToast(`Testing @${bot.name} connection...`);
      const res = await fetch(`/api/telegram/bots/${bot.id}/test`);
      const data = await res.json();
      if (data.valid) {
        triggerToast(`✅ Connected! Username: @${data.username}`);
      } else {
        triggerToast(`❌ Token Error: ${data.error || 'Unauthorized'}`);
      }
    } catch (err: any) {
      triggerToast(`❌ Test failed: ${err.message}`);
    }
  };

  // Delete Bot
  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Are you sure you want to remove this Telegram bot?')) return;
    try {
      await fetch(`/api/telegram/bots?id=${botId}`, { method: 'DELETE' });
      triggerToast('Bot removed');
      loadBots();
    } catch (err) {
      console.warn('Delete bot fallback:', err);
    }
  };

  // Open Add Bot Modal
  const openAddBotModal = () => {
    setEditingBotId(null);
    setFormBotName('');
    setFormBotToken('');
    setFormAgentId(agents[0]?.id || 'lead-frontend');
    setFormModel(defaultModel || '');
    setFormMode('direct');
    setFormTopicName('');
    setFormChatId('');
    setTokenTestResult(null);
    setShowBotModal(true);
  };

  // Open Edit Bot Modal
  const openEditBotModal = (bot: TelegramBotConfig) => {
    setEditingBotId(bot.id);
    setFormBotName(bot.name);
    setFormBotToken(bot.token);
    setFormAgentId(bot.agentId);
    setFormModel(bot.model || defaultModel || '');
    setFormMode(bot.mode || 'direct');
    setFormTopicName(bot.topicName || '');
    setFormChatId(bot.chatId || '');
    setTokenTestResult(null);
    setShowBotModal(true);
  };

  // Test Token live inside Modal
  const handleTestToken = async () => {
    if (!formBotToken.trim()) {
      triggerToast('Please enter a bot token first');
      return;
    }
    setIsTestingToken(true);
    setTokenTestResult(null);
    try {
      const res = await fetch('/api/telegram/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: formBotToken.trim() }),
      });
      const data = await res.json();
      setTokenTestResult(data);
      if (data.valid) {
        triggerToast(`✓ Token valid! Verified as @${data.username}`);
      } else {
        triggerToast(`❌ Token invalid: ${data.error || 'Unauthorized'}`);
      }
    } catch (err: any) {
      setTokenTestResult({ valid: false, error: err.message || 'Network error' });
      triggerToast(`❌ Test connection failed: ${err.message}`);
    } finally {
      setIsTestingToken(false);
    }
  };

  // Save (Create or Update) Bot Configuration
  const handleSaveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBotName.trim() || !formBotToken.trim()) {
      triggerToast('Please fill in Bot Name and Token');
      return;
    }

    setIsSubmittingBot(true);
    const botPayload: TelegramBotConfig = {
      id: editingBotId || `tg-${formAgentId}-${Date.now().toString().slice(-4)}`,
      name: formBotName.trim(),
      token: formBotToken.trim(),
      agentId: formAgentId,
      model: formModel.trim() || undefined,
      enabled: true,
      status: 'running',
      mode: formMode,
      topicName: formTopicName.trim() || undefined,
      chatId: formChatId.trim() || undefined,
    };

    try {
      const res = await fetch('/api/telegram/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botPayload),
      });
      const data = await res.json();
      if (data.error) {
        triggerToast(`⚠️ Saved, but bot start had an issue: ${data.error}`);
      } else {
        triggerToast(`✓ Bot ${botPayload.name} saved successfully`);
      }
      setShowBotModal(false);
      loadBots();
    } catch (err: any) {
      triggerToast(`Failed to save bot: ${err.message}`);
    } finally {
      setIsSubmittingBot(false);
    }
  };

  // Send real message to session
  const handleSendRealMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeTgSession || isSendingMessage) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsSendingMessage(true);

    // Optimistic user message append
    const tempUserMsg: SessionMessage = {
      id: `temp-${Date.now()}`,
      sessionId: activeTgSession.id,
      agentId: activeTgSession.agentId,
      channel: 'telegram',
      role: 'user',
      content: messageText,
      createdAt: Math.floor(Date.now() / 1000),
    };
    setTgMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeTgSession.id,
          agentId: activeTgSession.agentId,
          message: messageText,
        }),
      });
      if (res.ok) {
        loadActiveMessages(activeTgSession.id);
        loadLogs();
      }
    } catch (err) {
      triggerToast('Failed to dispatch message to agent');
    } finally {
      setIsSendingMessage(false);
    }
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

  // Real Telegram / Gateway Events
  const realTelegramLogs = useMemo(() => {
    const filtered = logs.filter(
      (l) =>
        l.channel === 'telegram' ||
        l.sessionId?.startsWith('tg-') ||
        (l.type && l.type.toLowerCase().includes('telegram'))
    );
    return (filtered.length > 0 ? filtered : logs).slice(0, 8);
  }, [logs]);

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
            Multi-bot routing, forum topic supergroups, live chat synchronization &amp; OTP authorization whitelist
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-center">
          <button
            onClick={() => {
              loadBots();
              loadAuthData();
              loadSessions();
              loadLogs();
              triggerToast('Refreshed Telegram status & bots');
            }}
            title="Refresh bots & auth status"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 text-xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={isLoadingBots ? 'animate-spin text-[#007AFF]' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={openAddBotModal}
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
          {telegramSessions.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#007AFF] font-bold">
              {telegramSessions.length} Chats
            </span>
          )}
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
      {/* TAB 1: CONNECTED BOTS & REAL SYNCED CHATS                     */}
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
                  Each worker agent pairs with a dedicated bot token or forum topic
                </span>
              </div>

              {/* Bots Grid */}
              {bots.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2 border border-dashed border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px]">
                  <Bot size={28} className="text-[#8A8A85] opacity-50" />
                  <span className="text-xs font-bold text-[#000000] dark:text-white">No Telegram Bots Registered</span>
                  <p className="text-[11px] text-[#8A8A85] max-w-sm">
                    Connect your Telegram bot token from @BotFather to let your agents chat and execute actions via Telegram.
                  </p>
                  <button
                    onClick={openAddBotModal}
                    className="mt-1 px-3 py-1.5 bg-[#007AFF] text-white text-xs font-bold rounded-[6px] hover:bg-[#0066D6] transition-colors"
                  >
                    Add Your First Bot
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {bots.map((bot) => {
                    const isRunning = bot.status === 'running';
                    const isError = bot.status === 'error';

                    return (
                      <div
                        key={bot.id}
                        className={`p-3.5 bg-[#F9FAFB] dark:bg-[#161618] border rounded-[8px] flex flex-col justify-between gap-3 transition-colors shadow-2xs ${
                          isError
                            ? 'border-red-300 dark:border-red-900/60'
                            : 'border-[#E5E7EB] dark:border-[#2C2C2E] hover:border-[#007AFF]/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <GrokAvatar id={bot.agentId} size={32} className="shrink-0 mt-0.5" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-[#000000] dark:text-white font-sans truncate">
                                {bot.name}
                              </span>
                              <span className="text-[10px] text-[#8A8A85] truncate">
                                Worker:{' '}
                                <strong className="text-[#000000] dark:text-white font-medium">
                                  {bot.agentId}
                                </strong>
                              </span>
                              {bot.model && (
                                <span className="text-[9px] text-[#007AFF] font-mono truncate">
                                  {bot.model}
                                </span>
                              )}
                            </div>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                              isRunning
                                ? 'bg-[#DCFCE7] dark:bg-emerald-950/40 text-[#16A34A]'
                                : isError
                                ? 'bg-red-100 dark:bg-red-950/40 text-red-600'
                                : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isRunning
                                  ? 'bg-[#16A34A] animate-pulse'
                                  : isError
                                  ? 'bg-red-500'
                                  : 'bg-gray-400'
                              }`}
                            />
                            {isError ? 'Error (Offline)' : bot.status}
                          </span>
                        </div>

                        {isError && (
                          <div className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded text-[11px] text-red-700 dark:text-red-300 flex items-center gap-1.5">
                            <AlertTriangle size={13} className="shrink-0 text-red-500" />
                            <span className="truncate">Token unauthorized or revoked in Telegram.</span>
                          </div>
                        )}

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
                          <div className="flex items-center gap-1.5">
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
                              onClick={() => handleTestExistingBot(bot)}
                              className="px-2 py-1 text-[10px] font-semibold border border-[#E5E7EB] dark:border-[#2C2C2E] rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                              title="Test API token connection"
                            >
                              Test
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditBotModal(bot)}
                              className="p-1 text-[#8A8A85] hover:text-[#007AFF] rounded transition-colors cursor-pointer"
                              title="Edit Bot Settings"
                            >
                              <Edit2 size={13} />
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Architecture Explainer */}
            <div className="w-full bg-[#EBF5FF] dark:bg-blue-950/20 border border-[#BFDBFE] dark:border-blue-900/40 rounded-[10px] p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-[#007AFF]" />
                <h3 className="text-sm font-bold text-[#000000] dark:text-white">
                  Multi-Bot Architecture vs Forum Topics
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                <div className="p-3 bg-white/80 dark:bg-[#1C1C1E] rounded-[8px] border border-blue-200 dark:border-blue-900/30 space-y-1">
                  <div className="font-bold text-[#000000] dark:text-white flex items-center gap-1">
                    <span>🟢 Dedicated 1:1 Bots</span>
                  </div>
                  <p className="text-[11px] text-[#4B5563] dark:text-gray-300">
                    Create separate bots in @BotFather for each agent role (e.g. Legal, Frontend, Architect). Chat directly with each bot in 1:1 Telegram private chats.
                  </p>
                </div>

                <div className="p-3 bg-white/80 dark:bg-[#1C1C1E] rounded-[8px] border border-blue-200 dark:border-blue-900/30 space-y-1">
                  <div className="font-bold text-[#000000] dark:text-white flex items-center gap-1">
                    <span>🔵 Forum Topic Supergroups</span>
                  </div>
                  <p className="text-[11px] text-[#4B5563] dark:text-gray-300">
                    Add 1 bot to a Telegram Supergroup with <strong>Topics</strong> enabled. Assign topics like <code>#frontend</code> or <code>#backend</code> to auto-route messages to the corresponding agent.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Gateway Event Stream */}
            <div className="w-full bg-[#0F0F0F] rounded-[10px] p-4 flex flex-col gap-2.5 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-[#A3A3A0] tracking-wider uppercase font-sans flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                  <span>LIVE GATEWAY EVENT STREAM</span>
                </div>
                <span className="text-[10px] text-[#8A8A85] font-mono">
                  {realTelegramLogs.length} events logged
                </span>
              </div>
              <div className="flex flex-col gap-2 w-full pt-1">
                {realTelegramLogs.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[#8A8A85] font-mono">
                    Waiting for incoming Telegram webhook or agent execution events...
                  </div>
                ) : (
                  realTelegramLogs.map((ev) => (
                    <div key={ev.id} className="w-full flex items-center gap-2 text-[10px] font-mono">
                      <div className="w-[5px] h-[5px] rounded-full bg-[#007AFF] shrink-0" />
                      <span className="text-[#A3A3A0] flex-1 truncate">
                        {ev.type} {ev.agentId ? `[${ev.agentId}]` : ''} · {typeof ev.timestamp === 'number' ? new Date(ev.timestamp * 1000).toLocaleTimeString() : ev.timestamp}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Real Synced Telegram Sessions & Chat Viewer */}
          <div className="w-full lg:w-[380px] shrink-0 bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] shadow-sm flex flex-col overflow-hidden">
            <div className="w-full bg-[#0F0F0F] p-[12px_16px] flex items-center justify-between text-[#FFFFFF]">
              <div className="flex items-center gap-2.5">
                <Send size={15} className="text-[#007AFF]" />
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold font-sans">
                    {activeTgSession ? activeTgSession.title || activeTgSession.id : 'Telegram Live Sync'}
                  </span>
                  <span className="text-[10px] text-[#16A34A]">
                    {activeTgSession ? `Agent: ${activeTgSession.agentId}` : 'No active telegram session'}
                  </span>
                </div>
              </div>

              {telegramSessions.length > 1 && (
                <select
                  value={activeTgSession?.id || ''}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="bg-[#242426] text-white text-[10px] px-2 py-1 rounded border border-white/10 outline-none"
                >
                  {telegramSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.id}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Chat Body */}
            <div className="flex-1 min-h-[380px] max-h-[460px] overflow-y-auto p-4 flex flex-col gap-3.5 bg-[#F7F7F5] dark:bg-[#141414] custom-scrollbar">
              {!activeTgSession ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2.5 my-auto text-[#8A8A85]">
                  <MessageSquare size={32} className="opacity-40 text-[#007AFF]" />
                  <span className="text-xs font-bold text-[#000000] dark:text-white">
                    No Telegram Sessions Yet
                  </span>
                  <p className="text-[11px] leading-relaxed">
                    Start your bot above and send a message or run <code className="text-[#007AFF]">/auth</code> on Telegram. Conversations will synchronize live right here!
                  </p>
                </div>
              ) : isLoadingMessages ? (
                <div className="h-full flex items-center justify-center text-xs text-[#8A8A85] my-auto">
                  <RefreshCw size={14} className="animate-spin text-[#007AFF] mr-2" />
                  Loading synced messages...
                </div>
              ) : tgMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-[#8A8A85] my-auto">
                  <span>Session ready. Send a message on Telegram to chat with {activeTgSession.agentId}.</span>
                </div>
              ) : (
                tgMessages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1 max-w-[85%] ${
                        isUser ? 'self-end' : 'self-start'
                      }`}
                    >
                      <div
                        className={`p-[10px_14px] rounded-[12px] text-[12px] leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-[#007AFF] text-white rounded-br-[2px]'
                            : 'bg-[#FFFFFF] dark:bg-[#1C1C1E] text-[#000000] dark:text-white border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-bl-[2px] shadow-2xs'
                        }`}
                      >
                        {m.content}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A85] px-1 font-mono">
                        <span>{isUser ? 'Telegram User' : `@${activeTgSession.agentId}`}</span>
                        <span>·</span>
                        <span>
                          {m.createdAt
                            ? new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Synced'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendRealMessage} className="p-3 bg-[#FFFFFF] dark:bg-[#1C1C1E] border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center gap-2">
              <input
                type="text"
                placeholder={activeTgSession ? `Message ${activeTgSession.agentId}...` : 'Start a Telegram chat first'}
                disabled={!activeTgSession || isSendingMessage}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!activeTgSession || !inputText.trim() || isSendingMessage}
                className="p-2 bg-[#007AFF] text-white rounded-[6px] hover:bg-[#0066D6] transition-colors cursor-pointer disabled:opacity-50"
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
                className={`w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0 ${
                  authRequired ? 'bg-blue-50 dark:bg-blue-950/40 text-[#007AFF]' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600'
                }`}
              >
                {authRequired ? <Lock size={22} /> : <Unlock size={22} />}
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
                        <span className="text-[9px] text-[#8A8A85] mt-0.5">
                          Requested: {new Date(req.createdAt * 1000).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleDenyRequest(req.userId)}
                        className="px-3 py-1.5 border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-[6px] font-semibold transition-colors cursor-pointer"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleApproveRequest(req)}
                        className="px-3.5 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[6px] transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                      >
                        <UserCheck size={14} />
                        <span>Approve Access</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Authorized Users Table */}
          <div className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <UserCheck size={16} className="text-emerald-500" />
                <h4 className="text-sm font-bold text-[#000000] dark:text-white">
                  Authorized Whitelist ({authorizedUsers.length})
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-[#8A8A85]" />
                  <input
                    type="text"
                    placeholder="Search users or IDs..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-7 pr-3 py-1.5 text-xs bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-[#000000] dark:text-white outline-none focus:border-[#007AFF] w-48"
                  />
                </div>
                <button
                  onClick={() => setShowManualAddModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[6px] transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={13} />
                  <span>Add User</span>
                </button>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8A8A85] flex flex-col items-center justify-center gap-2">
                <Shield size={24} className="opacity-40 text-[#8A8A85]" />
                <span>No authorized users found matching your search.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85] font-semibold text-[11px]">
                      <th className="pb-2 font-medium">User</th>
                      <th className="pb-2 font-medium">Telegram ID</th>
                      <th className="pb-2 font-medium">Auth Method</th>
                      <th className="pb-2 font-medium">Authorized At</th>
                      <th className="pb-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredUsers.map((u) => (
                      <tr key={u.userId} className="hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#16A34A] font-bold flex items-center justify-center text-[10px]">
                              {(u.firstName || u.username || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-[#000000] dark:text-white">
                                {u.firstName} {u.lastName}
                              </span>
                              {u.username && (
                                <span className="text-[11px] text-[#007AFF] font-mono">
                                  @{u.username}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 font-mono text-[11px] text-[#8A8A85]">
                          {u.userId}
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              u.authMethod === 'otp'
                                ? 'bg-blue-100 dark:bg-blue-950/40 text-[#007AFF]'
                                : u.authMethod === 'admin_approval'
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600'
                                : 'bg-gray-100 dark:bg-[#2C2C2E] text-[#8A8A85]'
                            }`}
                          >
                            {u.authMethod === 'otp'
                              ? 'OTP Verified'
                              : u.authMethod === 'admin_approval'
                              ? 'Admin Approved'
                              : 'Manual'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-[11px] text-[#8A8A85]">
                          {new Date(u.createdAt * 1000).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 pl-2 text-right">
                          <button
                            onClick={() => handleRevokeUser(u.userId)}
                            className="p-1.5 text-[#8A8A85] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors cursor-pointer"
                            title="Revoke Access"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Register or Edit Telegram Bot                          */}
      {/* ------------------------------------------------------------- */}
      {showBotModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[12px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-[#007AFF]" />
                <h3 className="text-sm font-bold text-[#000000] dark:text-white">
                  {editingBotId ? 'Edit Telegram Bot Configuration' : 'Connect New Telegram Bot'}
                </h3>
              </div>
              <button
                onClick={() => setShowBotModal(false)}
                className="p-1 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBot} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Bot Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HasLab Frontend Bot"
                  value={formBotName}
                  onChange={(e) => setFormBotName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                    Bot Token (@BotFather) *
                  </label>
                  <button
                    type="button"
                    onClick={handleTestToken}
                    disabled={isTestingToken || !formBotToken.trim()}
                    className="text-[11px] text-[#007AFF] font-bold hover:underline flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <Zap size={11} className={isTestingToken ? 'animate-spin' : ''} />
                    <span>{isTestingToken ? 'Verifying...' : 'Test Token'}</span>
                  </button>
                </div>
                <input
                  type="password"
                  required
                  placeholder="e.g. 7123456789:AAFx..."
                  value={formBotToken}
                  onChange={(e) => {
                    setFormBotToken(e.target.value);
                    setTokenTestResult(null);
                  }}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                />

                {/* Token Test Feedback Banner */}
                {tokenTestResult && (
                  <div
                    className={`mt-2 p-2.5 rounded-[6px] text-xs flex items-center gap-2 ${
                      tokenTestResult.valid
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900/40'
                    }`}
                  >
                    {tokenTestResult.valid ? (
                      <>
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                        <span>Token verified successfully! Active as <strong>@{tokenTestResult.username}</strong></span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={15} className="text-red-600 shrink-0" />
                        <span>Invalid Token: {tokenTestResult.error || 'Telegram rejected this token.'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                    Assigned Agent Worker
                  </label>
                  <select
                    value={formAgentId}
                    onChange={(e) => setFormAgentId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                    LLM Model Override
                  </label>
                  <select
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  >
                    <option value="">Default Model ({defaultModel || 'System Default'})</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333] dark:text-gray-200">
                  Bot Architecture Mode
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setFormMode('direct')}
                    className={`p-2.5 rounded-[6px] border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      formMode === 'direct'
                        ? 'border-[#007AFF] bg-blue-50/50 dark:bg-blue-950/30 text-[#007AFF]'
                        : 'border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85]'
                    }`}
                  >
                    <span className="text-xs font-bold">🟢 Dedicated Bot</span>
                    <span className="text-[10px] opacity-80">
                      1:1 direct chat with single agent
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormMode('topic_group')}
                    className={`p-2.5 rounded-[6px] border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      formMode === 'topic_group'
                        ? 'border-[#007AFF] bg-blue-50/50 dark:bg-blue-950/30 text-[#007AFF]'
                        : 'border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85]'
                    }`}
                  >
                    <span className="text-xs font-bold">🔵 Forum Topic Group</span>
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
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 border border-[#E5E7EB] dark:border-[#2C2C2E] text-xs font-semibold rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBot}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[6px] disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isSubmittingBot ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                  <span>{editingBotId ? 'Update Bot' : 'Register Bot'}</span>
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
