import React, { useEffect, useState } from 'react';
import {
  Brain,
  CalendarClock,
  Cpu,
  FileText,
  FolderGit2,
  Layers,
  MessageSquare,
  Plug,
  Puzzle,
  Search,
  Send,
  Settings as SettingsIcon,
  TerminalSquare,
  Users2,
  Wrench,
  X,
  Palette,
  Shield,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { navigate, navigateSettings, SettingsSection } from '../../router';
import { cn } from '../../lib/cn';
import { SettingsPane } from '../../panes/settings';
import { ProvidersPane } from '../../panes/providers';
import { AgentsPane } from '../../panes/agents';
import { SessionsPane } from '../../panes/sessions';
import { DocsPane } from '../../panes/docs';
import { McpsPane } from '../../panes/mcps';
import { SkillsPane } from '../../panes/skills';
import { ToolsPane } from '../../panes/tools';
import { TelegramPane } from '../../panes/telegram';
import { WorktreesPane } from '../../panes/worktrees';
import { SchedulerPane } from '../../panes/scheduler';
import { PluginsPane } from '../../panes/plugins';
import { DashboardPane } from '../../panes/dashboard';
import { LogsStreamingView } from '../LogsStreamingView';
import { AppearanceSettingsPane } from './AppearanceSettingsPane';
import { THEME_PALETTES } from '../../lib/themePalettes';
import { useAppStore } from '../../store/useAppStore';

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: string;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'dashboard', label: 'Overview', icon: Layers, group: 'System', description: 'System status, health metrics and resource usage' },
  { id: 'general', label: 'Appearance & Security', icon: Palette, group: 'Workspace', description: 'Theme palettes, light/dark mode, and workspace passwords' },
  { id: 'providers', label: 'Providers & Models', icon: Cpu, group: 'AI & Agents', description: 'API keys, LLM endpoints, and model routing' },
  { id: 'agents', label: 'Agent Personas', icon: Users2, group: 'AI & Agents', description: 'Agent roles, system prompts, and tool permissions' },
  { id: 'telegram', label: 'Telegram Gateway', icon: Send, group: 'Channels', description: 'Bot tokens, channel synchronization, and user pairing codes' },
  { id: 'mcps', label: 'MCP Servers', icon: Plug, group: 'Tools & Skills', description: 'Model Context Protocol servers and dynamic tools' },
  { id: 'skills', label: 'Skills Library', icon: Brain, group: 'Tools & Skills', description: 'Built-in and custom skills repository' },
  { id: 'tools', label: 'Tool Permissions', icon: Wrench, group: 'Tools & Skills', description: 'Allow, Approval, and Deny security policies per persona' },
  { id: 'scheduler', label: 'Routines & Cron', icon: CalendarClock, group: 'Automations', description: 'Automated recurring tasks and background routines' },
  { id: 'docs', label: 'Knowledge Base (RAG)', icon: FileText, group: 'Automations', description: 'Vector embeddings, document ingestion, and retrieval' },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, group: 'Extensions', description: 'Installed community and local workspace plugins' },
  { id: 'worktrees', label: 'Git Worktrees', icon: FolderGit2, group: 'Extensions', description: 'Isolated Git worktrees and checkout branches' },
  { id: 'sessions', label: 'Session Registry', icon: MessageSquare, group: 'Diagnostics', description: 'Inspect, backup, or delete active and archived sessions' },
  { id: 'logs', label: 'Streaming Logs', icon: TerminalSquare, group: 'Diagnostics', description: 'Real-time WebSocket server logs and diagnostic traces' },
];

