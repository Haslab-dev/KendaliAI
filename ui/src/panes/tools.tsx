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

// 6. Tools Tab
export const ToolsPane: React.FC = () => {
  const { agents } = useAppStore();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('personal-assistant');
  const [policies, setPolicies] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then(setTools);
  }, []);

  const fetchPolicies = async () => {
    const res = await fetch(`/api/policies?agentId=${selectedAgent}`);
    const data = await res.json();
    const map: Record<string, string> = {};
    data.forEach((p: any) => (map[p.toolName] = p.effect));
    setPolicies(map);
  };

  useEffect(() => {
    fetchPolicies();
  }, [selectedAgent]);

  const handlePolicyChange = async (toolName: string, effect: string) => {
    await fetch('/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: selectedAgent, toolName, effect }),
    });
    setPolicies({ ...policies, [toolName]: effect });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-hi">Capability Tools & Policies</h3>
          <p className="text-xs text-mid">
            Configure ALLOW, APPROVAL (Human-in-the-loop), or DENY policies per agent role.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-mid">Role:</span>
          <select
            className="px-3 py-1.5 bg-raised border border-line rounded-lg text-xs text-hi outline-none"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-line text-mid uppercase font-semibold">
            <th className="py-2.5 px-3">Tool Name</th>
            <th className="py-2.5 px-3">Category</th>
            <th className="py-2.5 px-3">Signature</th>
            <th className="py-2.5 px-3 text-right">Policy Action</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => {
            const current = policies[t.name] || 'ALLOW';
            return (
              <tr key={t.name} className="border-b border-line hover:bg-raised">
                <td className="py-2 px-3 font-semibold text-hi font-mono">{t.name}</td>
                <td className="py-2 px-3">
                  <span className="bg-raised text-mid px-2 py-0.5 rounded text-[10px]">
                    {t.category}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-[11px] text-lo truncate max-w-xs">
                  {t.signature}
                </td>
                <td className="py-2 px-3 text-right">
                  <select
                    className={`px-2 py-1 rounded text-xs font-semibold outline-none ${
                      current === 'DENY'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : current === 'APPROVAL'
                        ? 'bg-raised text-mid border bg-raised'
                        : 'bg-raised text-hi border bg-raised'
                    }`}
                    value={current}
                    onChange={(e) => handlePolicyChange(t.name, e.target.value)}
                  >
                    <option value="ALLOW">ALLOW</option>
                    <option value="APPROVAL">APPROVAL</option>
                    <option value="DENY">DENY</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

