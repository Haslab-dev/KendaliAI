import React, { useState } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import {
  Edit3,
  Copy,
  Trash2,
  FileText,
  ChevronRight,
  Shield,
  Wrench,
  Server,
  Zap,
  Save,
  X,
} from 'lucide-react';
import { AgentConfig } from '../../types';

export const AgentProfileDetail: React.FC = () => {
  const { activeAgent, updateAgent, duplicateAgent, deleteAgent, setActiveNavTab } = useProfileStore();
  const { availableModels, defaultModel } = useAppStore();

  const [activeTab, setActiveTab] = useState<'prompt' | 'behavior' | 'tools' | 'mcp' | 'skills'>('prompt');
  
  // Modal state for editing system prompt or soul files
  const [editingFile, setEditingFile] = useState<{
    key: 'systemPrompt' | 'soul' | 'style' | 'instructions' | 'memory';
    title: string;
    content: string;
  } | null>(null);

  if (!activeAgent) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-xs text-muted-foreground">
        No agent selected. Select an agent from the left rail.
      </div>
    );
  }

  const soul = activeAgent.soulStack || {};

  const handleOpenEditor = (key: 'systemPrompt' | 'soul' | 'style' | 'instructions' | 'memory', title: string) => {
    let content = '';
    if (key === 'systemPrompt') {
      content = activeAgent.systemPrompt || '';
    } else {
      content = soul[key] || '';
    }
    setEditingFile({ key, title, content });
  };

  const handleSaveEditor = async () => {
    if (!editingFile) return;

    if (editingFile.key === 'systemPrompt') {
      await updateAgent({ id: activeAgent.id, systemPrompt: editingFile.content });
    } else {
      const updatedSoul = {
        ...soul,
        [editingFile.key]: editingFile.content,
      };
      await updateAgent({ id: activeAgent.id, soulStack: updatedSoul });
    }

    setEditingFile(null);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0a0a0c] px-4 sm:px-8 py-8 select-none">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Agent Profile Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-muted border border-border/80 flex items-center justify-center text-4xl shadow-xl">
            {activeAgent.avatar?.slice(0, 2) || '🤖'}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {activeAgent.name}
            </h1>
            {activeAgent.role && (
              <p className="text-xs text-muted-foreground">{activeAgent.role}</p>
            )}
          </div>

          {/* Engine, Model & Reasoning Selectors */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            {/* Engine Selector */}
            <select
              value={activeAgent.engine || 'rakit'}
              onChange={(e) => updateAgent({ id: activeAgent.id, engine: e.target.value as any })}
              className="bg-muted/60 border border-border rounded-xl px-2.5 py-1 text-foreground focus:outline-none cursor-pointer"
            >
              <option value="rakit">RakitKode (Native)</option>
              <option value="acp">Claude Code (ACP)</option>
              <option value="codex">Codex (ACP)</option>
            </select>

            <span>•</span>

            {/* Model Selector */}
            <select
              value={activeAgent.model || defaultModel || ''}
              onChange={(e) => updateAgent({ id: activeAgent.id, model: e.target.value })}
              className="bg-muted/60 border border-border rounded-xl px-2.5 py-1 text-foreground focus:outline-none cursor-pointer max-w-[180px] truncate"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
              {!availableModels.some((m) => m.id === activeAgent.model) && activeAgent.model && (
                <option value={activeAgent.model}>{activeAgent.model}</option>
              )}
            </select>

            {/* Super Agent Badge */}
            {activeAgent.isSuper && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                super
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-muted/40 border border-border/50 rounded-2xl text-xs max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('prompt')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'prompt' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Prompt
          </button>
          <button
            onClick={() => setActiveTab('behavior')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'behavior' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Behavior
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'tools' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tools {activeAgent.tools?.length ? `(${activeAgent.tools.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'mcp' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            MCP {activeAgent.mcp?.length ? `(${activeAgent.mcp.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'skills' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Skills {activeAgent.skills?.length ? `(${activeAgent.skills.length})` : ''}
          </button>
        </div>

        {/* Tab 1: Prompt & Soul Stack */}
        {activeTab === 'prompt' && (
          <div className="space-y-6">
            {/* System Prompt Box */}
            <div className="rounded-2xl bg-[#121216] border border-border/60 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">System prompt</span>
                <button
                  onClick={() => handleOpenEditor('systemPrompt', 'System Prompt')}
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground font-mono bg-muted/30 p-2.5 rounded-xl whitespace-pre-wrap max-h-32 overflow-y-auto">
                {activeAgent.systemPrompt || 'No system prompt defined.'}
              </p>
            </div>

            {/* Soul Stack Cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Agent Prompt Stack
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* SOUL.md */}
                <div
                  onClick={() => handleOpenEditor('soul', 'SOUL.md (Identity & Worldview)')}
                  className="rounded-2xl bg-[#121216] hover:bg-[#16161b] border border-border/60 p-3.5 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-mono font-bold text-xs text-foreground">SOUL.md</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {soul.soul ? soul.soul.slice(0, 36) + '...' : 'Identity, worldview, and persona'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>

                {/* STYLE.md */}
                <div
                  onClick={() => handleOpenEditor('style', 'STYLE.md (Voice & Tone)')}
                  className="rounded-2xl bg-[#121216] hover:bg-[#16161b] border border-border/60 p-3.5 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-mono font-bold text-xs text-foreground">STYLE.md</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {soul.style ? soul.style.slice(0, 36) + '...' : 'Voice, tone, and formatting'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>

                {/* INSTRUCTIONS.md */}
                <div
                  onClick={() => handleOpenEditor('instructions', 'INSTRUCTIONS.md (SOP & Safety)')}
                  className="rounded-2xl bg-[#121216] hover:bg-[#16161b] border border-border/60 p-3.5 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-mono font-bold text-xs text-foreground">INSTRUCTIONS.md</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {soul.instructions ? soul.instructions.slice(0, 36) + '...' : 'Operating instructions and SOP'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>

                {/* MEMORY.md */}
                <div
                  onClick={() => handleOpenEditor('memory', 'MEMORY.md (Agent Long-Term Memory)')}
                  className="rounded-2xl bg-[#121216] hover:bg-[#16161b] border border-border/60 p-3.5 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-mono font-bold text-xs text-foreground">MEMORY.md</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {soul.memory ? soul.memory.slice(0, 36) + '...' : 'Continuity and context learned'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Behavior */}
        {activeTab === 'behavior' && (
          <div className="rounded-2xl bg-[#121216] border border-border/60 p-5 space-y-4 text-xs">
            <h3 className="font-semibold text-foreground">Agent Behavior & Execution</h3>
            <p className="text-muted-foreground">
              Configure how this agent behaves in sessions, executes tools, and confirms actions with you.
            </p>
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeAgent.isDefault}
                  onChange={(e) => updateAgent({ id: activeAgent.id, isDefault: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-0"
                />
                <span className="text-foreground">Set as default organization agent</span>
              </label>
            </div>
          </div>
        )}

        {/* Tab 3: Tools */}
        {activeTab === 'tools' && (
          <div className="rounded-2xl bg-[#121216] border border-border/60 p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Assigned Tools</h3>
              <span className="text-muted-foreground">{activeAgent.tools?.length || 0} tools enabled</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {(activeAgent.tools || ['read_file', 'write_file', 'bash', 'search_files', 'web_search']).map((tool) => (
                <span
                  key={tool}
                  className="px-2.5 py-1 rounded-lg bg-muted/60 border border-border font-mono text-foreground text-[11px]"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Actions: Duplicate / Delete */}
        <div className="flex items-center justify-center gap-3 pt-6 border-t border-border/30">
          <button
            onClick={async () => {
              const copy = await duplicateAgent(activeAgent.id);
              if (copy) setActiveNavTab('agent');
            }}
            className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted border border-border text-xs font-semibold text-foreground flex items-center gap-2 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>

          {!activeAgent.isDefault && !activeAgent.isSuper && (
            <button
              onClick={async () => {
                if (confirm(`Are you sure you want to delete ${activeAgent.name}?`)) {
                  await deleteAgent(activeAgent.id);
                  setActiveNavTab('chat');
                }
              }}
              className="px-4 py-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-xs font-semibold text-destructive flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete agent</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Modal for Soul & System Prompt */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#141418] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground">{editingFile.title}</h3>
              <button
                onClick={() => setEditingFile(null)}
                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                rows={14}
                className="w-full bg-[#0d0d10] border border-border/60 rounded-xl p-3 font-mono text-xs text-foreground focus:outline-none focus:border-primary/60 resize-none leading-relaxed"
                placeholder="Enter markdown content..."
              />
            </div>

            <div className="px-5 py-3 border-t border-border/40 flex items-center justify-end gap-2 bg-muted/10">
              <button
                onClick={() => setEditingFile(null)}
                className="px-3.5 py-1.5 rounded-xl hover:bg-muted text-xs font-medium text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditor}
                className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
