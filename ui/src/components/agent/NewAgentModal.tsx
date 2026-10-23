import React, { useState, useMemo } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { X, Bot, Plus, Sparkles, Check } from 'lucide-react';
import { ProviderIcon } from './ProviderIcon';
import { GrokAvatar, GROK_AVATARS } from '../GrokAvatar';
import { AgentIcon } from '../shell/AgentIcon';

interface NewAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewAgentModal: React.FC<NewAgentModalProps> = ({ isOpen, onClose }) => {
  const { createAgent, selectAgent, setActiveNavTab } = useProfileStore();
  const { availableModels, defaultModel } = useAppStore();
  const acpAgents = useAgentStore((s) => s.acpAgents);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('purple-pebble');
  const [engineType, setEngineType] = useState('rakit'); // 'rakit' or acp agent id like 'agy', 'commandcode'
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a specialized AI assistant. You help plan, reason, and execute tasks safely and efficiently.'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAcpDesc = useMemo(() => {
    return acpAgents.find((a) => a.id === engineType);
  }, [acpAgents, engineType]);

  const selectableModels = useMemo(() => {
    if (selectedAcpDesc?.supportedModels && selectedAcpDesc.supportedModels.length > 0) {
      return selectedAcpDesc.supportedModels.map((m) => ({ id: m, name: m }));
    }
    if (availableModels && availableModels.length > 0) {
      return availableModels.map((m) => ({ id: m.id, name: m.name || m.id }));
    }
    return [{ id: 'default', name: 'Default Model' }];
  }, [selectedAcpDesc, availableModels]);

  // Set default model when engine changes
  const activeModel = model || (selectedAcpDesc?.defaultModel || defaultModel || selectableModels[0]?.id || '');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const isACP = engineType !== 'rakit';
      const created = await createAgent({
        name: name.trim(),
        role: role.trim() || 'AI Assistant',
        description: description.trim() || `${name.trim()} - Autonomous agent`,
        avatar,
        engine: isACP ? 'acp' : 'rakit',
        acpAgent: isACP ? engineType : undefined,
        model: activeModel,
        systemPrompt: systemPrompt.trim(),
      });

      selectAgent(created.id);
      setActiveNavTab('agent');
      onClose();
      // Reset form
      setName('');
      setRole('');
      setDescription('');
      setAvatar('purple-pebble');
      setEngineType('rakit');
      setModel('');
    } catch (err) {
      console.error('Failed to create agent:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#141418] border border-border/70 shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 font-semibold text-sm text-foreground">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Create New Agent</h2>
              <p className="text-[11px] text-muted-foreground">Configure personality, engine, and role</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Avatar & Basic Info Preview */}
          <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/20 border border-border/40">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center shrink-0 shadow-inner">
              <AgentIcon
                id={engineType}
                name={name || 'Agent'}
                avatar={avatar}
                isACP={engineType !== 'rakit'}
                size={32}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground truncate">
                {name || 'Agent Name'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {role || 'Role / Responsibility'}
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                <ProviderIcon provider={engineType} size={11} />
                <span className="font-mono">
                  {engineType === 'rakit' ? 'RakitKode' : (selectedAcpDesc?.name || engineType)}
                </span>
                <span>•</span>
                <span className="font-mono truncate">{activeModel}</span>
              </div>
            </div>
          </div>

          {/* Name & Role Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-foreground">
                Agent Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Senior Frontend Dev"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 bg-muted/40 border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Role / Title</label>
              <input
                type="text"
                placeholder="e.g. UI / UX Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-9 px-3 bg-muted/40 border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
          </div>

          {/* Avatar Selector */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground">Avatar Style</label>
            <div className="grid grid-cols-5 gap-2 pt-0.5">
              {GROK_AVATARS.map((av) => {
                const isSelected = avatar === av.id;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setAvatar(av.id)}
                    className={`relative p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-xs'
                        : 'border-border/40 hover:border-border hover:bg-muted/30'
                    }`}
                    title={av.name}
                  >
                    <GrokAvatar id={av.id} size={24} />
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                      {av.id.split('-')[0]}
                    </span>
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center text-[8px]">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Engine & Model Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Agent Engine</label>
              <div className="flex items-center gap-2 h-9 px-2.5 bg-muted/40 border border-border rounded-xl text-xs text-foreground">
                <ProviderIcon provider={engineType} size={13} className="shrink-0" />
                <select
                  value={engineType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEngineType(val);
                    setModel(''); // Reset model to pick up engine default
                  }}
                  className="w-full bg-transparent text-foreground focus:outline-none cursor-pointer text-xs"
                >
                  <option value="rakit" className="bg-[#141418] text-foreground">⚡ RakitKode (Native)</option>
                  <optgroup label="External ACP Agents" className="bg-[#141418] text-foreground">
                    <option value="agy" className="bg-[#141418] text-foreground">✨ Google Antigravity (AGY)</option>
                    <option value="commandcode" className="bg-[#141418] text-foreground">💻 Command Code (CMD)</option>
                    <option value="opencode" className="bg-[#141418] text-foreground">🌐 OpenCode (ACP)</option>
                    <option value="omp" className="bg-[#141418] text-foreground">⚡ Oh My Pi (OMP)</option>
                    <option value="pi" className="bg-[#141418] text-foreground">🥧 Pi Coding Agent</option>
                    <option value="claude-code" className="bg-[#141418] text-foreground">🧠 Claude Code (ACP)</option>
                    <option value="codex" className="bg-[#141418] text-foreground">🛠️ OpenAI Codex (ACP)</option>
                    <option value="gemini" className="bg-[#141418] text-foreground">♊ Google Gemini CLI</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Default Model</label>
              <select
                value={activeModel}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-9 px-2.5 bg-muted/40 border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                {selectableModels.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#141418] text-foreground">
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">System Prompt</label>
              <span className="text-[10px] text-muted-foreground">Instructions & Persona</span>
            </div>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe this agent's core purpose, specialties, and behavioral boundaries..."
              className="w-full p-2.5 bg-muted/40 border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary/60 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border/40 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-xs font-semibold text-white transition-all shadow-md shadow-primary/20 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Agent'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
