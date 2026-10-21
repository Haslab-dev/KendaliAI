import React, { useState } from 'react';
import { X, Users, Check, Search, Send, Sparkles, Terminal, Shield, Cpu, Code2, MessageSquare } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { GrokAvatar } from './GrokAvatar';
import { navigate } from '../router';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_OPTIONS = [
  { id: 'users', label: 'Team', icon: Users },
  { id: 'terminal', label: 'Dev', icon: Terminal },
  { id: 'shield', label: 'Security', icon: Shield },
  { id: 'cpu', label: 'Infra', icon: Cpu },
  { id: 'code', label: 'Engineering', icon: Code2 },
  { id: 'sparkles', label: 'Product', icon: Sparkles },
  { id: 'chat', label: 'General', icon: MessageSquare },
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose }) => {
  const { agents, createGroupChat, telegramAgents } = useAppStore();
  const [title, setTitle] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('users');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredAgents = agents.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.role || '').toLowerCase().includes(q) ||
      (a.department || '').toLowerCase().includes(q)
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedAgentIds.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createGroupChat(title.trim(), selectedAgentIds, selectedAvatar);
      setTitle('');
      setSelectedAgentIds([]);
      onClose();
      navigate('chat');
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-card rounded-[16px] shadow-2xl border border-border flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center">
              <Users size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground font-sans">
                Create Group Chat
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Collaborate with multiple Agent Persons in a shared room
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
            {/* Group Title */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 font-sans">
                Group Name
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Core Engineering, Security War Room..."
                className="w-full px-3 py-2 text-sm bg-accent/60 dark:bg-card border border-border rounded-[8px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
                autoFocus
              />
            </div>

            {/* Icon Avatar Picker */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 font-sans">
                Group Icon
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {AVATAR_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selectedAvatar === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedAvatar(opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border text-xs font-medium cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary bg-blue-50 dark:bg-blue-950/40 text-primary shadow-xs'
                          : 'border-border text-muted-foreground hover:bg-foreground/5'
                      }`}
                    >
                      <Icon size={13} />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Agent Persons Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-sans">
                  Select Agent Persons ({selectedAgentIds.length} selected)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAgentIds.length === agents.length) {
                      setSelectedAgentIds([]);
                    } else {
                      setSelectedAgentIds(agents.map((a) => a.id));
                    }
                  }}
                  className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  {selectedAgentIds.length === agents.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Search agents filter */}
              <div className="relative mb-2">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter agents by name, role..."
                  className="w-full pl-7 pr-2.5 py-1.5 bg-accent/60 dark:bg-card border border-border rounded-[6px] text-xs text-foreground outline-none focus:border-primary/60"
                />
              </div>

              {/* Agents list */}
              <div className="max-h-52 overflow-y-auto custom-scrollbar border border-border rounded-[8px] divide-y divide-border">
                {filteredAgents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No agents found matching search.
                  </div>
                ) : (
                  filteredAgents.map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent.id);
                    const isTg = agent.telegramConnected || !!telegramAgents[agent.id]?.connected;

                    return (
                      <div
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/50 dark:bg-blue-950/20'
                            : 'hover:bg-foreground/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <GrokAvatar id={agent.avatar || agent.id} size={32} />
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-black" />
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-bold text-foreground truncate">
                                {agent.name}
                              </span>
                              {isTg && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-info/10 text-info shrink-0"
                                  title="Telegram Bot Linked"
                                >
                                  <Send size={7} /> TG
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {agent.role || agent.department || 'Specialist'} · {agent.model || 'gpt-4o'}
                            </span>
                          </div>
                        </div>

                        <div
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-primary border-primary text-white'
                              : 'border-border-strong'
                          }`}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-accent/40 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selectedAgentIds.length === 0
                ? 'Select at least 1 agent'
                : `${selectedAgentIds.length} agent${selectedAgentIds.length > 1 ? 's' : ''} in room`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium rounded-[6px] border border-border text-muted-foreground hover:bg-foreground/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || selectedAgentIds.length === 0 || isSubmitting}
                className="px-4 py-1.5 text-xs font-bold rounded-[6px] bg-primary hover:bg-primary/85 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              >
                {isSubmitting ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
