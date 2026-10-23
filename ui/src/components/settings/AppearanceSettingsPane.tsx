import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Laptop,
  Check,
  Minus,
  Plus,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { BUILT_IN_THEMES, BuiltInThemeId, ThemeColors, getThemeColorsForAppearance } from '../../lib/themePalettes';
import {
  AppearanceFontPreferences,
  DIFF_COLOR_SCHEMES,
  DiffColorScheme,
  ChatWidth,
  CHAT_WIDTHS,
  clampCodeFontSize,
  clampInterfaceFontSize,
  getStoredAppearanceContrast,
  getStoredChatWidth,
  getStoredDiffColorScheme,
  getStoredFontPreferences,
  saveAppearanceContrast,
  saveChatWidth,
  saveDiffColorScheme,
  saveFontPreferences,
} from '../../lib/themeEngine';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from '../../lib/notificationSounds';
import {
  SettingsGroupCard,
  SettingsRow,
  Switch,
} from './settingsPrimitives';
import { cn } from '../../lib/utils';

const PREVIEW_APPEARANCE: 'light' | 'dark' = 'dark';

function themeSwatches(colors: ThemeColors): string[] {
  return [colors.canvas, colors.sidebar, colors.messageSurface, colors.messageAction, colors.accent];
}

const COMMON_SANS_FONTS = [
  'System',
  'SF Pro',
  'Helvetica Neue',
  'Arial',
  'Segoe UI',
  'Roboto',
  'Inter',
];
const COMMON_CODE_FONTS = [
  'SF Mono',
  'Menlo',
  'Monaco',
  'Consolas',
  'Cascadia Code',
  'JetBrains Mono',
  'Fira Code',
];

