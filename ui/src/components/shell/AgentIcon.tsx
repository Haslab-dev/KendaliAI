import React from 'react';
import { cn } from '../../lib/cn';
import { ProviderIcon } from '../agent/ProviderIcon';
import { GrokAvatar } from '../GrokAvatar';

/* AgentIcon — renders the authentic brand icon for each agent:
 * - Native Assistant agents: real GrokAvatar shape presets (purple-pebble, blue-drop, cyan-bubble, green-cloud, emerald-spark, amber-star, etc.)
 * - ACP external agent orchestrators: Google Antigravity, Command Code, Claude, Codex, Gemini, OpenCode, Pi, OMP
 */

const KNOWN_ACP_IDENTIFIERS = [
  'agy',
  'antigravity',
  'commandcode',
  'cmd',
  'claude-code',
  'claude',
  'codex',
  'openai',
  'gemini',
  'opencode',
  'omp',
  'ohmypi',
  'pi',
  'cursor',
];

export const AgentIcon: React.FC<{
  id: string;
  name?: string;
  avatar?: string;
  isACP?: boolean;
  engine?: string;
  acpAgent?: string;
  size?: number;
  className?: string;
}> = ({ id, name, avatar, isACP, engine, acpAgent, size = 16, className }) => {
  // 1. If an explicit avatar preset is set, ALWAYS render GrokAvatar.
  // An agent's personal avatar is their visual identity regardless of backend execution engine.
  if (avatar) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        title={name || id}
      >
        <GrokAvatar id={avatar} size={size} />
      </span>
    );
  }

  // 2. Only render ProviderIcon if this is an explicit ACP provider orchestrator
  const normTarget = (acpAgent || id || '').toLowerCase().trim();
  const isAcpOrchestrator = KNOWN_ACP_IDENTIFIERS.some(
    (p) => normTarget === p || normTarget.startsWith(`${p}-`) || normTarget.endsWith(`-${p}`)
  );

  if (isAcpOrchestrator) {
    const prov = acpAgent || id;
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        title={name || id}
      >
        <ProviderIcon provider={prov} size={size} />
      </span>
    );
  }

  // 3. Native agent fallback to GrokAvatar
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      title={name || id}
    >
      <GrokAvatar id={id || name || 'purple-pebble'} size={size} />
    </span>
  );
};
