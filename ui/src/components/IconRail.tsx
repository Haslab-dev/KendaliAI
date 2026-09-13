import React from 'react';
import {
  Layers,
  MessageSquare,
  Bot,
  CalendarClock,
  FolderGit2,
  Plug,
  BookOpen,
  Shield,
  Settings as SettingsIcon,
  Code2,
  Send,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate, RouteName, useRoute } from '../router';

interface NavItem {
  id: RouteName;
  label: string;
  icon: LucideIcon;
  category?: string;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Executive Dashboard', icon: Layers },
  { id: 'chat', label: 'Chat & Coding Agent', icon: MessageSquare },
  { id: 'editor', label: 'Workspace Editor', icon: Code2 },
  { id: 'agents', label: 'Agent Personas', icon: Bot },
  { id: 'scheduler', label: 'Scheduler & Tasks', icon: CalendarClock },
  { id: 'worktrees', label: 'Git Worktrees', icon: FolderGit2 },
  { id: 'plugins', label: 'Plugins & Skills', icon: Plug },
  { id: 'docs', label: 'Knowledge Base (RAG)', icon: BookOpen },
  { id: 'telegram', label: 'Telegram Gateway', icon: Send },
  { id: 'settings', label: 'Policy Guardrails', icon: Shield },
];

export const IconRail: React.FC = () => {
  const { theme, toggleTheme } = useAppStore();
  const route = useRoute();

  return (
    <nav
      data-pencil-name="Icon Rail"
      className="hidden md:flex box-border w-[60px] shrink-0 h-full flex-col gap-[8px] py-4 justify-start items-center bg-[#0F0F0F] select-none z-30 border-r border-[#1F1F1F]"
    >
      {/* Brand Icon */}
      <button
        onClick={() => navigate('dashboard')}
        className="w-[38px] h-[38px] rounded-[6px] flex items-center justify-center text-white hover:bg-white/10 transition-colors mb-1"
        title="KendaliAI / Hermes Agent"
      >
        <span className="font-sans font-bold text-sm tracking-wider text-white">⚡</span>
      </button>

      {/* Nav Items */}
      <div className="flex flex-col gap-[6px] items-center w-full">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = route === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`box-border w-[40px] h-[40px] shrink-0 flex items-center justify-center rounded-[6px] transition-all group relative ${
                isActive
                  ? 'bg-white/15 text-white font-semibold shadow-inner'
                  : 'text-[#A3A3A0] hover:text-white hover:bg-white/10'
              }`}
              title={item.label}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />

              {/* Active pip */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[16px] bg-white rounded-r-full" />
              )}

              {/* Tooltip */}
              <span className="absolute left-[54px] bg-[#1F1F1F] text-white text-[11px] font-medium font-sans px-2.5 py-1 rounded-[4px] shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/10">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="box-border w-[40px] h-[40px] shrink-0 flex items-center justify-center rounded-[6px] text-[#A3A3A0] hover:text-white hover:bg-white/10 transition-colors group relative"
        title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
      >
        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        <span className="absolute left-[54px] bg-[#1F1F1F] text-white text-[11px] font-sans px-2.5 py-1 rounded-[4px] shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/10">
          {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
        </span>
      </button>

      {/* Providers & Global Settings shortcut */}
      <button
        onClick={() => navigate('providers')}
        className={`box-border w-[40px] h-[40px] shrink-0 flex items-center justify-center rounded-[6px] transition-colors group relative ${
          route === 'providers' ? 'bg-white/15 text-white' : 'text-[#A3A3A0] hover:text-white hover:bg-white/10'
        }`}
        title="LLM Providers & MCP"
      >
        <SettingsIcon size={18} />
        <span className="absolute left-[54px] bg-[#1F1F1F] text-white text-[11px] font-sans px-2.5 py-1 rounded-[4px] shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/10">
          LLM Providers & MCP
        </span>
      </button>

      {/* User Avatar */}
      <div
        onClick={() => navigate('settings')}
        className="w-[32px] h-[32px] rounded-full bg-[#007AFF] text-white font-bold text-[11px] flex items-center justify-center cursor-pointer mt-1 hover:ring-2 hover:ring-white/40 transition-all"
        title="Lutfi Ikbal — Pro Workspace"
      >
        LI
      </div>
    </nav>
  );
};
