import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { TelegramBotConfig } from '../types';
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
      {
        id: 'm3',
        sender: 'user',
        text: 'Run the accessibility scan for mobile screens',
        tag: 'You · Telegram',
        timestamp: '2:41 PM',
      },
      {
        id: 'm4',
        sender: 'bot',
        text: 'A11y audit complete: 100/100 Lighthouse score on mobile viewport.',
        tag: '@kendali_frontend_bot',
        timestamp: '2:42 PM',
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
  {
    id: 's-standup',
    title: 'Daily Architectural Standup',
    topic: 'Architecture',
    syncedTime: '8:30 AM cron',
    botId: 'tg-arch',
    messages: [
      {
        id: 'm7',
        sender: 'bot',
        text: 'Good morning! System architecture review: 3 worktrees active, 0 merge conflicts, memory footprint normal.',
        tag: '@kendali_arch_bot',
        timestamp: '8:30 AM',
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
  { id: '1', event: 'telegram.message ← @lutfi "Frontend status?"', time: '2:44 PM' },
  { id: '2', event: 'agent.turn → Lead Frontend Dev executing', time: '2:42 PM' },
  { id: '3', event: 'telegram.reply → @kendali_frontend_bot [Topic #2]', time: '2:40 PM' },
  { id: '4', event: 'bot.poller → getUpdates poll offset 49201', time: '2:38 PM' },
];

export const TelegramPane: React.FC = () => {
  const { agents } = useAppStore();

  const [bots, setBots] = useState<TelegramBotConfig[]>([]);
  const [sessions, setSessions] = useState<SyncedSession[]>(DEFAULT_SYNCED_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>('s-landing');
  const [events, setEvents] = useState<BusEvent[]>(INITIAL_EVENTS);
  const [inputText, setInputText] = useState('');
  const [isLoadingBots, setIsLoadingBots] = useState(false);

  // Multi-bot Add/Edit Modal
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [formBotName, setFormBotName] = useState('');
  const [formBotToken, setFormBotToken] = useState('');
  const [formAgentId, setFormAgentId] = useState('lead-frontend');
  const [formMode, setFormMode] = useState<'direct' | 'topic_group'>('direct');
  const [formTopicName, setFormTopicName] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch registered bots from backend
  const loadBots = useCallback(async () => {
    setIsLoadingBots(true);
    try {
      const res = await fetch('/api/telegram/bots');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setBots(data);
        } else {
          // Seed default showcase bots if none exist
          setBots([
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
          ]);
        }
      }
    } catch (err) {
      console.warn('Failed to load telegram bots:', err);
    } finally {
      setIsLoadingBots(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Toggle Bot Start/Stop
  const handleToggleBot = async (bot: TelegramBotConfig) => {
    const action = bot.status === 'running' ? 'stop' : 'start';
    const nextStatus = action === 'start' ? 'running' : 'stopped';

    setBots((prev) =>
      prev.map((b) => (b.id === bot.id ? { ...b, status: nextStatus } : b))
    );

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
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, messages: [...s.messages, userMsg] } : s
      )
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
        prev.map((s) =>
          s.id === activeSession.id ? { ...s, messages: [...s.messages, botMsg] } : s
        )
      );
    }, 900);
  };

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col font-sans">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-semibold rounded-[8px] shadow-lg border border-white/10 animate-fade-in">
          <CheckCircle2 size={14} className="text-[#16A34A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
              Telegram Gateway
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#DCFCE7] text-[#16A34A]">
              Multi-Bot Active
            </span>
          </div>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Bi-directional sync — connect multiple dedicated Telegram bots or route through Forum Supergroup topics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadBots}
            title="Refresh bots"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] text-xs transition-colors"
          >
            <RefreshCw size={13} className={isLoadingBots ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync Status</span>
          </button>
          <button
            onClick={() => setShowAddBotModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Telegram Bot</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 w-full px-6 lg:px-9 py-6 flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Registered Bots & Architecture Guide */}
        <div className="flex-1 w-full flex flex-col gap-4">
          {/* Multiple Bots Configuration Section */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <Send size={16} className="text-[#007AFF]" />
                <h2 className="text-sm font-bold text-[#000000]">
                  Connected Telegram Bots ({bots.length})
                </h2>
              </div>
              <span className="text-[11px] text-[#8A8A85]">
                Each staff agent can be paired with their own dedicated bot or group topic
              </span>
            </div>

            {/* Bots Grid / List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {bots.map((bot) => {
                const isRunning = bot.status === 'running';

                return (
                  <div
                    key={bot.id}
                    className="p-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] flex flex-col justify-between gap-3 hover:border-[#BFDBFE] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <GrokAvatar id={bot.agentId} size={28} className="shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-[#000000] font-sans">
                            {bot.name}
                          </span>
                          <span className="text-[10px] text-[#8A8A85]">
                            Assigned Agent: <strong className="text-[#000000]">{bot.agentId}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          isRunning ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-gray-200 text-gray-700'
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

                    {/* Mode Tag */}
                    <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-white border border-[#E5E7EB]">
                        {bot.mode === 'topic_group' ? '🔵 Forum Topics Group' : '🟢 Dedicated 1:1 Bot'}
                      </span>
                      {bot.topicName && (
                        <span className="text-[10px] text-[#007AFF]">
                          Topic: #{bot.topicName}
                        </span>
                      )}
                    </div>

                    {/* Bot Controls */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
                      <button
                        onClick={() => handleToggleBot(bot)}
                        className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                          isRunning
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        {isRunning ? <Square size={10} /> : <Play size={10} />}
                        <span>{isRunning ? 'Stop Bot' : 'Start Bot'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteBot(bot.id)}
                        className="p-1 text-[#8A8A85] hover:text-red-600 rounded transition-colors"
                        title="Remove Bot"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Educational Callout: How Telegram Bot vs Topic Group Works */}
          <div className="w-full bg-[#EBF5FF] border border-[#BFDBFE] rounded-[10px] p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <HelpCircle size={16} className="text-[#007AFF]" />
              <h3 className="text-sm font-bold text-[#000000]">
                How Multiple Bots &amp; Topic Groups Work in KendaliAI
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed text-[#1E3A8A]">
              <div className="p-3 bg-white/80 rounded-[8px] border border-blue-200 space-y-1">
                <div className="font-bold text-[#000000] flex items-center gap-1">
                  <span>🟢 Option A: Dedicated Bots (1:1)</span>
                </div>
                <p className="text-[11px] text-[#4B5563]">
                  Create separate bots in @BotFather (e.g. <code>@kendali_frontend_bot</code>, <code>@kendali_arch_bot</code>). Each staff worker binds to their dedicated bot token. You chat with that bot directly in Telegram.
                </p>
              </div>

              <div className="p-3 bg-white/80 rounded-[8px] border border-blue-200 space-y-1">
                <div className="font-bold text-[#000000] flex items-center gap-1">
                  <span>🔵 Option B: Forum Topic Supergroups</span>
                </div>
                <p className="text-[11px] text-[#4B5563]">
                  Add 1 bot to a Telegram Supergroup with <strong>Topics</strong> enabled. Create topics like <code>#Frontend</code> or <code>#Legal</code>. Telegram sends <code>message_thread_id</code>, and KendaliAI routes the turn to the right staff agent automatically!
                </p>
              </div>
            </div>
          </div>

          {/* Synchronized Sessions List */}
          <div className="flex flex-col gap-2 w-full">
            <div className="text-xs font-bold uppercase tracking-wider text-[#8A8A85] px-1">
              Active Telegram Thread Sessions
            </div>
            {sessions.map((s) => {
              const isSelected = s.id === activeSessionId;

              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  className={`w-full bg-[#FFFFFF] border ${
                    isSelected ? 'border-[#0F0F0F] ring-1 ring-[#0F0F0F]' : 'border-[#E5E7EB]'
                  } rounded-[8px] p-4 flex items-center justify-between cursor-pointer transition-all hover:border-[#D4D4D0]`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Repeat size={15} className={isSelected ? 'text-[#007AFF]' : 'text-[#16A34A]'} />
                    <div className="flex flex-col gap-[2px] min-w-0">
                      <span className="text-[13px] text-[#000000] font-sans font-medium">
                        {s.title}
                      </span>
                      <span className="text-[10px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
                        topic: {s.topic} · synced {s.syncedTime}
                      </span>
                    </div>
                  </div>

                  <ChevronRight size={14} className="text-[#8A8A85]" />
                </div>
              );
            })}
          </div>

          {/* Event Stream Card */}
          <div className="w-full bg-[#0F0F0F] rounded-[8px] p-4 flex flex-col gap-2.5 text-white">
            <div className="text-[10px] font-bold text-[#A3A3A0] font-['Funnel_Sans',sans-serif] tracking-wider uppercase">
              EVENT BUS — LIVE TELEGRAM ROUTER
            </div>

            <div className="flex flex-col gap-2 w-full pt-1">
              {events.map((ev) => (
                <div key={ev.id} className="w-full flex items-center gap-2 text-[10px] font-['Geist_Mono',monospace]">
                  <div className="w-[5px] h-[5px] rounded-full bg-[#16A34A] shrink-0" />
                  <span className="text-[#A3A3A0] flex-1 truncate">
                    {ev.event} · {ev.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Telegram Live Chat Preview */}
        <div className="w-full lg:w-[350px] shrink-0 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] shadow-lg flex flex-col overflow-hidden">
          {/* Phone Header */}
          <div className="w-full bg-[#0F0F0F] p-[14px_16px] flex items-center justify-between text-[#FFFFFF]">
            <div className="flex items-center gap-2.5">
              <Send size={15} className="text-[#007AFF]" />
              <div className="flex flex-col">
                <span className="text-[13px] font-bold font-sans">
                  {activeSession.topic || 'Telegram Sync'}
                </span>
                <span className="text-[10px] text-[#16A34A] font-['Funnel_Sans',sans-serif]">
                  online · {activeSession.botId || '@kendali_bot'}
                </span>
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 min-h-[380px] max-h-[440px] overflow-y-auto p-4 flex flex-col gap-3.5 bg-[#F7F7F5] custom-scrollbar">
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
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] rounded-br-[2px]'
                        : 'bg-[#FFFFFF] text-[#000000] border border-[#E5E7EB] rounded-bl-[2px] shadow-2xs'
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

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-3 bg-[#FFFFFF] border-t border-[#E5E7EB] flex items-center gap-2">
            <input
              type="text"
              placeholder="Simulate message to Telegram..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
            />
            <button
              type="submit"
              className="p-2 bg-[#0F0F0F] text-white rounded-[6px] hover:bg-black/90 transition-colors cursor-pointer"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Register New Telegram Bot (Multi-Bot Setup)             */}
      {/* ------------------------------------------------------------- */}
      {showAddBotModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-[#007AFF]" />
                <div>
                  <h2 className="text-base font-bold text-[#000000]">Add Telegram Bot Setup</h2>
                  <p className="text-[11px] text-[#8A8A85]">
                    Configure multi-bot pairing or Forum Supergroup topics
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddBotModal(false)}
                className="p-1.5 text-[#8A8A85] hover:text-[#000000] rounded-md hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBot} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  Bot Name &amp; Handle *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Dev Bot (@kendali_frontend_bot)"
                  value={formBotName}
                  onChange={(e) => setFormBotName(e.target.value)}
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
                  value={formBotToken}
                  onChange={(e) => setFormBotToken(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs font-mono text-[#000000] outline-none focus:border-[#0F0F0F]"
                />
              </div>

              {/* Assigned Staff Agent */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  Assigned Staff Worker / Persona *
                </label>
                <select
                  value={formAgentId}
                  onChange={(e) => setFormAgentId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
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

              {/* Operating Mode: Direct Bot vs Forum Topic Group */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#333333]">
                  Connection Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormMode('direct')}
                    className={`p-2.5 rounded-[6px] border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                      formMode === 'direct'
                        ? 'border-[#0F0F0F] bg-black text-white font-bold'
                        : 'border-[#E5E7EB] bg-white text-[#333333] hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs">🟢 Dedicated 1:1 Bot</span>
                    <span className={`text-[10px] ${formMode === 'direct' ? 'text-gray-300' : 'text-[#8A8A85]'}`}>
                      Direct private chat with agent
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormMode('topic_group')}
                    className={`p-2.5 rounded-[6px] border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                      formMode === 'topic_group'
                        ? 'border-[#007AFF] bg-blue-600 text-white font-bold'
                        : 'border-[#E5E7EB] bg-white text-[#333333] hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs">🔵 Forum Supergroup Topic</span>
                    <span className={`text-[10px] ${formMode === 'topic_group' ? 'text-blue-100' : 'text-[#8A8A85]'}`}>
                      Routes messages from Group Topics
                    </span>
                  </button>
                </div>
              </div>

              {/* Topic Fields if topic mode */}
              {formMode === 'topic_group' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50 border border-blue-200 rounded-[8px]">
                  <div>
                    <label className="text-[11px] font-bold text-blue-900">
                      Topic Name / Slug
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Frontend Dev"
                      value={formTopicName}
                      onChange={(e) => setFormTopicName(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 bg-white border border-blue-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-blue-900">
                      Supergroup Chat ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="-1001234567890"
                      value={formChatId}
                      onChange={(e) => setFormChatId(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 bg-white border border-blue-200 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddBotModal(false)}
                  className="px-4 py-2 border border-[#E5E7EB] text-xs font-semibold rounded-[6px] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] hover:bg-black/90 disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Register Bot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
