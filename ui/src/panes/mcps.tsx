import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Bot, MessageSquare, Plug, Brain, Wrench, Smartphone, Plus, Trash2, CheckCircle,
  RefreshCw, Edit2, Search, Check, CheckSquare, Square, Sparkles, AlertCircle, ChevronDown, ChevronUp, Terminal,
  Database, Eye, EyeOff, FileText, Upload, BookOpen, Key, Copy, ExternalLink
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { navigate } from '../router';
import { PaneToolbar, PaneToolbarFilters, PaneToolbarActions, StatCard, StatChip } from '../components/settings/settingsPrimitives';
import {
  ProviderConfig, AgentConfig, MCPServerConfig, SkillItem, ToolDefinition, TelegramBotConfig,
  ModelItem, isReasoningModel, EmbeddingConfig, DocumentItem
} from '../types';

// 4. MCP Servers Tab
export const McpsPane: React.FC = () => {
  const [mcps, setMcps] = useState<MCPServerConfig[]>([]);
  const [isFetchingTools, setIsFetchingTools] = useState(false);
  const [form, setForm] = useState<Partial<MCPServerConfig>>({
    name: '',
    transport: 'stdio',
    command: 'npx',
    args: [],
    url: '',
    enabled: true,
  });

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyTarget, setApiKeyTarget] = useState<'firecrawl' | 'exa' | 'all'>('all');
  const [toolSearch, setToolSearch] = useState('');
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  const fetchMCPs = async () => {
    try {
      const res = await fetch('/api/mcps');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMcps(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch MCPs:', err);
    }
  };

  useEffect(() => {
    fetchMCPs();
  }, []);

  const allMcpTools = useMemo(() => {
    const list: {
      name: string;
      description: string;
      serverName: string;
      serverId: string;
      serverTransport: string;
      serverEnabled: boolean;
    }[] = [];
    for (const m of mcps) {
      if (m.toolsCached && Array.isArray(m.toolsCached)) {
        for (const t of m.toolsCached) {
          list.push({
            name: t.name,
            description: t.description,
            serverName: m.name,
            serverId: m.id,
            serverTransport: m.transport || 'stdio',
            serverEnabled: m.enabled !== false,
          });
        }
      }
    }
    return list;
  }, [mcps]);

  const filteredMcpTools = useMemo(() => {
    return allMcpTools.filter((t) => {
      const matchesServer =
        selectedServer === 'all' ||
        t.serverId === selectedServer ||
        t.serverName.toLowerCase() === selectedServer.toLowerCase();
      const q = toolSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.serverName.toLowerCase().includes(q);
      return matchesServer && matchesSearch;
    });
  }, [allMcpTools, selectedServer, toolSearch]);

  const totalTools = useMemo(() => {
    return allMcpTools.length;
  }, [allMcpTools]);

  const activeCount = useMemo(() => {
    return mcps.filter((m) => m.enabled !== false).length;
  }, [mcps]);

  const copyTool = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedTool(name);
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const handleToggle = async (mcp: MCPServerConfig) => {
    const nextState = mcp.enabled === false ? true : false;
    setMcps((prev) =>
      prev.map((m) => (m.id === mcp.id ? { ...m, enabled: nextState } : m))
    );
    try {
      await fetch('/api/mcps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...mcp,
          enabled: nextState,
        }),
      });
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
      fetchMCPs();
    }
  };

  const handleFetchTools = async (id?: string) => {
    setIsFetchingTools(true);
    try {
      const res = await fetch('/api/mcps/fetch-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || '' }),
      });
      if (res.ok) {
        await fetchMCPs();
      }
    } catch (err) {
      console.error('Failed to fetch MCP tools:', err);
    } finally {
      setIsFetchingTools(false);
    }
  };

  const handleSave = async () => {
    if (!form.name) return alert('Name required');
    await fetch('/api/mcps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    alert('MCP Server saved!');
    fetchMCPs();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete MCP server?')) return;
    await fetch(`/api/mcps?id=${id}`, { method: 'DELETE' });
    fetchMCPs();
  };

  const [headerKey, setHeaderKey] = useState('');
  const [headerVal, setHeaderVal] = useState('');

  return (
    <div className="space-y-6">
      <PaneToolbar>
        <PaneToolbarFilters>
          <StatChip label="servers" value={mcps.length} />
          <StatChip label="tools cached" value={allMcpTools.length} tone="primary" />
        </PaneToolbarFilters>
        <PaneToolbarActions>
          <button
            type="button"
            onClick={() => handleFetchTools()}
            disabled={isFetchingTools}
            className="px-2.5 py-1.5 bg-card hover:bg-accent border border-border rounded-lg text-xs font-semibold text-foreground flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            title="Probe and update cached tools for all servers"
          >
            <RefreshCw size={13} className={isFetchingTools ? 'animate-spin' : ''} />
            <span>Sync All Tools</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setApiKeyTarget('all');
              setShowApiKeyModal(true);
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-primary/100 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Key size={13} />
            <span>Configure API Keys</span>
          </button>
        </PaneToolbarActions>
      </PaneToolbar>

      {/* Stats as compact cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Plug} label="Registered servers" value={mcps.length} />
        <StatCard icon={CheckCircle} label="Active" value={activeCount} tone="primary" />
        <StatCard icon={Wrench} label="Discovered tools" value={totalTools} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {mcps.map((m) => {
          const isFc = m.name?.toLowerCase() === 'firecrawl' || m.id?.toLowerCase() === 'firecrawl';
          const isEx = m.name?.toLowerCase() === 'exa' || m.id?.toLowerCase() === 'exa';
          const authH = m.headers ? (m.headers['Authorization'] || m.headers['authorization'] || '') : '';
          const exaH = m.headers ? (m.headers['x-api-key'] || m.headers['X-Api-Key'] || '') : '';
          const isConfigured = isFc
            ? Boolean(authH && !authH.includes('<') && !authH.includes('YOUR_'))
            : isEx
            ? Boolean(exaH && !exaH.includes('<') && !exaH.includes('YOUR_'))
            : Boolean(m.headers && Object.keys(m.headers).length > 0);
          const isEnabled = m.enabled !== false;

          return (
            <div
              key={m.id}
              className={`p-4 bg-card border rounded-xl space-y-2.5 transition-all shadow-2xs ${
                isEnabled ? 'border-border' : 'border-border/40 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                  <Plug size={15} className={isEnabled ? 'text-primary' : 'text-foreground-subtle'} />
                  <span>{m.name}</span>
                  <span className="text-ui-xs px-1.5 py-0.5 rounded bg-surface-muted text-muted-foreground uppercase font-mono border border-border/40">
                    {m.transport || 'stdio'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Enable / Disable Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(m)}
                    className={`text-ui-xs px-2 py-0.5 rounded font-sans font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      isEnabled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                    }`}
                    title={isEnabled ? 'Click to disable' : 'Click to enable'}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                    <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                  </button>

                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-foreground-subtle hover:text-destructive p-1 transition-colors cursor-pointer"
                    title="Delete MCP Server"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {m.transport === 'http' || m.transport === 'sse' ? (
                <div className="text-xs text-muted-foreground font-mono truncate" title={m.url}>
                  <span className="text-foreground-subtle font-sans">URL: </span>{m.url || 'No URL configured'}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground font-mono truncate">
                  {m.command} {(m.args || []).join(' ')}
                </div>
              )}

              {/* Key status and quick configure button */}
              <div className="flex items-center justify-between pt-1 border-t border-border/60">
                <div className="flex items-center gap-1.5">
                  {isFc || isEx ? (
                    isConfigured ? (
                      <span className="text-ui-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                        <Check size={10} /> Key Configured
                      </span>
                    ) : (
                      <span className="text-ui-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                        <AlertCircle size={10} /> Key Required
                      </span>
                    )
                  ) : m.headers && Object.keys(m.headers).length > 0 ? (
                    <span className="text-ui-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">
                      {Object.keys(m.headers).length} Header{Object.keys(m.headers).length > 1 ? 's' : ''}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFetchTools(m.id)}
                    disabled={isFetchingTools}
                    className="text-ui-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="Fetch / Refresh tools from this server"
                  >
                    <RefreshCw size={11} className={isFetchingTools ? 'animate-spin text-primary' : ''} />
                    <span>{m.toolsCached?.length || 0} tools</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setApiKeyTarget(isFc ? 'firecrawl' : isEx ? 'exa' : 'all');
                      setShowApiKeyModal(true);
                    }}
                    className="text-ui-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Key size={11} />
                    <span>Configure Key</span>
                  </button>
                </div>
              </div>

              {m.toolsCached && m.toolsCached.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {m.toolsCached.map((t) => (
                    <span
                      key={t.name}
                      className="text-ui-xs px-1.5 py-0.5 rounded bg-surface-muted text-foreground-subtle border border-border/50 font-mono"
                      title={t.description}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Discovered MCP Tools Section */}
      <div className="border-t border-border/60 pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-primary" />
              <h4 className="text-sm font-bold text-foreground">
                Discovered MCP Tools ({filteredMcpTools.length}
                {filteredMcpTools.length !== allMcpTools.length ? ` of ${allMcpTools.length}` : ''})
              </h4>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Callable functions exposed by connected Model Context Protocol servers to agents and routines.
            </p>
          </div>

          {/* Quick sync button */}
          <button
            type="button"
            onClick={() => handleFetchTools()}
            disabled={isFetchingTools}
            className="text-xs font-semibold px-2.5 py-1.5 bg-card hover:bg-accent border border-border rounded-lg text-foreground flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-colors"
          >
            <RefreshCw size={12} className={isFetchingTools ? 'animate-spin text-primary' : ''} />
            <span>Re-probe Tools</span>
          </button>
        </div>

        {/* Filter bar: Search & Server Badges */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tools by name, description, or server..."
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setSelectedServer('all')}
              className={`text-ui-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                selectedServer === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-card text-muted-foreground border border-border hover:bg-accent'
              }`}
            >
              All Servers ({allMcpTools.length})
            </button>
            {mcps.map((m) => {
              const count = m.toolsCached?.length || 0;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedServer(m.id || m.name)}
                  className={`text-ui-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                    selectedServer === m.id || selectedServer === m.name
                      ? 'bg-primary text-white'
                      : 'bg-card text-muted-foreground border border-border hover:bg-accent'
                  }`}
                >
                  {m.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Tools Listing Table / Cards */}
        {filteredMcpTools.length === 0 ? (
          <div className="p-8 bg-card border border-dashed border-border rounded-xl text-center flex flex-col items-center justify-center gap-2">
            <Wrench size={24} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">
              {allMcpTools.length === 0
                ? 'No MCP Tools Discovered Yet'
                : 'No MCP tools match your search filter'}
            </span>
            <p className="text-ui-xs text-muted-foreground max-w-sm">
              {allMcpTools.length === 0
                ? 'Make sure your MCP servers are configured with valid API keys or commands, then click "Sync All Tools".'
                : 'Try clearing the search query or selecting "All Servers".'}
            </p>
            {allMcpTools.length === 0 && (
              <button
                type="button"
                onClick={() => handleFetchTools()}
                disabled={isFetchingTools}
                className="mt-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RefreshCw size={12} className={isFetchingTools ? 'animate-spin' : ''} />
                <span>Probe & Discover Tools</span>
              </button>
            )}
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden divide-y divide-border/60 bg-card shadow-2xs">
            {filteredMcpTools.map((tool) => {
              const isCopied = copiedTool === tool.name;
              return (
                <div
                  key={`${tool.serverId}-${tool.name}`}
                  className="p-3.5 hover:bg-accent/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-primary">
                        {tool.name}
                      </span>

                      <button
                        type="button"
                        onClick={() => copyTool(tool.name)}
                        className="p-1 text-foreground-subtle hover:text-foreground transition-colors cursor-pointer"
                        title="Copy tool name"
                      >
                        {isCopied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>

                      <span className="text-ui-xs px-1.5 py-0.5 rounded bg-surface-muted text-muted-foreground uppercase font-mono border border-border/40">
                        {tool.serverName} · {tool.serverTransport}
                      </span>

                      <span
                        className={`text-ui-xs px-1.5 py-0.5 rounded font-mono ${
                          tool.serverEnabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}
                      >
                        {tool.serverEnabled ? '● Active' : '○ Disabled'}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {tool.description || 'No description provided by MCP schema.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        copyTool(tool.name);
                        navigate('chat');
                      }}
                      className="px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border rounded text-ui-xs font-medium text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                      title="Copy tool name and open Chat"
                    >
                      <ExternalLink size={11} />
                      <span>Use in Chat</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Register New MCP Server</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-ui-xs font-semibold text-muted-foreground uppercase">Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none focus:border-primary"
              placeholder="e.g. firecrawl, exa, github"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-ui-xs font-semibold text-muted-foreground uppercase">Transport</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none focus:border-primary cursor-pointer"
              value={form.transport || 'stdio'}
              onChange={(e) => setForm({ ...form, transport: e.target.value as any })}
            >
              <option value="http">HTTP / Streamable (Firecrawl, Exa)</option>
              <option value="sse">SSE (Remote Endpoint)</option>
              <option value="stdio">Stdio (Local CLI / Subprocess)</option>
            </select>
          </div>

          {form.transport === 'http' || form.transport === 'sse' ? (
            <>
              <div className="sm:col-span-2">
                <label className="text-ui-xs font-semibold text-muted-foreground uppercase">Endpoint URL</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none font-mono focus:border-primary"
                  placeholder="https://mcp.firecrawl.dev/v2/mcp or https://mcp.exa.ai/mcp"
                  value={form.url || ''}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-ui-xs font-semibold text-muted-foreground uppercase">HTTP Headers (API Key)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    className="w-1/3 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none font-mono focus:border-primary"
                    placeholder="Header (e.g. Authorization or x-api-key)"
                    value={headerKey}
                    onChange={(e) => setHeaderKey(e.target.value)}
                  />
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none font-mono focus:border-primary"
                    placeholder="Value (e.g. Bearer fc-xxx or exa-xxx)"
                    value={headerVal}
                    onChange={(e) => setHeaderVal(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!headerKey) return;
                      setForm({
                        ...form,
                        headers: { ...(form.headers || {}), [headerKey]: headerVal },
                      });
                      setHeaderKey('');
                      setHeaderVal('');
                    }}
                    className="px-3 py-2 bg-card hover:bg-accent border border-border rounded-lg text-xs text-foreground font-medium transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {form.headers && Object.keys(form.headers).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(form.headers).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-2.5 py-1 bg-surface-muted border border-border rounded text-ui-xs font-mono text-muted-foreground">
                        <span>{k}: {v.slice(0, 12)}...</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newH = { ...(form.headers || {}) };
                            delete newH[k];
                            setForm({ ...form, headers: newH });
                          }}
                          className="text-destructive text-xs hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-ui-xs font-semibold text-muted-foreground uppercase">Command</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none focus:border-primary"
                  placeholder="npx"
                  value={form.command || ''}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                />
              </div>
              <div>
                <label className="text-ui-xs font-semibold text-muted-foreground uppercase">Arguments</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-xs text-foreground outline-none focus:border-primary"
                  placeholder="-y @modelcontextprotocol/server-github"
                  value={(form.args || []).join(' ')}
                  onChange={(e) =>
                    setForm({ ...form, args: e.target.value.split(' ').filter(Boolean) })
                  }
                />
              </div>
            </>
          )}
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          Save MCP Server
        </button>
      </div>

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSuccess={fetchMCPs}
        targetService={apiKeyTarget}
      />
    </div>
  );
};

