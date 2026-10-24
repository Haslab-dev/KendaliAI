import { useEffect, useState } from 'react';

/*
 * Hash router. v2 shell has three surfaces: the Agent workspace (forge-ade
 * port), the Assistant workspace (KendaliAI chat/telegram/files), and the
 * Settings page (absorbs every management pane). Legacy pane hashes redirect
 * into their Settings section so old links keep working.
 */

export const ROUTES = ['agent', 'assistant', 'settings', 'terminal'] as const;

export type RouteName = (typeof ROUTES)[number];

export type SettingsSection =
  | 'dashboard'
  | 'general'
  | 'appearance'
  | 'providers'
  | 'capabilities'
  | 'mcps'
  | 'agents'
  | 'skills'
  | 'tools'
  | 'scheduler'
  | 'docs'
  | 'channels'
  | 'telegram'
  | 'plugins'
  | 'worktrees'
  | 'sessions'
  | 'logs'
  | 'connections'
  | 'integrations'
  | 'automations';

/** Legacy hash → new route (+ settings section where applicable). */
const LEGACY_MAP: Record<string, { route: RouteName; settings?: SettingsSection }> = {
  chat: { route: 'assistant' },
  dashboard: { route: 'settings', settings: 'dashboard' },
  general: { route: 'settings', settings: 'general' },
  appearance: { route: 'settings', settings: 'appearance' },
  providers: { route: 'settings', settings: 'providers' },
  capabilities: { route: 'settings', settings: 'capabilities' },
  integrations: { route: 'settings', settings: 'integrations' },
  model: { route: 'settings', settings: 'providers' },
  mcps: { route: 'settings', settings: 'capabilities' },
  agents: { route: 'settings', settings: 'providers' },
  agency: { route: 'settings', settings: 'providers' },
  acpAgents: { route: 'settings', settings: 'providers' },
  skills: { route: 'settings', settings: 'capabilities' },
  tools: { route: 'settings', settings: 'tools' },
  scheduler: { route: 'settings', settings: 'automations' },
  docs: { route: 'settings', settings: 'general' },
  channels: { route: 'settings', settings: 'integrations' },
  telegram: { route: 'settings', settings: 'integrations' },
  connections: { route: 'settings', settings: 'integrations' },
  automations: { route: 'settings', settings: 'automations' },
  plugins: { route: 'settings', settings: 'capabilities' },
  worktrees: { route: 'settings', settings: 'general' },
  sessions: { route: 'settings', settings: 'general' },
  logs: { route: 'settings', settings: 'dashboard' },
  editor: { route: 'assistant' },
  agent: { route: 'agent' },
  assistant: { route: 'assistant' },
  settings: { route: 'settings' },
  terminal: { route: 'terminal' },
};

interface ParsedRoute {
  route: RouteName;
  settingsSection: SettingsSection;
}

export function parseHash(): ParsedRoute {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const mapped = LEGACY_MAP[path];
  if (mapped) {
    // Settings sections arrive via ?section=…
    let section = mapped.settings || 'general';
    if (mapped.route === 'settings' && query) {
      const m = query.match(/section=([a-zA-Z0-9_-]+)/);
      if (m) {
        const rawSec = m[1];
        section = (LEGACY_MAP[rawSec]?.settings || rawSec) as SettingsSection;
      }
    }
    return { route: mapped.route, settingsSection: section };
  }
  return { route: 'agent', settingsSection: 'general' };
}

/** Navigate by route name or any legacy pane name (mapped automatically). */
export function navigate(route: string) {
  if (route === '/' || route === '' || route === 'workspace' || route === 'home') {
    window.location.hash = '#/agent';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  let target: RouteName | null = null;
  if ((ROUTES as readonly string[]).includes(route)) {
    target = route as RouteName;
  } else if (LEGACY_MAP[route]) {
    target = LEGACY_MAP[route].route;
  }
  if (!target) return;
  const hash = `#/${target}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

export function navigateSettings(section: SettingsSection) {
  const hash = `#/settings?section=${section}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

export function useRoute(): ParsedRoute {
  const [parsed, setParsed] = useState<ParsedRoute>(parseHash);
  useEffect(() => {
    const onChange = () => setParsed(parseHash());
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return parsed;
}
