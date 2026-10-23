import React from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '../ui';
import { THEME_PACK_LABELS, THEME_PACKS, ThemeMode, ThemePack } from '../../lib/theme';
import { THEME_PALETTES } from '../../lib/themePalettes';
import { cn } from '../../lib/cn';

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export const ThemePicker: React.FC<{ compact?: boolean; side?: 'top' | 'bottom' }> = ({ compact, side = 'bottom' }) => {
  const themeMode = useAppStore((s) => s.themeMode);
  const themePack = useAppStore((s) => s.themePack);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const setThemePack = useAppStore((s) => s.setThemePack);

  const ModeIcon = themeMode === 'system' ? Monitor : themeMode === 'light' ? Sun : Moon;

  return (
    <DropdownMenu
      align="right"
      width={220}
      side={side}
      trigger={
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          title="Theme & Appearance"
        >
          {compact ? <Palette size={15} /> : <ModeIcon size={15} />}
        </button>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Appearance</MenuLabel>
          <div className="mb-1 grid grid-cols-3 gap-1 px-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setThemeMode(m.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-2xs transition-colors',
                    themeMode === m.id
                      ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-foreground/5'
                  )}
                >
                  <Icon size={13} />
                  {m.label}
                </button>
              );
            })}
          </div>
          <MenuSeparator />
          <MenuLabel>T3 Theme Palettes</MenuLabel>
          {THEME_PALETTES.map((pal) => (
            <MenuItem
              key={pal.id}
              selected={themePack === pal.id || ((themePack as string) === 'forge' && pal.id === 'forge-default')}
              onClick={() => {
                setThemePack(pal.id);
                close();
              }}
            >
              <span className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-full shrink-0 border border-black/20 shadow-xs"
                    style={{ backgroundColor: pal.dotColor }}
                  />
                  <span>{pal.label}</span>
                </span>
                {(themePack === pal.id || ((themePack as string) === 'forge' && pal.id === 'forge-default')) && (
                  <Check size={13} className="text-primary" />
                )}
              </span>
            </MenuItem>
          ))}
        </>
      )}
    </DropdownMenu>
  );
};
