import React, { useState } from 'react';
import { Settings as SettingsIcon, MessagesSquare } from 'lucide-react';
import { navigate, navigateSettings, RouteName, useRoute } from '../router';
import { useAppStore } from '../store/useAppStore';
import { ThemePicker } from './shell/ThemePicker';
import { ProviderIcon } from './agent/ProviderIcon';
import { cn } from '../lib/cn';

const PRIMARY_ITEMS: {
  id: RouteName;
  label: string;
  renderIcon: (isActive: boolean) => React.ReactNode;
}[] = [
  {
    id: 'agent',
    label: 'Agent',
    renderIcon: () => <ProviderIcon provider="forge-ade" size={19} />,
  },
  {
    id: 'assistant',
    label: 'Assistant',
    renderIcon: (isActive) => <MessagesSquare size={19} strokeWidth={isActive ? 2.2 : 1.8} />,
  },
];

export const BottomNav: React.FC = () => {
  const { route } = useRoute();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <>
      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-border/70 bg-card px-2 py-1 md:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.35rem)' }}
      >
        {PRIMARY_ITEMS.map((item) => {
          const isActive = route === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setIsMoreOpen(false);
                navigate(item.id);
              }}
              className={cn(
                'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1 transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.renderIcon(isActive)}
              <span className="text-3xs font-medium">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => {
            setIsMoreOpen(false);
            navigateSettings('general');
          }}
          className={cn(
            'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1 transition-colors',
            route === 'settings' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          title="Settings"
        >
          <SettingsIcon size={19} strokeWidth={route === 'settings' ? 2.2 : 1.8} />
          <span className="text-3xs font-medium">Settings</span>
        </button>
      </nav>

      {/* Settings quick sheet */}
      {isMoreOpen && (
        <div className="dialog-backdrop fixed inset-0 z-50 flex flex-col justify-end md:hidden" onClick={() => setIsMoreOpen(false)}>
          <div className="dialog-glass animate-in slide-in-from-bottom-2 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <div>
                <h2 className="text-ui-lg font-semibold text-foreground">Settings</h2>
                <p className="text-ui-xs text-muted-foreground">Providers, agents, automations…</p>
              </div>
              <ThemePicker compact />
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  navigateSettings('general');
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-foreground px-3 py-2.5 text-ui-sm font-medium text-background"
              >
                <SettingsIcon size={16} />
                Open full Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
