import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Bot, MessageSquare, Plug, Brain, Wrench, Smartphone, Plus, Trash2, CheckCircle,
  RefreshCw, Edit2, Search, Check, CheckSquare, Square, Sparkles, AlertCircle, ChevronDown, ChevronUp, Terminal,
  Database, Eye, EyeOff, FileText, Upload, BookOpen
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  ProviderConfig, AgentConfig, MCPServerConfig, SkillItem, ToolDefinition, TelegramBotConfig,
  ModelItem, isReasoningModel, EmbeddingConfig, DocumentItem
} from '../types';

// 1. Providers Tab
export const ProvidersPane: React.FC = () => {
  const { loadProviders: reloadGlobalProviders } = useAppStore();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ProviderConfig>>({
    name: '',
    type: 'custom',
    apiKey: '',
    endpoint: '',
    models: [],
    enabled: true,
  });

  const [newModelInput, setNewModelInput] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchNotice, setFetchNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers');
      const data = await res.json();
      setProviders(data || []);
    } catch (e) {
      console.error('Failed to load providers:', e);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleEdit = (p: ProviderConfig) => {
    setEditingId(p.id);
    setForm({
      id: p.id,
      name: p.name,
      type: p.type,
      apiKey: p.apiKey,
      endpoint: p.endpoint,
      models: Array.isArray(p.models) ? p.models.map((m: any) => typeof m === 'string' ? { id: m, enabled: true } : m) : [],
      enabled: p.enabled !== false,
      isDefault: !!p.isDefault,
    });
    setFetchNotice(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({
      name: '',
      type: 'custom',
      apiKey: '',
      endpoint: '',
      models: [],
      enabled: true,
      isDefault: false,
    });
    setFetchNotice(null);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return alert('Provider name is required');
    const payload = {
      ...form,
      id: editingId || form.id || undefined,
      models: form.models || [],
    };
    try {
      await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      alert(editingId ? 'Provider updated successfully!' : 'Provider saved successfully!');
      handleCancelEdit();
      fetchProviders();
      reloadGlobalProviders();
    } catch (e) {
      alert('Failed to save provider: ' + e);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      alert(data.message || 'Connected successfully!');
    } catch (e) {
      alert('Test failed: ' + e);
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchRemoteModels = async () => {
    setIsFetchingModels(true);
    setFetchNotice(null);
    try {
      const res = await fetch('/api/providers/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || editingId,
          type: form.type,
          endpoint: form.endpoint,
          apiKey: form.apiKey,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const fetched: ModelItem[] = await res.json();
      if (!Array.isArray(fetched) || fetched.length === 0) {
        setFetchNotice({
          type: 'error',
          text: 'No models found at endpoint. Check endpoint URL and API key.',
        });
        return;
      }

      // Merge with existing models preserving enabled states
      const existingMap = new Map((form.models || []).map((m) => [m.id, m]));
      const merged: ModelItem[] = fetched.map((fm) => {
        const existing = existingMap.get(fm.id);
        return existing ? { ...fm, enabled: existing.enabled } : { ...fm, enabled: true };
      });
      // Add custom models that were in form but not in fetched
      const fetchedIds = new Set(fetched.map((f) => f.id));
      (form.models || []).forEach((m) => {
        if (!fetchedIds.has(m.id)) {
          merged.push(m);
        }
      });

      setForm((prev) => ({ ...prev, models: merged }));
      setFetchNotice({
        type: 'success',
        text: `Successfully discovered and synced ${fetched.length} models! Check/uncheck models below to configure what is shown across the app.`,
      });
    } catch (err: any) {
      setFetchNotice({
        type: 'error',
        text: `Failed to probe models: ${err.message || err}`,
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const toggleModel = (id: string) => {
    setForm((prev) => ({
      ...prev,
      models: (prev.models || []).map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      ),
    }));
  };

  const setAllModels = (enabled: boolean) => {
    setForm((prev) => ({
      ...prev,
      models: (prev.models || []).map((m) => ({ ...m, enabled })),
    }));
  };

  const handleAddManualModel = () => {
    const trimmed = newModelInput.trim();
    if (!trimmed) return;
    if ((form.models || []).some((m) => m.id.toLowerCase() === trimmed.toLowerCase())) {
      alert('Model already exists in list');
      return;
    }
    setForm((prev) => ({
      ...prev,
      models: [...(prev.models || []), { id: trimmed, enabled: true }],
    }));
    setNewModelInput('');
  };

  const handleRemoveModel = (id: string) => {
    setForm((prev) => ({
      ...prev,
      models: (prev.models || []).filter((m) => m.id !== id),
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete provider?')) return;
    await fetch(`/api/providers?id=${id}`, { method: 'DELETE' });
    fetchProviders();
    reloadGlobalProviders();
  };

  const filteredFormModels = useMemo(() => {
    const query = modelFilter.toLowerCase().trim();
    if (!query) return form.models || [];
    return (form.models || []).filter(
      (m) => m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query))
    );
  }, [form.models, modelFilter]);

  const enabledFormCount = (form.models || []).filter((m) => m.enabled !== false).length;
  const totalFormCount = (form.models || []).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-neutral-100">LLM Inference Providers & Models</h3>
        <p className="text-xs text-neutral-400">
          Configure API endpoints, probe /models catalogs, and toggle which models are enabled for Chat and Bots.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {providers.map((p) => {
          const enabledCount = (p.models || []).filter((m) => m.enabled !== false).length;
          const totalCount = (p.models || []).length;
          const enabledModels = (p.models || []).filter((m) => m.enabled !== false);

          return (
            <div
              key={p.id}
              className={`p-4 bg-[#212121] border rounded-xl space-y-3 transition-colors ${
                editingId === p.id ? 'border-blue-500/70 bg-[#252525]' : 'border-[#2e2e2e]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-neutral-200 flex items-center gap-1.5">
                  <Zap size={15} className="text-amber-400" />
                  <span>{p.name}</span>
                  <span className="text-[10px] text-neutral-400 uppercase bg-[#181818] px-1.5 py-0.5 rounded border border-[#333]">
                    {p.type}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.isDefault && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
                      DEFAULT
                    </span>
                  )}
                  <button
                    onClick={() => handleEdit(p)}
                    className="text-neutral-400 hover:text-blue-400 p-1 transition-colors"
                    title="Edit provider and models"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-neutral-500 hover:text-red-400 p-1 transition-colors"
                    title="Delete provider"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="text-xs text-neutral-400 truncate">
                Endpoint: <code className="text-neutral-300">{p.endpoint || 'default (cloud)'}</code>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400 font-medium">
                    Models ({enabledCount} active / {totalCount} total)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                  {enabledModels.slice(0, 6).map((m) => (
                    <span
                      key={m.id}
                      className="text-[10px] bg-[#171717] border border-[#2e2e2e] text-neutral-300 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono"
                    >
                      {isReasoningModel(m.id) && <span title="Reasoning / Thinking Model">🧠</span>}
                      <span>{m.id}</span>
                    </span>
                  ))}
                  {enabledModels.length > 6 && (
                    <span className="text-[10px] text-neutral-500 self-center px-1 font-mono">
                      +{enabledModels.length - 6} more
                    </span>
                  )}
                  {enabledModels.length === 0 && (
                    <span className="text-[11px] text-neutral-500 italic">No models enabled</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Form */}
      <div ref={formRef} className="border-t border-[#262626] pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-neutral-200">
              {editingId ? `Edit Provider: ${form.name}` : 'Register New Provider'}
            </h4>
            {editingId && (
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
                EDITING MODE
              </span>
            )}
          </div>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="text-xs text-neutral-400 hover:text-white px-2 py-1 bg-[#242424] hover:bg-[#2c2c2c] rounded-lg transition-colors"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500"
              placeholder="e.g. OpenAI Production"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Provider Type (OpenAI Compatible)</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500"
              value={form.type || 'custom'}
              onChange={(e) => {
                const nextType = e.target.value;
                let nextEndpoint = form.endpoint || '';
                if (!form.endpoint || form.endpoint.includes('api.openai.com') || form.endpoint.includes('api.deepseek.com') || form.endpoint.includes('openrouter.ai') || form.endpoint.includes('11434')) {
                  if (nextType === 'openai') nextEndpoint = 'https://api.openai.com/v1';
                  else if (nextType === 'deepseek') nextEndpoint = 'https://api.deepseek.com';
                  else if (nextType === 'openrouter') nextEndpoint = 'https://openrouter.ai/api/v1';
                  else if (nextType === 'ollama') nextEndpoint = 'http://localhost:11434/v1';
                  else if (nextType === 'custom' && !form.endpoint) nextEndpoint = 'http://localhost:8000/v1';
                }
                setForm({ ...form, type: nextType, endpoint: nextEndpoint });
              }}
            >
              <option value="custom">Custom OpenAI-Compatible Endpoint</option>
              <option value="openai">OpenAI (Official)</option>
              <option value="deepseek">DeepSeek (OpenAI Compatible)</option>
              <option value="openrouter">OpenRouter (OpenAI Compatible)</option>
              <option value="ollama">Ollama (Local /v1)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">API Key</label>
            <input
              type="password"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500 font-mono"
              placeholder="sk-..."
              value={form.apiKey || ''}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Endpoint URL</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500 font-mono"
              placeholder="https://api.openai.com/v1 or https://your-provider/v1"
              value={form.endpoint || ''}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            />
          </div>
        </div>

        {/* Action Controls for Probing & Testing */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleFetchRemoteModels}
            disabled={isFetchingModels}
            className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            title="Probe endpoint for available models catalog"
          >
            <RefreshCw size={13} className={isFetchingModels ? 'animate-spin' : ''} />
            <span>{isFetchingModels ? 'Probing Endpoint /models...' : 'Fetch Models (/models)'}</span>
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="px-3 py-2 bg-[#212121] hover:bg-[#2a2a2a] text-neutral-300 border border-[#2e2e2e] rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {/* Fetch Notice */}
        {fetchNotice && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              fetchNotice.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}
          >
            {fetchNotice.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{fetchNotice.text}</span>
          </div>
        )}

        {/* Models Catalog & Checkboxes Section */}
        <div className="bg-[#1b1b1b] border border-[#2e2e2e] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-200">
                Models Catalog ({enabledFormCount} of {totalFormCount} enabled)
              </span>
              <span className="text-[11px] text-neutral-400">
                — Uncheck models you do not want shown in chat selectors
              </span>
            </div>
            {totalFormCount > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllModels(true)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Enable All
                </button>
                <span className="text-neutral-600">|</span>
                <button
                  type="button"
                  onClick={() => setAllModels(false)}
                  className="text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Disable All
                </button>
              </div>
            )}
          </div>

          {/* Model search if many models */}
          {totalFormCount > 5 && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-neutral-500" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 bg-[#141414] border border-[#2a2a2a] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500"
                placeholder={`Search ${totalFormCount} models...`}
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              />
            </div>
          )}

          {/* Model Items List */}
          <div className="max-h-52 overflow-y-auto space-y-1 custom-scrollbar pr-1">
            {filteredFormModels.map((m) => {
              const isEnabled = m.enabled !== false;
              const isReasoning = isReasoningModel(m.id);
              return (
                <div
                  key={m.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                    isEnabled
                      ? 'bg-[#222222] border-[#333333] text-neutral-200'
                      : 'bg-[#161616] border-[#222222] text-neutral-500'
                  }`}
                >
                  <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 truncate mr-2">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleModel(m.id)}
                      className="rounded border-[#3e3e3e] bg-[#181818] text-blue-600 focus:ring-0 cursor-pointer w-4 h-4"
                    />
                    <span className={`font-mono text-xs truncate ${isEnabled ? 'text-neutral-200' : 'text-neutral-500 line-through'}`}>
                      {m.id}
                    </span>
                    {isReasoning && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-sans">
                        <span>🧠</span>
                        <span>Reasoning</span>
                      </span>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRemoveModel(m.id)}
                    className="text-neutral-500 hover:text-red-400 p-1 transition-colors"
                    title="Remove model"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}

            {totalFormCount === 0 && (
              <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-[#2a2a2a] rounded-lg">
                No models in catalog yet. Click <strong className="text-purple-400">"Fetch Models (/models)"</strong> above to auto-detect, or add a custom model below.
              </div>
            )}

            {totalFormCount > 0 && filteredFormModels.length === 0 && (
              <div className="py-4 text-center text-xs text-neutral-500">
                No models matching "{modelFilter}"
              </div>
            )}
          </div>

          {/* Add Custom Model Manually */}
          <div className="flex gap-2 pt-2 border-t border-[#262626]">
            <input
              type="text"
              className="flex-1 px-3 py-1.5 bg-[#141414] border border-[#2a2a2a] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500 font-mono"
              placeholder="Add custom model ID (e.g. gpt-4o, claude-3-7-sonnet, llama3:8b)"
              value={newModelInput}
              onChange={(e) => setNewModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddManualModel();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddManualModel}
              disabled={!newModelInput.trim()}
              className="px-3 py-1.5 bg-[#252525] hover:bg-[#303030] text-neutral-200 border border-[#333333] rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              Add Model
            </button>
          </div>
        </div>

        {/* Primary Save Button */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-colors"
          >
            {editingId ? 'Update Provider & Models' : 'Save Provider'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-[#212121] hover:bg-[#2a2a2a] text-neutral-400 hover:text-neutral-200 border border-[#2e2e2e] rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Embedding & Vector RAG Configuration */}
      <EmbeddingRAGCard />
    </div>
  );
};

// Embedding & Vector RAG Component (Custom OpenAI Compatible)
const EmbeddingRAGCard: React.FC = () => {
  const [cfg, setCfg] = useState<EmbeddingConfig>({
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    enabled: true,
  });
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/embedding')
      .then((r) => r.json())
      .then((data) => {
        if (data) setCfg(data);
      })
      .catch((err) => console.error('Failed to load embedding config:', err));
  }, []);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/embedding/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
          model: cfg.model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: data.message || `Connected! Dimensions: ${data.dimensions}`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to connect to embedding provider',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Network error testing embedding provider',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      alert('Failed to save embedding configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-6 border-t border-[#262626] space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Database size={17} className="text-emerald-400" />
          <h3 className="text-base font-bold text-neutral-100">
            Embedding & Vector RAG (OpenAI Compatible)
          </h3>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
            SQLITE VECTOR
          </span>
        </div>
        <p className="text-xs text-neutral-400 mt-0.5">
          Configure custom OpenAI-compatible embedding provider (e.g. OpenAI, Ollama, vLLM, LMStudio) for vector RAG over documents, large pastes, and 128k context compaction.
        </p>
      </div>

      <div className="p-4 bg-[#1b1b1b] border border-[#2e2e2e] rounded-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-200">Enable Vector Knowledge & RAG</span>
            <span className="text-xs text-neutral-500">(Auto-indexes uploads & large pastes into local SQLite)</span>
          </div>
          <button
            type="button"
            onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              cfg.enabled ? 'bg-emerald-600' : 'bg-[#333333]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                cfg.enabled ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Embedding Provider Endpoint</label>
            <input
              type="text"
              value={cfg.endpoint}
              onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 bg-[#121212] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-emerald-500 font-mono"
            />
            <span className="text-[10px] text-neutral-500 mt-1 block">Supports OpenAI or any OpenAI-compatible embedding API</span>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={cfg.apiKey}
                onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full pl-3 pr-8 py-2 bg-[#121212] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">Leave empty if local endpoint requires no auth</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Embedding Model Name</label>
            <input
              type="text"
              value={cfg.model}
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
              placeholder="text-embedding-3-small"
              className="w-full px-3 py-2 bg-[#121212] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-emerald-500 font-mono"
            />
            <span className="text-[10px] text-neutral-500 mt-1 block">Default: text-embedding-3-small</span>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Dimensions</label>
            <input
              type="number"
              value={cfg.dimensions || 1536}
              onChange={(e) => setCfg({ ...cfg, dimensions: parseInt(e.target.value) || 1536 })}
              placeholder="1536"
              className="w-full px-3 py-2 bg-[#121212] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-emerald-500 font-mono"
            />
            <span className="text-[10px] text-neutral-500 mt-1 block">Vector dimension (1536 for text-embedding-3-small)</span>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/30 border-red-500/40 text-red-300'
            }`}
          >
            {testResult.success ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Embedding Settings'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="px-4 py-2 bg-[#262626] hover:bg-[#303030] text-neutral-200 border border-[#333333] rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isTesting ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} className="text-emerald-400" />}
            <span>{isTesting ? 'Testing Probe...' : 'Test Connection'}</span>
          </button>

          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check size={13} /> Settings saved!
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

