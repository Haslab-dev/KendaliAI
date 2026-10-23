import React, { useState } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { X, Users, Search, Camera } from 'lucide-react';
import { AgentIcon } from '../shell/AgentIcon';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({ isOpen, onClose }) => {
  const { agents, createGroup, selectGroup, setActiveNavTab } = useProfileStore();

  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || selectedAgentIds.length === 0) return;
    const group = await createGroup(name.trim(), brief.trim(), selectedAgentIds);
    selectGroup(group.id);
    setActiveNavTab('groups');
    onClose();
  };

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
            <Users className="w-4 h-4 text-primary" />
            <span>New group</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Group Name */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground">Group name</label>
            <div className="relative">
              <div className="w-8 h-8 absolute left-1.5 top-1.5 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground">
                <Camera className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="e.g. Core Engineering, Sales Squad"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 pl-12 pr-3 bg-muted/30 hover:bg-muted/50 focus:bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                autoFocus
              />
            </div>
          </div>

          {/* Brief */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground">Brief</label>
            <textarea
              placeholder="What is this group for? Every agent reads it."
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="w-full p-3 bg-muted/30 hover:bg-muted/50 focus:bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none transition-colors"
            />
          </div>

          {/* Add Agents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">Add agents</label>
              <span className="text-[11px] text-muted-foreground">
                {selectedAgentIds.length} selected
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search agents"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-2.5 bg-muted/30 hover:bg-muted/50 focus:bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors"
              />
            </div>

            {/* Available Agents List */}
            <div className="max-h-40 overflow-y-auto space-y-1 pt-1 pr-1 scrollbar-thin">
              {filteredAgents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                return (
                  <div
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50 text-foreground'
                        : 'bg-muted/20 border-border hover:bg-muted/40 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AgentIcon id={agent.id} name={agent.name} avatar={agent.avatar} size={20} />
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-foreground truncate">{agent.name}</p>
                        {agent.role && <p className="text-[10px] text-muted-foreground truncate">{agent.role}</p>}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-border text-primary focus:ring-0 cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-end gap-2 bg-muted/15">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || selectedAgentIds.length === 0}
            className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-xs font-semibold text-primary-foreground transition-colors shadow-xs cursor-pointer"
          >
            Create group
          </button>
        </div>
      </div>
    </div>
  );
};
