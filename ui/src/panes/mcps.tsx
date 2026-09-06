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
        <h3 className="text-base font-bold text-hi">Model Context Protocol (MCP) Servers</h3>
        <p className="text-xs text-mid">
          Supervised background processes or remote SSE tool endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {mcps.map((m) => (
          <div key={m.id} className="p-4 bg-raised border border-line rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm text-hi flex items-center gap-1.5">
                <Plug size={15} className="text-hi" />
                <span>{m.name}</span>
                <span className="text-[10px] text-lo uppercase">({m.transport})</span>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="text-lo hover:text-red-400 p-1"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="text-xs text-mid font-mono truncate">
              {m.command} {(m.args || []).join(' ')}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line pt-5 space-y-3">
        <h4 className="text-sm font-semibold text-hi">Register New MCP Server</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Name</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="e.g. github"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Transport</label>
            <select
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              value={form.transport || 'stdio'}
              onChange={(e) => setForm({ ...form, transport: e.target.value as any })}
            >
              <option value="stdio">Stdio (Local CLI)</option>
              <option value="sse">SSE (HTTP endpoint)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Command</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
              placeholder="npx"
              value={form.command || ''}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-mid uppercase">Arguments</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none"
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
          className="px-4 py-2 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold"
        >
          Save MCP Server
        </button>
      </div>
    </div>
  );
};

