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
    avatar: '🤖',
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
        <h3 className="text-base font-bold text-neutral-100">Agent Personas & Manifests</h3>
        <p className="text-xs text-neutral-400">
          Declarative agent manifests defining role prompts, allowed tools, skills, and model preferences.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {agents.map((a) => (
          <div
            key={a.id}
            className="p-4 bg-[#212121] border border-[#2e2e2e] rounded-xl space-y-2 cursor-pointer hover:border-neutral-500 transition-colors"
            onClick={() => {
              setActiveAgent(a);
              setForm(a);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{a.avatar || '🤖'}</span>
                <span className="font-semibold text-sm text-neutral-200">{a.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(a.id);
                }}
                className="text-neutral-500 hover:text-red-400 p-1"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="text-xs text-neutral-400 line-clamp-2">{a.description}</div>
            <div className="text-[11px] text-neutral-500 flex items-center gap-2">
              <span>Model: <code className="text-purple-300 font-mono">{a.model}</code></span>
              <span>|</span>
              <span>Tools: <code>{(a.tools || []).length}</code></span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      <div className="border-t border-[#262626] pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-neutral-200">Create / Edit Agent Manifest</h4>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">ID</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              placeholder="e.g. devops"
              value={form.id || ''}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Display Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              placeholder="e.g. DevOps Engineer"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Avatar Emoji</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none text-center"
              value={form.avatar || '🤖'}
              onChange={(e) => setForm({ ...form, avatar: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Model Preference</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none font-mono"
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
                        {m.id} {isReasoningModel(m.id) ? '🧠' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="col-span-3">
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Description</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              placeholder="Specialized duties"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="col-span-3">
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">
              System Prompt
            </label>
            <textarea
              rows={4}
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 font-mono outline-none"
              placeholder="You are an expert..."
              value={form.systemPrompt || ''}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </div>
          <div className="col-span-3">
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">
              Allowed Tools (comma-separated)
            </label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
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
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
        >
          Save Agent
        </button>
      </div>
    </div>
  );
};

