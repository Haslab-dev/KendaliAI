import React, { useState, useRef, useEffect } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import {
  ChevronDown,
  Check,
  Search,
} from 'lucide-react';
import { AgentTaskInputBar, PromptSubmitOptions } from '../common/AgentTaskInputBar';
import { WorkspaceHeader } from '../common/WorkspaceHeader';
import { AgentIcon } from '../shell/AgentIcon';
import { cn } from '../../lib/cn';

export const ChatHome: React.FC = () => {
  const { agents, activeAgent, selectAgent, selectedAgentId } = useProfileStore();
  const { createSessionForAgent, sendMessage } = useSessionStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentName = activeAgent?.name || 'General';

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmitPrompt = async (text: string, options?: PromptSubmitOptions) => {
    const isAcp = options?.engineKind === 'acp';
    const acpAgent = isAcp ? (options?.engineId || 'agy') : undefined;
    const targetAgentId = activeAgent?.id || selectedAgentId || agents[0]?.id || 'lutfi';
    const chosenModel = options?.model || (isAcp ? undefined : activeAgent?.model);
    const engineKind = isAcp ? 'acp' : 'rakit';

    await createSessionForAgent(targetAgentId, text.slice(0, 36), {
      engine: engineKind,
      acpAgent,
      model: chosenModel,
    });
    await sendMessage(text, {
      agentId: targetAgentId,
      model: chosenModel,
      engine: engineKind,
      acpAgent,
    });
  };

  // Stacked landing tray chip above the composer
  const landingTray = (
    <div
      ref={dropdownRef}
      className="flex min-h-8 w-full flex-nowrap items-center gap-x-1.5 px-3.5 py-1 text-xs text-muted-foreground"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          className={cn(
            'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 font-normal text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
            isDropdownOpen && 'bg-accent text-foreground'
          )}
        >
          <AgentIcon
            id={activeAgent?.id || ''}
            name={currentName}
            avatar={activeAgent?.avatar}
            isACP={false}
            size={14}
            className="shrink-0"
          />
          <span className="max-w-[180px] truncate">{currentName}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>

        {isDropdownOpen && (
          <div className="dropdown-glass absolute bottom-full left-0 z-50 mb-2 w-64 animate-in rounded-xl p-1 text-ui-sm text-foreground shadow-2xl fade-in zoom-in-95 duration-100">
            <div className="border-b border-border/40 px-2.5 pt-2 pb-1.5">
              <div className="relative flex items-center">
                <Search className="absolute left-1.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Select agent..."
                  className="h-6 w-full bg-transparent pl-6 pr-2 text-ui-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto p-1 pt-1 scrollbar-thin">
              <div className="px-2 py-0.5 text-4xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Assistants
              </div>
              {filteredAgents.map((ag) => {
                const isCurrent = ag.id === activeAgent?.id;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => {
                      selectAgent(ag.id);
                      setIsDropdownOpen(false);
                      useSessionStore.getState().selectSession(null);
                      useAgentStore.getState().setComposerTarget({ kind: 'native', id: 'rakit-kode' });
                    }}
                    className={cn(
                      'flex min-h-7 w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-left text-ui-xs transition-colors',
                      isCurrent ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80 hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <AgentIcon id={ag.id} name={ag.name} avatar={ag.avatar} isACP={false} size={14} />
                      <span className="truncate">{ag.name}</span>
                    </div>
                    {isCurrent && <Check className="size-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 h-full bg-background text-foreground flex flex-col relative overflow-hidden select-none transition-colors">
      {/* Top Workspace Header */}
      <WorkspaceHeader />

      {/* Centered Landing Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 z-10 min-h-0">
        <div className="flex w-full max-w-[var(--chat-content-max-width,46rem)] flex-col items-center justify-center gap-7 my-auto pb-12">
          {/* Brand Spark Glyph + Heading */}
          <div className="flex flex-col items-center gap-4 text-center select-none w-full">
            <div className="text-foreground">
              <svg width={56} height={56} viewBox="0 0 48 48" fill="currentColor" className="shrink-0" aria-hidden="true">
                <path d="M24 3c1.6 10.6 6.4 16.7 20 21-13.6 4.3-18.4 10.4-20 21-1.6-10.6-6.4-16.7-20-21 13.6-4.3 18.4-10.4 20-21Z" />
                <circle cx="39.5" cy="8.5" r="3.2" />
              </svg>
            </div>

            <h2 className="text-[26px] font-normal leading-[1.15] tracking-[-0.015em] text-foreground sm:text-[30px]">
              What should we do in{' '}
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="cursor-pointer rounded-xs text-inherit underline decoration-dotted decoration-[1.5px] underline-offset-[6px] transition-colors duration-150 ease-out hover:text-foreground/75 focus:outline-none"
              >
                {currentName}
              </button>
              ?
            </h2>
          </div>

          {/* Centered Composer */}
          <div className="w-full pt-1">
            <AgentTaskInputBar
              placeholder="Ask anything, @ threads or files, $ skills, or / commands"
              autoFocus={true}
              headerNode={landingTray}
              onSubmitPrompt={handleSubmitPrompt}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatHome;
