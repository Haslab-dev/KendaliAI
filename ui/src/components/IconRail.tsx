import React from 'react';
import {
  Feather,
  MessageSquare,
  Bot,
  Zap,
  Plug,
  Brain,
  Wrench,
  Smartphone,
  Sun,
  Moon,
  History,
  FileText,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate, RouteName, useRoute } from '../router';

const NAV_ITEMS: { id: RouteName; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat View', icon: MessageSquare },
  { id: 'logs', label: 'Streaming Logs', icon: Terminal },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'providers', label: 'Providers & Models', icon: Zap },
  { id: 'docs', label: 'Doc Store', icon: FileText },
  { id: 'mcps', label: 'MCP Servers', icon: Plug },
  { id: 'skills', label: 'Skills Library', icon: Brain },
  { id: 'tools', label: 'Tools & Policies', icon: Wrench },
  { id: 'telegram', label: 'Telegram Bots', icon: Smartphone },
];

export const IconRail: React.FC = () => {
  const { theme, toggleTheme } = useAppStore();
  const route = useRoute();

  return (
    <nav className="hidden md:flex w-[58px] bg-rail border-r border-line flex-col items-center py-3 gap-2 z-20 select-none flex-shrink-0">
      {/* LibreChat Feather Logo */}
      <div
        className="w-[38px] h-[38px] rounded-xl flex items-center justify-center cursor-pointer text-hi mb-2"
        title="KendaliAI Gateway"
        onClick={() => navigate('chat')}
      >
        <Feather size={20} strokeWidth={1.75} />
      </div>

      {/* Nav Icons — routed panes */}
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = route === item.id;
        return (
          <button
            key={item.label}
            onClick={() => navigate(item.id)}
            className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center transition-all group relative ${
              isActive
                ? 'hover:bg-raised text-hi font-semibold shadow-sm'
                : 'text-mid hover:text-hi hover:bg-raised/60'
            }`}
          >
            <Icon size={19} />
            {item.id === 'logs' && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-hi animate-pulse" />
            )}
            <span className="absolute left-[65px] bg-hi text-app text-xs px-2 py-1 rounded shadow-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              {item.label}
            </span>
          </button>
        );
      })}

      <div className="flex-1" />

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="w-[42px] h-[42px] rounded-xl flex items-center justify-center text-mid hover:text-hi hover:bg-raised/60 transition-all group relative"
      >
        {theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}
        <span className="absolute left-[65px] bg-hi text-app text-xs px-2 py-1 rounded shadow-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
          Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
        </span>
      </button>

      {/* Session Registry */}
      <button
        onClick={() => navigate('sessions')}
        className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center transition-all group relative ${
          route === 'sessions'
            ? 'hover:bg-raised text-hi'
            : 'text-mid hover:text-hi hover:bg-raised/60'
        }`}
      >
        <History size={19} />
        <span className="absolute left-[65px] bg-hi text-app text-xs px-2 py-1 rounded shadow-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
          Session Registry
        </span>
      </button>

      {/* User Avatar */}
      <div
        className="w-[36px] h-[36px] rounded-full bg-hi text-app font-semibold text-xs flex items-center justify-center relative cursor-pointer mt-1"
        title="Active User"
      >
        LI
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-hi border-2 border-line" />
      </div>
    </nav>
  );
};
