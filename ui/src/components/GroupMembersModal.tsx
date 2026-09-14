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
      <div className="relative w-full max-w-md bg-[#FFFFFF] dark:bg-[#1C1C1E] rounded-[16px] shadow-2xl border border-[#E5E7EB] dark:border-[#2C2C2E] flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] dark:border-[#2C2C2E]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#007AFF] flex items-center justify-center">
              <Users size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#000000] dark:text-white font-sans">
                {session.title || 'Group Members'}
              </h3>
              <p className="text-[11px] text-[#8A8A85]">
                {session.participants?.length || 0} Agent Persons + You
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
          {/* Add member section */}
          {isAddingMember ? (
            <div className="p-3 bg-[#F7F7F5] dark:bg-[#141414] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[10px] space-y-2">
              <span className="text-[11px] font-bold text-[#000000] dark:text-white block">
                Add Agent Person to Group
              </span>
              <select
                value={selectedAgentToAdd}
                onChange={(e) => setSelectedAgentToAdd(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-[#000000] dark:text-white outline-none"
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
                  className="px-2.5 py-1 text-xs text-[#8A8A85] hover:text-[#000000] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={!selectedAgentToAdd}
                  className="px-3 py-1 text-xs font-bold bg-[#007AFF] text-white rounded-[6px] disabled:opacity-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingMember(true)}
              className="w-full py-2 px-3 border border-dashed border-[#E5E7EB] dark:border-[#2C2C2E] hover:border-[#007AFF] rounded-[8px] text-xs font-medium text-[#007AFF] flex items-center justify-center gap-1.5 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Agent Person</span>
            </button>
          )}

          {/* Current members list */}
          <div className="divide-y divide-[#E5E7EB] dark:divide-[#2C2C2E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[8px] overflow-hidden">
            {/* User row */}
            <div className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-black/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#007AFF] text-white font-bold text-xs flex items-center justify-center">
                  You
                </div>
                <div>
                  <span className="text-xs font-bold text-[#000000] dark:text-white block">
                    You (Workspace Owner)
                  </span>
                  <span className="text-[10px] text-[#8A8A85]">Admin</span>
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
                  className="flex items-center justify-between p-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <GrokAvatar id={agent?.avatar || agent?.id || 'blue-drop'} size={32} />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-black" />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-[#000000] dark:text-white truncate">
                          {agentName}
                        </span>
                        {isTg && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-[#E1F2FB] dark:bg-[#0E3550] text-[#0088cc] shrink-0"
                            title="Telegram Bot Linked"
                          >
                            <Send size={7} /> TG
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#8A8A85] truncate">
                        {agentRole} · {agent?.model || 'gpt-4o'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveMember(part.participantId)}
                    className="p-1 text-[#8A8A85] hover:text-red-500 rounded transition-colors cursor-pointer"
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
        <div className="p-3 bg-[#F9FAFB] dark:bg-[#141414] border-t border-[#E5E7EB] dark:border-[#2C2C2E] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-[6px] bg-[#007AFF] text-white hover:bg-[#0062CC] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
