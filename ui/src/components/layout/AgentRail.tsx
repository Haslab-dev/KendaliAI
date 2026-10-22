import React from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { Plus, Bell, Settings, Bot, Users, Sliders } from 'lucide-react';
import { AgentIcon } from '../shell/AgentIcon';

interface AgentRailProps {
  onOpenCreateAgent?: () => void;
  onOpenSettings?: () => void;
}

export const AgentRail: React.FC<AgentRailProps> = ({
  onOpenCreateAgent,
  onOpenSettings,
}) => {
  const {
    agents,
    selectedAgentId,
    selectAgent,
    activeGroup,
    selectedGroupId,
    activeNavTab,
    setActiveNavTab,
  } = useProfileStore();

  const { selectSession, createSessionForAgent } = useSessionStore();

  const handleAgentClick = (agentId: string) => {
    selectAgent(agentId);
    setActiveNavTab('chat');
  };

  const handleNewAgentClick = () => {
    if (onOpenCreateAgent) {
      onOpenCreateAgent();
    } else {
      setActiveNavTab('agent');
    }
  };

  return (
    <aside className="w-16 shrink-0 h-full bg-[#0a0a0c] border-r border-border/40 flex flex-col items-center py-3 select-none z-20">
      {/* Brand Logo */}
      <div
        className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg mb-4 cursor-pointer hover:bg-primary/20 transition-colors shadow-sm"
        title="KendaliAI"
        onClick={() => {
          setActiveNavTab('chat');
          selectSession(null);
        }}
      >
        <span className="bg-gradient-to-tr from-indigo-500 to-violet-400 bg-clip-text text-transparent">
          K
        </span>
      </div>

      {/* Agents Roster */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2.5 px-2 scrollbar-none">
        {agents.map((agent) => {
          const isSelected = selectedAgentId === agent.id && activeNavTab !== 'groups';
          return (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent.id)}
              className={`relative group w-11 h-11 rounded-2xl flex items-center justify-center text-xl transition-all duration-150 ${
                isSelected
                  ? 'bg-primary text-white shadow-md shadow-primary/25 scale-105'
                  : 'bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground'
              }`}
              title={`${agent.name} (${agent.role || 'Agent'})`}
            >
              {/* Left active indicator pill */}
              {isSelected && (
                <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-primary" />
              )}
              <AgentIcon
                id={agent.id}
                name={agent.name}
                avatar={agent.avatar}
                isACP={agent.engine === 'acp'}
                size={22}
              />

              {/* Tooltip */}
              <div className="absolute left-14 ml-2 px-2.5 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-lg border border-border whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                <p className="font-semibold">{agent.name}</p>
                {agent.role && <p className="text-[10px] text-muted-foreground">{agent.role}</p>}
              </div>
            </button>
          );
        })}

        {/* Active Group Avatar (if in group mode) */}
        {activeNavTab === 'groups' && activeGroup && (
          <div
            className="relative group w-11 h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-md scale-105 cursor-pointer"
            title={`Group: ${activeGroup.name}`}
          >
            <span className="absolute -left-2 w-1 h-5 rounded-r-full bg-violet-500" />
            <Users className="w-5 h-5" />
            <div className="absolute left-14 ml-2 px-2.5 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-lg border border-border whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              <p className="font-semibold">{activeGroup.name}</p>
              <p className="text-[10px] text-muted-foreground">Group Chat</p>
            </div>
          </div>
        )}

        {/* Add Agent Button */}
        <button
          onClick={handleNewAgentClick}
          className="w-10 h-10 rounded-2xl border border-dashed border-border/80 hover:border-primary/60 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors"
          title="Create New Agent"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Rail Bottom Actions */}
      <div className="pt-2 flex flex-col items-center gap-2 w-full border-t border-border/30">
        <button
          className="w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            setActiveNavTab('settings');
          }}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            activeNavTab === 'settings'
              ? 'text-amber-400 bg-amber-400/10 border border-amber-400/40'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          title="Control center"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
