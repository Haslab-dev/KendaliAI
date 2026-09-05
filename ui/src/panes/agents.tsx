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

// 2. Agents Tab
export const AgentsPane: React.FC = () => {
  const { agents, loadAgents, setActiveAgent, providers } = useAppStore();
  const [form, setForm] = useState<Partial<AgentConfig>>({
    id: '',
    name: '',
    avatar: '',
    model: '',
    description: '',
    systemPrompt: '',
    tools: ['filesystem.*', 'shell.*', 'git.*'],
    skills: ['coding', 'debugging'],
  });

  const handleSave = async () => {
    if (!form.name) return alert('Agent name is required');
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    alert('Agent manifest saved!');
    loadAgents();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete agent?')) return;
    await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
    loadAgents();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-hi">Agent Personas & Manifests</h3>
        <p className="text-xs text-mid">
          Declarative agent manifests defining role prompts, allowed tools, skills, and model preferences.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {agents.map((a) => (
          <div
            key={a.id}
            className="p-4 bg-raised border border-line rounded-xl space-y-2 cursor-pointer hover:border-mid transition-colors"
            onClick={() => {
              setActiveAgent(a);
              setForm(a);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl text-mid flex items-center"><Bot size={18} /></span>
                <span className="font-semibold text-sm text-hi">{a.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(a.id);
                }}
                className="text-lo hover:text-red-400 p-1"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="text-xs text-mid line-clamp-2">{a.description}</div>
            <div className="text-[11px] text-lo flex items-center gap-2">
              <span>Model: <code className="text-hi font-mono">{a.model}</code></span>
              <span>|</span>
              <span>Tools: <code>{(a.tools || []).length}</code></span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      <div className="border-t border-line pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-hi">Create / Edit Agent Manifest</h4>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">ID</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="e.g. devops"
              value={form.id || ''}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Display Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="e.g. DevOps Engineer"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Avatar Emoji</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none text-center"
              value={form.avatar || ''}
              onChange={(e) => setForm({ ...form, avatar: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Model Preference</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none font-mono"
              value={form.model || ''}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            >
              <option value="">Inherit Active Provider Default</option>
              {providers.map((p) => {
                const enabledMods = (p.models || []).filter((m) => m.enabled !== false);
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
          <div className="col-span-3">
            <label className="text-[11px] font-semibold text-mid uppercase">Description</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="Specialized duties"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="col-span-3">
            <label className="text-[11px] font-semibold text-mid uppercase">
              System Prompt
            </label>
            <textarea
              rows={4}
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi font-mono outline-none"
              placeholder="You are an expert..."
              value={form.systemPrompt || ''}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </div>
          <div className="col-span-3">
            <label className="text-[11px] font-semibold text-mid uppercase">
              Allowed Tools (comma-separated)
            </label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="filesystem.*, shell.*, git.*"
              value={(form.tools || []).join(', ')}
              onChange={(e) =>
                setForm({
                  ...form,
                  tools: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                })
              }
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold"
        >
          Save Agent
        </button>
      </div>
    </div>
  );
};

