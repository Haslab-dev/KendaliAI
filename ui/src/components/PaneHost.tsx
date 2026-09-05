import React from 'react';
import { ArrowLeft, Bot, Brain, FileText, MessageSquare, Plug, Smartphone, Terminal, Wrench, Zap, type LucideIcon } from 'lucide-react';
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
import { LogsStreamingView } from './LogsStreamingView';

const PANES: Record<
  Exclude<RouteName, 'chat'>,
  { label: string; icon: LucideIcon }
> = {
  logs: { label: 'Streaming Logs', icon: Terminal },
  providers: { label: 'Providers & Models', icon: Zap },
  agents: { label: 'Agent Personas', icon: Bot },
  sessions: { label: 'Session Registry', icon: MessageSquare },
  docs: { label: 'Doc Store', icon: FileText },
  mcps: { label: 'MCP Servers', icon: Plug },
  skills: { label: 'Skills Library', icon: Brain },
  tools: { label: 'Tools & Policies', icon: Wrench },
  telegram: { label: 'Telegram Bots', icon: Smartphone },
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

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 relative overflow-hidden bg-app">
      {route !== 'logs' && (
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
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        {/* Inner padding for all panes except full-bleed logs */}
        <div className={route === 'logs' ? 'flex-1 flex flex-col' : 'flex-1 flex flex-col px-4 py-4 md:px-6 md:py-6'}>
          {route === 'providers' && <ProvidersPane />}
          {route === 'agents' && <AgentsPane />}
          {route === 'logs' && <LogsStreamingView onClose={() => navigate('chat')} />}
          {route === 'sessions' && <SessionsPane onSelectSession={openInChat} />}
          {route === 'docs' && <DocsPane onChatWithDoc={() => navigate('chat')} />}
          {route === 'mcps' && <McpsPane />}
          {route === 'skills' && <SkillsPane />}
          {route === 'tools' && <ToolsPane />}
          {route === 'telegram' && <TelegramPane />}
        </div>
      </div>
    </div>
  );
};
