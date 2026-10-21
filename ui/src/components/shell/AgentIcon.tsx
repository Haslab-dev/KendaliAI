import React from 'react';
import { cn } from '../../lib/cn';
import { ProviderIcon } from '../agent/ProviderIcon';
import { GrokAvatar } from '../GrokAvatar';

/* AgentIcon — renders the authentic brand icon for each agent:
 * - ACP external agents: real Google Antigravity, Command Code, Claude, Codex, Gemini, OpenCode
 * - Native Assistant agents: real GrokAvatar shape presets (purple-pebble, blue-drop, cyan-bubble, green-cloud, etc.)
 */

export const AgentIcon: React.FC<{
  id: string;
  name?: string;
  avatar?: string;
  isACP?: boolean;
  size?: number;
  className?: string;
}> = ({ id, name, avatar, isACP, size = 16, className }) => {
  const norm = (id || name || '').toLowerCase();
  const isAcpAgent =
    isACP ||
    norm.includes('agy') ||
    norm.includes('antigravity') ||
    norm.includes('commandcode') ||
    norm === 'cmd' ||
    norm.includes('claude') ||
    norm.includes('codex') ||
    norm.includes('gemini') ||
    norm.includes('opencode');

  if (isAcpAgent) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        title={name || id}
      >
        <ProviderIcon provider={id} size={size} />
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      title={name || id}
    >
      <GrokAvatar id={avatar || id || name} size={size} />
    </span>
  );
};
