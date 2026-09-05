import React from 'react';
import { Bot, Brain, FileText, MessageSquare, History, type LucideIcon } from 'lucide-react';
import { navigate, RouteName, useRoute } from '../router';

// Mobile bottom navigation (GOALS.md F3) — the phone-friendly counterpart of
// the desktop IconRail. Touch targets stay >= 44px.
const MOBILE_ITEMS: { id: RouteName; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'skills', label: 'Skills', icon: Brain },
];

export const BottomNav: React.FC = () => {
  const route = useRoute();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#111111] border-t border-[#262626] flex items-stretch justify-around pt-1"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.25rem)' }}
    >
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = route === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[48px] flex-1 py-1 rounded-xl transition-colors ${
              isActive ? 'text-blue-400' : 'text-neutral-400 active:text-neutral-200'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
