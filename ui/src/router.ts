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
  | 'providers'
  | 'mcps'
  | 'agents'
  | 'skills'
  | 'tools'
  | 'scheduler'
  | 'docs'
  | 'telegram'
  | 'plugins'
  | 'worktrees'
  | 'sessions'
  | 'logs';

/** Legacy hash → new route (+ settings section where applicable). */
const LEGACY_MAP: Record<string, { route: RouteName; settings?: SettingsSection }> = {
  chat: { route: 'assistant' },
  dashboard: { route: 'settings', settings: 'dashboard' },
  providers: { route: 'settings', settings: 'providers' },
  mcps: { route: 'settings', settings: 'mcps' },
  agents: { route: 'settings', settings: 'agents' },
  agency: { route: 'settings', settings: 'agents' },
  skills: { route: 'settings', settings: 'skills' },
  tools: { route: 'settings', settings: 'tools' },
  scheduler: { route: 'settings', settings: 'scheduler' },
  docs: { route: 'settings', settings: 'docs' },
  telegram: { route: 'settings', settings: 'telegram' },
  plugins: { route: 'settings', settings: 'plugins' },
  worktrees: { route: 'settings', settings: 'worktrees' },
  sessions: { route: 'settings', settings: 'sessions' },
  logs: { route: 'settings', settings: 'logs' },
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
      const m = query.match(/section=([a-z]+)/);
      if (m) section = m[1] as SettingsSection;
    }
    return { route: mapped.route, settingsSection: section };
  }
  return { route: 'agent', settingsSection: 'general' };
}

/** Navigate by route name or any legacy pane name (mapped automatically). */
export function navigate(route: string) {
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
