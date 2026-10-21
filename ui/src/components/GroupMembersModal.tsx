import React, { useState } from 'react';
import { X, Users, Plus, Trash2, Send, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { GrokAvatar } from './GrokAvatar';
import { Session } from '../types';

interface GroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
}

export const GroupMembersModal: React.FC<GroupMembersModalProps> = ({ isOpen, onClose, session }) => {
  const { agents, updateGroupParticipants, telegramAgents } = useAppStore();
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedAgentToAdd, setSelectedAgentToAdd] = useState('');

  if (!isOpen || !session || session.type !== 'group') return null;

  const currentParticipantIds = (session.participants || []).map((p) => p.participantId);

  const availableAgentsToAdd = agents.filter(
    (a) => !currentParticipantIds.includes(a.id)
  );

  const handleRemoveMember = async (agentId: string) => {
    const next = currentParticipantIds.filter((id) => id !== agentId);
    await updateGroupParticipants(session.id, next);
  };

  const handleAddMember = async () => {
    if (!selectedAgentToAdd) return;
    const next = [...currentParticipantIds, selectedAgentToAdd];
    await updateGroupParticipants(session.id, next);
    setSelectedAgentToAdd('');
    setIsAddingMember(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-card rounded-[16px] shadow-2xl border border-border flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center">
              <Users size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground font-sans">
                {session.title || 'Group Members'}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {session.participants?.length || 0} Agent Persons + You
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

        {/* Content */}
        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
          {/* Add member section */}
          {isAddingMember ? (
            <div className="p-3 bg-accent/60 dark:bg-card border border-border rounded-[10px] space-y-2">
              <span className="text-[11px] font-bold text-foreground block">
                Add Agent Person to Group
              </span>
              <select
                value={selectedAgentToAdd}
                onChange={(e) => setSelectedAgentToAdd(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-card border border-border rounded-[6px] text-foreground outline-none"
              >
                <option value="">Select an agent...</option>
                {availableAgentsToAdd.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role || a.department || 'Specialist'})
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingMember(false)}
                  className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={!selectedAgentToAdd}
                  className="px-3 py-1 text-xs font-bold bg-primary text-white rounded-[6px] disabled:opacity-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingMember(true)}
              className="w-full py-2 px-3 border border-dashed border-border hover:border-primary/60 rounded-[8px] text-xs font-medium text-primary flex items-center justify-center gap-1.5 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Agent Person</span>
            </button>
          )}

          {/* Current members list */}
          <div className="divide-y divide-border border border-border rounded-[8px] overflow-hidden">
            {/* User row */}
            <div className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-black/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center">
                  You
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground block">
                    You (Workspace Owner)
                  </span>
                  <span className="text-[10px] text-muted-foreground">Admin</span>
                </div>
              </div>
            </div>

            {/* Agent members */}
            {(session.participants || []).map((part) => {
              const agent = agents.find((a) => a.id === part.participantId);
              const agentName = agent?.name || part.participantId;
              const agentRole = agent?.role || agent?.department || 'Specialist';
              const isTg = agent?.telegramConnected || !!telegramAgents[agent?.id || '']?.connected;

              return (
                <div
                  key={part.id || part.participantId}
                  className="flex items-center justify-between p-2.5 hover:bg-foreground/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <GrokAvatar id={agent?.avatar || agent?.id || 'blue-drop'} size={32} />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-black" />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-foreground truncate">
                          {agentName}
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
                        {agentRole} · {agent?.model || 'gpt-4o'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveMember(part.participantId)}
                    className="p-1 text-muted-foreground hover:text-red-500 rounded transition-colors cursor-pointer"
                    title="Remove from group"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-accent/40 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-[6px] bg-primary text-white hover:bg-primary/85 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
