import { useEffect, useState } from 'react';

// Tiny hash router (GOALS.md F1). Hash-based so the existing SPA fallback in
// internal/server/server.go keeps working without server changes.
export const ROUTES = [
  'chat',
  'logs',
  'providers',
  'agents',
  'sessions',
  'docs',
  'mcps',
  'skills',
  'tools',
  'telegram',
] as const;

export type RouteName = (typeof ROUTES)[number];

export function parseHash(): RouteName {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as readonly string[]).includes(h) ? (h as RouteName) : 'chat';
}

export function navigate(route: RouteName) {
  if (parseHash() === route) return;
  window.location.hash = `#/${route}`;
}

export function useRoute(): RouteName {
  const [route, setRoute] = useState<RouteName>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
