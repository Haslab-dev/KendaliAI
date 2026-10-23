import React from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ThemeMode } from '../../lib/theme';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };

export const APP_VERSION = '0.6.0';
export const APP_BUILD = 55;

export const ProfileRow: React.FC<{
  theme: ThemeMode;
  onToggleTheme: (next: ThemeMode) => void;
  onOpenSettings?: () => void;
  className?: string;
}> = ({ theme, onToggleTheme, className }) => {
  const label = theme === 'dark' ? 'Dark theme' : theme === 'light' ? 'Light theme' : 'Follow system';
  return (
    <div className={cn('flex shrink-0 items-center justify-between gap-2 border-t border-sidebar-border/30 px-3 py-2 bg-sidebar', className)}>
      <button
        type="button"
        aria-label={`Appearance: ${label}`}
        title={`${label} — click for ${NEXT_MODE[theme]}`}
        onClick={() => onToggleTheme(NEXT_MODE[theme])}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
      >
        {theme === 'dark' ? <Moon className="size-4" /> : theme === 'light' ? <Sun className="size-4" /> : <Laptop className="size-4" />}
      </button>

      <span
        title={`KendaliAI v${APP_VERSION} (Build ${APP_BUILD})`}
        className="font-mono text-ui-xs text-muted-foreground/70 hover:text-foreground transition-colors select-none cursor-default font-medium px-2 py-0.5 rounded-md bg-foreground/5"
      >
        v{APP_VERSION}
        <span className="text-[10px] text-muted-foreground/50 font-normal ml-1">#{APP_BUILD}</span>
      </span>
    </div>
  );
};
