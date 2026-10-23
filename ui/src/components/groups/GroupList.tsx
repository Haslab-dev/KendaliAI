import React, { useState } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { Users, Plus, Search, ChevronRight, MessageSquare, Trash2 } from 'lucide-react';
import { NewGroupModal } from './NewGroupModal';
import { AgentIcon } from '../shell/AgentIcon';

export const GroupList: React.FC = () => {
  const { groups, agents, selectGroup, deleteGroup } = useProfileStore();
  const { createSessionForGroup } = useSessionStore();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const filteredGroups = (groups || []).filter((g) => {
    const name = g?.name || g?.title || '';
    return name.toLowerCase().includes((search || '').toLowerCase());
  });

  const handleSelectGroup = async (groupId: string) => {
    selectGroup(groupId);
    await createSessionForGroup(groupId);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0a0a0c] px-4 sm:px-8 py-8 select-none">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Groups</h1>
            <p className="text-xs text-muted-foreground">
              Put several agents in one chat, give them one brief, and let them collaborate.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New group</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-muted/20 border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-primary/60"
          />
        </div>

        {/* Groups Grid / List */}
        {filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted/40 text-muted-foreground flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">No groups yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Create a group to allow multiple specialized agents to collaborate and hand off tasks to each other.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create your first group</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map((group) => {
              const memberIds = group.memberIds || [];
              const memberAgents = agents.filter((a) => memberIds.includes(a.id));
              const displayName = group.name || group.title || 'Untitled Group';

              return (
                <div
                  key={group.id}
                  onClick={() => handleSelectGroup(group.id)}
                  className="rounded-2xl bg-[#121216] hover:bg-[#15151a] border border-border/60 p-4 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Combined avatars */}
                    <div className="flex -space-x-2 shrink-0">
                      {memberAgents.slice(0, 3).map((a, i) => (
                        <div
                          key={a.id}
                          className="w-8 h-8 rounded-full bg-muted border-2 border-[#121216] flex items-center justify-center text-sm overflow-hidden"
                          style={{ zIndex: 10 - i }}
                        >
                          <AgentIcon id={a.id} name={a.name} avatar={a.avatar} isACP={a.engine === 'acp'} size={20} />
                        </div>
                      ))}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate">{displayName}</h3>
                        <span className="text-[11px] text-muted-foreground bg-muted/40 px-2 py-0.2 rounded-full">
                          {memberIds.length} agents
                        </span>
                      </div>
                      {group.brief && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{group.brief}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete group "${displayName}"?`)) {
                          deleteGroup(group.id);
                        }
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete group"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NewGroupModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
};
