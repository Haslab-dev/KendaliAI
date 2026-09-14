import React, { useState } from 'react';
import {
  Layers,
  MessageSquare,
  FolderGit2,
  CalendarClock,
  Settings as SettingsIcon,
  Bot,
  Plug,
  BookOpen,
  Code2,
  Terminal,
  Send,
  Zap,
  MoreHorizontal,
  X,
  Sun,
  Moon,
  Building2,
  Users2,
  type LucideIcon,
} from 'lucide-react';
import { navigate, RouteName, useRoute } from '../router';
import { useAppStore } from '../store/useAppStore';

const PRIMARY_MOBILE_ITEMS: { id: RouteName; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Overview', icon: Layers },
  { id: 'agents', label: 'Agents', icon: Users2 },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
];

const ALL_MOBILE_FEATURES: { id: RouteName; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', desc: 'System overview & executive metrics', icon: Layers },
  { id: 'agents', label: 'Agent Persons', desc: 'Agency office staff, personal assistants & bot pairing', icon: Users2 },
  { id: 'chat', label: 'Hermes Chat', desc: 'Coding agent & reasoning canvas', icon: MessageSquare },
  { id: 'editor', label: 'Workspace Editor', desc: 'File explorer & in-browser editor', icon: Code2 },
  { id: 'terminal', label: 'Shell Terminal', desc: 'Interactive shell session & command line', icon: Terminal },
  { id: 'scheduler', label: 'Scheduler & Reminders', desc: 'Natural language & cron automation', icon: CalendarClock },
  { id: 'worktrees', label: 'Branches (Worktrees)', desc: 'Isolated git branches & worktrees', icon: FolderGit2 },
  { id: 'plugins', label: 'Plugins & Skills', desc: 'Hot-register tools & agent plugins', icon: Plug },
  { id: 'docs', label: 'Knowledge Base', desc: 'Vector embeddings RAG & chunk search', icon: BookOpen },
  { id: 'providers', label: 'Providers & MCP', desc: 'OpenAI, Ollama, DeepSeek & MCP tools', icon: Zap },
  { id: 'telegram', label: 'Telegram Gateway', desc: 'Bi-directional bot & topic streaming', icon: Send },
  { id: 'settings', label: 'Settings', desc: 'Tool approvals, policies & configuration', icon: SettingsIcon },
];

export const BottomNav: React.FC = () => {
  const route = useRoute();
  const { theme, toggleTheme } = useAppStore();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <>
      {/* Mobile Bottom Navigation Bar matching refs/mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] dark:bg-[#141414] border-t border-[#E5E7EB] dark:border-[#27272A] flex items-stretch justify-around px-2 py-1 shadow-lg"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.35rem)' }}
      >
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = route === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setIsMoreOpen(false);
                navigate(item.id);
              }}
              className={`flex flex-col items-center justify-center gap-1 min-h-[48px] flex-1 py-1 rounded-[6px] transition-colors ${
                isActive
                  ? 'text-[#0F0F0F] dark:text-white font-bold'
                  : 'text-[#8A8A85] hover:text-[#333333]'
              }`}
            >
              <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[9px] font-funnel">{item.label}</span>
            </button>
          );
        })}

        {/* More Drawer Button */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] flex-1 py-1 rounded-[6px] transition-colors ${
            isMoreOpen || !PRIMARY_MOBILE_ITEMS.some((p) => p.id === route)
              ? 'text-[#007AFF] font-bold'
              : 'text-[#8A8A85] hover:text-[#333333]'
          }`}
          title="All Features"
        >
          <MoreHorizontal size={19} />
          <span className="text-[9px] font-funnel">More</span>
        </button>
      </nav>

      {/* Drawer Overlay */}
      {isMoreOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-150 flex flex-col justify-end"
          onClick={() => setIsMoreOpen(false)}
        >
          <div
            className="bg-[#FFFFFF] dark:bg-[#181818] rounded-t-[16px] border-t border-[#E5E7EB] dark:border-[#2E2E30] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] dark:border-[#2E2E30]">
              <div>
                <h2 className="text-base font-bold font-sans text-black dark:text-white">All Features</h2>
                <p className="text-[11px] text-[#8A8A85] font-funnel">Hermes Agent Local Gateway</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="p-2 text-[#8A8A85] hover:text-black dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="p-2 text-[#8A8A85] hover:text-black dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Menu Grid / List */}
            <div className="overflow-y-auto p-3 space-y-1 custom-scrollbar">
              {ALL_MOBILE_FEATURES.map((item) => {
                const Icon = item.icon;
                const isActive = route === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setIsMoreOpen(false);
                      navigate(item.id);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-[8px] text-left transition-colors ${
                      isActive
                        ? 'bg-[#FFF5EB] dark:bg-[#2A1F16] border border-[#F5E3CF] dark:border-[#422F1F] text-black dark:text-white'
                        : 'hover:bg-[#F7F7F5] dark:hover:bg-[#202022] text-[#333333] dark:text-[#D4D4D8]'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-[6px] flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-[#0F0F0F] text-white dark:bg-white dark:text-black'
                          : 'bg-[#F7F7F5] dark:bg-[#252528] text-[#333333] dark:text-white'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold font-sans truncate">{item.label}</div>
                      <div className="text-[10px] text-[#8A8A85] font-funnel truncate">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
