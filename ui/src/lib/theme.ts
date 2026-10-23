import { BUILT_IN_THEME_IDS, BuiltInThemeId, THEME_PALETTES } from './themePalettes';
import {
  applyTheme as applyThemeEngine,
  getStoredThemePalette,
  getStoredAppearanceMode,
  saveThemePreference,
  initThemeEngine,
  ThemePreferenceMode,
  getStoredFontPreferences,
  applyAppearanceFontVariables,
  getStoredAppearanceContrast,
  applyAppearanceContrast,
  getStoredChatWidth,
  saveChatWidth,
  getStoredDiffColorScheme,
  saveDiffColorScheme,
} from './themeEngine';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePack = BuiltInThemeId | 'forge' | 't3-chat';

export const THEME_PACKS: BuiltInThemeId[] = [...BUILT_IN_THEME_IDS];

export const THEME_PACK_LABELS: Record<string, string> = {
  'forge-default': 'ForgeADE',
  't3-chat': 'ForgeADE',
  forge: 'ForgeADE',
  grove: 'Grove',
  ocean: 'Ocean',
  ember: 'Ember',
  iris: 'Iris',
};

export function normalizePack(pack: string | null): BuiltInThemeId {
  if (!pack) return 'iris';
  if (pack === 'forge' || pack === 't3-chat') return 'forge-default';
  if ((BUILT_IN_THEME_IDS as readonly string[]).includes(pack)) {
    return pack as BuiltInThemeId;
  }
  return 'iris';
}

export function loadThemeMode(): ThemeMode {
  return getStoredAppearanceMode();
}

export function loadThemePack(): BuiltInThemeId {
  return getStoredThemePalette();
}

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function applyTheme(mode: ThemeMode, pack: ThemePack): void {
  const normalized = normalizePack(pack);
  applyThemeEngine(normalized, mode);
}

export function persistTheme(mode: ThemeMode, pack: ThemePack): void {
  const normalized = normalizePack(pack);
  saveThemePreference(normalized, mode);
}

/** Initialize theme from storage before first paint (main.tsx). */
export function initTheme(): void {
  initThemeEngine();
  if (typeof document !== 'undefined') {
    applyAppearanceFontVariables(document.documentElement, getStoredFontPreferences());
    applyAppearanceContrast(document.documentElement, getStoredAppearanceContrast());
    saveChatWidth(getStoredChatWidth());
    saveDiffColorScheme(getStoredDiffColorScheme());
  }
}