export const SettingsScreen: React.FC<{ section: SettingsSection }> = ({ section }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(section || 'general');
  const [query, setQuery] = useState('');
  const [generalTab, setGeneralTab] = useState<'appearance' | 'guardrails'>('appearance');
  const mode = useAppStore((s) => s.mode);

  useEffect(() => {
    if (section && section !== activeSection) {
      setActiveSection(section);
    }
  }, [section]);

  const filtered = SECTIONS.filter(
    (s) =>
      s.label.toLowerCase().includes(query.toLowerCase()) ||
      s.group.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase())
  );
  const groups = Array.from(new Set(filtered.map((s) => s.group)));
  const currentSectionDef = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[1];

  const pick = (id: SettingsSection) => {
    setActiveSection(id);
    navigateSettings(id);
  };

  const handleClose = () => {
    navigate(mode === 'agent' ? 'agent' : 'assistant');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground font-sans">
      {/* Left Navigation Sidebar */}
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/70 backdrop-blur-md">
        {/* Sidebar Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
              title="Return to Workspace (Esc)"
            >
              <ArrowLeft className="size-4" />
            </button>
            <span className="text-ui-base font-bold text-foreground">Settings</span>
          </div>

          <kbd className="hidden sm:inline-block rounded border border-border/80 bg-card px-1.5 py-0.5 text-3xs font-mono text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border/40">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings..."
              className="h-8 w-full rounded-lg border border-border/60 bg-card pl-8 pr-2.5 text-ui-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Navigation Categories */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4 select-none scrollbar-thin">
          {groups.map((group) => (
            <div key={group} className="space-y-0.5">
              <div className="px-2.5 pb-1 pt-1 text-3xs font-bold uppercase tracking-wider text-muted-foreground/70">
                {group}
              </div>
              {filtered
                .filter((s) => s.group === group)
                .map((s) => {
                  const Icon = s.icon;
                  const active = s.id === activeSection;
                  return (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      className={cn(
                        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-ui-xs transition-colors',
                        active
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'text-foreground/80 hover:bg-surface-hover hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Settings Content Area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Content Top Bar Breadcrumbs */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-chrome px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-muted-foreground">{currentSectionDef.group}</span>
              <span className="text-2xs text-muted-foreground/40">/</span>
              <h2 className="text-ui-base font-bold text-foreground">{currentSectionDef.label}</h2>
            </div>
            <p className="text-2xs text-muted-foreground">{currentSectionDef.description}</p>
          </div>

          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-ui-xs font-medium text-foreground hover:bg-surface-hover"
          >
            Done
          </button>
        </div>

        {/* Pane Content Container */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="mx-auto max-w-4xl">
            {activeSection === 'dashboard' && <DashboardPane />}
            {activeSection === 'general' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <button
                    onClick={() => setGeneralTab('appearance')}
                    className={`rounded-lg px-3 py-1.5 text-ui-xs font-semibold transition-colors ${
                      generalTab === 'appearance'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    Theme & Appearance
                  </button>
                  <button
                    onClick={() => setGeneralTab('guardrails')}
                    className={`rounded-lg px-3 py-1.5 text-ui-xs font-semibold transition-colors ${
                      generalTab === 'guardrails'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    Policy Guardrails & Security
                  </button>
                </div>
                {generalTab === 'appearance' ? <AppearanceSettingsPane /> : <SettingsPane />}
              </div>
            )}
            {activeSection === 'providers' && <ProvidersPane />}
            {activeSection === 'agents' && <AgentsPane />}
            {activeSection === 'telegram' && <TelegramPane />}
            {activeSection === 'mcps' && <McpsPane />}
            {activeSection === 'skills' && <SkillsPane />}
            {activeSection === 'tools' && <ToolsPane />}
            {activeSection === 'scheduler' && <SchedulerPane />}
            {activeSection === 'docs' && <DocsPane onChatWithDoc={() => navigate('assistant')} />}
            {activeSection === 'plugins' && <PluginsPane />}
            {activeSection === 'worktrees' && <WorktreesPane />}
            {activeSection === 'sessions' && <SessionsPane onSelectSession={() => navigate('assistant')} />}
            {activeSection === 'logs' && <LogsStreamingView onClose={handleClose} />}
          </div>
        </div>
      </main>
    </div>
  );
};
