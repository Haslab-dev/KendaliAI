import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cloud,
  Search,
  ExternalLink,
  CheckCircle2,
  Plus,
  Github,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  Workflow,
  Database,
  Table,
  ArrowLeft,
  KeyRound,
  Loader2,
  XCircle,
} from 'lucide-react';
import { ComposioToolkit } from '../../types';
import { useProfileStore } from '../../store/useProfileStore';

const COMPOSIO_KEY_URL = 'https://app.composio.dev/settings/api-keys';

type ConnectPhase = 'idle' | 'connecting' | 'awaiting-oauth' | 'error';

export const ConnectionsView: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const [activeTab, setActiveTab] = useState<'connectors' | 'plugins'>('connectors');
  const [search, setSearch] = useState('');
  const [toolkits, setToolkits] = useState<ComposioToolkit[]>([]);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [connectPhase, setConnectPhase] = useState<Record<string, ConnectPhase>>({});
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setToolkits(data);
      }
    } catch (err) {
      console.error('[ConnectionsView] failed to load connectors:', err);
    }
  }, []);

  useEffect(() => {
    fetch('/api/composio/key')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => setKeyConfigured(!!data.configured))
      .catch(() => setKeyConfigured(false));
    void loadConnectors();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loadConnectors]);

  const saveApiKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setSavingKey(true);
    setError(null);
    try {
      const res = await fetch('/api/composio/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      if (!res.ok) throw new Error(await res.text());
      setKeyConfigured(true);
      setApiKeyInput('');
      await loadConnectors();
    } catch (err: any) {
      setError(err?.message || 'Failed to save the API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const removeApiKey = async () => {
    try {
      await fetch('/api/composio/key', { method: 'DELETE' });
      setKeyConfigured(false);
      await loadConnectors();
    } catch {
      /* non-fatal */
    }
  };

  const beginPolling = useCallback((slug: string, accountId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 3 * 60 * 1000) {
        window.clearInterval(pollRef.current!);
        setConnectPhase((p) => ({ ...p, [slug]: 'error' }));
        setError(`Authorization for ${slug} timed out. Try connecting again.`);
        return;
      }
      try {
        const res = await fetch(`/api/connectors/status/${encodeURIComponent(accountId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.connected) {
          window.clearInterval(pollRef.current!);
          setConnectPhase((p) => ({ ...p, [slug]: 'idle' }));
          await loadConnectors();
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          window.clearInterval(pollRef.current!);
          setConnectPhase((p) => ({ ...p, [slug]: 'error' }));
          setError(`Authorization for ${slug} failed. Please try again.`);
        }
      } catch {
        /* keep polling through transient errors */
      }
    }, 2500);
  }, [loadConnectors]);

  const handleConnect = async (slug: string) => {
    setError(null);
    setConnectPhase((p) => ({ ...p, [slug]: 'connecting' }));
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(slug)}/connect`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConnectPhase((p) => ({ ...p, [slug]: 'error' }));
        setError(data?.error || `Could not start connecting ${slug}.`);
        return;
      }
      if (data.redirectUrl) {
        setConnectPhase((p) => ({ ...p, [slug]: 'awaiting-oauth' }));
        window.open(data.redirectUrl, '_blank', 'noopener,width=680,height=760');
        if (data.connectedAccountId) beginPolling(slug, data.connectedAccountId);
        else await loadConnectors();
      } else if (data.connected) {
        setConnectPhase((p) => ({ ...p, [slug]: 'idle' }));
        await loadConnectors();
      } else {
        setConnectPhase((p) => ({ ...p, [slug]: 'idle' }));
        await loadConnectors();
      }
    } catch (err: any) {
      setConnectPhase((p) => ({ ...p, [slug]: 'error' }));
      setError(err?.message || `Could not connect ${slug}.`);
    }
  };

  const handleDisconnect = async (slug: string) => {
    setError(null);
    setConnectPhase((p) => ({ ...p, [slug]: 'connecting' }));
    try {
      await fetch(`/api/connectors/${encodeURIComponent(slug)}/disconnect`, { method: 'POST' });
    } finally {
      setConnectPhase((p) => ({ ...p, [slug]: 'idle' }));
      await loadConnectors();
    }
  };

  const filteredToolkits = toolkits.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const setActiveNavTab = useProfileStore((s) => s.setActiveNavTab);

  const plugins = [
    {
      id: 'workflows',
      name: 'Workflows',
      description: 'Automate multi-step tasks with your agents.',
      icon: <Workflow className="w-5 h-5 text-indigo-400" />,
      installed: true,
    },
    {
      id: 'supermemory',
      name: 'Supermemory',
      description: 'Save, recall, and search long-term agent memories semantically.',
      icon: <Database className="w-5 h-5 text-emerald-400" />,
      installed: false,
    },
    {
      id: 'data-view',
      name: 'Data View',
      description: 'Keep a local copy of a Google Sheet or CSV to view and edit, then sync back.',
      icon: <Table className="w-5 h-5 text-amber-400" />,
      installed: false,
    },
  ];

  const phaseIcon = (slug: string, connected: boolean) => {
    const phase = connectPhase[slug] || 'idle';
    if (phase === 'connecting' || phase === 'awaiting-oauth')
      return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    return <ExternalLink className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation Bar (hidden when embedded in Settings) */}
        {!embedded && (
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <button
              onClick={() => setActiveNavTab('chat')}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chat</span>
            </button>
            <span className="text-xs text-muted-foreground font-mono">App Connectors & Plugins</span>
          </div>
        )}

        {/* Header (hidden when embedded — the Settings frame owns the title) */}
        {!embedded && (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Connections</h1>
              <p className="text-xs text-muted-foreground">
                Empower your agents with 500+ app connectors via Composio, plus custom plugins.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-xs text-red-400">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400/70 hover:text-red-400">×</button>
          </div>
        )}

        {/* Composio API key setup */}
        {keyConfigured === false && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Connect via Composio</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a project API key at{' '}
              <a href={COMPOSIO_KEY_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                app.composio.dev → API Keys
              </a>{' '}
              and paste it here. Credentials stay encrypted with Composio — your agents only see connected
              account references, never tokens.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
                placeholder="Paste your Composio API key..."
                className="flex-1 h-9 rounded-lg bg-muted/20 border border-border/50 px-3 text-xs text-foreground focus:outline-none focus:border-primary/60"
              />
              <button
                onClick={saveApiKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className="h-9 px-4 rounded-lg bg-primary text-white text-xs font-semibold shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {savingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Save</span>
              </button>
            </div>
          </div>
        )}

        {keyConfigured && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Composio connected — your agents can use these apps via composio_call.</span>
            </div>
            <button
              onClick={removeApiKey}
              className="text-3xs font-semibold text-muted-foreground hover:text-destructive transition-colors"
            >
              Disconnect key
            </button>
          </div>
        )}

        {/* Tabs: Connectors vs Plugins */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-6 text-sm font-semibold">
            <button
              onClick={() => setActiveTab('connectors')}
              className={`pb-1 transition-colors relative ${
                activeTab === 'connectors' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Connectors</span>
              {activeTab === 'connectors' && (
                <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('plugins')}
              className={`pb-1 transition-colors relative ${
                activeTab === 'plugins' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Plugins</span>
              {activeTab === 'plugins' && (
                <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-muted/20 border border-border/50 rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/60"
            />
          </div>
        </div>

        {/* Tab 1: Connectors (Composio) */}
        {activeTab === 'connectors' && (
          <div className="space-y-3">
            <div className="text-ui-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
              App Connectors {keyConfigured === false && <span className="normal-case font-normal">— add your Composio API key above to connect</span>}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredToolkits.map((toolkit) => {
                const phase = connectPhase[toolkit.slug] || 'idle';
                const busy = phase === 'connecting' || phase === 'awaiting-oauth';
                return (
                  <div
                    key={toolkit.slug}
                    className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between transition-colors hover:border-border/80 shadow-2xs"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden">
                        {toolkit.logoUrl ? (
                          <img src={toolkit.logoUrl} alt={toolkit.name} className="w-6 h-6 rounded" loading="lazy" />
                        ) : (
                          <>
                            {toolkit.slug === 'github' && <Github className="w-5 h-5 text-foreground" />}
                            {toolkit.slug === 'gmail' && <Mail className="w-5 h-5 text-red-400" />}
                            {(toolkit.slug === 'googlecalendar' || toolkit.slug === 'gcalendar') && <Calendar className="w-5 h-5 text-blue-400" />}
                            {toolkit.slug === 'slack' && <MessageSquare className="w-5 h-5 text-emerald-400" />}
                            {toolkit.slug === 'notion' && <FileText className="w-5 h-5 text-foreground" />}
                            {!['github', 'gmail', 'googlecalendar', 'gcalendar', 'slack', 'notion'].includes(toolkit.slug) && (
                              <Cloud className="w-5 h-5 text-primary" />
                            )}
                          </>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground">{toolkit.name}</h3>
                          {toolkit.connected ? (
                            <span className="inline-flex items-center gap-1 text-ui-xs text-emerald-400 font-medium bg-emerald-950/30 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Connected
                            </span>
                          ) : phase === 'awaiting-oauth' ? (
                            <span className="inline-flex items-center gap-1 text-ui-xs text-amber-400 font-medium bg-amber-950/30 border border-amber-800/40 px-2 py-0.5 rounded-full">
                              <Loader2 className="w-3 h-3 animate-spin" /> Awaiting authorization…
                            </span>
                          ) : phase === 'error' ? (
                            <span className="inline-flex items-center gap-1 text-ui-xs text-red-400 font-medium bg-red-950/30 border border-red-800/40 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3" /> Failed
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{toolkit.description}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => (toolkit.connected ? handleDisconnect(toolkit.slug) : handleConnect(toolkit.slug))}
                      disabled={busy || keyConfigured === false}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-60 ${
                        toolkit.connected
                          ? 'bg-muted/60 hover:bg-destructive/10 hover:text-destructive text-muted-foreground border border-border/60'
                          : 'bg-primary hover:bg-primary/90 text-white shadow-xs'
                      }`}
                    >
                      {toolkit.connected ? (
                        <span>Disconnect</span>
                      ) : (
                        <>
                          {phaseIcon(toolkit.slug, toolkit.connected)}
                          <span>Connect</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Plugins */}
        {activeTab === 'plugins' && (
          <div className="space-y-3">
            <div className="text-ui-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
              Built-in System Plugins
            </div>

            <div className="grid grid-cols-1 gap-3">
              {plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between shadow-2xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shrink-0">
                      {plugin.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-foreground">{plugin.name}</h3>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{plugin.description}</p>
                    </div>
                  </div>

                  <button
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      plugin.installed
                        ? 'bg-muted/60 text-muted-foreground border border-border/60'
                        : 'bg-primary hover:bg-primary/90 text-white shadow-xs'
                    }`}
                  >
                    {plugin.installed ? <span>Enabled</span> : <><Plus className="w-3.5 h-3.5" /><span>Add</span></>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
