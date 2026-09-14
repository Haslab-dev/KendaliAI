import React from 'react';
import {
  ArrowLeft,
  Bot,
  Brain,
  FileText,
  MessageSquare,
  Plug,
  Settings,
  Smartphone,
  Terminal,
  Wrench,
  Zap,
  Code2,
  GitFork,
  Clock,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';
import { navigate, RouteName } from '../router';
import { useAppStore } from '../store/useAppStore';
import { ProvidersPane } from '../panes/providers';
import { AgentsPane } from '../panes/agents';
import { SessionsPane } from '../panes/sessions';
import { DocsPane } from '../panes/docs';
import { McpsPane } from '../panes/mcps';
import { SkillsPane } from '../panes/skills';
import { ToolsPane } from '../panes/tools';
import { TelegramPane } from '../panes/telegram';
import { SettingsPane } from '../panes/settings';
import { EditorPane } from '../panes/editor';
import { WorktreesPane } from '../panes/worktrees';
import { SchedulerPane } from '../panes/scheduler';
import { PluginsPane } from '../panes/plugins';
import { DashboardPane } from '../panes/dashboard';
import { AgencyHQPane } from '../panes/agency';
import { LogsStreamingView } from './LogsStreamingView';
import { TerminalPane } from '../panes/terminal';
import { Layers, Building2, Users2 } from 'lucide-react';

const PANES: Record<
  Exclude<RouteName, 'chat'>,
  { label: string; icon: LucideIcon }
> = {
  dashboard: { label: 'Dashboard', icon: Layers },
  agency: { label: 'Agent Persons', icon: Users2 },
  editor: { label: 'Files & Code Editor', icon: Code2 },
  terminal: { label: 'Shell Terminal', icon: Terminal },
  worktrees: { label: 'Git Worktrees', icon: GitFork },
  scheduler: { label: 'Scheduler & Cron', icon: Clock },
  plugins: { label: 'Plugins & Extensions', icon: Puzzle },
  logs: { label: 'Streaming Logs', icon: Terminal },
  providers: { label: 'Providers & Models', icon: Zap },
  agents: { label: 'Agent Persons', icon: Users2 },
  sessions: { label: 'Session Registry', icon: MessageSquare },
  docs: { label: 'Doc Store', icon: FileText },
  mcps: { label: 'MCP Servers', icon: Plug },
  skills: { label: 'Skills Library', icon: Brain },
  tools: { label: 'Tools & Policies', icon: Wrench },
  telegram: { label: 'Telegram Bots', icon: Smartphone },
  settings: { label: 'Settings', icon: Settings },
};

// PaneHost renders the active workspace pane in the main content area as a
// real routed pane (GOALS.md F2) — no modal overlays.
export const PaneHost: React.FC<{ route: Exclude<RouteName, 'chat'> }> = ({ route }) => {
  const { selectSession } = useAppStore() as any;
  const meta = PANES[route];

  const openInChat = (sessionId: string) => {
    selectSession(sessionId);
    navigate('chat');
  };

  const isFullBleed = [
    'dashboard',
    'agency',
    'editor',
    'terminal',
    'worktrees',
    'scheduler',
    'plugins',
    'providers',
    'agents',
    'docs',
    'telegram',
    'settings',
    'logs',
  ].includes(route);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 relative overflow-hidden bg-app">
      {!isFullBleed && (
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-line bg-rail flex-shrink-0">
          <button
            onClick={() => navigate('chat')}
            className="md:hidden flex items-center gap-1 text-mid hover:text-hi text-xs px-2 py-1.5 rounded-lg bg-raised"
          >
            <ArrowLeft size={14} />
            Chat
          </button>
          <span className="w-8 h-8 rounded-xl text-hi flex items-center justify-center flex-shrink-0">
            <meta.icon size={16} />
          </span>
          <h1 className="text-sm font-bold text-hi">{meta.label}</h1>
        </div>
      )}
      {route === 'editor' ? (
        <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
          <EditorPane />
        </div>
      ) : route === 'terminal' ? (
        <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
          <TerminalPane />
        </div>
      ) : route === 'logs' ? (
        <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
          <LogsStreamingView onClose={() => navigate('chat')} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
          {/* Inner padding for supplementary panes; full-bleed for dedicated reference layouts */}
          <div className={isFullBleed ? 'flex-1 flex flex-col min-h-0' : 'flex-1 flex flex-col px-4 py-4 md:px-6 md:py-6'}>
            {route === 'dashboard' && <DashboardPane />}
            {route === 'agency' && <AgencyHQPane />}
            {route === 'worktrees' && <WorktreesPane />}
            {route === 'scheduler' && <SchedulerPane />}
            {route === 'plugins' && <PluginsPane />}
            {route === 'providers' && <ProvidersPane />}
            {route === 'agents' && <AgentsPane />}
            {route === 'sessions' && <SessionsPane onSelectSession={openInChat} />}
            {route === 'docs' && <DocsPane onChatWithDoc={() => navigate('chat')} />}
            {route === 'mcps' && <McpsPane />}
            {route === 'skills' && <SkillsPane />}
            {route === 'tools' && <ToolsPane />}
            {route === 'telegram' && <TelegramPane />}
            {route === 'settings' && <SettingsPane />}
          </div>
        </div>
      )}
    </div>
  );
};
