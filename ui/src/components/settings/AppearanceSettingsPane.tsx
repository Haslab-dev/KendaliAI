import React, { useState } from 'react';
import {
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  Type,
  Sliders,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { THEME_PALETTES, BuiltInThemeId } from '../../lib/themePalettes';
import { ThemeMode } from '../../lib/theme';

export const AppearanceSettingsPane: React.FC = () => {
  const { themeMode, setThemeMode, themePack, setThemePack } = useAppStore();
  const [activeFont, setActiveFont] = useState('sans');

  const modes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System Match', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-ui-sm font-semibold text-foreground flex items-center gap-2">
            <Sun className="size-4 text-primary" />
            Appearance Mode
          </h3>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Select light, dark, or follow your operating system appearance preference.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {modes.map((m) => {
            const Icon = m.icon;
            const isSelected = themeMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setThemeMode(m.id)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-ui-xs transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                    : 'border-border/70 bg-background text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                <Icon className="size-5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* T3Code Theme Palettes */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-ui-sm font-semibold text-foreground flex items-center gap-2">
            <Palette className="size-4 text-primary" />
            T3Code Theme Palettes
          </h3>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Theme styling ported from ForgeADE & T3Code. Dynamic custom properties adapt smoothly to all workspaces.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEME_PALETTES.map((pal) => {
            const isSelected = themePack === pal.id || (themePack === 'forge' && pal.id === 't3-chat');
            return (
              <div
                key={pal.id}
                onClick={() => setThemePack(pal.id)}
                className={`group cursor-pointer rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border/70 bg-background hover:border-border hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-4 rounded-full border border-black/20 shadow-xs"
                      style={{ backgroundColor: pal.dotColor }}
                    />
                    <span className="text-ui-sm font-semibold text-foreground">{pal.label}</span>
                  </div>
                  {isSelected && <Check className="size-4 text-primary" />}
                </div>

                <p className="mt-2 text-2xs text-muted-foreground leading-relaxed">
                  {pal.description}
                </p>

                {/* Color swatch preview bar */}
                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full opacity-80">
                  <span className="w-1/3" style={{ backgroundColor: pal.dotColor }} />
                  <span className="w-1/3 bg-card border-x border-border/50" />
                  <span className="w-1/3 bg-background" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Typography & UI Geometry */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-ui-sm font-semibold text-foreground flex items-center gap-2">
            <Type className="size-4 text-primary" />
            Typography & Font Stacks
          </h3>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Dense, high-contrast type scale optimized for terminal, code, and chat reading.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'sans', label: 'System Sans', sample: 'Inter / SF Pro', mono: false },
            { id: 'geist', label: 'Geist Sans', sample: 'Modern Geometric', mono: false },
            { id: 'mono', label: 'SF / Geist Mono', sample: 'Code & Terminals', mono: true },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFont(f.id)}
              className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                activeFont === f.id
                  ? 'border-primary bg-primary/10 font-semibold'
                  : 'border-border/70 bg-background hover:bg-surface-hover'
              }`}
            >
              <span className={`text-ui-sm ${f.mono ? 'font-mono' : ''}`}>{f.label}</span>
              <span className="text-2xs text-muted-foreground mt-1">{f.sample}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
