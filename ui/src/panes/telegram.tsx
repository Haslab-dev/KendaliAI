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
        <h3 className="text-base font-bold text-neutral-100">Telegram Bot Channel Manager</h3>
        <p className="text-xs text-neutral-400">
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
              className={`p-4 bg-[#212121] border rounded-xl flex items-center justify-between transition-colors ${
                isEditing ? 'border-blue-500/70 bg-[#252525]' : 'border-[#2e2e2e]'
              }`}
            >
              <div className="space-y-1.5">
                <div className="font-semibold text-sm text-neutral-200 flex items-center gap-2">
                  <Smartphone size={16} className="text-sky-400" />
                  <span>{b.name}</span>
                  <span className="text-xs text-neutral-400">
                    → Agent: <code className="text-blue-400 font-semibold">{assignedAgent?.name || b.agentId}</code>
                  </span>
                  {b.model ? (
                    <span className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                      {isReasoningModel(b.model) && <span>🧠</span>}
                      <span>Model: {b.model}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-neutral-400 bg-[#191919] border border-[#2e2e2e] px-2 py-0.5 rounded-md font-mono">
                      Model: Default ({assignedAgent?.model || 'default'})
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500 flex items-center gap-3">
                  <span>Token: <code>••••••••{b.token.slice(-6)}</code></span>
                  <span>ID: <code className="text-neutral-400">{b.id}</code></span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 ${
                    isRunning
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                    }`}
                  />
                  {b.status.toUpperCase()}
                </span>

                {isRunning ? (
                  <button
                    onClick={() => handleToggle(b.id, 'stop')}
                    className="px-3 py-1 bg-[#2e2e2e] hover:bg-[#383838] text-neutral-300 rounded-lg text-xs transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggle(b.id, 'start')}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Start
                  </button>
                )}

                <button
                  onClick={() => handleEdit(b)}
                  className="px-2.5 py-1 bg-[#282828] hover:bg-[#323232] text-neutral-300 border border-[#383838] rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Edit bot configuration"
                >
                  <Edit2 size={12} />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => handleDelete(b.id)}
                  className="text-neutral-500 hover:text-red-400 p-1.5 transition-colors"
                  title="Delete bot"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}

        {bots.length === 0 && (
          <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-[#2a2a2a] rounded-xl">
            No Telegram bots registered yet. Create one below to connect your Telegram chats to KendaliAI agents.
          </div>
        )}
      </div>

      <div ref={formRef} className="border-t border-[#262626] pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-neutral-200">
              {editingBotId ? `Edit Telegram Bot: ${form.name}` : 'Register Telegram Bot'}
            </h4>
            {editingBotId && (
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
                EDITING MODE
              </span>
            )}
          </div>
          {editingBotId && (
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
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Bot Label</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500"
              placeholder="e.g. Engineer Bot"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">
              Bot Token (@BotFather)
            </label>
            <input
              type="password"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500 font-mono"
              placeholder="123456:ABC-DEF..."
              value={form.token || ''}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">
              Target Agent Persona
            </label>
            <select
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500"
              value={form.agentId || 'engineer'}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.avatar || '🤖'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">
              Default Model (from Providers)
            </label>
            <select
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none focus:border-blue-500 font-mono"
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
                        {m.id} {isReasoningModel(m.id) ? '🧠 (Reasoning)' : ''}
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
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-colors"
          >
            {editingBotId ? 'Update Telegram Bot' : 'Save & Launch Bot'}
          </button>
          {editingBotId && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-[#212121] hover:bg-[#2a2a2a] text-neutral-400 hover:text-neutral-200 border border-[#2e2e2e] rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

