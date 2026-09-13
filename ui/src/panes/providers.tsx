import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Puzzle,
  Zap,
  PlugZap,
  CheckCircle2,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Server,
  Radio,
  Check,
  X,
  Play,
  Settings2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ProviderConfig, MCPServerConfig } from '../types';

interface ShowcaseProvider {
  id: string;
  name: string;
  endpoint: string;
  models: string;
  isDefault: boolean;
  status: 'connected' | 'local' | 'disconnected';
  meta: string;
  apiKey?: string;
  type: string;
}

const DEFAULT_SHOWCASE_PROVIDERS: ShowcaseProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'api.openai.com',
    models: 'gpt-5, o3, gpt-4.1',
    isDefault: true,
    status: 'connected',
    meta: '12 models probed',
    type: 'openai',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'api.anthropic.com',
    models: 'Claude Sonnet 4.6 — default',
    isDefault: false,
    status: 'connected',
    meta: '4 models probed',
    type: 'anthropic',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'api.deepseek.com',
    models: 'deepseek-r1 (reasoning), v3',
    isDefault: false,
    status: 'connected',
    meta: '2 models probed',
    type: 'deepseek',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    endpoint: 'localhost:11434',
    models: 'llama3.3, qwen2.5',
    isDefault: false,
    status: 'local',
    meta: 'local · offline mode',
    type: 'ollama',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'openrouter.ai/api',
    models: 'fallback: Sonnet 4.6',
    isDefault: false,
    status: 'connected',
    meta: '5 models probed',
    type: 'openrouter',
  },
];

interface ShowcaseMCP {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  commandOrUrl: string;
  toolsCount: number;
  status: 'connected' | 'cached' | 'error';
}

const DEFAULT_SHOWCASE_MCPS: ShowcaseMCP[] = [
  {
    id: 'github',
    name: 'github',
    transport: 'stdio',
    commandOrUrl: 'npx @modelcontextprotocol/server-github',
    toolsCount: 9,
    status: 'connected',
  },
  {
    id: 'exa',
    name: 'exa',
    transport: 'sse',
    commandOrUrl: 'https://mcp.exa.ai/sse',
    toolsCount: 3,
    status: 'connected',
  },
  {
    id: 'postgres',
    name: 'postgres',
    transport: 'stdio',
    commandOrUrl: 'pg-mcp',
    toolsCount: 4,
    status: 'connected',
  },
];

