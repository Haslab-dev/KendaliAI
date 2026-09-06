import React, { useState } from 'react';
import {
  Bot,
  Brain,
  FileText,
  MessageSquare,
  History,
  Settings as SettingsIcon,
  Zap,
  Plug,
  Wrench,
  Smartphone,
  Terminal,
  MoreHorizontal,
  X,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { navigate, RouteName, useRoute } from '../router';
import { useAppStore } from '../store/useAppStore';

// Primary 4 items always shown on bottom navigation bar
const PRIMARY_ITEMS: { id: RouteName; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

// All menu items available in the "More" drawer on mobile
const ALL_MENU_ITEMS: { id: RouteName; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat View', desc: 'Main agent chat & reasoning canvas', icon: MessageSquare },
  { id: 'sessions', label: 'Session Registry', desc: 'Active & archived conversation threads', icon: History },
  { id: 'agents', label: 'Agent Personas', desc: 'Autonomous personas, system prompts & tools', icon: Bot },
  { id: 'providers', label: 'Providers & Models', desc: 'OpenAI, Ollama, DeepSeek & model probes', icon: Zap },
  { id: 'docs', label: 'Document Store (RAG)', desc: 'Vector embeddings & semantic search chunks', icon: FileText },
  { id: 'skills', label: 'Skills Library', desc: 'Modular domain instructions (SKILL.md)', icon: Brain },
  { id: 'mcps', label: 'MCP Servers', desc: 'Model Context Protocol tool extensions', icon: Plug },
  { id: 'tools', label: 'Tools & Policies', desc: 'Tool approval rules & capability permissions', icon: Wrench },
  { id: 'telegram', label: 'Telegram Bots', desc: 'Bi-directional bots & topic syncing', icon: Smartphone },
  { id: 'logs', label: 'Streaming Logs', desc: 'Real-time WebSocket event telemetry', icon: Terminal },
  { id: 'settings', label: 'Settings', desc: 'Security password, appearance & PWA install', icon: SettingsIcon },
];

export const BottomNav: React.FC = () => {
  const route = useRoute();
  const { theme, toggleTheme } = useAppStore();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <>
      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-rail border-t border-line flex items-stretch justify-around px-1 pt-1"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.25rem)' }}
      >
        {PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = route === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setIsMoreOpen(false);
                navigate(item.id);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[48px] flex-1 py-1 rounded-xl transition-colors ${
                isActive ? 'text-hi font-semibold' : 'text-mid active:text-hi'
              }`}
            >
              <Icon size={19} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}

        {/* More / All Menus Button */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[48px] flex-1 py-1 rounded-xl transition-colors ${
            isMoreOpen || !PRIMARY_ITEMS.some((p) => p.id === route)
              ? 'text-hi font-semibold'
              : 'text-mid active:text-hi'
          }`}
          title="All Menus & Settings"
        >
          <MoreHorizontal size={19} />
          <span className="text-[10px]">More</span>
        </button>
      </nav>

      {/* Full "All Menus & Settings" Mobile Drawer */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-150">
          <div
            className="bg-panel border-t border-line rounded-t-3xl max-h-[82vh] flex flex-col shadow-2xl overflow-hidden pb-16 animate-in slide-in-from-bottom duration-200"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="text-base">🪶</span>
                <div>
                  <h3 className="text-sm font-bold text-hi">All Menus & Settings</h3>
                  <p className="text-[10px] text-mid">Full KendaliAI workspace navigation</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl bg-raised border border-line text-mid hover:text-hi"
                  title="Toggle theme"
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="p-2 rounded-xl bg-raised border border-line text-mid hover:text-hi"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = route === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setIsMoreOpen(false);
                      navigate(item.id);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                      isActive
                        ? 'bg-raised border-line text-hi shadow-sm'
                        : 'bg-inputbg border-line/60 text-mid hover:text-hi hover:bg-raised'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-hi text-app' : 'bg-raised text-mid border border-line'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-hi truncate">{item.label}</div>
                      <div className="text-[10px] text-mid truncate">{item.desc}</div>
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