export const AppearanceSettingsPane: React.FC = () => {
  const { themeMode, setThemeMode, themePack, setThemePack } = useAppStore();
  const [contrast, setContrast] = useState(() => getStoredAppearanceContrast());
  const [fonts, setFonts] = useState<AppearanceFontPreferences>(() => getStoredFontPreferences());
  const [chatWidth, setChatWidth] = useState<ChatWidth>(() => getStoredChatWidth());
  const [diffScheme, setDiffScheme] = useState<DiffColorScheme>(() => getStoredDiffColorScheme());
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());

  const activePalette = (themePack as BuiltInThemeId) in BUILT_IN_THEMES ? (themePack as BuiltInThemeId) : 'iris';

  const updateFonts = (patch: Partial<AppearanceFontPreferences>) => {
    const next = { ...fonts, ...patch };
    setFonts(next);
    saveFontPreferences(next);
  };

  const modes: { id: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
    { id: 'system', label: 'Auto', icon: <Laptop className="size-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Theme Mode & Contrast */}
      <SettingsGroupCard>
        <SettingsRow
          label="Interface appearance"
          description="Switch between light, dark, or follow your operating system settings."
          control={
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1 border border-border/50">
              {modes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setThemeMode(m.id)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-ui-xs font-medium transition-colors cursor-pointer',
                    themeMode === m.id
                      ? 'bg-card text-foreground font-semibold shadow-xs'
                      : 'text-foreground-subtle hover:text-foreground'
                  )}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          }
        />
        <SettingsRow
          label="Interface contrast"
          description="Adjust contrast levels between surfaces and foreground text."
          control={
            <div className="flex items-center gap-3 w-48">
              <input
                type="range"
                min={70}
                max={130}
                step={5}
                value={contrast}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setContrast(next);
                  saveAppearanceContrast(next);
                }}
                className="settings-slider flex-1"
                style={{ ['--settings-slider-progress' as string]: `${((contrast - 70) / 60) * 100}%` }}
              />
              <span className="font-mono text-ui-xs text-foreground min-w-9 text-right tabular-nums">
                {contrast}%
              </span>
            </div>
          }
        />
      </SettingsGroupCard>

      {/* 2. Color Palettes */}
      <SettingsGroupCard>
        <div className="px-4 py-3 border-b border-border">
          <div className="text-ui-base font-medium text-foreground">Theme Palettes</div>
          <div className="mt-0.5 text-ui-sm text-foreground-subtle">
            Select an aesthetic preset ported from ForgeADE & T3Code.
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(BUILT_IN_THEMES) as BuiltInThemeId[]).map((id) => {
            const t = BUILT_IN_THEMES[id];
            const swatches = themeSwatches(getThemeColorsForAppearance(t, PREVIEW_APPEARANCE));
            const isSelected = activePalette === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setThemePack(id)}
                className={cn(
                  'group flex flex-col items-start rounded-xl border p-3.5 text-left transition-all cursor-pointer',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-border/70 bg-card hover:border-border hover:bg-surface-hover'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-ui-sm font-semibold text-foreground">{t.label}</span>
                  {isSelected && <Check className="size-4 text-primary" />}
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  <div className="flex overflow-hidden rounded-full border border-border/40">
                    {swatches.map((c, i) => (
                      <span key={i} className="block size-3.5" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-2xs text-foreground-subtle capitalize ml-1">{id}</span>
                </div>
              </button>
            );
          })}
        </div>
      </SettingsGroupCard>

      {/* 3. Typography & Sizing */}
      <SettingsGroupCard>
        <SettingsRow
          label="Interface font size"
          description="Adjust UI scale across sidebar, cards, and buttons."
          control={
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Reset to default"
                onClick={() => updateFonts({ sizeInterface: 13 })}
                className="text-foreground-subtlest hover:text-foreground text-ui-xs cursor-pointer"
              >
                Reset
              </button>
              <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => updateFonts({ sizeInterface: clampInterfaceFontSize(fonts.sizeInterface - 1) })}
                  className="rounded p-1 text-foreground-subtle hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <Minus className="size-3" />
                </button>
                <span className="min-w-7 text-center font-mono text-ui-xs text-foreground tabular-nums">
                  {fonts.sizeInterface}px
                </span>
                <button
                  type="button"
                  onClick={() => updateFonts({ sizeInterface: clampInterfaceFontSize(fonts.sizeInterface + 1) })}
                  className="rounded p-1 text-foreground-subtle hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-3" />
                </button>
              </div>
            </div>
          }
        />
        <SettingsRow
          label="Code font size"
          description="Monospace text size for code blocks, terminal, and file views."
          control={
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Reset to default"
                onClick={() => updateFonts({ sizeCode: 12 })}
                className="text-foreground-subtlest hover:text-foreground text-ui-xs cursor-pointer"
              >
                Reset
              </button>
              <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => updateFonts({ sizeCode: clampCodeFontSize(fonts.sizeCode - 1) })}
                  className="rounded p-1 text-foreground-subtle hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <Minus className="size-3" />
                </button>
                <span className="min-w-7 text-center font-mono text-ui-xs text-foreground tabular-nums">
                  {fonts.sizeCode}px
                </span>
                <button
                  type="button"
                  onClick={() => updateFonts({ sizeCode: clampCodeFontSize(fonts.sizeCode + 1) })}
                  className="rounded p-1 text-foreground-subtle hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-3" />
                </button>
              </div>
            </div>
          }
        />
        <SettingsRow
          label="UI font family"
          description="Primary sans-serif typeface used throughout the interface."
          control={
            <input
              type="text"
              list="font-options-sans"
              value={fonts.sans}
              placeholder="System default"
              onChange={(e) => updateFonts({ sans: e.target.value })}
              className="h-8 w-44 rounded-md border border-border bg-background px-2.5 text-ui-xs text-foreground outline-none placeholder:text-foreground-subtlest"
            />
          }
        />
        <datalist id="font-options-sans">
          {COMMON_SANS_FONTS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <SettingsRow
          label="Code font family"
          description="Monospace typeface for code editors and command terminals."
          control={
            <input
              type="text"
              list="font-options-code"
              value={fonts.code}
              placeholder="System default"
              onChange={(e) => updateFonts({ code: e.target.value })}
              className="h-8 w-44 rounded-md border border-border bg-background px-2.5 text-ui-xs text-foreground outline-none placeholder:text-foreground-subtlest"
            />
          }
        />
        <datalist id="font-options-code">
          {COMMON_CODE_FONTS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </SettingsGroupCard>

      {/* 4. Chat Width, Diff Colors & Sound Effects */}
      <SettingsGroupCard>
        <SettingsRow
          label="Chat lane width"
          description="Horizontal layout constraints for messages and input composer."
          control={
            <div className="flex items-center gap-1 rounded-lg bg-surface p-1 border border-border/50">
              {CHAT_WIDTHS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setChatWidth(opt);
                    saveChatWidth(opt);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-ui-xs font-medium capitalize transition-colors cursor-pointer',
                    chatWidth === opt
                      ? 'bg-card text-foreground font-semibold shadow-xs'
                      : 'text-foreground-subtle hover:text-foreground'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          }
        />
        <SettingsRow
          label="Diff color scheme"
          description="Color palette for insertions and deletions in git diffs."
          control={
            <div className="flex items-center gap-1 rounded-lg bg-surface p-1 border border-border/50">
              {DIFF_COLOR_SCHEMES.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setDiffScheme(opt);
                    saveDiffColorScheme(opt);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-ui-xs font-medium capitalize transition-colors cursor-pointer',
                    diffScheme === opt
                      ? 'bg-card text-foreground font-semibold shadow-xs'
                      : 'text-foreground-subtle hover:text-foreground'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          }
        />
        <SettingsRow
          label="Notification sounds"
          description="Play a subtle audio chime when agent turns or long tasks finish."
          control={
            <Switch
              checked={soundEnabled}
              onCheckedChange={(checked) => {
                setSoundEnabled(checked);
                setNotificationSoundEnabled(checked);
              }}
            />
          }
        />
      </SettingsGroupCard>
    </div>
  );
};
