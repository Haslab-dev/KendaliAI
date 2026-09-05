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

// 7. Telegram Tab
export const TelegramPane: React.FC = () => {
  const { agents, providers } = useAppStore();
  const [bots, setBots] = useState<TelegramBotConfig[]>([]);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TelegramBotConfig>>({
    name: '',
    token: '',
    agentId: 'personal-assistant',
    model: '',
    providerId: '',
    enabled: true,
  });
  const formRef = useRef<HTMLDivElement>(null);

  const fetchBots = async () => {
    try {
      const res = await fetch('/api/telegram/bots');
      const data = await res.json();
      setBots(data || []);
    } catch (e) {
      console.error('Failed to load Telegram bots:', e);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  const handleEdit = (b: TelegramBotConfig) => {
    setEditingBotId(b.id);
    setForm({
      id: b.id,
      name: b.name,
      token: b.token,
      agentId: b.agentId,
      model: b.model || '',
      providerId: b.providerId || '',
      enabled: b.enabled,
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingBotId(null);
    setForm({
      name: '',
      token: '',
      agentId: 'personal-assistant',
      model: '',
      providerId: '',
      enabled: true,
    });
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.token?.trim()) {
      return alert('Bot Name & Token are required');
    }
    try {
      const payload = {
        ...form,
        id: editingBotId || form.id || undefined,
      };
      await fetch('/api/telegram/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      alert(editingBotId ? 'Telegram bot updated successfully!' : 'Telegram bot saved & launched!');
      handleCancelEdit();
      fetchBots();
    } catch (e) {
      alert('Failed to save Telegram bot: ' + e);
    }
  };

  const handleToggle = async (id: string, action: 'start' | 'stop') => {
    await fetch(`/api/telegram/bots/${id}/${action}`, { method: 'POST' });
    fetchBots();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete bot?')) return;
    await fetch(`/api/telegram/bots?id=${id}`, { method: 'DELETE' });
    if (editingBotId === id) handleCancelEdit();
    fetchBots();
  };

  const selectedAgent = agents.find((a) => a.id === form.agentId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-hi">Telegram Bot Channel Manager</h3>
        <p className="text-xs text-mid">
          Map Telegram bots directly to agents and assign model overrides. Conversations synchronize bidirectionally with Web.
        </p>
      </div>

      <div className="space-y-3">
        {bots.map((b) => {
          const isRunning = b.status === 'running';
          const isEditing = editingBotId === b.id;
          const assignedAgent = agents.find((a) => a.id === b.agentId);

          return (
            <div
              key={b.id}
              className={`p-4 bg-raised border rounded-xl flex items-center justify-between transition-colors ${
                isEditing ? 'bg-raised bg-raised' : 'border-line'
              }`}
            >
              <div className="space-y-1.5">
                <div className="font-semibold text-sm text-hi flex items-center gap-2">
                  <Smartphone size={16} className="text-hi" />
                  <span>{b.name}</span>
                  <span className="text-xs text-mid">
                    → Agent: <code className="text-hi font-semibold">{assignedAgent?.name || b.agentId}</code>
                  </span>
                  {b.model ? (
                    <span className="text-xs text-hi bg-raised border bg-raised px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                      {isReasoningModel(b.model) && <Brain size={12} className="inline text-mid" />}
                      <span>Model: {b.model}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-mid bg-panel border border-line px-2 py-0.5 rounded-md font-mono">
                      Model: Default ({assignedAgent?.model || 'default'})
                    </span>
                  )}
                </div>
                <div className="text-xs text-lo flex items-center gap-3">
                  <span>Token: <code>••••••••{b.token.slice(-6)}</code></span>
                  <span>ID: <code className="text-mid">{b.id}</code></span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 ${
                    isRunning
                      ? 'bg-raised text-hi border bg-raised'
                      : 'bg-raised text-mid border border-neutral-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRunning ? 'bg-hi animate-pulse' : 'bg-neutral-500'
                    }`}
                  />
                  {b.status.toUpperCase()}
                </span>

                {isRunning ? (
                  <button
                    onClick={() => handleToggle(b.id, 'stop')}
                    className="px-3 py-1 bg-raised hover:bg-hoverbg text-mid rounded-lg text-xs transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggle(b.id, 'start')}
                    className="px-3 py-1 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold transition-colors"
                  >
                    Start
                  </button>
                )}

                <button
                  onClick={() => handleEdit(b)}
                  className="px-2.5 py-1 bg-raised hover:bg-hoverbg text-mid border border-line rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Edit bot configuration"
                >
                  <Edit2 size={12} />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => handleDelete(b.id)}
                  className="text-lo hover:text-red-400 p-1.5 transition-colors"
                  title="Delete bot"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}

        {bots.length === 0 && (
          <div className="py-8 text-center text-xs text-lo border border-dashed border-line rounded-xl">
            No Telegram bots registered yet. Create one below to connect your Telegram chats to KendaliAI agents.
          </div>
        )}
      </div>

      <div ref={formRef} className="border-t border-line pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-hi">
              {editingBotId ? `Edit Telegram Bot: ${form.name}` : 'Register Telegram Bot'}
            </h4>
            {editingBotId && (
              <span className="text-[10px] bg-raised text-hi px-2 py-0.5 rounded-full font-bold">
                EDITING MODE
              </span>
            )}
          </div>
          {editingBotId && (
            <button
              onClick={handleCancelEdit}
              className="text-xs text-mid hover:text-hi px-2 py-1 hover:bg-hoverbg bg-hoverbg rounded-lg transition-colors"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Bot Label</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-line"
              placeholder="e.g. Engineer Bot"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">
              Bot Token (@BotFather)
            </label>
            <input
              type="password"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-line font-mono"
              placeholder="123456:ABC-DEF..."
              value={form.token || ''}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">
              Target Agent Persona
            </label>
            <select
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-line"
              value={form.agentId || 'engineer'}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">
              Default Model (from Providers)
            </label>
            <select
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-line font-mono"
              value={form.model || ''}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            >
              <option value="">
                Agent Default ({selectedAgent?.model || 'default'})
              </option>
              {providers.map((p) => {
                const enabledMods = (p.models || []).filter((m) => m.enabled !== false);
                if (enabledMods.length === 0) return null;
                return (
                  <optgroup key={p.id} label={`${p.name} (${p.type})`}>
                    {enabledMods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}{isReasoningModel(m.id) ? ' (reasoning)' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold shadow-lg transition-colors"
          >
            {editingBotId ? 'Update Telegram Bot' : 'Save & Launch Bot'}
          </button>
          {editingBotId && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-raised hover:bg-hoverbg text-mid hover:text-hi border border-line rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

