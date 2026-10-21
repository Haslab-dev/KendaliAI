import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  Key,
  Bot,
  Shield,
  Clock,
  UserCheck,
  UserX,
  X,
  Copy,
  Check,
  Play,
  Square,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TelegramBotConfig, TelegramAuthorizedUser, TelegramPendingRequest } from '../../types';

interface TelegramConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TelegramConnectModal: React.FC<TelegramConnectModalProps> = ({ isOpen, onClose }) => {
  const { agents } = useAppStore();

  const [bots, setBots] = useState<TelegramBotConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'bots' | 'pairing'>('bots');

  // New Bot Form
  const [botName, setBotName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || 'lead-frontend');
  const [testingToken, setTestingToken] = useState(false);
  const [tokenResult, setTokenResult] = useState<{ valid: boolean; username?: string; error?: string } | null>(null);
  const [submittingBot, setSubmittingBot] = useState(false);

  // Pairing / Access Control
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [authorizedUsers, setAuthorizedUsers] = useState<TelegramAuthorizedUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TelegramPendingRequest[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadBots = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/telegram/bots');
      if (res.ok) {
        const data = await res.json();
        setBots(data.bots || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const loadAuth = async () => {
    try {
      const [uRes, pRes] = await Promise.all([
        fetch('/api/telegram/auth/users'),
        fetch('/api/telegram/auth/pending'),
      ]);
      if (uRes.ok) {
        const uData = await uRes.json();
        setAuthorizedUsers(uData.users || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setPendingRequests(pData.requests || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      loadBots();
      loadAuth();
    }
  }, [isOpen]);

  const handleTestToken = async () => {
    if (!botToken.trim()) return;
    setTestingToken(true);
    setTokenResult(null);
    try {
      const res = await fetch('/api/telegram/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken.trim() }),
      });
      const data = await res.json();
      setTokenResult(data);
      if (data.valid && data.username && !botName) {
        setBotName(`@${data.username}`);
      }
    } catch (err: any) {
      setTokenResult({ valid: false, error: err.message || 'Verification failed' });
    } finally {
      setTestingToken(false);
    }
  };

  const handleAddBot = async () => {
    if (!botToken.trim() || !botName.trim() || submittingBot) return;
    setSubmittingBot(true);
    try {
      const res = await fetch('/api/telegram/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: botName.trim(),
          token: botToken.trim(),
          agentId: selectedAgentId,
          mode: 'direct',
        }),
      });
      if (res.ok) {
        setBotToken('');
        setBotName('');
        setTokenResult(null);
        await loadBots();
      }
    } catch {} finally {
      setSubmittingBot(false);
    }
  };

  const handleToggleBot = async (bot: TelegramBotConfig) => {
    const action = bot.status === 'running' ? 'stop' : 'start';
    try {
      await fetch(`/api/telegram/bots/${bot.id}/${action}`, { method: 'POST' });
      await loadBots();
    } catch {}
  };

  const handleDeleteBot = async (botId: string) => {
    if (!window.confirm('Remove this Telegram Bot connection?')) return;
    try {
      await fetch(`/api/telegram/bots?id=${botId}`, { method: 'DELETE' });
      await loadBots();
    } catch {}
  };

  const handleGeneratePairingCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await fetch('/api/telegram/auth/code', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPairingCode(data.code || data.pairingCode || null);
      }
    } catch {} finally {
      setGeneratingCode(false);
    }
  };

  const handleApproveUser = async (userId: number | string) => {
    try {
      await fetch('/api/telegram/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      await loadAuth();
    } catch {}
  };

  const handleDenyUser = async (userId: number | string) => {
    try {
      await fetch('/api/telegram/auth/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      await loadAuth();
    } catch {}
  };

  const handleRevokeUser = async (userId: number | string) => {
    try {
      await fetch(`/api/telegram/auth/users?userId=${userId}`, { method: 'DELETE' });
      await loadAuth();
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex h-[560px] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-chrome px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <Send className="size-4" />
            </div>
            <div>
              <h2 className="text-ui-sm font-semibold text-foreground">Connect Telegram Bot</h2>
              <p className="text-2xs text-muted-foreground">Pair your AI agents with Telegram channels & chats</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex shrink-0 border-b border-border bg-card px-5 pt-2">
          <button
            onClick={() => setActiveTab('bots')}
            className={`border-b-2 px-3 pb-2 text-ui-xs font-medium transition-colors ${
              activeTab === 'bots'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Bots & Connection ({bots.length})
          </button>
          <button
            onClick={() => setActiveTab('pairing')}
            className={`border-b-2 px-3 pb-2 text-ui-xs font-medium transition-colors ${
              activeTab === 'pairing'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            User Pairing & Access ({authorizedUsers.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          {activeTab === 'bots' ? (
            <div className="space-y-5">
              {/* Add New Bot Form */}
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <h3 className="text-ui-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="size-3.5 text-sky-500" />
                  Add Telegram Bot Token
                </h3>

                <div>
                  <label className="text-2xs font-medium text-muted-foreground">Bot Token (from @BotFather)</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="password"
                      value={botToken}
                      onChange={(e) => {
                        setBotToken(e.target.value);
                        setTokenResult(null);
                      }}
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                      className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-ui-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleTestToken}
                      disabled={testingToken || !botToken.trim()}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-ui-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
                    >
                      {testingToken ? <RefreshCw className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                      Test
                    </button>
                  </div>
                  {tokenResult && (
                    <div
                      className={`mt-1.5 flex items-center gap-1 text-2xs ${
                        tokenResult.valid ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {tokenResult.valid ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                      <span>
                        {tokenResult.valid
                          ? `Valid token for bot @${tokenResult.username}`
                          : tokenResult.error || 'Invalid token'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-medium text-muted-foreground">Bot Name / Label</label>
                    <input
                      type="text"
                      value={botName}
                      onChange={(e) => setBotName(e.target.value)}
                      placeholder="@MyKendaliBot"
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-1.5 text-ui-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-2xs font-medium text-muted-foreground">Assigned Agent</label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-ui-xs text-foreground focus:border-primary focus:outline-none"
                    >
                      {agents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name} ({ag.role || 'Assistant'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleAddBot}
                    disabled={submittingBot || !botToken.trim() || !botName.trim()}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-ui-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    Connect Bot
                  </button>
                </div>
              </div>

              {/* Connected Bots List */}
              <div className="space-y-2">
                <h3 className="text-ui-xs font-semibold text-foreground">Active Telegram Bots</h3>
                {bots.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-ui-xs text-muted-foreground">
                    No Telegram bots connected yet. Enter your bot token above to link your agent.
                  </div>
                ) : (
                  bots.map((bot) => (
                    <div
                      key={bot.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-8 items-center justify-center rounded-lg ${
                            bot.status === 'running' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Send className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-ui-sm font-semibold text-foreground">{bot.name}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-3xs font-semibold ${
                                bot.status === 'running'
                                  ? 'bg-success/15 text-success'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {bot.status}
                            </span>
                          </div>
                          <p className="text-2xs text-muted-foreground">
                            Agent: <span className="font-medium text-foreground">{bot.agentId}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleBot(bot)}
                          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-ui-xs font-medium border ${
                            bot.status === 'running'
                              ? 'border-warning/40 text-warning hover:bg-warning/10'
                              : 'border-success/40 text-success hover:bg-success/10'
                          }`}
                        >
                          {bot.status === 'running' ? (
                            <>
                              <Square className="size-3 fill-current" />
                              Stop
                            </>
                          ) : (
                            <>
                              <Play className="size-3 fill-current" />
                              Start
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteBot(bot.id)}
                          className="flex size-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                          title="Remove bot"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* User Pairing & Authorization Tab */
            <div className="space-y-5">
              {/* Pairing Code Generator */}
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-ui-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Shield className="size-3.5 text-primary" />
                      Pairing Code for Telegram Users
                    </h3>
                    <p className="text-2xs text-muted-foreground">
                      Users message this code to your bot with <code className="bg-card px-1 rounded">/pair &lt;code&gt;</code>
                    </p>
                  </div>
                  <button
                    onClick={handleGeneratePairingCode}
                    disabled={generatingCode}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-ui-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <RefreshCw className={`size-3 ${generatingCode ? 'animate-spin' : ''}`} />
                    New Code
                  </button>
                </div>

                {pairingCode && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5">
                    <div>
                      <span className="text-2xs text-primary font-medium">Active Code:</span>
                      <div className="font-mono text-ui-xl font-bold tracking-widest text-primary">{pairingCode}</div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(pairingCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 1500);
                      }}
                      className="flex items-center gap-1 rounded bg-card px-2 py-1 text-2xs font-medium text-foreground hover:bg-surface-hover"
                    >
                      {copiedCode ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                      {copiedCode ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>

              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-ui-xs font-semibold text-foreground text-amber-500 flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    Pending Authorization Requests ({pendingRequests.length})
                  </h3>
                  <div className="space-y-1.5">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.userId}
                        className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning/5 p-3"
                      >
                        <div>
                          <div className="text-ui-xs font-semibold text-foreground">
                            {req.firstName} {req.lastName} {req.username && `(@${req.username})`}
                          </div>
                          <div className="text-2xs font-mono text-muted-foreground">User ID: {req.userId}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApproveUser(req.userId)}
                            className="flex items-center gap-1 rounded bg-success px-2.5 py-1 text-ui-xs font-medium text-white hover:opacity-90"
                          >
                            <UserCheck className="size-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleDenyUser(req.userId)}
                            className="flex items-center gap-1 rounded bg-destructive px-2.5 py-1 text-ui-xs font-medium text-white hover:opacity-90"
                          >
                            <UserX className="size-3" />
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Authorized Users */}
              <div className="space-y-2">
                <h3 className="text-ui-xs font-semibold text-foreground">
                  Authorized Users ({authorizedUsers.length})
                </h3>
                {authorizedUsers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-ui-xs text-muted-foreground">
                    No authorized users yet. Generate a pairing code above to let users connect.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {authorizedUsers.map((user) => (
                      <div
                        key={user.userId}
                        className="flex items-center justify-between rounded-xl border border-border bg-card p-2.5"
                      >
                        <div>
                          <div className="text-ui-xs font-semibold text-foreground">
                            {user.firstName} {user.lastName} {user.username && `(@${user.username})`}
                          </div>
                          <div className="text-2xs font-mono text-muted-foreground">ID: {user.userId}</div>
                        </div>
                        <button
                          onClick={() => handleRevokeUser(user.userId)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-2xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3" />
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
