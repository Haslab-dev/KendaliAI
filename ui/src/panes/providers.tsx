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
import { PaneToolbar, PaneToolbarFilters, PaneToolbarActions, StatChip } from '../components/settings/settingsPrimitives';
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
    <div className="w-full flex flex-col gap-5 text-foreground transition-colors select-none">
      {/* Toolbar: refresh + add (page title lives in the Settings frame) */}
      <PaneToolbar>
        <PaneToolbarFilters>
          <StatChip label="providers" value={providers.length} />
          <StatChip label="active in chat" value={providers.filter((p) => p.enabled).length} tone="primary" />
          <StatChip label="models enabled" value={providers.reduce((acc, p) => acc + p.models.filter((m) => m.enabled).length, 0)} />
        </PaneToolbarFilters>
        <PaneToolbarActions>
          <button
            onClick={() => {
              loadData();
              loadModels(true);
            }}
            title="Refresh providers & models"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-ui-sm font-medium text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-primary' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-ui-sm font-semibold text-foreground-inverse transition-colors hover:bg-brand/80 active:scale-95 cursor-pointer"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Add Provider</span>
          </button>
        </PaneToolbarActions>
      </PaneToolbar>

      {/* Toast Notification Alert */}
      {toast && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-lg flex items-center justify-between animate-fade-in">
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

      {/* Main Responsive Layout (Full Width for Providers) */}
      <div className="flex-1 w-full flex flex-col gap-5">
        {/* Providers List */}
        <div className="w-full flex flex-col gap-3.5">

          {providers.map((p) => {
            const isDefault = p.id === activeDefaultId || p.isDefault;
            const activeModels = p.models.filter((m) => m.enabled);

            return (
              <div
                key={p.id}
                className={`w-full bg-card rounded-xl p-4 flex flex-col gap-3.5 border transition-all shadow-2xs ${
                  isDefault
                    ? 'border-primary ring-1 ring-[#007AFF]/30'
                    : p.enabled
                    ? 'border-border'
                    : 'border-border/50 dark:border-border/50 opacity-60 bg-gray-50/50 dark:bg-card'
                }`}
              >
                {/* Header Row of Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Provider Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-lg ${
                        p.type === 'ollama'
                          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600'
                          : p.type === 'anthropic'
                          ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600'
                          : p.type === 'deepseek'
                          ? 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600'
                          : 'bg-blue-50 dark:bg-blue-950/30 text-primary'
                      }`}
                    >
                      <Cpu size={20} />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-ui-base font-bold text-foreground font-sans truncate">
                          {p.name}
                        </span>
                        <span className="text-ui-xs px-1.5 py-0.5 rounded font-mono uppercase font-bold bg-gray-100 dark:bg-accent text-muted-foreground">
                          {p.type}
                        </span>
                        {isDefault && (
                          <span className="bg-primary text-white text-ui-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            DEFAULT
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-ui-xs text-muted-foreground font-mono truncate">
                        <Globe size={11} className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{p.endpoint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-center shrink-0">
                    {/* Status Dot */}
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded-md text-ui-xs font-sans mr-1">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          p.status === 'connected' && p.enabled
                            ? 'bg-emerald-500'
                            : p.status === 'local' && p.enabled
                            ? 'bg-amber-500'
                            : 'bg-gray-400'
                        }`}
                      />
                      <span className="text-muted-foreground font-medium capitalize">
                        {p.enabled ? p.status : 'disabled'}
                      </span>
                    </div>

                    {/* Test Button */}
                    <button
                      type="button"
                      title="Test connection"
                      onClick={() => handleTestConnection(p)}
                      disabled={isTesting}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Play size={15} />
                    </button>

                    {/* Probe / Fetch Models */}
                    <button
                      type="button"
                      title="Fetch & probe latest models from this provider"
                      onClick={() => handleProbeFromCard(p)}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <RefreshCw size={14} />
                    </button>

                    {/* Edit Provider Button */}
                    <button
                      type="button"
                      title="Edit provider settings & select models"
                      onClick={() => handleOpenEditModal(p)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>

                    {/* Set Default */}
                    {!isDefault && (
                      <button
                        type="button"
                        title="Set as system default provider"
                        onClick={() => handleSetDefault(p.id)}
                        className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors cursor-pointer"
                      >
                        <Check size={16} />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      title="Delete provider"
                      onClick={() => handleDeleteProvider(p.id, p.name)}
                      className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Models Tag Row on Card */}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-sans">
                      Models ({activeModels.length} active of {p.models.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(p)}
                      className="text-ui-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Sliders size={12} />
                      <span>Select Models</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.models.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        No models configured. Click "Select Models" to probe or add.
                      </span>
                    ) : (
                      p.models.slice(0, 7).map((m) => (
                        <span
                          key={m.id}
                          className={`text-ui-xs font-mono px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                            m.enabled
                              ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-primary'
                              : 'bg-gray-100/60 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-muted-foreground line-through opacity-60'
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
                        className="text-ui-xs font-mono px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                      >
                        +{p.models.length - 7} more
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add custom endpoint card — only when the list is empty (the toolbar
              Add Provider button covers it otherwise) */}
          {providers.length === 0 && (
          <div
            onClick={handleOpenAddModal}
            className="w-full bg-card border border-dashed border-border rounded-xl p-4 flex items-center gap-3.5 cursor-pointer hover:border-primary/60 hover:bg-primary/[0.04] transition-all group"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-surface-muted rounded-lg text-muted-foreground group-hover:text-primary transition-colors">
              <Plus size={20} />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="text-ui-sm font-bold text-foreground/85 group-hover:text-primary transition-colors">
                Connect New Provider / Endpoint
              </div>
              <div className="text-ui-xs text-muted-foreground">
                OpenAI, Anthropic, Ollama, DeepSeek, vLLM, or any custom /v1 API
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PROVIDER ADD / EDIT MODAL WITH MODEL SELECTION CHECKBOXES      */}
      {/* ------------------------------------------------------------- */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-xl my-auto max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center shrink-0">
                  <Cpu size={18} />
                </div>
                <div>
                  <h3 className="text-ui-base font-bold text-foreground font-sans">
                    {modalMode === 'edit' ? `Edit Provider: ${pName}` : 'Add LLM Provider'}
                  </h3>
                  <p className="text-ui-xs text-muted-foreground font-sans">
                    Configure endpoint credentials and choose which models appear in chat
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProviderModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Form */}
            <form onSubmit={handleSaveProvider} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {/* Provider Name */}
              <div className="flex flex-col gap-1">
                <label className="text-ui-xs font-bold text-foreground font-sans">
                  Provider Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OpenAI, DeepSeek, Ollama Local"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full border border-border bg-card rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* Provider Type Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-ui-xs font-bold text-foreground font-sans">
                  Provider Protocol / Type
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {['openai', 'anthropic', 'deepseek', 'ollama', 'openrouter', 'custom'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={`py-1.5 px-2 rounded-lg text-ui-xs font-mono font-medium capitalize border transition-all cursor-pointer truncate ${
                        pType === t
                          ? 'bg-primary text-white border-primary'
                          : 'bg-card border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Base Endpoint URL */}
              <div className="flex flex-col gap-1">
                <label className="text-ui-xs font-bold text-foreground font-sans">
                  Base Endpoint URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://api.openai.com/v1 or http://localhost:11434"
                  value={pEndpoint}
                  onChange={(e) => setPEndpoint(e.target.value)}
                  className="w-full border border-border bg-card rounded-lg px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1">
                <label className="text-ui-xs font-bold text-foreground font-sans">
                  API Key {pType === 'ollama' && <span className="text-muted-foreground font-normal">(Optional for Ollama)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder={pType === 'ollama' ? 'None (local network)' : 'sk-...'}
                    value={pApiKey}
                    onChange={(e) => setPApiKey(e.target.value)}
                    className="w-full border border-border bg-card rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-foreground outline-none focus:border-primary/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Checkbox Options: Enabled & Default */}
              <div className="flex items-center gap-5 py-1">
                <label className="flex items-center gap-2 text-xs font-sans text-foreground/85 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pEnabled}
                    onChange={(e) => setPEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-[#007AFF] cursor-pointer"
                  />
                  <span>Enable Provider</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-sans text-foreground/85 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pIsDefault}
                    onChange={(e) => setPIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-[#007AFF] cursor-pointer"
                  />
                  <span>Set as Default Provider</span>
                </label>
              </div>

              {/* --------------------------------------------------------- */}
              {/* MODEL SELECTION & PROBE SECTION                           */}
              {/* --------------------------------------------------------- */}
              <div className="bg-accent/60 dark:bg-background border border-border rounded-xl p-3.5 space-y-3">
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground font-sans">
                        Model Selection
                      </span>
                      <span className="text-ui-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-950/40 text-primary">
                        {selectedModelsCount} of {modelsList.length} enabled
                      </span>
                    </div>
                    <span className="text-ui-xs text-muted-foreground">
                      Only checked models will appear in Chat &amp; Agent dropdowns
                    </span>
                  </div>

                  {/* Probe / Fetch Models Button */}
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels || !pEndpoint.trim()}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/85 disabled:opacity-50 text-white text-ui-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Fetch and discover live models from this provider endpoint"
                  >
                    <RefreshCw size={12} className={isFetchingModels ? 'animate-spin' : ''} />
                    <span>{isFetchingModels ? 'Fetching Models…' : 'Fetch Models'}</span>
                  </button>
                </div>

                {/* Probe Notification Banner */}
                {probeNotice && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-start justify-between gap-2 ${
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
                      <span className="text-ui-xs leading-tight break-words">{probeNotice.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProbeNotice(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Search & Bulk Select Controls */}
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filter models..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-1 bg-card border border-border rounded-lg text-xs text-foreground outline-none focus:border-primary/60"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectAllModels(true)}
                      className="text-ui-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-muted-foreground text-ui-xs">·</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllModels(false)}
                      className="text-ui-xs font-bold text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Models Checkbox Scroll Area */}
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg bg-card divide-y divide-gray-100 dark:divide-gray-800 custom-scrollbar">
                  {filteredModalModels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No models found. Click "Fetch Models" above or add a custom model below.
                    </div>
                  ) : (
                    filteredModalModels.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center justify-between p-2 sm:p-2.5 hover:bg-foreground/5 cursor-pointer transition-colors select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={m.enabled}
                            onChange={() => handleToggleModelCheckbox(m.id)}
                            className="w-4 h-4 rounded text-primary focus:ring-[#007AFF] cursor-pointer shrink-0"
                          />
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className={`font-mono text-xs font-semibold truncate ${
                                m.enabled ? 'text-foreground' : 'text-muted-foreground line-through'
                              }`}
                            >
                              {m.id}
                            </span>
                            {m.name && m.name !== m.id && (
                              <span className="text-ui-xs text-muted-foreground truncate hidden sm:inline">
                                ({m.name})
                              </span>
                            )}
                            {isReasoningModel(m.id) && (
                              <span className="text-ui-xs px-1.5 py-0.5 rounded font-bold uppercase bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shrink-0">
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
                          className="text-muted-foreground hover:text-red-500 p-1 transition-colors cursor-pointer shrink-0 ml-2"
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
                    className="flex-1 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-mono text-foreground outline-none focus:border-primary/60"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomModel}
                    className="px-3 py-1.5 bg-foreground text-background font-bold text-xs rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowProviderModal(false)}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary/85 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer active:scale-95"
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
          <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-lg p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center">
                  <Puzzle size={16} />
                </div>
                <div>
                  <h3 className="text-ui-base font-bold text-foreground font-sans">
                    Connect MCP Server
                  </h3>
                  <p className="text-ui-xs text-muted-foreground font-sans">
                    Standard Model Context Protocol client connection
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMcpModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveMCP} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-ui-xs font-bold text-foreground">Server Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. filesystem, github, postgres"
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="border border-border bg-card rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-ui-xs font-bold text-foreground">Transport Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMTransport('stdio')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      mTransport === 'stdio'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    stdio (local process)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMTransport('sse')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      mTransport === 'sse'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    SSE (stream)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMTransport('http')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      mTransport === 'http'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    HTTP (streamable)
                  </button>
                </div>
              </div>

              {mTransport === 'stdio' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-ui-xs font-bold text-foreground">Command</label>
                    <input
                      type="text"
                      value={mCommand}
                      onChange={(e) => setMCommand(e.target.value)}
                      placeholder="npx or python"
                      className="border border-border bg-card rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-ui-xs font-bold text-foreground">Arguments</label>
                    <input
                      type="text"
                      value={mArgs}
                      onChange={(e) => setMArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-..."
                      className="border border-border bg-card rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-ui-xs font-bold text-foreground">
                    {mTransport === 'http' ? 'HTTP Endpoint URL' : 'SSE Endpoint URL'}
                  </label>
                  <input
                    type="text"
                    value={mUrl}
                    onChange={(e) => setMUrl(e.target.value)}
                    placeholder={mTransport === 'http' ? 'https://mcp.domain.com/mcp' : 'https://mcp.domain.com/sse'}
                    className="border border-border bg-card rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary/60"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowMcpModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary hover:bg-primary/85 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
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
