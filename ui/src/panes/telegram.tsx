import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  RefreshCw,
  Repeat,
  ChevronRight,
  Shield,
  Key,
  Mic,
  Bot,
  Settings,
  X,
  AlertCircle,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

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
  messages: TelegramMessage[];
}

const DEFAULT_SYNCED_SESSIONS: SyncedSession[] = [
  {
    id: 's-landing',
    title: 'Landing page build',
    topic: 'Dev',
    syncedTime: '2m ago',
    messages: [
      {
        id: 'm1',
        sender: 'user',
        text: "What's the build status?",
        tag: 'You · web synced',
        timestamp: '2:40 PM',
      },
      {
        id: 'm2',
        sender: 'bot',
        text: 'Landing page deployed from worktree feature/landing-page — 12 commits, all checks green ✓',
        tag: '@kendaliai_bot',
        timestamp: '2:40 PM',
      },
      {
        id: 'm3',
        sender: 'user',
        text: 'Run the security review',
        tag: 'You · web synced',
        timestamp: '2:41 PM',
      },
      {
        id: 'm4',
        sender: 'bot',
        text: 'Found 1 hardcoded OpenAI key in config.go:42. Want me to revoke and patch?',
        tag: '@kendaliai_bot',
        timestamp: '2:42 PM',
      },
    ],
  },
  {
    id: 's-standup',
    title: 'Daily standup notes',
    topic: 'Work',
    syncedTime: '8:30 AM cron',
    messages: [
      {
        id: 'm5',
        sender: 'bot',
        text: 'Good morning! Here is your scheduled daily standup briefing. 3 tasks pending review.',
        tag: '@kendaliai_bot',
        timestamp: '8:30 AM',
      },
    ],
  },
  {
    id: 's-research',
    title: 'Research digest',
    topic: 'Reading',
    syncedTime: 'Fri 6 PM',
    messages: [
      {
        id: 'm6',
        sender: 'bot',
        text: 'Weekly RAG index refreshed with 12 new markdown documents.',
        tag: '@kendaliai_bot',
        timestamp: 'Friday 6:00 PM',
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
  { id: '1', event: 'reminder.triggered → stretch-reminder', time: '2:45 PM' },
  { id: '2', event: 'telegram.message ← @lutfi "status?"', time: '2:44 PM' },
  { id: '3', event: 'task.completed → landing-page-build', time: '2:41 PM' },
  { id: '4', event: 'mcp.call → github.create_issue', time: '2:38 PM' },
];

export const TelegramPane: React.FC = () => {
  const { agents } = useAppStore();

  const [sessions, setSessions] = useState<SyncedSession[]>(DEFAULT_SYNCED_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>('s-landing');
  const [events, setEvents] = useState<BusEvent[]>(INITIAL_EVENTS);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(true);

  // Config Modal State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [botUsername, setBotUsername] = useState('@kendaliai_bot');
  const [botToken, setBotToken] = useState('7129482104:AAFnX89...masked');
  const [whitelistUsers, setWhitelistUsers] = useState('14920491, 5829104');
  const [selectedAgent, setSelectedAgent] = useState('personal-assistant');
  const [isSaved, setIsSaved] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: TelegramMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: inputText.trim(),
      tag: 'You · web synced',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, messages: [...s.messages, userMsg] } : s
      )
    );

    // Event bus notification
    const newEvent: BusEvent = {
      id: `ev-${Date.now()}`,
      event: `telegram.message ← @you "${inputText.slice(0, 18)}..."`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setEvents((prev) => [newEvent, ...prev.slice(0, 5)]);

    const sentText = inputText;
    setInputText('');

    // Simulate Agent Bot response
    setTimeout(() => {
      const botMsg: TelegramMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'bot',
        text: `Echo from ${botUsername}: Processing "${sentText}". All background systems synchronized.`,
        tag: botUsername,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id ? { ...s, messages: [...s.messages, botMsg] } : s
        )
      );
    }, 900);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setShowConfigModal(false);
    }, 600);

    try {
      await fetch('/api/telegram/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: botUsername,
          token: botToken,
          agentId: selectedAgent,
          enabled: true,
        }),
      });
    } catch (err) {
      console.warn('Bot config saved locally:', err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col">
      {/* Page Header matching telegram-syncs.html */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
            Telegram Gateway
          </h1>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Bi-directional sync — messages from Telegram stream into the Web UI and vice versa
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Settings size={14} />
            <span>Configure Bot</span>
          </button>
        </div>
      </div>

      {/* Main Container matching telegram-syncs.html */}
      <div className="flex-1 w-full px-6 lg:px-9 py-6 flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Sessions & Event Bus */}
        <div className="flex-1 w-full flex flex-col gap-3">
          {/* Bot Status Card */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-4 flex items-center justify-between shadow-[0px_1px_2px_0px_#0000000a]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-[42px] h-[42px] shrink-0 flex items-center justify-center bg-[#EBF5FF] rounded-[8px]">
                <Send size={19} className="text-[#007AFF]" />
              </div>
              <div className="flex flex-col gap-[2px] min-w-0">
                <span className="text-[14px] font-bold text-[#000000] font-sans">
                  {botUsername}
                </span>
                <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif] truncate">
                  Gateway connected · event bus streaming · {sessions.length} topics mapped
                </span>
              </div>
            </div>

            <div className="bg-[#DCFCE7] rounded-[4px] px-3 py-1.5 flex items-center shrink-0">
              <span className="text-[10px] font-bold text-[#16A34A] font-['Funnel_Sans',sans-serif] tracking-wider uppercase">
                LIVE
              </span>
            </div>
          </div>

          {/* Synchronized Sessions List */}
          <div className="flex flex-col gap-2 w-full">
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
                      <span className="text-[13px] text-[#000000] font-['Geist',sans-serif]">
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

          {/* Event Stream Card matching telegram-syncs.html */}
          <div className="w-full bg-[#0F0F0F] rounded-[8px] p-4 flex flex-col gap-2.5 text-white">
            <div className="text-[10px] font-bold text-[#A3A3A0] font-['Funnel_Sans',sans-serif] tracking-wider uppercase">
              EVENT BUS — LIVE
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

        {/* Right Column: Telegram Live Chat Preview matching telegram-syncs.html */}
        <div className="w-full lg:w-[340px] shrink-0 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-[0px_4px_16px_0px_#00000018] flex flex-col overflow-hidden">
          {/* Phone Header */}
          <div className="w-full bg-[#0F0F0F] p-[12px_16px] flex items-center justify-between text-[#FFFFFF]">
            <div className="flex items-center gap-2">
              <Send size={15} className="text-[#007AFF]" />
              <span className="text-[13px] font-bold font-sans">
                {botUsername}
              </span>
            </div>
            <span className="text-[10px] text-[#16A34A] font-['Funnel_Sans',sans-serif]">
              online
            </span>
          </div>

          {/* Chat Bubble Area */}
          <div className="w-full bg-[#EBF5FF] p-4 flex flex-col gap-2.5 min-h-[380px] max-h-[480px] overflow-y-auto">
            {activeSession.messages.map((m) => {
              const isUser = m.sender === 'user';

              return (
                <div
                  key={m.id}
                  className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[240px] rounded-[8px] p-[10px_12px] flex flex-col gap-1 ${
                      isUser
                        ? 'bg-[#007AFF] text-[#FFFFFF]'
                        : 'bg-[#FFFFFF] text-[#000000] border border-[#E5E7EB]'
                    }`}
                  >
                    <p className="text-[12px] leading-[17px] font-['Geist',sans-serif]">
                      {m.text}
                    </p>
                    <span
                      className={`text-[9px] font-['Funnel_Sans',sans-serif] ${
                        isUser ? 'text-[#BFDBFE]' : 'text-[#8A8A85]'
                      }`}
                    >
                      {m.tag}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Telegram Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="w-full border-t border-[#E5E7EB] p-[10px_14px] flex items-center gap-2 bg-[#FFFFFF]"
          >
            <input
              type="text"
              placeholder="Message…"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 text-[12px] font-['Geist',sans-serif] text-[#000000] placeholder-[#8A8A85] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-1 text-[#007AFF] hover:text-[#007AFF]/80 disabled:text-[#A3A3A0] transition-colors"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>

      {/* Configure Bot Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#EBF5FF] flex items-center justify-center text-[#007AFF]">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000]">Telegram Gateway Settings</h3>
                  <p className="text-[11px] text-[#8A8A85]">Connect your bot credentials & access controls</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Bot Username</label>
                <input
                  type="text"
                  required
                  placeholder="@your_bot_name"
                  value={botUsername}
                  onChange={(e) => setBotUsername(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Bot Token (from @BotFather)</label>
                <input
                  type="password"
                  required
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Whitelist Telegram User IDs</label>
                <input
                  type="text"
                  placeholder="e.g. 14920491, 5829104 (empty for all)"
                  value={whitelistUsers}
                  onChange={(e) => setWhitelistUsers(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
                <span className="text-[10px] text-[#8A8A85]">Prevents unauthorized users from commanding the agent.</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Default Agent Persona</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                >
                  <option value="personal-assistant">Personal Assistant (General chat & reminders)</option>
                  <option value="coder">Coder (Hermes programming & worktrees)</option>
                  <option value="planner">Planner (Task orchestration)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-[#000000]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[6px] hover:bg-black/90 flex items-center gap-1.5"
                >
                  {isSaved && <CheckCircle2 size={13} className="text-[#16A34A]" />}
                  <span>{isSaved ? 'Saved' : 'Save Connection'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
