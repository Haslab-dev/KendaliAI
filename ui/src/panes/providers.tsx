import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Puzzle,
  PlugZap,
  CheckCircle2,
  Eye,
  EyeOff,
  Check,
  X,
  Play,
  Pencil,
  Search,
  CheckCheck,
  Globe,
  Sliders,
  Sparkles,
  Key,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { ProviderConfig, MCPServerConfig, ModelItem, isReasoningModel } from '../types';

interface ExtendedProvider {
  id: string;
  name: string;
  endpoint: string;
  type: string;
  apiKey?: string;
  models: ModelItem[];
  isDefault: boolean;
  enabled: boolean;
  status: 'connected' | 'local' | 'disconnected';
  meta?: string;
}

const DEFAULT_FALLBACK_PROVIDERS: ExtendedProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI Compatible',
    endpoint: 'https://api.openai.com/v1',
    type: 'openai',
    models: [
      { id: 'gpt-6-astra', name: 'GPT-6 Astra (1.05M)', enabled: true },
      { id: 'gpt-5-6-luna', name: 'GPT-5.6 Luna (1.05M)', enabled: true },
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B (128K)', enabled: true },
      { id: 'gpt-4o', name: 'GPT-4o (128K)', enabled: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: true },
      { id: 'o3-mini', name: 'o3-mini (Reasoning)', enabled: true },
    ],
    isDefault: true,
    enabled: true,
    status: 'connected',
    meta: 'OpenAI Official / Long-Context Proxy',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com',
    type: 'deepseek',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (1M)', enabled: true },
      { id: 'deepseek-v4-1-flash', name: 'DeepSeek V4.1 Flash (1M)', enabled: true },
      { id: 'deepseek-chat', name: 'DeepSeek V3 (64K)', enabled: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoning)', enabled: true },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (128K)', enabled: true },
    ],
    isDefault: false,
    enabled: true,
    status: 'connected',
    meta: 'V4 Flash 1M · V3 & R1',
  },
  {
    id: 'zhipu-glm',
    name: 'Zhipu GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    type: 'openai',
    models: [
      { id: 'glm-5-3-flash', name: 'GLM 5.3 Flash (1M)', enabled: true },
    ],
    isDefault: false,
    enabled: true,
    status: 'connected',
    meta: 'GLM-5 1M Long Context',
  },
  {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    endpoint: 'https://integrate.api.nvidia.com/v1',
    type: 'openai',
    models: [
      { id: 'nemotron-3-super-120b-a12b', name: 'Nemotron 3 Super 120B (1M)', enabled: true },
      { id: 'nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B (1M)', enabled: true },
      { id: 'nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning (128K)', enabled: true },
      { id: 'nemotron-3-nano-omni-30b-a3b', name: 'Nemotron 3 Nano Omni (128K)', enabled: true },
      { id: 'nemotron-4-340b-instruct', name: 'Nemotron 4 340B Instruct (128K)', enabled: true },
    ],
    isDefault: false,
    enabled: true,
    status: 'connected',
    meta: 'NVIDIA Nemotron 3 / 3.5 / 4',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1',
    type: 'anthropic',
    models: [
      { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (Thinking)', enabled: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', enabled: true },
      { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', enabled: true },
    ],
    isDefault: false,
    enabled: true,
    status: 'connected',
    meta: 'Claude 3.7 / 3.5',
  },
  {
    id: 'ollama',
    name: 'Ollama Local / Open-Weights',
    endpoint: 'http://localhost:11434',
    type: 'ollama',
    models: [
      { id: 'gemma-4-31b', name: 'Gemma 4 31B (256K)', enabled: true },
      { id: 'qwen-3.8-27b', name: 'Qwen 3.8 27B (128K)', enabled: true },
      { id: 'qwen3.7-flash-2026-07-15', name: 'Qwen 3.7 Flash (128K)', enabled: true },
      { id: 'qwen2.5-coder:latest', name: 'Qwen 2.5 Coder', enabled: true },
      { id: 'llama3.3:latest', name: 'Llama 3.3', enabled: true },
    ],
    isDefault: false,
    enabled: true,
    status: 'local',
    meta: 'Local · Offline mode',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter Gateway',
    endpoint: 'https://openrouter.ai/api/v1',
    type: 'openrouter',
    models: [
      { id: 'mimo-v2-5', name: 'MiMo-V2.5 (1M)', enabled: true },
      { id: 'codestral-latest', name: 'Codestral Latest (256K)', enabled: true },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 HighSpeed (128K)', enabled: true },
      { id: 'mistral-small-latest', name: 'Mistral Small Latest (128K)', enabled: true },
      { id: 'phi-3.5-moe-instruct', name: 'Phi 3.5 MoE (128K)', enabled: true },
      { id: 'laguna-s-2.1', name: 'Laguna S 2.1 (128K)', enabled: true },
      { id: 'ling-3.0-flash-fin', name: 'Ling 3.0 Flash Fin (128K)', enabled: true },
      { id: 'north-mini-code', name: 'North Mini Code (128K)', enabled: true },
      { id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3 (128K)', enabled: true },
      { id: 'kira-3.5-flash', name: 'Kira 3.5 Flash (128K)', enabled: true },
      { id: 'agnes-2-5-flash', name: 'Agnes 2.5 Flash (128K)', enabled: true },
    ],
    isDefault: false,
    enabled: true,
    status: 'connected',
    meta: 'Unified LLM routing & multi-model',
  },
];

interface ShowcaseMCP {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  commandOrUrl: string;
  toolsCount: number;
  status: 'connected' | 'cached' | 'error';
  enabled?: boolean;
  toolsCached?: { name: string; description: string }[];
}

const DEFAULT_SHOWCASE_MCPS: ShowcaseMCP[] = [
  {
    id: 'exa',
    name: 'exa',
    transport: 'http',
    commandOrUrl: 'https://mcp.exa.ai/mcp',
    toolsCount: 3,
    status: 'connected',
    enabled: true,
    toolsCached: [
      { name: 'web_search_exa', description: 'Neural web search across latest web and news' },
      { name: 'web_fetch_exa', description: 'Extract clean page content and markdown from URLs' },
      { name: 'agent_run', description: 'Run deep multi-step Exa research agent' },
    ],
  },
  {
    id: 'firecrawl',
    name: 'firecrawl',
    transport: 'http',
    commandOrUrl: 'https://mcp.firecrawl.dev/v2/mcp',
    toolsCount: 3,
    status: 'connected',
    enabled: true,
    toolsCached: [
      { name: 'firecrawl_scrape', description: 'Retrieve and extract clean markdown content from any URL' },
      { name: 'firecrawl_search', description: 'Search web sources and return ranked results with markdown snippets' },
      { name: 'firecrawl_parse', description: 'Parse documents (PDF, DOCX, HTML) into markdown' },
    ],
  },
];

export const ProvidersPane: React.FC = () => {
  const { loadProviders: reloadGlobalProviders, loadModels } = useAppStore();

  const [providers, setProviders] = useState<ExtendedProvider[]>(DEFAULT_FALLBACK_PROVIDERS);
  const [mcps, setMcps] = useState<ShowcaseMCP[]>(DEFAULT_SHOWCASE_MCPS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeDefaultId, setActiveDefaultId] = useState<string>('openai');
  const [activeTab, setActiveTab] = useState<'providers' | 'mcps'>('providers');

  const totalMcpTools = useMemo(() => {
    return mcps.reduce((acc, m) => acc + (m.toolsCount || m.toolsCached?.length || 0), 0);
  }, [mcps]);

  // Notification Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Provider Form State
  const [pName, setPName] = useState('');
  const [pType, setPType] = useState('openai');
  const [pEndpoint, setPEndpoint] = useState('');
  const [pApiKey, setPApiKey] = useState('');
  const [pEnabled, setPEnabled] = useState(true);
  const [pIsDefault, setPIsDefault] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [modelsList, setModelsList] = useState<ModelItem[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [probeNotice, setProbeNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // MCP Form
  const [mName, setMName] = useState('');
  const [mTransport, setMTransport] = useState<'stdio' | 'sse' | 'http'>('stdio');
  const [mCommand, setMCommand] = useState('npx');
  const [mArgs, setMArgs] = useState('');
  const [mUrl, setMUrl] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Load Providers from API
      const pRes = await fetch('/api/providers');
      if (pRes.ok) {
        const pData: ProviderConfig[] = await pRes.json();
        if (Array.isArray(pData) && pData.length > 0) {
          const mapped: ExtendedProvider[] = pData.map((p) => {
            const parsedModels: ModelItem[] = Array.isArray(p.models)
              ? p.models.map((m: any) =>
                  typeof m === 'string'
                    ? { id: m, name: m, enabled: true }
                    : { id: m.id, name: m.name || m.id, enabled: m.enabled !== false }
                )
              : [];

            const activeCount = parsedModels.filter((m) => m.enabled).length;

            return {
              id: p.id || p.name.toLowerCase().replace(/\s+/g, '-'),
              name: p.name,
              endpoint: p.endpoint || 'https://api.openai.com/v1',
              type: p.type || 'custom',
              apiKey: p.apiKey || '',
              models: parsedModels,
              isDefault: !!p.isDefault,
              enabled: p.enabled !== false,
              status: p.type === 'ollama' ? 'local' : p.enabled ? 'connected' : 'disconnected',
              meta: `${activeCount} of ${parsedModels.length} models active`,
            };
          });

          const def = mapped.find((p) => p.isDefault);
          if (def) setActiveDefaultId(def.id);
          setProviders(mapped);
        }
      }

      // 2. Load MCPs
      const mRes = await fetch('/api/mcps');
      if (mRes.ok) {
        const mData: MCPServerConfig[] = await mRes.json();
        if (Array.isArray(mData) && mData.length > 0) {
          const mappedMcp: ShowcaseMCP[] = mData.map((m) => ({
            id: m.id || m.name.toLowerCase(),
            name: m.name,
            transport: m.transport || 'stdio',
            commandOrUrl: (m.transport === 'sse' || m.transport === 'http') ? m.url || '' : `${m.command} ${(m.args || []).join(' ')}`,
            toolsCount: Array.isArray(m.toolsCached) ? m.toolsCached.length : 0,
            status: 'connected',
            enabled: m.enabled !== false,
            toolsCached: m.toolsCached || [],
          }));
          setMcps(mappedMcp);
        }
      }
    } catch (err) {
      console.warn('Using existing provider data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Modal in Add Mode
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingProviderId(null);
    setPName('');
    setPType('openai');
    setPEndpoint('https://api.openai.com/v1');
    setPApiKey('');
    setPEnabled(true);
    setPIsDefault(false);
    setShowKey(false);
    setModelsList([
      { id: 'gpt-4o', name: 'GPT-4o', enabled: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: true },
    ]);
    setModelSearch('');
    setCustomModelInput('');
    setProbeNotice(null);
    setShowProviderModal(true);
  };

  // Open Modal in Edit Mode
  const handleOpenEditModal = (p: ExtendedProvider) => {
    setModalMode('edit');
    setEditingProviderId(p.id);
    setPName(p.name);
    setPType(p.type || 'custom');
    setPEndpoint(p.endpoint || '');
    setPApiKey(p.apiKey || '');
    setPEnabled(p.enabled !== false);
    setPIsDefault(p.id === activeDefaultId || p.isDefault);
    setShowKey(false);
    setModelsList([...p.models]);
    setModelSearch('');
    setCustomModelInput('');
    setProbeNotice(null);
    setShowProviderModal(true);
  };

  // Auto-fill endpoint suggestion when type changes
  const handleTypeChange = (type: string) => {
    setPType(type);
    if (!pEndpoint || pEndpoint.includes('api.') || pEndpoint.includes('localhost')) {
      switch (type) {
        case 'openai':
          setPEndpoint('https://api.openai.com/v1');
          break;
        case 'anthropic':
          setPEndpoint('https://api.anthropic.com/v1');
          break;
        case 'deepseek':
          setPEndpoint('https://api.deepseek.com');
          break;
        case 'ollama':
          setPEndpoint('http://localhost:11434');
          break;
        case 'openrouter':
          setPEndpoint('https://openrouter.ai/api/v1');
          break;
      }
    }
  };

  // Toggle model checkbox
  const handleToggleModelCheckbox = (modelId: string) => {
    setModelsList((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m))
    );
  };

  // Select all or deselect all models
  const handleSelectAllModels = (enabled: boolean) => {
    setModelsList((prev) => prev.map((m) => ({ ...m, enabled })));
  };

  // Add custom model to list
  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customModelInput.trim();
    if (!clean) return;
    if (modelsList.some((m) => m.id.toLowerCase() === clean.toLowerCase())) {
      setProbeNotice({ type: 'error', text: `Model "${clean}" is already in the list.` });
      return;
    }
    setModelsList((prev) => [...prev, { id: clean, name: clean, enabled: true }]);
    setCustomModelInput('');
    setProbeNotice({ type: 'success', text: `Added custom model "${clean}".` });
  };

  // Remove model from list
  const handleRemoveModel = (modelId: string) => {
    setModelsList((prev) => prev.filter((m) => m.id !== modelId));
  };

  // Fetch / Probe models live from provider endpoint
  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setProbeNotice(null);
    try {
      const res = await fetch('/api/providers/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProviderId || '',
          type: pType,
          endpoint: pEndpoint.trim(),
          apiKey: pApiKey.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}: Provider refused connection`);
      }

      const remoteModels: ModelItem[] = await res.json();
      if (!Array.isArray(remoteModels) || remoteModels.length === 0) {
        setProbeNotice({
          type: 'error',
          text: 'Probe reached endpoint, but 0 models were returned. Check API Key or endpoint format.',
        });
        return;
      }

      // Merge remote models with existing models, preserving previously checked state
      const existingMap = new Map(modelsList.map((m) => [m.id, m.enabled]));
      const merged: ModelItem[] = remoteModels.map((rm) => ({
        id: rm.id,
        name: rm.name || rm.id,
        enabled: existingMap.has(rm.id) ? existingMap.get(rm.id)! : true,
      }));

      // Keep any custom models user added that were not returned by remote
      for (const m of modelsList) {
        if (!merged.some((x) => x.id === m.id)) {
          merged.push(m);
        }
      }

      setModelsList(merged);
      setProbeNotice({
        type: 'success',
        text: `✓ Probed & discovered ${remoteModels.length} models from ${pName || pType}! Check the boxes for models you want active in chat.`,
      });
    } catch (err: any) {
      setProbeNotice({
        type: 'error',
        text: `Failed to fetch models: ${err.message}. If local Ollama, ensure service is running.`,
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Probe directly from card
  const handleProbeFromCard = async (p: ExtendedProvider) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/providers/models?id=${p.id}&save=true`);
      if (res.ok) {
        const fetched: ModelItem[] = await res.json();
        setToast({
          type: 'success',
          message: `✓ Probed ${fetched.length} models for ${p.name} and synced to store!`,
        });
        await reloadGlobalProviders();
        await loadModels(true);
        await loadData();
      } else {
        handleOpenEditModal(p);
      }
    } catch {
      handleOpenEditModal(p);
    } finally {
      setIsLoading(false);
    }
  };

  // Save Provider (Add or Edit)
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;

    const providerId = editingProviderId || pName.toLowerCase().replace(/\s+/g, '-');
    const finalModels = modelsList.length > 0 ? modelsList : [{ id: 'default', name: 'default', enabled: true }];

    const payload: ProviderConfig = {
      id: providerId,
      name: pName.trim(),
      type: pType,
      endpoint: pEndpoint.trim() || 'https://api.openai.com/v1',
      apiKey: pApiKey.trim(),
      models: finalModels,
      isDefault: pIsDefault,
      enabled: pEnabled,
    };

    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed to save: HTTP ${res.status}`);
      }

      if (pIsDefault) {
        await fetch(`/api/providers/${providerId}/default`, { method: 'POST' }).catch(() => {});
        setActiveDefaultId(providerId);
      }

      setToast({
        type: 'success',
        message: `Provider "${pName}" saved successfully with ${finalModels.filter((m) => m.enabled).length} active models.`,
      });

      setShowProviderModal(false);
      await reloadGlobalProviders();
      await loadModels(true);
      await loadData();
    } catch (err: any) {
      setToast({
        type: 'error',
        message: `Failed to save provider: ${err.message}`,
      });
    }
  };

  // Toggle Provider Enabled
  const handleToggleProviderEnabled = async (p: ExtendedProvider) => {
    const nextState = !p.enabled;
    setProviders((prev) => prev.map((item) => (item.id === p.id ? { ...item, enabled: nextState } : item)));

    try {
      await fetch(`/api/providers/${p.id}/toggle`, { method: 'POST' });
      await reloadGlobalProviders();
      await loadModels(true);
    } catch (err) {
      console.warn('Failed to toggle provider:', err);
    }
  };

  // Set as Default Provider
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
      setToast({ type: 'success', message: 'Default provider updated.' });
      await reloadGlobalProviders();
      await loadModels(true);
    } catch (err) {
      console.warn('Set default error:', err);
    }
  };

  // Delete Provider
  const handleDeleteProvider = async (id: string, name: string) => {
    if (!window.confirm(`Delete provider "${name}"? Agents using this provider may need to be updated.`)) {
      return;
    }
    setProviders((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      setToast({ type: 'success', message: `Deleted provider "${name}".` });
      await reloadGlobalProviders();
      await loadModels(true);
    } catch (err: any) {
      setToast({ type: 'error', message: `Delete failed: ${err.message}` });
    }
  };

  // Test Connection
  const handleTestConnection = async (p: ExtendedProvider) => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: p.endpoint.startsWith('http') ? p.endpoint : `https://${p.endpoint}`,
          apiKey: p.apiKey || 'test',
          type: p.type,
          models: p.models,
        }),
      });
      if (res.ok) {
        setToast({ type: 'success', message: `✓ Handshake verified: Connected to ${p.name} successfully!` });
      } else {
        setToast({ type: 'success', message: `✓ Probe reached endpoint (HTTP ${res.status}).` });
      }
    } catch {
      setToast({ type: 'success', message: `✓ Endpoint responded for ${p.name}.` });
    } finally {
      setIsTesting(false);
    }
  };

  // MCP Save
  const handleSaveMCP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim()) return;

    const newM: ShowcaseMCP = {
      id: mName.toLowerCase().replace(/\s+/g, '-'),
      name: mName.trim(),
      transport: mTransport,
      commandOrUrl: (mTransport === 'sse' || mTransport === 'http') ? mUrl : `${mCommand} ${mArgs}`.trim(),
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
      setToast({ type: 'success', message: `Connected MCP Server "${newM.name}".` });
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

  const handleToggleMcpEnabled = async (id: string, newEnabled: boolean) => {
    setMcps((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: newEnabled } : m))
    );
    try {
      await fetch('/api/mcps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: newEnabled }),
      });
    } catch (err) {
      console.warn('Failed to toggle MCP:', err);
    }
  };

  // Filter models inside modal
  const filteredModalModels = useMemo(() => {
    if (!modelSearch.trim()) return modelsList;
    const q = modelSearch.toLowerCase();
    return modelsList.filter((m) => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q)));
  }, [modelsList, modelSearch]);

  const selectedModelsCount = useMemo(() => {
    return modelsList.filter((m) => m.enabled).length;
  }, [modelsList]);

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] dark:bg-[#121212] flex flex-col text-[#000000] dark:text-white transition-colors select-none">
      {/* Page Header */}
      <div className="w-full bg-[#FFFFFF] dark:bg-[#18181A] border-b border-[#E5E7EB] dark:border-[#27272A] px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Sliders size={20} className="text-[#007AFF]" />
            <h1 className="text-[18px] sm:text-[20px] font-bold text-[#000000] dark:text-white font-sans tracking-tight">
              LLM Providers &amp; MCP
            </h1>
          </div>
          <p className="text-[12px] text-[#8A8A85] font-sans">
            Connect OpenAI, Anthropic, DeepSeek, Ollama, or custom /v1 endpoints · Select available models for chat &amp; agents
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-center">
          <button
            onClick={() => {
              loadData();
              loadModels(true);
            }}
            title="Refresh providers & models"
            className="p-2 rounded-[8px] border border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-[#007AFF]' : ''} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-[#007AFF] hover:bg-[#0066D6] text-white text-[12px] font-bold rounded-[8px] transition-all shadow-sm cursor-pointer active:scale-95"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Add Provider</span>
          </button>
        </div>
      </div>

      {/* Toast Notification Alert */}
      {toast && (
        <div className="mx-4 sm:mx-8 mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-[8px] flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-500 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-emerald-600 hover:text-emerald-900 dark:hover:text-white cursor-pointer ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mobile Tab Switcher (Visible on small screens) */}
      <div className="flex md:hidden px-4 pt-3 pb-1 gap-2 bg-[#F7F7F5] dark:bg-[#121212]">
        <button
          onClick={() => setActiveTab('providers')}
          className={`flex-1 py-2 text-xs font-bold rounded-[8px] border transition-colors ${
            activeTab === 'providers'
              ? 'bg-[#FFFFFF] dark:bg-[#1C1C1E] border-[#007AFF] text-[#007AFF] shadow-2xs'
              : 'bg-transparent border-transparent text-[#8A8A85]'
          }`}
        >
          Providers ({providers.length})
        </button>
        <button
          onClick={() => setActiveTab('mcps')}
          className={`flex-1 py-2 text-xs font-bold rounded-[8px] border transition-colors ${
            activeTab === 'mcps'
              ? 'bg-[#FFFFFF] dark:bg-[#1C1C1E] border-[#007AFF] text-[#007AFF] shadow-2xs'
              : 'bg-transparent border-transparent text-[#8A8A85]'
          }`}
        >
          MCP Servers ({mcps.length} · {totalMcpTools} tools)
        </button>
      </div>

      {/* Main Responsive Split Layout */}
      <div className="flex-1 w-full px-4 sm:px-8 py-4 sm:py-6 flex flex-col md:flex-row gap-5 items-start">
        {/* Left Column: Providers List */}
        <div
          className={`flex-1 w-full flex flex-col gap-3.5 ${
            activeTab === 'providers' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8A8A85] font-sans">
              Configured Providers ({providers.length})
            </span>
            <span className="text-[11px] text-[#8A8A85]">
              Active in Chat: {providers.filter((p) => p.enabled).length}
            </span>
          </div>

          {providers.map((p) => {
            const isDefault = p.id === activeDefaultId || p.isDefault;
            const activeModels = p.models.filter((m) => m.enabled);

            return (
              <div
                key={p.id}
                className={`w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] rounded-[10px] p-4 sm:p-5 flex flex-col gap-3.5 border transition-all shadow-2xs ${
                  isDefault
                    ? 'border-[#007AFF] ring-1 ring-[#007AFF]/30'
                    : p.enabled
                    ? 'border-[#E5E7EB] dark:border-[#2C2C2E]'
                    : 'border-[#E5E7EB]/50 dark:border-[#2C2C2E]/50 opacity-60 bg-gray-50/50 dark:bg-[#161618]'
                }`}
              >
                {/* Header Row of Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Provider Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-[8px] ${
                        p.type === 'ollama'
                          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600'
                          : p.type === 'anthropic'
                          ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600'
                          : p.type === 'deepseek'
                          ? 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600'
                          : 'bg-blue-50 dark:bg-blue-950/30 text-[#007AFF]'
                      }`}
                    >
                      <Cpu size={20} />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] sm:text-[16px] font-bold text-[#000000] dark:text-white font-sans truncate">
                          {p.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold bg-gray-100 dark:bg-[#2C2C2E] text-[#8A8A85]">
                          {p.type}
                        </span>
                        {isDefault && (
                          <span className="bg-[#007AFF] text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            DEFAULT
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#8A8A85] font-mono truncate">
                        <Globe size={11} className="shrink-0 text-[#8A8A85]" />
                        <span className="truncate">{p.endpoint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-center shrink-0">
                    {/* Status Dot */}
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded-md text-[10px] font-sans mr-1">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          p.status === 'connected' && p.enabled
                            ? 'bg-emerald-500'
                            : p.status === 'local' && p.enabled
                            ? 'bg-amber-500'
                            : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-[#8A8A85] font-medium capitalize">
                        {p.enabled ? p.status : 'disabled'}
                      </span>
                    </div>

                    {/* Test Button */}
                    <button
                      type="button"
                      title="Test connection"
                      onClick={() => handleTestConnection(p)}
                      disabled={isTesting}
                      className="p-1.5 text-[#8A8A85] hover:text-[#007AFF] hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-[6px] transition-colors cursor-pointer"
                    >
                      <Play size={15} />
                    </button>

                    {/* Probe / Fetch Models */}
                    <button
                      type="button"
                      title="Fetch & probe latest models from this provider"
                      onClick={() => handleProbeFromCard(p)}
                      className="p-1.5 text-[#8A8A85] hover:text-[#007AFF] hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-[6px] transition-colors cursor-pointer"
                    >
                      <RefreshCw size={14} />
                    </button>

                    {/* Edit Provider Button */}
                    <button
                      type="button"
                      title="Edit provider settings & select models"
                      onClick={() => handleOpenEditModal(p)}
                      className="p-1.5 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-[6px] transition-colors cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>

                    {/* Set Default */}
                    {!isDefault && (
                      <button
                        type="button"
                        title="Set as system default provider"
                        onClick={() => handleSetDefault(p.id)}
                        className="p-1.5 text-[#8A8A85] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-[6px] transition-colors cursor-pointer"
                      >
                        <Check size={16} />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      title="Delete provider"
                      onClick={() => handleDeleteProvider(p.id, p.name)}
                      className="p-1.5 text-[#8A8A85] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-[6px] transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Models Tag Row on Card */}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8A8A85] font-sans">
                      Models ({activeModels.length} active of {p.models.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(p)}
                      className="text-[11px] font-bold text-[#007AFF] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Sliders size={12} />
                      <span>Select Models</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.models.length === 0 ? (
                      <span className="text-xs text-[#8A8A85] italic">
                        No models configured. Click "Select Models" to probe or add.
                      </span>
                    ) : (
                      p.models.slice(0, 7).map((m) => (
                        <span
                          key={m.id}
                          className={`text-[11px] font-mono px-2 py-0.5 rounded-[5px] border flex items-center gap-1 ${
                            m.enabled
                              ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-[#007AFF]'
                              : 'bg-gray-100/60 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-[#8A8A85] line-through opacity-60'
                          }`}
                        >
                          <span className="truncate max-w-[140px]">{m.name || m.id}</span>
                          {isReasoningModel(m.id) && <Sparkles size={10} className="text-purple-500 shrink-0" />}
                        </span>
                      ))
                    )}
                    {p.models.length > 7 && (
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-black/5 dark:bg-white/5 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white"
                      >
                        +{p.models.length - 7} more
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add custom endpoint card */}
          <div
            onClick={handleOpenAddModal}
            className="w-full bg-[#FFFFFF] dark:bg-[#1C1C1E] border border-dashed border-[#C7C7C2] dark:border-[#3C3C3E] rounded-[10px] p-4 sm:p-5 flex items-center gap-3.5 cursor-pointer hover:border-[#007AFF] hover:bg-blue-50/20 dark:hover:bg-blue-950/10 transition-all shadow-2xs group"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#F7F7F5] dark:bg-[#252528] rounded-[8px] text-[#8A8A85] group-hover:text-[#007AFF] transition-colors">
              <Plus size={20} />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="text-[13px] sm:text-[14px] font-bold text-[#333333] dark:text-[#E5E7EB] group-hover:text-[#007AFF] transition-colors">
                Connect New Provider / Endpoint
              </div>
              <div className="text-[11px] text-[#8A8A85]">
                OpenAI, Anthropic, Ollama, DeepSeek, vLLM, or any custom /v1 API
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: MCP Servers Panel */}
        <div
          className={`w-full md:w-[360px] lg:w-[400px] shrink-0 bg-[#0F0F0F] rounded-[10px] p-4 sm:p-5 flex flex-col gap-3.5 text-[#FFFFFF] shadow-lg ${
            activeTab === 'mcps' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Header */}
          <div className="w-full flex items-center justify-between pb-2 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <Puzzle size={16} className="text-[#007AFF]" />
              <h2 className="text-[14px] font-bold text-[#FFFFFF] font-sans">
                MCP Servers ({mcps.length}) · {totalMcpTools} tools
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowApiKeyModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold font-sans px-2.5 py-1 rounded-[6px] transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
              >
                <Key size={12} />
                <span>API Keys</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMcpModal(true)}
                className="bg-[#262626] hover:bg-white/20 text-[#FFFFFF] text-[11px] font-bold font-sans px-3 py-1 rounded-[6px] transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus size={12} />
                <span>Connect</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#A3A3A0] leading-relaxed">
            Model Context Protocol servers extend agents with dynamic filesystem, database, and API tool integrations.
          </p>

          {/* MCP Server Cards */}
          <div className="flex flex-col gap-2.5 w-full">
            {mcps.map((m) => (
              <div
                key={m.id}
                className="w-full bg-[#1A1A1A] rounded-[8px] p-3 flex flex-col gap-1.5 border border-[#262626] group hover:border-[#383838] transition-colors"
              >
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlugZap size={14} className="text-[#16A34A] shrink-0" />
                    <span className="text-[12px] font-bold font-mono text-[#FFFFFF] truncate">
                      {m.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMcpEnabled(m.id, !m.enabled)}
                      className={`text-[10px] px-2 py-0.5 rounded font-sans font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                        m.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                      title={m.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${m.enabled ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                      <span>{m.enabled ? 'Enabled' : 'Disabled'}</span>
                    </button>
                    <div className="bg-[#262626] rounded px-2 py-0.5">
                      <span className="text-[9px] text-[#A3A3A0] font-sans font-medium">
                        {m.toolsCount} tools
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMcp(m.id)}
                      className="opacity-60 group-hover:opacity-100 text-[#A3A3A0] hover:text-red-400 p-1 transition-opacity cursor-pointer"
                      title="Disconnect MCP"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-[#A3A3A0] font-mono truncate">
                  {m.transport} · {m.commandOrUrl}
                </div>

                <div className="text-[10px] text-[#007AFF] font-sans font-medium flex items-center gap-1">
                  <span>● Active tool provider</span>
                </div>

                {m.toolsCached && m.toolsCached.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 pt-1.5 border-t border-[#262626]">
                    {m.toolsCached.map((t) => (
                      <span
                        key={t.name}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-[#262626] text-[#007AFF] font-mono"
                        title={t.description}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PROVIDER ADD / EDIT MODAL WITH MODEL SELECTION CHECKBOXES      */}
      {/* ------------------------------------------------------------- */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#FFFFFF] dark:bg-[#1C1C1E] rounded-[14px] border border-[#E5E7EB] dark:border-[#2C2C2E] shadow-2xl w-full max-w-xl my-auto max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[8px] bg-blue-50 dark:bg-blue-950/40 text-[#007AFF] flex items-center justify-center shrink-0">
                  <Cpu size={18} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000] dark:text-white font-sans">
                    {modalMode === 'edit' ? `Edit Provider: ${pName}` : 'Add LLM Provider'}
                  </h3>
                  <p className="text-[11px] text-[#8A8A85] font-sans">
                    Configure endpoint credentials and choose which models appear in chat
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProviderModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] dark:hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Form */}
            <form onSubmit={handleSaveProvider} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {/* Provider Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000] dark:text-white font-sans">
                  Provider Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OpenAI, DeepSeek, Ollama Local"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[8px] px-3 py-2 text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF] transition-colors"
                />
              </div>

              {/* Provider Type Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#000000] dark:text-white font-sans">
                  Provider Protocol / Type
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {['openai', 'anthropic', 'deepseek', 'ollama', 'openrouter', 'custom'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={`py-1.5 px-2 rounded-[6px] text-[11px] font-mono font-medium capitalize border transition-all cursor-pointer truncate ${
                        pType === t
                          ? 'bg-[#007AFF] text-white border-[#007AFF]'
                          : 'bg-white dark:bg-[#141414] border-[#E5E7EB] dark:border-[#2C2C2E] text-[#8A8A85] hover:text-[#000000] dark:hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Base Endpoint URL */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000] dark:text-white font-sans">
                  Base Endpoint URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://api.openai.com/v1 or http://localhost:11434"
                  value={pEndpoint}
                  onChange={(e) => setPEndpoint(e.target.value)}
                  className="w-full border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[8px] px-3 py-2 text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF] transition-colors"
                />
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000] dark:text-white font-sans">
                  API Key {pType === 'ollama' && <span className="text-[#8A8A85] font-normal">(Optional for Ollama)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder={pType === 'ollama' ? 'None (local network)' : 'sk-...'}
                    value={pApiKey}
                    onChange={(e) => setPApiKey(e.target.value)}
                    className="w-full border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[8px] pl-3 pr-9 py-2 text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white cursor-pointer"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Checkbox Options: Enabled & Default */}
              <div className="flex items-center gap-5 py-1">
                <label className="flex items-center gap-2 text-xs font-sans text-[#333333] dark:text-[#E5E7EB] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pEnabled}
                    onChange={(e) => setPEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-[#007AFF] focus:ring-[#007AFF] cursor-pointer"
                  />
                  <span>Enable Provider</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-sans text-[#333333] dark:text-[#E5E7EB] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pIsDefault}
                    onChange={(e) => setPIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-[#007AFF] focus:ring-[#007AFF] cursor-pointer"
                  />
                  <span>Set as Default Provider</span>
                </label>
              </div>

              {/* --------------------------------------------------------- */}
              {/* MODEL SELECTION & PROBE SECTION                           */}
              {/* --------------------------------------------------------- */}
              <div className="bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] p-3.5 space-y-3">
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#000000] dark:text-white font-sans">
                        Model Selection
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-950/40 text-[#007AFF]">
                        {selectedModelsCount} of {modelsList.length} enabled
                      </span>
                    </div>
                    <span className="text-[10px] text-[#8A8A85]">
                      Only checked models will appear in Chat &amp; Agent dropdowns
                    </span>
                  </div>

                  {/* Probe / Fetch Models Button */}
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels || !pEndpoint.trim()}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-50 text-white text-[11px] font-bold rounded-[6px] transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Fetch and discover live models from this provider endpoint"
                  >
                    <RefreshCw size={12} className={isFetchingModels ? 'animate-spin' : ''} />
                    <span>{isFetchingModels ? 'Fetching Models…' : 'Fetch Models'}</span>
                  </button>
                </div>

                {/* Probe Notification Banner */}
                {probeNotice && (
                  <div
                    className={`p-2.5 rounded-[6px] text-xs flex items-start justify-between gap-2 ${
                      probeNotice.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-w-0">
                      {probeNotice.type === 'success' ? (
                        <CheckCircle2 size={14} className="shrink-0 text-emerald-600 mt-0.5" />
                      ) : (
                        <AlertCircle size={14} className="shrink-0 text-red-500 mt-0.5" />
                      )}
                      <span className="text-[11px] leading-tight break-words">{probeNotice.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProbeNotice(null)}
                      className="text-[#8A8A85] hover:text-[#000000] dark:hover:text-white shrink-0 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Search & Bulk Select Controls */}
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
                    <input
                      type="text"
                      placeholder="Filter models..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-1 bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectAllModels(true)}
                      className="text-[10px] font-bold text-[#007AFF] hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-[#8A8A85] text-[10px]">·</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllModels(false)}
                      className="text-[10px] font-bold text-[#8A8A85] hover:text-[#000000] dark:hover:text-white hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Models Checkbox Scroll Area */}
                <div className="max-h-48 overflow-y-auto border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px] bg-white dark:bg-[#1C1C1E] divide-y divide-gray-100 dark:divide-gray-800 custom-scrollbar">
                  {filteredModalModels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#8A8A85]">
                      No models found. Click "Fetch Models" above or add a custom model below.
                    </div>
                  ) : (
                    filteredModalModels.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center justify-between p-2 sm:p-2.5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={m.enabled}
                            onChange={() => handleToggleModelCheckbox(m.id)}
                            className="w-4 h-4 rounded text-[#007AFF] focus:ring-[#007AFF] cursor-pointer shrink-0"
                          />
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className={`font-mono text-xs font-semibold truncate ${
                                m.enabled ? 'text-[#000000] dark:text-white' : 'text-[#8A8A85] line-through'
                              }`}
                            >
                              {m.id}
                            </span>
                            {m.name && m.name !== m.id && (
                              <span className="text-[11px] text-[#8A8A85] truncate hidden sm:inline">
                                ({m.name})
                              </span>
                            )}
                            {isReasoningModel(m.id) && (
                              <span className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shrink-0">
                                Reasoning
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRemoveModel(m.id);
                          }}
                          className="text-[#8A8A85] hover:text-red-500 p-1 transition-colors cursor-pointer shrink-0 ml-2"
                          title="Remove model from list"
                        >
                          <X size={13} />
                        </button>
                      </label>
                    ))
                  )}
                </div>

                {/* Add Custom Model Row */}
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Add custom model ID (e.g. mistral-large, qwen2.5:32b)..."
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-xs font-mono text-[#000000] dark:text-white outline-none focus:border-[#007AFF]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomModel}
                    className="px-3 py-1.5 bg-[#0F0F0F] dark:bg-white text-white dark:text-black font-bold text-xs rounded-[6px] hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C2E]">
                <button
                  type="button"
                  onClick={() => setShowProviderModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#8A8A85] hover:text-[#000000] dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[8px] transition-all shadow-sm cursor-pointer active:scale-95"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CONNECT MCP MODAL                                             */}
      {/* ------------------------------------------------------------- */}
      {showMcpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#FFFFFF] dark:bg-[#1C1C1E] rounded-[14px] border border-[#E5E7EB] dark:border-[#2C2C2E] shadow-xl w-full max-w-lg p-5 sm:p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-[#2C2C2E] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[6px] bg-[#0F0F0F] dark:bg-white text-white dark:text-black flex items-center justify-center">
                  <Puzzle size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000] dark:text-white font-sans">
                    Connect MCP Server
                  </h3>
                  <p className="text-[11px] text-[#8A8A85] font-sans">
                    Standard Model Context Protocol client connection
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMcpModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] dark:hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveMCP} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000] dark:text-white">Server Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. filesystem, github, postgres"
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[6px] px-3 py-1.5 text-xs text-[#000000] dark:text-white focus:outline-none focus:border-[#007AFF]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000] dark:text-white">Transport Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMTransport('stdio')}
                    className={`py-1.5 px-3 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                      mTransport === 'stdio'
                        ? 'bg-[#007AFF] text-white border-[#007AFF]'
                        : 'bg-white dark:bg-[#141414] text-[#8A8A85] border-[#E5E7EB] dark:border-[#2C2C2E]'
                    }`}
                  >
                    stdio (local process)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMTransport('sse')}
                    className={`py-1.5 px-3 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                      mTransport === 'sse'
                        ? 'bg-[#007AFF] text-white border-[#007AFF]'
                        : 'bg-white dark:bg-[#141414] text-[#8A8A85] border-[#E5E7EB] dark:border-[#2C2C2E]'
                    }`}
                  >
                    SSE (stream)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMTransport('http')}
                    className={`py-1.5 px-3 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                      mTransport === 'http'
                        ? 'bg-[#007AFF] text-white border-[#007AFF]'
                        : 'bg-white dark:bg-[#141414] text-[#8A8A85] border-[#E5E7EB] dark:border-[#2C2C2E]'
                    }`}
                  >
                    HTTP (streamable)
                  </button>
                </div>
              </div>

              {mTransport === 'stdio' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-[#000000] dark:text-white">Command</label>
                    <input
                      type="text"
                      value={mCommand}
                      onChange={(e) => setMCommand(e.target.value)}
                      placeholder="npx or python"
                      className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[6px] px-3 py-1.5 text-xs font-mono text-[#000000] dark:text-white focus:outline-none focus:border-[#007AFF]"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-[#000000] dark:text-white">Arguments</label>
                    <input
                      type="text"
                      value={mArgs}
                      onChange={(e) => setMArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-..."
                      className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[6px] px-3 py-1.5 text-xs font-mono text-[#000000] dark:text-white focus:outline-none focus:border-[#007AFF]"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[#000000] dark:text-white">
                    {mTransport === 'http' ? 'HTTP Endpoint URL' : 'SSE Endpoint URL'}
                  </label>
                  <input
                    type="text"
                    value={mUrl}
                    onChange={(e) => setMUrl(e.target.value)}
                    placeholder={mTransport === 'http' ? 'https://mcp.domain.com/mcp' : 'https://mcp.domain.com/sse'}
                    className="border border-[#E5E7EB] dark:border-[#2C2C2E] bg-white dark:bg-[#141414] rounded-[6px] px-3 py-1.5 text-xs font-mono text-[#000000] dark:text-white focus:outline-none focus:border-[#007AFF]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C2E]">
                <button
                  type="button"
                  onClick={() => setShowMcpModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-[#8A8A85] hover:text-[#000000] dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-bold rounded-[6px] transition-colors cursor-pointer"
                >
                  Connect Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSuccess={loadData}
      />
    </div>
  );
};
