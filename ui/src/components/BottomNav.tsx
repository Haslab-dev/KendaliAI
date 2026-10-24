import React from 'react';
import {
  MessageSquare,
  BookOpen,
  Lightbulb,
  SquareCheck,
  Shapes,
  Equal,
} from 'lucide-react';
import { useProfileStore } from '../store/useProfileStore';
import { useRoute, navigate, navigateSettings } from '../router';
import { cn } from '../lib/cn';

/**
 * Muse AI style bottom navigation bar:
 * - 6 pure icon buttons (no text labels)
 * - 1: Chat (speech bubble)
 * - 2: Notebook (editor)
 * - 3: Lightbulb (feed / insights)
 * - 4: Checklist (tasks / automations)
 * - 5: 4-Shapes Grid (groups)
 * - 6: Double line "=" (settings)
 * - Dark translucent glass background with safe area inset
 * - Subtle primary indicator dot below the active item
 */
export const BottomNav: React.FC = () => {
  const { activeNavTab, setActiveNavTab } = useProfileStore();
  const { route, settingsSection } = useRoute();

  const isSettingsRoute = route === 'settings' || activeNavTab === 'settings';

  const isChatActive =
    (activeNavTab === 'chat' || (!isSettingsRoute && ['chat', 'agent'].includes(activeNavTab))) &&
    !isSettingsRoute &&
    activeNavTab !== 'editor' &&
    activeNavTab !== 'feed' &&
    activeNavTab !== 'groups';

  const isEditorActive = activeNavTab === 'editor';
  const isFeedActive = activeNavTab === 'feed';
  const isAutomationsActive = isSettingsRoute && settingsSection === 'automations';
  const isGroupsActive = activeNavTab === 'groups';
  const isSettingsActive = isSettingsRoute && settingsSection !== 'automations';

  const NAV_ITEMS = [
    {
      id: 'chat',
      label: 'Chat',
      isActive: isChatActive,
      onClick: () => {
        setActiveNavTab('chat');
        navigate('agent');
      },
      icon: (active: boolean) => (
        <MessageSquare
          size={21}
          className={cn(
            'transition-transform duration-200',
            active ? 'fill-current stroke-current scale-105' : 'stroke-[1.8]'
          )}
        />
      ),
    },
    {
      id: 'editor',
      label: 'Editor',
      isActive: isEditorActive,
      onClick: () => {
        setActiveNavTab('editor');
        navigate('agent');
      },
      icon: (active: boolean) => (
        <BookOpen
          size={21}
          className={cn(
            'transition-transform duration-200',
            active ? 'stroke-[2.3] scale-105' : 'stroke-[1.8]'
          )}
        />
      ),
    },
    {
      id: 'feed',
      label: 'Feed',
      isActive: isFeedActive,
      onClick: () => {
        setActiveNavTab('feed');
        navigate('agent');
      },
      icon: (active: boolean) => (
        <Lightbulb
          size={21}
          className={cn(
            'transition-transform duration-200',
            active ? 'fill-primary/20 stroke-[2.3] scale-105' : 'stroke-[1.8]'
          )}
        />
      ),
    },
    {
      id: 'automations',
      label: 'Tasks',
      isActive: isAutomationsActive,
      onClick: () => {
        setActiveNavTab('settings');
        navigateSettings('automations');
      },
      icon: (active: boolean) => (
        <SquareCheck
          size={21}
          className={cn(
            'transition-transform duration-200',
            active ? 'stroke-[2.3] scale-105' : 'stroke-[1.8]'
          )}
        />
      ),
    },
    {
      id: 'groups',
      label: 'Groups',
      isActive: isGroupsActive,
      onClick: () => {
        setActiveNavTab('groups');
        navigate('agent');
      },
      icon: (active: boolean) => (
        <Shapes
          size={21}
          className={cn(
            'transition-transform duration-200',
            active ? 'fill-current stroke-current scale-105' : 'stroke-[1.8]'
          )}
        />
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      isActive: isSettingsActive,
      onClick: () => {
        setActiveNavTab('settings');
        navigateSettings('general');
      },
      icon: (active: boolean) => (
        <Equal
          size={22}
          className={cn(
            'transition-transform duration-200',
            active ? 'stroke-[2.8] scale-105' : 'stroke-[2]'
          )}
        />
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 dark:border-white/10 bg-[#121214] dark:bg-[#121214] text-white backdrop-blur-2xl h-14 md:hidden select-none shadow-[0_-4px_24px_rgba(0,0,0,0.35)] touch-manipulation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile Navigation"
    >
      {NAV_ITEMS.map((item) => {
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            aria-label={item.label}
            title={item.label}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-xl transition-all cursor-pointer touch-manipulation',
              item.isActive
                ? 'text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300 active:scale-90'
            )}
          >
            {item.icon(item.isActive)}
            {item.isActive && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary ring-1 ring-primary/40 shadow-[0_0_6px_var(--primary)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
