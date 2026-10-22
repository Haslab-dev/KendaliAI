import React, { useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Building2,
  Folder,
  BarChart3,
  Settings,
  Cpu,
  Wrench,
  Brain,
  Plug,
  Puzzle,
  Bell,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { ProvidersPane } from '../../panes/providers';
import { AppearanceSettingsPane } from './AppearanceSettingsPane';
import { McpsPane } from '../../panes/mcps';
import { SkillsPane } from '../../panes/skills';
import { ToolsPane } from '../../panes/tools';
import { PluginsPane } from '../../panes/plugins';
import { TelegramPane } from '../../panes/telegram';
import { DashboardPane } from '../../panes/dashboard';
import { WorktreesPane } from '../../panes/worktrees';
import { SessionsPane } from '../../panes/sessions';

interface ControlCenterRowProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const ControlCenterRow: React.FC<ControlCenterRowProps> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#18181e] transition-colors group"
  >
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
        {icon}
      </span>
      <span className="text-sm text-foreground/90 group-hover:text-foreground font-medium">
        {label}
      </span>
    </div>
    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
  </button>
);

export const ControlCenterView: React.FC = () => {
  const { setActiveNavTab } = useProfileStore();
  const { selectSession } = useSessionStore();
  const [selectedPane, setSelectedPane] = useState<string | null>(null);

  // If a sub-pane is selected, show that pane with a back button
  if (selectedPane) {
    const renderSubPane = () => {
      switch (selectedPane) {
        case 'providers':
          return <ProvidersPane />;
        case 'settings':
          return <AppearanceSettingsPane />;
        case 'mcps':
          return <McpsPane />;
        case 'skills':
          return <SkillsPane />;
        case 'tools':
          return <ToolsPane />;
        case 'plugins':
          return <PluginsPane />;
        case 'telegram':
          return <TelegramPane />;
        case 'dashboard':
          return <DashboardPane />;
        case 'worktrees':
          return <WorktreesPane />;
        case 'usage':
          return (
            <SessionsPane
              onSelectSession={(id) => {
                selectSession(id);
                setActiveNavTab('chat');
              }}
            />
          );
        default:
          return <ProvidersPane />;
      }
    };

    return (
      <div className="flex-1 h-full flex flex-col bg-[#0a0a0c] text-foreground select-none overflow-hidden">
        {/* Header */}
        <div className="h-14 px-6 border-b border-border/30 flex items-center justify-between shrink-0 bg-[#0e0e12]/80 backdrop-blur-md">
          <button
            onClick={() => setSelectedPane(null)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Control center</span>
          </button>
          <button
            onClick={() => setActiveNavTab('chat')}
            className="px-3.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
          >
            Done
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
          <div className="max-w-6xl mx-auto">
            {renderSubPane()}
          </div>
        </div>
      </div>
    );
  }

  // Root Control Center Menu (matches reference layout)
  return (
    <div className="flex-1 h-full flex flex-col bg-[#0a0a0c] text-foreground select-none overflow-hidden">
      {/* Top Header */}
      <div className="h-14 px-6 border-b border-border/30 flex items-center justify-between shrink-0 bg-[#0e0e12]/80">
        <button
          onClick={() => setActiveNavTab('chat')}
          className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Control center</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 scrollbar-thin">
        <div className="max-w-2xl mx-auto space-y-7">
          {/* Workspace */}
          <div className="space-y-2">
            <h3 className="text-xs text-muted-foreground font-medium px-1">Workspace</h3>
            <div className="rounded-2xl bg-[#121216] border border-border/40 divide-y divide-border/25 overflow-hidden shadow-xs">
              <ControlCenterRow
                icon={<Building2 className="w-4 h-4" />}
                label="Organization"
                onClick={() => setSelectedPane('dashboard')}
              />
              <ControlCenterRow
                icon={<Folder className="w-4 h-4" />}
                label="Browse Files"
                onClick={() => setSelectedPane('worktrees')}
              />
              <ControlCenterRow
                icon={<BarChart3 className="w-4 h-4" />}
                label="Usage"
                onClick={() => setSelectedPane('usage')}
              />
              <ControlCenterRow
                icon={<Settings className="w-4 h-4" />}
                label="Settings"
                onClick={() => setSelectedPane('settings')}
              />
            </div>
          </div>

          {/* Agent tools */}
          <div className="space-y-2">
            <h3 className="text-xs text-muted-foreground font-medium px-1">Agent tools</h3>
            <div className="rounded-2xl bg-[#121216] border border-border/40 divide-y divide-border/25 overflow-hidden shadow-xs">
              <ControlCenterRow
                icon={<Cpu className="w-4 h-4" />}
                label="AI Providers"
                onClick={() => setSelectedPane('providers')}
              />
              <ControlCenterRow
                icon={<Wrench className="w-4 h-4" />}
                label="Tools"
                onClick={() => setSelectedPane('tools')}
              />
              <ControlCenterRow
                icon={<Brain className="w-4 h-4" />}
                label="Skills"
                onClick={() => setSelectedPane('skills')}
              />
              <ControlCenterRow
                icon={<Plug className="w-4 h-4" />}
                label="MCP"
                onClick={() => setSelectedPane('mcps')}
              />
              <ControlCenterRow
                icon={<Puzzle className="w-4 h-4" />}
                label="Plugins"
                onClick={() => setSelectedPane('plugins')}
              />
            </div>
          </div>

          {/* Integrations */}
          <div className="space-y-2">
            <h3 className="text-xs text-muted-foreground font-medium px-1">Integrations</h3>
            <div className="rounded-2xl bg-[#121216] border border-border/40 divide-y divide-border/25 overflow-hidden shadow-xs">
              <ControlCenterRow
                icon={<Bell className="w-4 h-4" />}
                label="Notifications"
                onClick={() => setSelectedPane('telegram')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
