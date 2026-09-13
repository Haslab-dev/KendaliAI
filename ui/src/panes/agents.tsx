import React, { useState } from 'react';
import {
  Bot, MessageSquare, Plus, Trash2, Edit2, Check,
  X, Sparkles, ExternalLink, Wrench, Brain
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AgentConfig, isReasoningModel } from '../types';
import { navigate } from '../router';

export const AgentsPane: React.FC = () => {
  const { agents, loadAgents, setActiveAgent, activeAgent, providers, createSession } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);

  const [form, setForm] = useState<Partial<AgentConfig>>({
    id: '',
    name: '',
    avatar: '🤖',
    model: '',
    description: '',
    systemPrompt: '',
    tools: ['edit', 'bash', 'review_code'],
    skills: ['coding', 'debugging'],
    isDefault: false,
  });

  const openNewModal = () => {
    setEditingAgent(null);
    setForm({
      id: '',
      name: '',
      avatar: '🤖',
      model: '',
      description: '',
      systemPrompt: '',
      tools: ['edit', 'bash', 'review_code'],
      skills: ['coding', 'debugging'],
      isDefault: false,
    });
    setShowModal(true);
  };

  const openEditModal = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setForm(agent);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.id) return alert('Agent ID and Name are required');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowModal(false);
        await loadAgents();
      } else {
        alert('Failed to save agent persona');
      }
    } catch (e) {
      alert('Error saving agent persona');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete agent persona "${id}"?`)) return;
    try {
      await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
      await loadAgents();
    } catch (e) {
      console.error('Failed to delete agent', e);
    }
  };

  const handleChatWithAgent = async (agent: AgentConfig) => {
    setActiveAgent(agent);
    await createSession(agent.id);
    navigate('chat');
  };

  // Fallback preset personas if none are loaded yet
  const displayAgents = agents.length > 0 ? agents : [
    {
      id: 'coder',
      name: 'Coder',
      avatar: '🛠️',
      model: 'claude-sonnet-4-6',
      description: 'Senior engineer — code authoring, refactoring, test runs, architecture.',
      tools: ['edit', 'bash', 'review_code', 'git_worktree', 'read_file', 'write_file'],
      skills: ['coding', 'architecture'],
      systemPrompt: '',
      providerId: '',
      mcp: [],
      memoryScopes: [],
      policy: {},
      isDefault: true,
    },
    {
      id: 'planner',
      name: 'Planner',
      avatar: '📋',
      model: 'gpt-5',
      description: 'System decomposition, technical roadmaps, milestone breakdowns.',
      tools: ['schedule_task', 'read_file', 'browser', 'memory'],
      skills: ['planning', 'coordination'],
      systemPrompt: '',
      providerId: '',
      mcp: [],
      memoryScopes: [],
      policy: {},
      isDefault: false,
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      avatar: '🛡️',
      model: 'claude-sonnet-4-6',
      description: 'Diff inspection, security vulnerability scanner, credential leak detection.',
      tools: ['review_code', 'git_diff', 'check_secrets'],
      skills: ['security', 'audit'],
      systemPrompt: '',
      providerId: '',
      mcp: [],
      memoryScopes: [],
      policy: {},
      isDefault: false,
    },
    {
      id: 'assistant',
      name: 'Assistant',
      avatar: '⚡',
      model: 'deepseek-v3',
      description: 'Daily executive coordinator, natural language instructions, reminders, cron jobs.',
      tools: ['schedule_reminder', 'weather', 'calendar'],
      skills: ['executive', 'reminders'],
      systemPrompt: '',
      providerId: '',
      mcp: [],
      memoryScopes: [],
      policy: {},
      isDefault: false,
    },
    {
      id: 'research',
      name: 'Research',
      avatar: '🔍',
      model: 'deepseek-r1',
      description: 'Deep web searches, competitor analysis, arXiv synthesis, citations.',
      tools: ['web_search', 'read_url', 'pdf_extract'],
      skills: ['research', 'synthesis'],
      systemPrompt: '',
      providerId: '',
      mcp: [],
      memoryScopes: [],
      policy: {},
      isDefault: false,
    },
    {
      id: 'knowledge',
      name: 'Knowledge',
      avatar: '📚',
      model: 'claude-sonnet-4-6',
      description: 'RAG query engine, semantic document retrieval, vector database management.',
      tools: ['rag_search', 'ingest_doc', 'index_chunks'],
      skills: ['rag', 'vector-search'],
      systemPrompt: '',
      providerId: '',
      mcp: [],
      memoryScopes: [],
      policy: {},
      isDefault: false,
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#F7F7F5] overflow-y-auto custom-scrollbar">
      {/* Page Header matching refs/desktop/agents.html */}
      <div className="w-full shrink-0 h-[80px] flex flex-row gap-3.5 px-6 sm:px-9 items-center bg-[#FFFFFF] border-b border-[#E5E7EB] z-10 select-none">
        <div className="flex-1 flex flex-col gap-0.5 justify-start items-start">
          <div className="text-[20px] text-[#000000] font-inter font-bold">
            Agent Personas
          </div>
          <div className="text-[12px] text-[#8A8A85] font-funnel font-normal">
            Instantly selectable from the chat header · invoke as /skill:&lt;agent&gt; · install_agent · list_agents
          </div>
        </div>

        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2 bg-[#0F0F0F] hover:bg-[#2A2A2A] text-[#FFFFFF] rounded-[8px] font-inter font-bold text-[12px] transition-colors shadow-2xs"
        >
          <Plus size={14} />
          <span>New Persona</span>
        </button>
      </div>

      {/* Main Grid matching reference */}
      <div className="flex-1 p-6 sm:p-9 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayAgents.map((ag) => {
            const isActive = activeAgent?.id === ag.id;
            return (
              <div
                key={ag.id}
                className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] shadow-2xs flex flex-col gap-2.5 hover:border-[#D97706] transition-all"
              >
                {/* Top row */}
                <div className="w-full flex flex-row gap-2.5 items-center">
                  <div className="w-[42px] h-[42px] shrink-0 flex items-center justify-center bg-[#FFF5EB] rounded-[8px] text-[20px]">
                    {ag.avatar || '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-[#000000] font-inter font-bold truncate">
                      {ag.name}
                    </div>
                    <div className="text-[10px] text-[#8A8A85] font-mono truncate">
                      {ag.model || 'default'}
                    </div>
                  </div>
                  {isActive ? (
                    <div className="px-2 py-0.5 bg-[#DCFCE7] rounded-[4px] text-[10px] text-[#16A34A] font-funnel font-bold">
                      active
                    </div>
                  ) : ag.isDefault ? (
                    <div className="px-2 py-0.5 bg-[#FFF5EB] rounded-[4px] text-[10px] text-[#D97706] font-funnel font-bold">
                      default
                    </div>
                  ) : null}
                </div>

                {/* Description */}
                <div className="text-[12px]/[18px] text-[#333333] font-geist line-clamp-2 min-h-[36px]">
                  {ag.description}
                </div>

                {/* Bottom row: Tools count and actions */}
                <div className="w-full flex items-center gap-2 pt-1 border-t border-[#F0F0EE]">
                  <div className="text-[10px] text-[#8A8A85] font-funnel">
                    {(ag.tools || []).length} tools registered
                  </div>
                  <div className="flex-1" />

                  {/* Chat With Agent Button */}
                  <button
                    onClick={() => handleChatWithAgent(ag)}
                    className="w-[28px] h-[28px] flex items-center justify-center border border-[#E5E7EB] hover:bg-[#F7F7F5] rounded-[4px] text-[#333333] transition-colors"
                    title="Start Chat with Agent"
                  >
                    <MessageSquare size={13} />
                  </button>

                  {/* Edit Button */}
                  <button
                    onClick={() => openEditModal(ag)}
                    className="w-[28px] h-[28px] flex items-center justify-center border border-[#E5E7EB] hover:bg-[#F7F7F5] rounded-[4px] text-[#333333] transition-colors"
                    title="Edit Persona Manifest"
                  >
                    <Edit2 size={13} />
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(ag.id)}
                    className="w-[28px] h-[28px] flex items-center justify-center border border-[#E5E7EB] hover:bg-red-50 text-red-500 rounded-[4px] transition-colors"
                    title="Delete Persona"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create / Edit Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-bold font-inter text-[#000000]">
                {editingAgent ? `Edit Persona: ${editingAgent.name}` : 'New Agent Persona'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[#8A8A85] hover:text-[#000000]">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-[#8A8A85] font-funnel uppercase">ID</label>
                <input
                  type="text"
                  disabled={!!editingAgent}
                  value={form.id || ''}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="e.g. devops"
                  className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-xs font-mono text-[#000000] outline-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#8A8A85] font-funnel uppercase">Display Name</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. DevOps Engineer"
                  className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-xs font-geist text-[#000000] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#8A8A85] font-funnel uppercase">Avatar Emoji</label>
                <input
                  type="text"
                  value={form.avatar || ''}
                  onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                  placeholder="🛠️"
                  className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-sm text-center text-[#000000] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#8A8A85] font-funnel uppercase">Model Preference</label>
              <select
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-xs font-mono text-[#000000] outline-none"
              >
                <option value="">Inherit Active Provider Default</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="gpt-5">GPT-5 / GPT-4o</option>
                <option value="deepseek-v3">DeepSeek V3</option>
                <option value="deepseek-r1">DeepSeek R1 (Reasoning)</option>
                <option value="ollama/qwen2.5-coder:7b">Ollama / Qwen 2.5 Coder (Local)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#8A8A85] font-funnel uppercase">Description</label>
              <input
                type="text"
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief summary of duties and responsibilities"
                className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-xs font-geist text-[#000000] outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#8A8A85] font-funnel uppercase">System Prompt Instructions</label>
              <textarea
                rows={3}
                value={form.systemPrompt || ''}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="You are a senior software engineer specializing in..."
                className="w-full mt-1 p-2.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] text-xs font-mono text-[#000000] outline-none resize-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
              <label className="flex items-center gap-2 text-xs font-funnel text-[#333333] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isDefault || false}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="rounded border-[#E5E7EB] text-[#007AFF]"
                />
                <span>Set as Default Persona</span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-[#E5E7EB] text-xs font-funnel text-[#8A8A85] hover:text-[#000000] rounded-[4px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-1.5 bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-funnel font-bold rounded-[4px] transition-colors"
                >
                  Save Persona
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
