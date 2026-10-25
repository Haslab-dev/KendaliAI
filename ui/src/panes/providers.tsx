import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
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
  Bot,
  Cable,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useAgentStore } from '../store/useAgentStore';
import { PaneToolbar, PaneToolbarFilters, PaneToolbarActions, StatChip } from '../components/settings/settingsPrimitives';
import { ProviderConfig, ModelItem, isReasoningModel } from '../types';

// Mirrors the backend capability inference so the UI can badge/highlight
// image-capable models before the first probe.
const IMAGE_MODEL_RE = /(gpt-image|dall-e|dalle|imagen|gemini-.*image|flux|stable-diffusion|sdxl|seedream|ideogram|recraft)/i;
const isImageModelId = (id?: string) => !!id && IMAGE_MODEL_RE.test(id);

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

export const ProvidersPane: React.FC = () => {
  const { loadProviders: reloadGlobalProviders, loadModels } = useAppStore();
  const { acpAgents, acpSessions } = useAgentStore();

  const [providers, setProviders] = useState<ExtendedProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeDefaultId, setActiveDefaultId] = useState<string | null>(null);
  const [defaultImageModel, setDefaultImageModel] = useState('');

  // Notification Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load Providers from API
      const pRes = await fetch('/api/providers');
      if (pRes.ok) {
        const pData: ProviderConfig[] = await pRes.json();
        if (Array.isArray(pData)) {
          const mapped: ExtendedProvider[] = pData.map((p) => {
            const parsedModels: ModelItem[] = Array.isArray(p.models)
              ? p.models.map((m: any) =>
                  typeof m === 'string'
                    ? { id: m, name: m, enabled: true }
                    : {
                        id: m.id,
                        name: m.name || m.id,
                        enabled: m.enabled !== false,
                        supportsVision: m.supportsVision,
                        supportsImageGen: m.supportsImageGen,
                      }
                )
              : [];

            const activeCount = parsedModels.filter((m) => m.enabled).length;
            const isLocal =
              p.type === 'ollama' ||
              (p.endpoint &&
                (p.endpoint.includes('localhost') || p.endpoint.includes('127.0.0.1')));
            const status: 'connected' | 'local' | 'disconnected' = !p.enabled
              ? 'disconnected'
              : isLocal
              ? 'local'
              : p.apiKey && p.apiKey.trim().length > 0
              ? 'connected'
              : 'disconnected';

            return {
              id: p.id || p.name.toLowerCase().replace(/\s+/g, '-'),
              name: p.name,
              endpoint: p.endpoint || 'https://api.openai.com/v1',
              type: p.type || 'custom',
              apiKey: p.apiKey || '',
              models: parsedModels,
              isDefault: !!p.isDefault,
              enabled: p.enabled !== false,
              status,
              meta: `${activeCount} of ${parsedModels.length} models active`,
            };
          });

          const def = mapped.find((p) => p.isDefault);
          setActiveDefaultId(def ? def.id : mapped.length > 0 ? mapped[0].id : null);
          setProviders(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load providers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetch('/api/models/default-image')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.model) setDefaultImageModel(data.model);
      })
      .catch(() => {});
  }, []);

  const imageModels = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; provider: string }[] = [];
    for (const p of providers) {
      if (!p.enabled) continue;
      for (const m of p.models) {
        if (!m.enabled || seen.has(m.id)) continue;
        if (m.supportsImageGen === true || isImageModelId(m.id)) {
          seen.add(m.id);
          list.push({ id: m.id, provider: p.name });
        }
      }
    }
    return list;
  }, [providers]);

  const saveDefaultImageModel = async (model: string) => {
    setDefaultImageModel(model);
    try {
      await fetch('/api/models/default-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      setToast({
        type: 'success',
        message: model ? `Default image model set to ${model}.` : 'Image model set to auto-detect.',
      });
    } catch {
      setToast({ type: 'error', message: 'Failed to save the default image model.' });
    }
  };

  const toggleModelCapability = (id: string, capability: 'vision' | 'image') => {
    setModelsList((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (capability === 'vision') {
          return { ...m, supportsVision: !m.supportsVision };
        }
        return { ...m, supportsImageGen: !m.supportsImageGen };
      })
    );
  };

  // Open Modal in Add Mode
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingProviderId(null);
    setPName('');
    setPType('openai');
    setPEndpoint('https://api.openai.com/v1');
    setPApiKey('');
    setPEnabled(true);
    setPIsDefault(providers.length === 0);
    setShowKey(false);
    setModelsList([]);
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
      const existingMap = new Map(modelsList.map((m) => [m.id, m]));
      const merged: ModelItem[] = remoteModels.map((rm) => {
        const prev = existingMap.get(rm.id);
        return {
          id: rm.id,
          name: rm.name || rm.id,
          enabled: prev ? prev.enabled : true,
          supportsVision: prev?.supportsVision,
          supportsImageGen: prev?.supportsImageGen,
        };
      });

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
      await fetch(`/api/providers/${encodeURIComponent(id)}/default`, { method: 'POST' });
      setToast({ type: 'success', message: 'Default provider updated.' });
      await reloadGlobalProviders();
      await loadModels(true);
      await loadData();
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
    if (activeDefaultId === id) {
      setActiveDefaultId(null);
    }
    try {
      let res = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        res = await fetch(`/api/providers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setToast({ type: 'success', message: `Deleted provider "${name}".` });
      await reloadGlobalProviders();
      await loadModels(true);
      await loadData();
    } catch (err: any) {
      setToast({ type: 'error', message: `Delete failed: ${err.message}` });
      await loadData();
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

      {/* Image generation default */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-ui-sm font-semibold text-foreground">
            <Sparkles size={14} className="text-muted-foreground" />
            Image generation model
          </div>
          <div className="mt-0.5 text-ui-xs text-muted-foreground">
            Used by the <span className="font-mono">generate_image</span> tool when the agent does not pick a model.
          </div>
        </div>
        <select
          value={defaultImageModel}
          onChange={(e) => void saveDefaultImageModel(e.target.value)}
          className="h-9 w-full shrink-0 rounded-lg border border-border bg-card px-2.5 font-mono text-ui-xs text-foreground outline-none focus:border-primary/60 sm:w-64"
        >
          <option value="">Auto (first image-capable model)</option>
          {imageModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} · {m.provider}
            </option>
          ))}
          {defaultImageModel && !imageModels.some((m) => m.id === defaultImageModel) && (
            <option value={defaultImageModel}>{defaultImageModel} (not detected)</option>
          )}
        </select>
      </div>

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
                          !p.enabled
                            ? 'bg-zinc-400'
                            : p.status === 'connected'
                            ? 'bg-emerald-500'
                            : p.status === 'local'
                            ? 'bg-amber-500'
                            : 'bg-zinc-400'
                        }`}
                      />
                      <span className="text-muted-foreground font-medium capitalize">
                        {!p.enabled
                          ? 'disabled'
                          : p.status === 'connected'
                          ? 'connected'
                          : p.status === 'local'
                          ? 'local'
                          : 'no key'}
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

                {/* Models Summary Row */}
                <div className="pt-2.5 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-ui-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Models:</span>
                    <span className="font-semibold text-foreground font-mono">
                      {activeModels.length} of {p.models.length} active
                    </span>
                    {activeModels.slice(0, 3).map((m) => (
                      <span
                        key={m.id}
                        className="text-3xs font-mono px-2 py-0.5 rounded-md bg-surface-muted border border-border text-foreground-subtle truncate max-w-[140px]"
                      >
                        {m.name || m.id}
                      </span>
                    ))}
                    {activeModels.length > 3 && (
                      <span className="text-3xs text-muted-foreground font-mono">
                        +{activeModels.length - 3} more
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(p)}
                    className="inline-flex items-center gap-1.5 text-ui-xs font-semibold text-primary hover:underline cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Sliders size={12} />
                    <span>Manage Models ({p.models.length})</span>
                  </button>
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

          {/* ACP External Runners Card (Clean & Compact) */}
          <div className="w-full bg-card rounded-xl p-5 flex flex-col gap-3.5 border border-border shadow-2xs mt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-primary">
                  <Cable className="size-4" />
                </div>
                <div>
                  <h3 className="text-ui-sm font-semibold text-foreground flex items-center gap-2">
                    ACP External CLI Runners
                    <span className="inline-flex items-center gap-1 text-3xs font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      ws://localhost:18889
                    </span>
                  </h3>
                  <p className="text-ui-xs text-muted-foreground mt-0.5">
                    External command-line agents connected via the Agent Client Protocol.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-ui-xs text-muted-foreground font-mono self-start sm:self-auto">
                <span className="px-2.5 py-1 rounded-lg bg-surface border border-border">
                  {acpAgents.length} runner{acpAgents.length === 1 ? '' : 's'} registered
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-surface border border-border">
                  {Object.keys(acpSessions).length} live session{Object.keys(acpSessions).length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {acpAgents.length > 0 ? (
              <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-surface overflow-hidden">
                {acpAgents.map((ag) => {
                  const modelCount = ag.supportedModels?.length || 0;
                  return (
                    <div key={ag.id} className="flex items-center justify-between gap-3 p-3 text-ui-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Bot className="size-4 text-primary shrink-0" />
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-semibold text-foreground font-mono">{ag.name || ag.id}</span>
                          <span className="text-3xs text-muted-foreground font-mono">({ag.id})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-3xs text-muted-foreground font-mono">
                          {modelCount > 0 ? `${modelCount} model${modelCount === 1 ? '' : 's'} available` : 'Standard runner'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded-full ${
                            ag.available
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-500/10 text-muted-foreground border border-border'
                          }`}
                        >
                          {ag.available ? 'Ready' : 'Not installed'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-ui-xs text-muted-foreground">
                External CLI runners (such as Claude Code or custom agents running with <code className="font-mono bg-surface-muted px-1.5 py-0.5 rounded text-foreground">--acp</code>) register here automatically.
              </div>
            )}
          </div>
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
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleModelCapability(m.id, 'vision');
                              }}
                              title="Toggle vision (image input) support. Auto-inferred when unset."
                              className={`text-ui-xs px-1.5 py-0.5 rounded font-bold uppercase shrink-0 transition-colors ${
                                m.supportsVision === true
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : m.supportsVision === false
                                  ? 'bg-muted text-muted-foreground'
                                  : 'border border-dashed border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              Vision
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleModelCapability(m.id, 'image');
                              }}
                              title="Toggle image-generation support. Auto-inferred when unset."
                              className={`text-ui-xs px-1.5 py-0.5 rounded font-bold uppercase shrink-0 transition-colors ${
                                m.supportsImageGen === true || (m.supportsImageGen === undefined && isImageModelId(m.id))
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : m.supportsImageGen === false
                                  ? 'bg-muted text-muted-foreground'
                                  : 'border border-dashed border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              Image
                            </button>
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
    </div>
  );
};
