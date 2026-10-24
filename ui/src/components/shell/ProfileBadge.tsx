import React from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useUIStore } from '../../store/useUIStore';
import { AgentIcon } from './AgentIcon';
import { ProviderIcon } from '../agent/ProviderIcon';
import { cn } from '../../lib/cn';

interface ProfileBadgeProps {
  /** True when chat content has scrolled beneath the floating badge. */
  scrolled?: boolean;
}

/**
 * Floating top-center agent identity, Muse parity: a circular avatar with a
 * soft ring and the agent's name in a dark pill beneath it. Clicking opens
 * the profile panel on the right; the badge hides itself while that panel
 * is open and fades back when it closes. A dark gradient scrim rises when
 * content scrolls underneath so text never clashes with the badge.
 */
export const ProfileBadge: React.FC<ProfileBadgeProps> = ({ scrolled }) => {
  const { agents, activeAgent } = useProfileStore();
  const { activeSession } = useSessionStore();
  const { rightPanel, toggleProfilePanel } = useUIStore();

  const sessionAgent =
    agents.find((a) => a.id === activeSession?.agentId) ||
    (activeSession?.agentId === activeAgent?.id ? activeAgent : null);
  const profileAgent = sessionAgent || activeAgent;

  let sessMeta: Record<string, any> = {};
  if (activeSession?.metadata) {
    try {
      sessMeta = JSON.parse(activeSession.metadata);
    } catch {}
  }
  const isAcp =
    !sessionAgent &&
    (sessMeta.engine === 'acp' ||
      Boolean(sessMeta.acpAgent) ||
      ['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'].includes(
        (activeSession?.agentId || '').toLowerCase()
      ));
  const resolvedAcp = sessMeta.acpAgent || activeSession?.agentId || 'agy';

  const hidden = rightPanel === 'profile';

  return (
    <>
      {/* Scroll scrim: dark fade so passing content never clashes with the badge */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-background/95 via-background/60 to-transparent transition-opacity duration-300',
          scrolled && !hidden ? 'opacity-100' : 'opacity-0'
        )}
      />

      <button
        type="button"
        onClick={toggleProfilePanel}
        aria-label="Open agent profile"
        title={`${profileAgent?.name || 'Agent'} — profile`}
        className={cn(
          'absolute left-1/2 top-3 sm:top-4 -translate-x-1/2 z-30 flex flex-col items-center transition-all duration-300 cursor-pointer select-none active:scale-95',
          hidden ? 'pointer-events-none -translate-y-2 opacity-0' : 'opacity-100'
        )}
      >
        <div className="size-14 sm:size-16 shrink-0 overflow-hidden rounded-full bg-background ring-2 ring-primary/20 shadow-md">
          {isAcp ? (
            <ProviderIcon provider={resolvedAcp} size={64} />
          ) : (
            profileAgent && (
              <AgentIcon
                id={profileAgent.id}
                name={profileAgent.name}
                avatar={profileAgent.avatar}
                size={64}
              />
            )
          )}
        </div>
        <span className="-mt-3 z-10 max-w-44 truncate rounded-full border border-border/80 bg-card/95 shadow-md px-3 py-0.5 text-ui-xs font-bold text-foreground backdrop-blur-md">
          {profileAgent?.name || 'Agent'}
        </span>
      </button>
    </>
  );
};

export default ProfileBadge;
