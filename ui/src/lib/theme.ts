/*
 * Theme engine — ForgeADE & T3Code parity.
 * Centralizes light/dark/system mode plus theme packs:
 * "t3-chat" (Forge zinc), "grove", "ocean", "ember", "iris".
 */

import { BUILT_IN_THEME_IDS, BuiltInThemeId, THEME_PALETTES } from './themePalettes';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePack = BuiltInThemeId | 'forge';

export const THEME_PACKS: BuiltInThemeId[] = [...BUILT_IN_THEME_IDS];

export const THEME_PACK_LABELS: Record<ThemePack, string> = {
  't3-chat': 'Forge T3',
  forge: 'Forge T3',
  grove: 'Grove',
  ocean: 'Ocean',
  ember: 'Ember',
  iris: 'Iris',
};

const MODE_KEY = 'kendali_theme';
const PACK_KEY = 'kendali_theme_pack';

export function normalizePack(pack: string | null): BuiltInThemeId {
  if (!pack) return 't3-chat';
  if (pack === 'forge') return 't3-chat';
  if ((BUILT_IN_THEME_IDS as readonly string[]).includes(pack)) {
    return pack as BuiltInThemeId;
  }
  return 't3-chat';
}

export function loadThemeMode(): ThemeMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'dark';
}

export function loadThemePack(): BuiltInThemeId {
  return normalizePack(localStorage.getItem(PACK_KEY));
}

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode, pack: ThemePack): void {
  const resolved = resolveMode(mode);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');

  const normalized = normalizePack(pack);
  if (normalized === 't3-chat') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', normalized);
  }
}

export function persistTheme(mode: ThemeMode, pack: ThemePack): void {
  localStorage.setItem(MODE_KEY, mode);
  localStorage.setItem(PACK_KEY, normalizePack(pack));
}

/** Initialize theme from storage before first paint (main.tsx). */
export function initTheme(): void {
  applyTheme(loadThemeMode(), loadThemePack());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (loadThemeMode() === 'system') {
      applyTheme('system', loadThemePack());
    }
  });
}