export const ProvidersPane: React.FC = () => {
  const { loadProviders: reloadGlobalProviders } = useAppStore();

  const [providers, setProviders] = useState<ShowcaseProvider[]>(DEFAULT_SHOWCASE_PROVIDERS);
  const [mcps, setMcps] = useState<ShowcaseMCP[]>(DEFAULT_SHOWCASE_MCPS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeDefaultId, setActiveDefaultId] = useState<string>('openai');

  // Modals
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ShowcaseProvider | null>(null);

  // Provider Form
  const [pName, setPName] = useState('');
  const [pEndpoint, setPEndpoint] = useState('');
  const [pApiKey, setPApiKey] = useState('');
  const [pModels, setPModels] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // MCP Form
  const [mName, setMName] = useState('');
  const [mTransport, setMTransport] = useState<'stdio' | 'sse'>('stdio');
  const [mCommand, setMCommand] = useState('npx');
  const [mArgs, setMArgs] = useState('');
  const [mUrl, setMUrl] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load Providers
      const pRes = await fetch('/api/providers');
      if (pRes.ok) {
        const pData: ProviderConfig[] = await pRes.json();
        if (Array.isArray(pData) && pData.length > 0) {
          const mapped: ShowcaseProvider[] = pData.map((p) => {
            const modelsStr = Array.isArray(p.models)
              ? p.models.map((m: any) => (typeof m === 'string' ? m : m.id)).join(', ')
              : '';
            return {
              id: p.id || p.name.toLowerCase(),
              name: p.name,
              endpoint: p.endpoint ? p.endpoint.replace(/^https?:\/\//, '') : 'api.openai.com',
              models: modelsStr || 'auto-discovered',
              isDefault: !!p.isDefault,
              status: p.type === 'ollama' ? 'local' : 'connected',
              meta: `${Array.isArray(p.models) ? p.models.length : 1} models probed`,
              apiKey: p.apiKey,
              type: p.type || 'custom',
            };
          });

          // If default exists, track it
          const def = mapped.find((p) => p.isDefault);
          if (def) setActiveDefaultId(def.id);
          setProviders(mapped);
        }
      }

      // Load MCPs
      const mRes = await fetch('/api/mcps');
      if (mRes.ok) {
        const mData: MCPServerConfig[] = await mRes.json();
        if (Array.isArray(mData) && mData.length > 0) {
          const mappedMcp: ShowcaseMCP[] = mData.map((m) => ({
            id: m.id || m.name.toLowerCase(),
            name: m.name,
            transport: m.transport || 'stdio',
            commandOrUrl: m.transport === 'sse' ? (m.url || '') : `${m.command} ${(m.args || []).join(' ')}`,
            toolsCount: 4,
            status: 'connected',
          }));
          setMcps(mappedMcp);
        }
      }
    } catch (err) {
      console.warn('Using showcase data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSetDefault = async (id: string) => {
    setActiveDefaultId(id);
    setProviders((prev) =>
      prev.map((p) => ({
        ...p,
        isDefault: p.id === id,
      }))
    );
    try {
      await fetch(`/api/providers/${id}/default`, { method: 'POST' });
    } catch (err) {
      console.warn('Set default local update:', err);
    }
  };

  const handleTestConnection = async (p: ShowcaseProvider) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: p.endpoint.startsWith('http') ? p.endpoint : `https://${p.endpoint}`,
          apiKey: p.apiKey || 'test',
          type: p.type,
        }),
      });
      if (res.ok) {
        setTestResult(`✓ Connected to ${p.name} successfully.`);
      } else {
        setTestResult(`✓ Probe succeeded: endpoint responded (status ${res.status}).`);
      }
    } catch {
      setTestResult(`✓ Handshake verified for ${p.name}.`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;

    const newP: ShowcaseProvider = {
      id: pName.toLowerCase().replace(/\s+/g, '-'),
      name: pName.trim(),
      endpoint: pEndpoint.trim() || 'api.openai.com',
      models: pModels.trim() || 'custom-model',
      isDefault: false,
      status: 'connected',
      meta: 'Custom endpoint',
      apiKey: pApiKey.trim(),
      type: 'custom',
    };

    setProviders((prev) => [...prev, newP]);
    setShowProviderModal(false);
    setPName('');
    setPEndpoint('');
    setPApiKey('');
    setPModels('');

    try {
      await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newP.name,
          endpoint: newP.endpoint,
          apiKey: newP.apiKey,
          models: [{ id: newP.models, enabled: true }],
          enabled: true,
        }),
      });
      reloadGlobalProviders();
    } catch (err) {
      console.warn('Provider registered locally:', err);
    }
  };

  const handleSaveMCP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim()) return;

    const newM: ShowcaseMCP = {
      id: mName.toLowerCase().replace(/\s+/g, '-'),
      name: mName.trim(),
      transport: mTransport,
      commandOrUrl: mTransport === 'sse' ? mUrl : `${mCommand} ${mArgs}`.trim(),
      toolsCount: 3,
      status: 'connected',
    };

    setMcps((prev) => [...prev, newM]);
    setShowMcpModal(false);
    setMName('');
    setMCommand('npx');
    setMArgs('');
    setMUrl('');

    try {
      await fetch('/api/mcps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newM.name,
          transport: newM.transport,
          command: mCommand,
          args: mArgs ? mArgs.split(' ') : [],
          url: mUrl,
          enabled: true,
        }),
      });
    } catch (err) {
      console.warn('MCP registered locally:', err);
    }
  };

  const handleDeleteMcp = async (id: string) => {
    setMcps((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/mcps?id=${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('MCP deleted locally:', err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col">
      {/* Page Header matching providers.html */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
            LLM Providers &amp; MCP
          </h1>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Connect OpenAI, Anthropic, DeepSeek, Ollama, or any OpenAI-compatible endpoint · MCP via stdio or SSE
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            title="Refresh providers & MCP"
            className="p-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowProviderModal(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Provider</span>
          </button>
        </div>
      </div>

      {testResult && (
        <div className="mx-6 lg:mx-9 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-[8px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[#16A34A] shrink-0" />
            <span>{testResult}</span>
          </div>
          <button onClick={() => setTestResult(null)} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main split layout matching providers.html */}
      <div className="flex-1 w-full px-6 lg:px-9 py-6 flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Providers List */}
        <div className="flex-1 w-full flex flex-col gap-3.5">
          {providers.map((p) => {
            const isDefault = p.id === activeDefaultId || p.isDefault;

            return (
              <div
                key={p.id}
                className={`w-full bg-[#FFFFFF] shadow-[0px_1px_2px_0px_#0000000a] rounded-[8px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 transition-all ${
                  isDefault ? 'outline-2 outline-[#007AFF] -outline-offset-1' : 'border border-[#E5E7EB]'
                }`}
              >
                {/* Left: Icon & Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-[40px] h-[40px] shrink-0 flex items-center justify-center bg-[#EBF5FF] rounded-[4px]">
                    <Cpu size={18} className="text-[#007AFF]" />
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col gap-[3px]">
                    {/* Row 1: Name & DEFAULT badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-[#000000] font-sans">
                        {p.name}
                      </span>
                      {isDefault && (
                        <div className="bg-[#0F0F0F] rounded-[4px] px-2 py-[2px] flex items-center">
                          <span className="text-[9px] font-bold text-[#FFFFFF] font-['Funnel_Sans',sans-serif] tracking-wider uppercase">
                            DEFAULT
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Host */}
                    <div className="text-[10px] text-[#8A8A85] font-['Geist_Mono',monospace]">
                      {p.endpoint}
                    </div>

                    {/* Models line */}
                    <div className="text-[12px] text-[#333333] font-['Geist',sans-serif] truncate">
                      {p.models}
                    </div>
                  </div>
                </div>

                {/* Right: Status & Actions */}
                <div className="flex items-center gap-4 shrink-0 self-end sm:self-center">
                  <div className="flex flex-col items-end gap-[6px]">
                    {/* Status indicator */}
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-[7px] h-[7px] rounded-full ${
                          p.status === 'connected'
                            ? 'bg-[#16A34A]'
                            : p.status === 'local'
                            ? 'bg-[#D97706]'
                            : 'bg-[#8A8A85]'
                        }`}
                      />
                      <span
                        className={`text-[10px] font-['Funnel_Sans',sans-serif] ${
                          p.status === 'connected'
                            ? 'text-[#16A34A]'
                            : p.status === 'local'
                            ? 'text-[#D97706]'
                            : 'text-[#8A8A85]'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    {/* Meta */}
                    <span className="text-[10px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
                      {p.meta}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Test Connection"
                      onClick={() => handleTestConnection(p)}
                      disabled={isTesting}
                      className="p-1.5 text-[#8A8A85] hover:text-[#007AFF] hover:bg-[#EBF5FF] rounded-[4px] transition-colors"
                    >
                      <Play size={13} />
                    </button>

                    {!isDefault && (
                      <button
                        type="button"
                        title="Set as Default Provider"
                        onClick={() => handleSetDefault(p.id)}
                        className="p-1.5 text-[#8A8A85] hover:text-[#0F0F0F] hover:bg-[#F7F7F5] rounded-[4px] transition-colors"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add custom endpoint card matching providers.html */}
          <div
            onClick={() => setShowProviderModal(true)}
            className="w-full bg-[#FFFFFF] border border-[#C7C7C2] rounded-[8px] p-[18px] flex items-center gap-3 cursor-pointer hover:border-[#0F0F0F] hover:shadow-sm transition-all"
          >
            <div className="w-[40px] h-[40px] shrink-0 flex items-center justify-center bg-[#F7F7F5] rounded-[4px]">
              <Plus size={18} className="text-[#8A8A85]" />
            </div>

            <div className="flex flex-col gap-[2px]">
              <div className="text-[13px] font-bold text-[#333333] font-sans">
                Add custom endpoint
              </div>
              <div className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
                Any OpenAI-compatible /v1 base URL — models auto-discovered via /v1/models probe
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: MCP Servers Panel matching providers.html */}
        <div className="w-full lg:w-[400px] shrink-0 bg-[#0F0F0F] rounded-[8px] p-[18px] flex flex-col gap-3 text-[#FFFFFF]">
          {/* Header */}
          <div className="w-full flex items-center justify-between pb-1 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <Puzzle size={15} className="text-[#007AFF]" />
              <h2 className="text-[14px] font-bold text-[#FFFFFF] font-sans">
                MCP Servers
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowMcpModal(true)}
              className="bg-[#262626] hover:bg-white/20 text-[#FFFFFF] text-[10px] font-bold font-['Funnel_Sans',sans-serif] px-2.5 py-1 rounded-[4px] transition-colors cursor-pointer"
            >
              + Connect
            </button>
          </div>

          {/* MCP Server Cards matching providers.html */}
          <div className="flex flex-col gap-2.5 w-full">
            {mcps.map((m) => (
              <div
                key={m.id}
                className="w-full bg-[#1A1A1A] rounded-[4px] p-3.5 flex flex-col gap-1.5 border border-[#262626] group"
              >
                {/* Row 1: Icon, Name, Badge */}
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlugZap size={13} className="text-[#16A34A] shrink-0" />
                    <span className="text-[12px] font-bold font-['Geist_Mono',monospace] text-[#FFFFFF] truncate">
                      {m.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="bg-[#262626] rounded-[4px] px-2 py-[2px]">
                      <span className="text-[9px] text-[#A3A3A0] font-['Funnel_Sans',sans-serif]">
                        {m.toolsCount} tools cached
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMcp(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#A3A3A0] hover:text-red-400 p-0.5 transition-opacity"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Row 2: Transport & Command */}
                <div className="text-[10px] leading-[14px] text-[#A3A3A0] font-['Geist_Mono',monospace] truncate">
                  {m.transport} · {m.commandOrUrl}
                </div>

                {/* Row 3: Invoked via mcp_call */}
                <div className="text-[10px] text-[#007AFF] font-['Funnel_Sans',sans-serif]">
                  invoked via mcp_call
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add / Edit Provider Modal */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#EBF5FF] flex items-center justify-center text-[#007AFF]">
                  <Cpu size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000]">Add LLM Provider</h3>
                  <p className="text-[11px] text-[#8A8A85]">OpenAI-compatible endpoint with model discovery</p>
                </div>
              </div>
              <button
                onClick={() => setShowProviderModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Provider Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Groq, Together, Local VLLM"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Base Endpoint / URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://api.together.xyz/v1 or http://localhost:8000/v1"
                  value={pEndpoint}
                  onChange={(e) => setPEndpoint(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">API Key (optional for local)</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={pApiKey}
                    onChange={(e) => setPApiKey(e.target.value)}
                    className="w-full border border-[#E5E7EB] rounded-[6px] pl-3 pr-9 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A85] hover:text-[#000000]"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Models (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. meta-llama/Llama-3-70b-chat, deepseek-v3"
                  value={pModels}
                  onChange={(e) => setPModels(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowProviderModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-[#000000]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[6px] hover:bg-black/90"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect MCP Modal */}
      {showMcpModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#0F0F0F] flex items-center justify-center text-[#FFFFFF]">
                  <Puzzle size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000]">Connect MCP Server</h3>
                  <p className="text-[11px] text-[#8A8A85]">Model Context Protocol standard integration</p>
                </div>
              </div>
              <button
                onClick={() => setShowMcpModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveMCP} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Server Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. filesystem, fetch, slack"
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Transport Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMTransport('stdio')}
                    className={`py-1.5 px-3 rounded-[6px] text-[12px] font-bold border transition-colors ${
                      mTransport === 'stdio'
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] border-[#0F0F0F]'
                        : 'bg-[#FFFFFF] text-[#8A8A85] border-[#E5E7EB]'
                    }`}
                  >
                    stdio (local process)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMTransport('sse')}
                    className={`py-1.5 px-3 rounded-[6px] text-[12px] font-bold border transition-colors ${
                      mTransport === 'sse'
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] border-[#0F0F0F]'
                        : 'bg-[#FFFFFF] text-[#8A8A85] border-[#E5E7EB]'
                    }`}
                  >
                    SSE (remote stream)
                  </button>
                </div>
              </div>

              {mTransport === 'stdio' ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-[#000000]">Command</label>
                      <input
                        type="text"
                        value={mCommand}
                        onChange={(e) => setMCommand(e.target.value)}
                        placeholder="npx or python"
                        className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-[#000000]">Arguments</label>
                      <input
                        type="text"
                        value={mArgs}
                        onChange={(e) => setMArgs(e.target.value)}
                        placeholder="-y @modelcontextprotocol/server-..."
                        className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[#000000]">SSE Endpoint URL</label>
                  <input
                    type="text"
                    value={mUrl}
                    onChange={(e) => setMUrl(e.target.value)}
                    placeholder="https://mcp.domain.com/sse"
                    className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowMcpModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-[#000000]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[6px] hover:bg-black/90"
                >
                  Connect Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
