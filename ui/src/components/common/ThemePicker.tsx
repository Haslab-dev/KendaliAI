import React, { useState, useRef, useEffect } from 'react';
import { Palette, Sun, Moon, Laptop, Check, ChevronDown, Type, Minus, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { BuiltInThemeId, BUILT_IN_THEMES, ThemeColors, getThemeColorsForAppearance } from '../../lib/themePalettes';
import {
  AppearanceFontPreferences,
  DIFF_COLOR_SCHEMES,
  DiffColorScheme,
  ChatWidth,
  CHAT_WIDTHS,
  DEFAULT_CHAT_WIDTH,
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
import { cn } from '../../lib/cn';

const PREVIEW_APPEARANCE: 'light' | 'dark' = 'dark';

function themeSwatches(colors: ThemeColors): string[] {
  return [colors.canvas, colors.sidebar, colors.messageSurface, colors.messageAction, colors.accent];
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ui-xs text-foreground/70">{label}</span>
      <div className="flex items-center gap-1 rounded-md border border-border bg-card">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={(e) => {
            e.stopPropagation();
            onChange(Math.max(min, value - 1));
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 cursor-pointer"
        >
          <Minus className="size-3" />
        </button>
        <span className="min-w-7 text-center font-mono text-ui-xs text-foreground tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={(e) => {
            e.stopPropagation();
            onChange(Math.min(max, value + 1));
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 cursor-pointer"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
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

function FontFamilyField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-ui-xs text-foreground/70">{label}</span>
      <input
        type="text"
        list={`forge-font-options-${label.replace(/\s+/g, '-')}`}
        value={value}
        placeholder="System default"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-ui-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      <datalist id={`forge-font-options-${label.replace(/\s+/g, '-')}`}>
        {options.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </label>
  );
}

export const ThemePicker: React.FC<{ compact?: boolean }> = ({ compact = true }) => {
  const { themeMode, setThemeMode, themePack, setThemePack } = useAppStore();
  const [open, setOpen] = useState(false);
  const [contrast, setContrast] = useState(() => getStoredAppearanceContrast());
  const [fonts, setFonts] = useState<AppearanceFontPreferences>(() => getStoredFontPreferences());
  const [chatWidth, setChatWidth] = useState<ChatWidth>(() => getStoredChatWidth());
  const [diffScheme, setDiffScheme] = useState<DiffColorScheme>(() => getStoredDiffColorScheme());
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const updateFonts = (patch: Partial<AppearanceFontPreferences>) => {
    const next = { ...fonts, ...patch };
    setFonts(next);
    saveFontPreferences(next);
  };

  const activePalette = (themePack as BuiltInThemeId) in BUILT_IN_THEMES ? (themePack as BuiltInThemeId) : 'iris';
  const currentTheme = BUILT_IN_THEMES[activePalette] ?? BUILT_IN_THEMES['iris'];
  const currentColors = getThemeColorsForAppearance(currentTheme, PREVIEW_APPEARANCE);

  const modes: { id: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
    { id: 'system', label: 'Auto', icon: <Laptop className="size-3.5" /> },
  ];

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-ui-xs font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground cursor-pointer',
          open && 'border-border bg-accent text-foreground',
        )}
        title="Appearance"
      >
        <Palette className="size-3.5 shrink-0 text-primary" />
        {!compact && <span>{currentTheme.label}</span>}
        <span
          className="size-2 rounded-full border border-border/40"
          style={{ backgroundColor: currentColors.messageAction }}
        />
        <ChevronDown className={cn('size-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="dropdown-glass bg-popover/98 border border-border text-foreground absolute right-0 z-50 mt-1.5 w-80 animate-in rounded-2xl p-3.5 shadow-2xl fade-in zoom-in-95 duration-100 max-h-[85vh] overflow-y-auto scrollbar-thin">
          {/* Appearance mode */}
          <div className="px-1 pb-1 pt-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setThemeMode(m.id)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-ui-xs font-medium transition-colors cursor-pointer',
                  themeMode === m.id
                    ? 'border-primary bg-primary/10 text-foreground font-semibold'
                    : 'border-border text-foreground/75 hover:bg-accent hover:text-foreground',
                )}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="my-2.5 h-px bg-border" />

          {/* Theme gallery */}
          <div className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Theme
          </div>
          <div className="space-y-1">
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
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-primary/15 font-semibold text-foreground'
                      : 'text-foreground/75 hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex shrink-0 overflow-hidden rounded-full border border-border/40">
                      {swatches.map((c, i) => (
                        <span key={i} className="block size-3" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    <span>{t.label}</span>
                  </span>
                  {isSelected && <Check className="size-3.5 text-primary" />}
                </button>
              );
            })}
          </div>

          <div className="my-2.5 h-px bg-border" />

          {/* Contrast */}
          <div className="space-y-1 px-1">
            <div className="flex items-center justify-between">
              <span className="text-ui-xs text-foreground/75">Contrast</span>
              <span className="font-mono text-2xs text-muted-foreground tabular-nums">{contrast}%</span>
            </div>
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
              className="settings-slider w-full"
              style={{ ['--settings-slider-progress' as string]: `${((contrast - 70) / 60) * 100}%` }}
            />
          </div>

          <div className="my-2.5 h-px bg-border" />

          {/* Typography */}
          <div className="flex items-center gap-1.5 px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Type className="size-3" />
            Typography
          </div>
          <div className="space-y-2 px-1">
            <Stepper
              label="Interface size"
              value={clampInterfaceFontSize(fonts.sizeInterface)}
              min={12}
              max={20}
              onChange={(next) => updateFonts({ sizeInterface: next })}
            />
            <Stepper
              label="Code size"
              value={clampCodeFontSize(fonts.sizeCode)}
              min={10}
              max={18}
              onChange={(next) => updateFonts({ sizeCode: next })}
            />
            <FontFamilyField
              label="Interface font"
              value={fonts.sans}
              options={COMMON_SANS_FONTS}
              onChange={(next) => updateFonts({ sans: next })}
            />
            <FontFamilyField
              label="Code font"
              value={fonts.code}
              options={COMMON_CODE_FONTS}
              onChange={(next) => updateFonts({ code: next })}
            />
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-ui-xs text-foreground/75">Font smoothing</span>
              <input
                type="checkbox"
                checked={fonts.smoothing}
                onChange={(e) => updateFonts({ smoothing: e.target.checked })}
                className="size-3.5 accent-[var(--focus)] cursor-pointer"
              />
            </label>
          </div>

          <div className="my-2.5 h-px bg-border" />

          {/* Chat width */}
          <div className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Chat width
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {CHAT_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setChatWidth(w);
                  saveChatWidth(w);
                }}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-ui-xs font-medium capitalize transition-colors cursor-pointer',
                  chatWidth === w
                    ? 'border-primary bg-primary/10 text-foreground font-semibold'
                    : 'border-border text-foreground/75 hover:bg-accent hover:text-foreground',
                )}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="px-1 pt-2 pb-0.5 space-y-1">
            <div className="h-1.5 w-full bg-accent rounded-full overflow-hidden flex items-center">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200"
                style={{
                  width: chatWidth === 'comfortable' ? '50%' : chatWidth === 'wide' ? '75%' : '100%',
                }}
              />
            </div>
            <div className="flex items-center justify-between text-3xs text-muted-foreground">
              <span>
                {chatWidth === 'comfortable' && 'Comfortable (736px)'}
                {chatWidth === 'wide' && 'Wide layout (928px)'}
                {chatWidth === 'full' && 'Full width (100%)'}
              </span>
              <span className="font-mono">
                {chatWidth === 'comfortable' ? '46rem' : chatWidth === 'wide' ? '58rem' : '100%'}
              </span>
            </div>
          </div>

          <div className="my-2.5 h-px bg-border" />

          {/* Diff colors */}
          <div className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Diff colors
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {DIFF_COLOR_SCHEMES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setDiffScheme(s);
                  saveDiffColorScheme(s);
                }}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-ui-xs font-medium capitalize transition-colors cursor-pointer',
                  diffScheme === s
                    ? 'border-primary bg-primary/10 text-foreground font-semibold'
                    : 'border-border text-foreground/75 hover:bg-accent hover:text-foreground',
                )}
              >
                {s === 'classic' ? 'Green / Red' : 'Blue / Orange'}
              </button>
            ))}
          </div>

          <div className="my-2.5 h-px bg-border" />

          {/* Notifications */}
          <label className="flex items-center justify-between px-1 cursor-pointer">
            <span className="text-ui-xs text-foreground/75">Turn completion sound</span>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => {
                setSoundEnabled(e.target.checked);
                setNotificationSoundEnabled(e.target.checked);
              }}
              className="size-3.5 accent-[var(--focus)] cursor-pointer"
            />
          </label>
        </div>
      )}
    </div>
  );
};
