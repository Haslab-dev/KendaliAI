import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Palette,
  Send,
  TerminalSquare,
  Shield,
  Layers,
  X,
  ArrowLeft,
} from 'lucide-react';
import { ProvidersPane } from '../../panes/providers';
import { AppearanceSettingsPane } from './AppearanceSettingsPane';
import { TelegramPane } from '../../panes/telegram';
import { LogsStreamingView } from '../LogsStreamingView';
import { DashboardPane } from '../../panes/dashboard';
import { useProfileStore } from '../../store/useProfileStore';
import { navigate } from '../../router';

type SettingsTab = 'providers' | 'general' | 'telegram' | 'logs';

interface SettingsScreenProps {
  section?: string;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ section }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (section === 'providers') return 'providers';
    if (section === 'telegram') return 'telegram';
    if (section === 'logs' || section === 'dashboard') return 'logs';
    return 'providers';
  });

  const handleClose = () => {
    useProfileStore.getState().setActiveNavTab('chat');
    navigate('agent');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabs = [
    {
      id: 'providers' as const,
      label: 'AI Providers & Models',
      icon: Cpu,
      description: 'API keys, LLM endpoints, and model routing',
    },
    {
      id: 'general' as const,
      label: 'Appearance & Security',
      icon: Palette,
      description: 'Theme palettes, dark mode, and security',
    },
    {
      id: 'telegram' as const,
      label: 'Telegram Gateway',
      icon: Send,
      description: 'Bot tokens and channel synchronization',
    },
    {
      id: 'logs' as const,
      label: 'Diagnostics & Logs',
      icon: TerminalSquare,
      description: 'Real-time WebSocket server logs and status',
    },
  ];

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0a0a0c] text-foreground select-none overflow-hidden">
      {/* Top Header & Horizontal Tabs */}
      <div className="shrink-0 border-b border-border/40 bg-[#0e0e12]/80 backdrop-blur-md px-6 pt-5 pb-3">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Workspace configuration, LLM model providers, channels, and system diagnostics.
            </p>
          </div>

          {/* Clean Top Tabs & Done Button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-muted/40 border border-border/50 rounded-xl text-xs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
              title="Close Settings (Esc)"
            >
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area (Full Width, No Nested Sidebar) */}
      <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'providers' && <ProvidersPane />}
          {activeTab === 'general' && <AppearanceSettingsPane />}
          {activeTab === 'telegram' && <TelegramPane />}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              <DashboardPane />
              <div className="rounded-xl border border-border/60 bg-[#101014] p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4 text-primary" />
                  Live Gateway Event Stream
                </h3>
                <LogsStreamingView />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
