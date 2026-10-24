import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useUIStore } from '../../store/useUIStore';
import {
  Plus,
  Settings,
  Users,
  Hammer,
  FolderGit2,
  SquareCode,
  Newspaper,
} from 'lucide-react';
import { AgentIcon } from '../shell/AgentIcon';
import { getAgentAvatarColor } from '../GrokAvatar';
import { AgentGroup } from '../../types';
import { cn } from '../../lib/cn';

interface AgentRailProps {
  onOpenCreateAgent?: () => void;
  onOpenSettings?: () => void;
}

/** Entries of the dev FAB popup, rendered bottom-to-top (bottom = closest to the anchor). */
const DEV_FAB_ITEMS = [
  { id: 'git', label: 'Git Client', icon: FolderGit2 },
  { id: 'editor', label: 'Editor', icon: SquareCode },
] as const;

export const AgentRail: React.FC<AgentRailProps> = ({
  onOpenCreateAgent,
  onOpenSettings,
}) => {
  const {
    agents,
    selectedAgentId,
    selectAgent,
    groups,
    activeGroup,
    selectGroup,
    activeNavTab,
    setActiveNavTab,
  } = useProfileStore();

  const {
    selectSession,
    sessions: allStoreSessions,
    createSessionForGroup,
  } = useSessionStore();

  const { closePanels } = useUIStore();

  const [devFabOpen, setDevFabOpen] = useState(false);
  const devFabRef = useRef<HTMLDivElement>(null);

  // Filter out any ACP engines so only real native agents appear on the rail
  const nativeAgents = useMemo(() => {
    const acpNames = ['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'];
    return agents.filter((a) => !acpNames.includes(a.id.toLowerCase()));
  }, [agents]);

  // Persistent groups defined in the system
  const allGroups = groups;

  // Close the dev FAB on outside click
  useEffect(() => {
    if (!devFabOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (devFabRef.current && !devFabRef.current.contains(e.target as Node)) {
        setDevFabOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [devFabOpen]);

  const handleAgentClick = async (agentId: string) => {
    selectAgent(agentId);
    setActiveNavTab('chat');
    useAgentStore.getState().setComposerTarget({ kind: 'native', id: 'rakit-kode' });
    // Opening an agent always lands on its permanent Main Chat session
    await useSessionStore.getState().openMainSession(agentId);
  };

  const handleGroupClick = async (group: AgentGroup) => {
    selectGroup(group.id);
    setActiveNavTab('groups');
    const matching = allStoreSessions
      .filter((s) => {
        if (s.type === 'group') {
          if (s.agentId === group.id) return true;
          if (s.metadata) {
            try {
              const m = JSON.parse(s.metadata);
              return m.groupId === group.id;
            } catch {}
          }
        }
        return false;
      })
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    if (matching.length > 0) {
      await selectSession(matching[0].id);
    } else {
      const newSid = await createSessionForGroup(group.id);
      await selectSession(newSid);
    }
  };

  const handleNewAgentClick = () => {
    if (onOpenCreateAgent) {
      onOpenCreateAgent();
    } else {
      setActiveNavTab('agent');
    }
  };

  const handleFabNavigate = (tab: (typeof DEV_FAB_ITEMS)[number]['id']) => {
    setDevFabOpen(false);
    closePanels();
    setActiveNavTab(tab);
  };

  return (
    <aside className="w-16 shrink-0 h-full bg-chrome border-r border-sidebar-border flex flex-col items-center py-3 select-none z-20">
      {/* Brand Spark Glyph */}
      <div
        className="w-11 h-11 rounded-xl bg-transparent flex items-center justify-center text-primary font-bold mb-3 cursor-pointer hover:scale-105 transition-transform"
        title="KendaliAI"
        onClick={() => {
          setActiveNavTab('chat');
          selectSession(null);
          useAgentStore.getState().setComposerTarget({ kind: 'native', id: 'rakit-kode' });
        }}
      >
        <svg width={28} height={28} viewBox="0 0 48 48" fill="currentColor">
          <path d="M24 3c1.6 10.6 6.4 16.7 20 21-13.6 4.3-18.4 10.4-20 21-1.6-10.6-6.4-16.7-20-21 13.6-4.3 18.4-10.4 20-21Z" />
          <circle cx="39.5" cy="8.5" r="3.2" />
        </svg>
      </div>

      {/* Agents Roster */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 px-2 scrollbar-none">
        {nativeAgents.map((agent) => {
          const isSelected = selectedAgentId === agent.id && activeNavTab !== 'groups';
          const avatarColor = getAgentAvatarColor(agent.avatar || agent.id);

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => handleAgentClick(agent.id)}
              className={`relative group w-11 h-11 rounded-xl flex items-center justify-center p-0 bg-transparent transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'scale-105 border-2 shadow-xs'
                  : 'border-2 border-transparent hover:scale-105'
              }`}
              style={
                isSelected
                  ? { borderColor: avatarColor, boxShadow: `0 0 10px ${avatarColor}40` }
                  : undefined
              }
              title={`${agent.name} (${agent.role || 'Agent'})`}
            >
              <AgentIcon
                id={agent.id}
                name={agent.name}
                avatar={agent.avatar}
                size={36}
              />

              {/* Tooltip */}
              <div className="absolute left-14 ml-2 px-2.5 py-1 bg-popover text-foreground text-ui-xs rounded-md shadow-xl border border-border/40 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                <p className="font-semibold">{agent.name}</p>
                {agent.role && <p className="text-[10px] text-muted-foreground">{agent.role}</p>}
              </div>
            </button>
          );
        })}

        {/* Persistent Groups in Agent Sidebar (Rail) */}
        {allGroups.length > 0 && (
          <>
            <div className="w-8 h-px bg-sidebar-border my-1 shrink-0" />

            {allGroups.map((group) => {
              const isSelected = activeNavTab === 'groups' && activeGroup?.id === group.id;
              const displayMembers = (group.memberIds || []).slice(0, 3); // Max 3 avatars!

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleGroupClick(group)}
                  className={`relative group w-11 h-11 rounded-xl flex items-center justify-center p-0 bg-transparent transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'scale-105 border-2 border-primary shadow-xs'
                      : 'border-2 border-transparent hover:scale-105'
                  }`}
                  title={`${group.name} (${(group.memberIds || []).length} agents)`}
                >
                  {/* Group member icons inside button */}
                  <div className="flex items-center justify-center -space-x-2 shrink-0">
                    {displayMembers.length > 0 ? (
                      displayMembers.map((memberId, idx) => {
                        const memberAgent = agents.find((a) => a.id === memberId);
                        return (
                          <div
                            key={memberId}
                            className="size-6 rounded-lg flex items-center justify-center overflow-hidden shrink-0 bg-transparent"
                            style={{ zIndex: 10 - idx }}
                          >
                            <AgentIcon
                              id={memberId}
                              name={memberAgent?.name || memberId}
                              avatar={memberAgent?.avatar}
                              size={20}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <Users className="size-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Tooltip on hover */}
                  <div className="absolute left-14 ml-2 px-2.5 py-1 bg-popover text-foreground text-ui-xs rounded-md shadow-xl border border-border/40 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Group · {(group.memberIds || []).length} agents
                    </p>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {/* Add Agent Button */}
        <button
          onClick={handleNewAgentClick}
          className="w-11 h-11 rounded-xl bg-transparent border-2 border-transparent text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer hover:scale-110 mt-1 p-0"
          title="Create New Agent"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Rail Bottom Actions */}
      <div className="pt-2 flex flex-col items-center gap-2 w-full border-t border-sidebar-border">
        {/* Feed — AI-generated feed from web sources */}
        <button
          type="button"
          onClick={() => {
            closePanels();
            setActiveNavTab('feed');
          }}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer',
            activeNavTab === 'feed'
              ? 'text-primary bg-primary/10 border border-primary/40'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
          title="Feed"
        >
          <Newspaper className="w-4 h-4" />
        </button>

        {/* Groups — open the groups list */}
        <button
          type="button"
          onClick={() => {
            closePanels();
            selectSession(null);
            selectGroup(null);
            setActiveNavTab('groups');
          }}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer',
            activeNavTab === 'groups'
              ? 'text-primary bg-primary/10 border border-primary/40'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
          title="Groups"
        >
          <Users className="w-4 h-4" />
        </button>

        {/* Dev FAB: one anchor icon that fans out Editor / Git Client */}
        <div className="relative w-full flex justify-center" ref={devFabRef}>
          {/* FAB popup stack (expands upward, Muse-style floating action buttons) */}
          {devFabOpen && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50">
              {[...DEV_FAB_ITEMS].reverse().map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeNavTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleFabNavigate(item.id)}
                    className={cn(
                      'fab-pop group relative size-10 rounded-xl flex items-center justify-center border shadow-lg transition-colors cursor-pointer',
                      isActive
                        ? 'bg-primary/15 border-primary/50 text-primary'
                        : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40'
                    )}
                    style={{ animationDelay: `${idx * 40}ms` }}
                    title={item.label}
                  >
                    <Icon className="size-4.5" />

                    {/* Label tooltip */}
                    <div className="absolute left-12 px-2 py-1 bg-popover text-foreground text-ui-xs rounded-md shadow-xl border border-border/40 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                      {item.label}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* FAB anchor */}
          <button
            type="button"
            onClick={() => setDevFabOpen(!devFabOpen)}
            aria-expanded={devFabOpen}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer',
              devFabOpen
                ? 'text-primary bg-primary/10 border border-primary/40 rotate-12'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            title="Dev tools — Editor, Git Client"
          >
            <Hammer className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => {
            if (onOpenSettings) onOpenSettings();
            else setActiveNavTab('settings');
          }}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            activeNavTab === 'settings'
              ? 'text-primary bg-primary/10 border border-primary/40'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title="Settings (⌘,)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};

export default AgentRail;
