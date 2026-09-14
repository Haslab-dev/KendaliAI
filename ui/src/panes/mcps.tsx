import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Bot, MessageSquare, Plug, Brain, Wrench, Smartphone, Plus, Trash2, CheckCircle,
  RefreshCw, Edit2, Search, Check, CheckSquare, Square, Sparkles, AlertCircle, ChevronDown, ChevronUp, Terminal,
  Database, Eye, EyeOff, FileText, Upload, BookOpen, Key, Copy, ExternalLink
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { navigate } from '../router';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-hi">Model Context Protocol (MCP) Servers</h3>
          <p className="text-xs text-mid">
            Supervised background tools, local CLI subprocesses, or remote Streamable HTTP / SSE endpoints.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleFetchTools()}
            disabled={isFetchingTools}
            className="px-2.5 py-1.5 bg-raised hover:bg-hoverbg border border-line rounded-lg text-xs font-semibold text-hi flex items-center gap-1.5 transition-colors cursor-pointer"
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
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Key size={13} />
            <span>Configure API Keys</span>
          </button>
        </div>
      </div>

      {/* Stats Overview Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-raised border border-line rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-mid font-semibold uppercase tracking-wider">Registered Servers</span>
            <div className="text-xl font-bold text-hi mt-0.5">{mcps.length}</div>
          </div>
          <Plug size={22} className="text-mid" />
        </div>
        <div className="p-3 bg-raised border border-line rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-mid font-semibold uppercase tracking-wider">Active Providers</span>
            <div className="text-xl font-bold text-emerald-500 mt-0.5">{activeCount}</div>
          </div>
          <CheckCircle size={22} className="text-emerald-500" />
        </div>
        <div className="p-3 bg-raised border border-line rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-mid font-semibold uppercase tracking-wider">Total Discovered Tools</span>
            <div className="text-xl font-bold text-blue-500 mt-0.5">{totalTools}</div>
          </div>
          <Wrench size={22} className="text-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              className={`p-4 bg-raised border rounded-xl space-y-2.5 transition-all ${
                isEnabled ? 'border-line' : 'border-line/40 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-hi flex items-center gap-1.5">
                  <Plug size={15} className={isEnabled ? 'text-hi' : 'text-lo'} />
                  <span>{m.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-mid uppercase font-mono">
                    {m.transport || 'stdio'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Enable / Disable Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(m)}
                    className={`text-[10px] px-2 py-0.5 rounded font-sans font-medium transition-colors cursor-pointer flex items-center gap-1 ${
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
                    className="text-lo hover:text-red-400 p-1 transition-colors cursor-pointer"
                    title="Delete MCP Server"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {m.transport === 'http' || m.transport === 'sse' ? (
                <div className="text-xs text-mid font-mono truncate" title={m.url}>
                  <span className="text-lo font-sans">URL: </span>{m.url || 'No URL configured'}
                </div>
              ) : (
                <div className="text-xs text-mid font-mono truncate">
                  {m.command} {(m.args || []).join(' ')}
                </div>
              )}

              {/* Key status and quick configure button */}
              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <div className="flex items-center gap-1.5">
                  {isFc || isEx ? (
                    isConfigured ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                        <Check size={10} /> Key Configured
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                        <AlertCircle size={10} /> Key Required
                      </span>
                    )
                  ) : m.headers && Object.keys(m.headers).length > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                      {Object.keys(m.headers).length} Header{Object.keys(m.headers).length > 1 ? 's' : ''}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFetchTools(m.id)}
                    disabled={isFetchingTools}
                    className="text-[11px] text-mid hover:text-hi font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="Fetch / Refresh tools from this server"
                  >
                    <RefreshCw size={11} className={isFetchingTools ? 'animate-spin' : ''} />
                    <span>{m.toolsCached?.length || 0} tools</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setApiKeyTarget(isFc ? 'firecrawl' : isEx ? 'exa' : 'all');
                      setShowApiKeyModal(true);
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
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
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono"
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
      <div className="border-t border-line pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-blue-500" />
              <h4 className="text-sm font-bold text-hi">
                Discovered MCP Tools ({filteredMcpTools.length}
                {filteredMcpTools.length !== allMcpTools.length ? ` of ${allMcpTools.length}` : ''})
              </h4>
            </div>
            <p className="text-xs text-mid mt-0.5">
              Callable functions exposed by connected Model Context Protocol servers to agents and routines.
            </p>
          </div>

          {/* Quick sync button */}
          <button
            type="button"
            onClick={() => handleFetchTools()}
            disabled={isFetchingTools}
            className="text-xs font-semibold px-2.5 py-1.5 bg-raised hover:bg-hoverbg border border-line rounded-lg text-hi flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-colors"
          >
            <RefreshCw size={12} className={isFetchingTools ? 'animate-spin' : ''} />
            <span>Re-probe Tools</span>
          </button>
        </div>

        {/* Filter bar: Search & Server Badges */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mid" />
            <input
              type="text"
              placeholder="Search tools by name, description, or server..."
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi placeholder-mid outline-none focus:border-hi transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setSelectedServer('all')}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                selectedServer === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-raised text-mid border border-line hover:bg-hoverbg'
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
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                    selectedServer === m.id || selectedServer === m.name
                      ? 'bg-blue-600 text-white'
                      : 'bg-raised text-mid border border-line hover:bg-hoverbg'
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
          <div className="p-8 bg-raised border border-dashed border-line rounded-xl text-center flex flex-col items-center justify-center gap-2">
            <Wrench size={24} className="text-mid" />
            <span className="text-xs font-semibold text-hi">
              {allMcpTools.length === 0
                ? 'No MCP Tools Discovered Yet'
                : 'No MCP tools match your search filter'}
            </span>
            <p className="text-[11px] text-mid max-w-sm">
              {allMcpTools.length === 0
                ? 'Make sure your MCP servers are configured with valid API keys or commands, then click "Sync All Tools".'
                : 'Try clearing the search query or selecting "All Servers".'}
            </p>
            {allMcpTools.length === 0 && (
              <button
                type="button"
                onClick={() => handleFetchTools()}
                disabled={isFetchingTools}
                className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} className={isFetchingTools ? 'animate-spin' : ''} />
                <span>Probe & Discover Tools</span>
              </button>
            )}
          </div>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden divide-y divide-line bg-raised">
            {filteredMcpTools.map((tool) => {
              const isCopied = copiedTool === tool.name;
              return (
                <div
                  key={`${tool.serverId}-${tool.name}`}
                  className="p-3.5 hover:bg-hoverbg/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-500">
                        {tool.name}
                      </span>

                      <button
                        type="button"
                        onClick={() => copyTool(tool.name)}
                        className="p-1 text-lo hover:text-hi transition-colors cursor-pointer"
                        title="Copy tool name"
                      >
                        {isCopied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>

                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-mid uppercase font-mono">
                        {tool.serverName} · {tool.serverTransport}
                      </span>

                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          tool.serverEnabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}
                      >
                        {tool.serverEnabled ? '● Active' : '○ Disabled'}
                      </span>
                    </div>

                    <p className="text-xs text-mid line-clamp-2">
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
                      className="px-2.5 py-1 bg-inputbg hover:bg-line border border-line rounded text-[11px] font-medium text-hi flex items-center gap-1 transition-colors cursor-pointer"
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

      <div className="border-t border-line pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-hi">Register New MCP Server</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="e.g. firecrawl, exa, github"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Transport</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
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
                <label className="text-[11px] font-semibold text-mid uppercase">Endpoint URL</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none font-mono"
                  placeholder="https://mcp.firecrawl.dev/v2/mcp or https://mcp.exa.ai/mcp"
                  value={form.url || ''}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold text-mid uppercase">HTTP Headers (API Key)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    className="w-1/3 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none font-mono"
                    placeholder="Header (e.g. Authorization or x-api-key)"
                    value={headerKey}
                    onChange={(e) => setHeaderKey(e.target.value)}
                  />
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none font-mono"
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
                    className="px-3 py-2 bg-raised border border-line rounded-lg text-xs text-hi font-medium"
                  >
                    Add
                  </button>
                </div>
                {form.headers && Object.keys(form.headers).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(form.headers).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-2.5 py-1 bg-inputbg border border-line rounded text-[11px] font-mono text-mid">
                        <span>{k}: {v.slice(0, 12)}...</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newH = { ...(form.headers || {}) };
                            delete newH[k];
                            setForm({ ...form, headers: newH });
                          }}
                          className="text-red-400 text-xs hover:underline"
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
                <label className="text-[11px] font-semibold text-mid uppercase">Command</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
                  placeholder="npx"
                  value={form.command || ''}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-mid uppercase">Arguments</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
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
          className="px-4 py-2 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold cursor-pointer"
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

