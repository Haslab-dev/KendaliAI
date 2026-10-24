import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cloud,
  Search,
  ExternalLink,
  CheckCircle2,
  Plus,
  ArrowLeft,
  KeyRound,
  Loader2,
  XCircle,
  Puzzle,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { ComposioToolkit } from '../../types';
import { useProfileStore } from '../../store/useProfileStore';
import { navigateSettings } from '../../router';
import { ServiceIcon } from './ServiceIcon';

const COMPOSIO_KEY_URL = 'https://app.composio.dev/settings/api-keys';

type ConnectPhase = 'idle' | 'connecting' | 'awaiting-oauth' | 'error';

export const ConnectionsView: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
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

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredToolkits = toolkits.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedCategory === 'all') return true;
    return t.category === selectedCategory;
  });

  const connectedCount = toolkits.filter((t) => t.connected).length;
  const setActiveNavTab = useProfileStore((s) => s.setActiveNavTab);

  const phaseIcon = (slug: string, connected: boolean) => {
    const phase = connectPhase[slug] || 'idle';
    if (phase === 'connecting' || phase === 'awaiting-oauth')
      return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    return <ExternalLink className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex-1 w-full bg-background select-none">
      <div className={embedded ? 'w-full space-y-5' : 'max-w-4xl mx-auto space-y-6'}>
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
            <span className="text-xs text-muted-foreground font-mono">App Connectors</span>
          </div>
        )}

        {/* Header (hidden when embedded — the Settings frame owns the title) */}
        {!embedded && (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">App Connectors</h1>
              <p className="text-xs text-muted-foreground">
                Empower your agents with 500+ app connectors via Composio.
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
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Connect via Composio</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
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
                className="flex-1 h-9 rounded-lg bg-muted/20 border border-border/50 px-3 text-xs text-foreground focus:outline-none focus:border-primary/60 font-mono"
              />
              <button
                onClick={saveApiKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className="h-9 px-4 rounded-lg bg-primary text-white text-xs font-semibold shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {savingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Save Key</span>
              </button>
            </div>
          </div>
        )}

        {keyConfigured && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Composio connected — agents can use authenticated app actions via composio_call.</span>
            </div>
            <button
              onClick={removeApiKey}
              className="text-3xs font-semibold text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              Disconnect key
            </button>
          </div>
        )}

        {/* Toolbar: Search + Stats + Link to Plugins */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search 500+ connectors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-card border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary/60"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-ui-xs px-2.5 py-1 rounded-full border border-border bg-card text-foreground-subtle font-medium">
              <span className="font-semibold text-foreground">{toolkits.length}</span> connectors
            </span>
            {connectedCount > 0 && (
              <span className="text-ui-xs px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium">
                <span className="font-semibold">{connectedCount}</span> connected
              </span>
            )}
            <button
              type="button"
              onClick={() => navigateSettings('plugins')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/70 hover:border-border bg-card text-ui-xs font-medium text-foreground-subtle hover:text-foreground transition-colors cursor-pointer"
            >
              <Puzzle className="w-3.5 h-3.5 text-primary" />
              <span>Local Plugins & Catalog</span>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-0.5">
          {[
            { id: 'all', label: 'All Apps' },
            { id: 'workspace', label: 'Google Workspace' },
            { id: 'development', label: 'Dev & Issues' },
            { id: 'productivity', label: 'Productivity & Docs' },
            { id: 'communication', label: 'Chat & Comms' },
            { id: 'design', label: 'Design' },
            { id: 'crm', label: 'CRM & Sales' },
            { id: 'social', label: 'Social & Media' },
          ].map((cat) => {
            const count = cat.id === 'all'
              ? toolkits.length
              : toolkits.filter((t) => t.category === cat.id).length;
            if (count === 0 && cat.id !== 'all') return null;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-ui-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-primary text-white shadow-xs font-semibold'
                    : 'bg-card hover:bg-surface text-muted-foreground hover:text-foreground border border-border/70'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`text-3xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-muted/40 text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Connectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredToolkits.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center space-y-2">
              <Cloud className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-ui-sm font-semibold text-foreground">No connectors found</p>
              <p className="text-ui-xs text-muted-foreground">
                No apps matched "{search}" in this category. Try searching another app or reset filters.
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                }}
                className="mt-2 text-ui-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            filteredToolkits.map((toolkit) => {
              const phase = connectPhase[toolkit.slug] || 'idle';
              const busy = phase === 'connecting' || phase === 'awaiting-oauth';
              return (
                <div
                  key={toolkit.slug}
                  className="rounded-xl bg-card border border-border p-4 flex items-center justify-between transition-all hover:border-border/80 shadow-2xs group"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                    <div className="w-11 h-11 rounded-xl bg-surface/80 border border-border flex items-center justify-center shrink-0 overflow-hidden shadow-2xs p-2 group-hover:scale-105 transition-transform">
                      <ServiceIcon
                        slug={toolkit.slug}
                        name={toolkit.name}
                        logoUrl={toolkit.logoUrl}
                        className="w-6 h-6 shrink-0"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-ui-sm text-foreground truncate">{toolkit.name}</h3>
                        {toolkit.category && (
                          <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground/80 font-mono uppercase tracking-wider shrink-0 hidden sm:inline-block">
                            {toolkit.category === 'workspace' ? 'Google' : toolkit.category}
                          </span>
                        )}
                        {toolkit.connected ? (
                          <span className="inline-flex items-center gap-1 text-3xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </span>
                        ) : phase === 'awaiting-oauth' ? (
                          <span className="inline-flex items-center gap-1 text-3xs text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">
                            <Loader2 className="w-3 h-3 animate-spin" /> Authorizing…
                          </span>
                        ) : phase === 'error' ? (
                          <span className="inline-flex items-center gap-1 text-3xs text-destructive font-medium bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full shrink-0">
                            <XCircle className="w-3 h-3" /> Failed
                          </span>
                        ) : null}
                      </div>
                      <p className="text-ui-xs text-muted-foreground truncate mt-0.5">{toolkit.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => (toolkit.connected ? handleDisconnect(toolkit.slug) : handleConnect(toolkit.slug))}
                    disabled={busy || keyConfigured === false}
                    className={`px-3 py-1.5 rounded-lg text-ui-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer ${
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
            })
          )}
        </div>
      </div>
    </div>
  );
};
