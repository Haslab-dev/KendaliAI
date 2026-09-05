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

// 4. MCP Servers Tab
export const McpsPane: React.FC = () => {
  const [mcps, setMcps] = useState<MCPServerConfig[]>([]);
  const [form, setForm] = useState<Partial<MCPServerConfig>>({
    name: '',
    transport: 'stdio',
    command: 'npx',
    args: [],
    url: '',
    enabled: true,
  });

  const fetchMCPs = async () => {
    const res = await fetch('/api/mcps');
    setMcps(await res.json());
  };

  useEffect(() => {
    fetchMCPs();
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-neutral-100">Model Context Protocol (MCP) Servers</h3>
        <p className="text-xs text-neutral-400">
          Supervised background processes or remote SSE tool endpoints.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {mcps.map((m) => (
          <div key={m.id} className="p-4 bg-[#212121] border border-[#2e2e2e] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm text-neutral-200 flex items-center gap-1.5">
                <Plug size={15} className="text-purple-400" />
                <span>{m.name}</span>
                <span className="text-[10px] text-neutral-500 uppercase">({m.transport})</span>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="text-neutral-500 hover:text-red-400 p-1"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="text-xs text-neutral-400 font-mono truncate">
              {m.command} {(m.args || []).join(' ')}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#262626] pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-neutral-200">Register New MCP Server</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              placeholder="e.g. github"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Transport</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              value={form.transport || 'stdio'}
              onChange={(e) => setForm({ ...form, transport: e.target.value as any })}
            >
              <option value="stdio">Stdio (Local CLI)</option>
              <option value="sse">SSE (HTTP endpoint)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Command</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              placeholder="npx"
              value={form.command || ''}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase">Arguments</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-[#1b1b1b] border border-[#2e2e2e] rounded-lg text-xs text-neutral-200 outline-none"
              placeholder="-y @modelcontextprotocol/server-github"
              value={(form.args || []).join(' ')}
              onChange={(e) =>
                setForm({ ...form, args: e.target.value.split(' ').filter(Boolean) })
              }
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
        >
          Save MCP Server
        </button>
      </div>
    </div>
  );
};

