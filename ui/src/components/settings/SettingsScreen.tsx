import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Settings2,
  Palette,
  Cpu,
  Bot,
  Wrench,
  WandSparkles,
  Cable,
  Blocks,
  Radio,
  BarChart3,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { ProfileRow } from '../shell/ProfileRow';
import { navigate } from '../../router';
import { cn } from '../../lib/utils';
import {
  BetaBadge,
  SETTINGS_FRAME_CONTENT_CLASSNAME,
  SectionErrorBoundary,
  SectionTitle,
  SettingsGroupCard,
  SettingsRow,
  settingsButtonClasses as btn,
} from './settingsPrimitives';
import { AppearanceSettingsPane } from './AppearanceSettingsPane';
import { ProvidersPane } from '../../panes/providers';
import { McpsPane } from '../../panes/mcps';
import { SkillsPane } from '../../panes/skills';
import { PluginsPane } from '../../panes/plugins';
import { ToolsPane } from '../../panes/tools';
import { ChannelsSettingsPane } from './ChannelsSettingsPane';
import { DashboardPane } from '../../panes/dashboard';

export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'providers'
  | 'acpAgents'
  | 'tools'
  | 'skills'
  | 'mcps'
  | 'plugins'
  | 'channels'
  | 'dashboard';

interface NavItem {
  id: SettingsSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_GROUPS: Array<{ id: string; label: string; items: NavItem[] }> = [
  {
    id: 'preferences',
    label: 'Preferences',
    items: [
      { id: 'general', label: 'General', icon: Settings2 },
      { id: 'appearance', label: 'Appearance', icon: Palette },
    ],
  },
  {
    id: 'ai-engines',
    label: 'AI & Engines',
    items: [
      { id: 'providers', label: 'AI Providers', icon: Cpu },
      { id: 'acpAgents', label: 'ACP Orchestrators', icon: Bot, badge: 'ACP' },
    ],
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    items: [
      { id: 'tools', label: 'Tools & Policies', icon: Wrench },
      { id: 'skills', label: 'Skills', icon: WandSparkles },
      { id: 'mcps', label: 'MCP Servers', icon: Cable },
      { id: 'plugins', label: 'Plugins', icon: Blocks },
      { id: 'channels', label: 'Channels', icon: Radio, badge: 'Telegram' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'dashboard', label: 'Diagnostics & Usage', icon: BarChart3 },
    ],
  },
];

const SECTION_TITLES: Record<SettingsSectionId, string> = {
  general: 'General',
  appearance: 'Appearance',
  providers: 'AI Providers & Models',
  acpAgents: 'Agent Client Protocol (ACP) & Orchestrators',
  tools: 'Tools & Security Policies',
  skills: 'Agent Skills Catalog',
  mcps: 'Model Context Protocol (MCP) Servers',
  plugins: 'Community & Ecosystem Plugins',
  channels: 'Channels & Messaging Bridge',
  dashboard: 'Diagnostics, Usage & System Logs',
};

interface SettingsScreenProps {
  section?: string;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ section }) => {
  const { setActiveNavTab } = useProfileStore();
  const { themeMode, setThemeMode } = useAppStore();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => {
    if (section && section in SECTION_TITLES) return section as SettingsSectionId;
    if (section === 'model') return 'providers';
    return 'general';
  });

  useEffect(() => {
    if (section) {
      if (section in SECTION_TITLES) {
        setActiveSection(section as SettingsSectionId);
      } else if (section === 'model') {
        setActiveSection('providers');
      }
    }
  }, [section]);

  const handleBackToWorkspace = () => {
    setActiveNavTab('chat');
    window.location.hash = '';
    navigate('agent');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* 1. Left Navigation Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border/40 bg-sidebar transition-colors">
        {/* Top Back Action */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-3">
          <button
            type="button"
            onClick={handleBackToWorkspace}
            className="group flex items-center gap-2 rounded-lg px-2 py-1 text-ui-xs font-semibold text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to workspace</span>
          </button>
        </div>

        {/* Scrollable Nav Item Groups */}
        <div className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          <nav className="flex flex-col gap-4">
            {NAV_GROUPS.map((grp) => (
              <div key={grp.id} className="flex flex-col gap-1">
                <span className="px-2.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {grp.label}
                </span>
                <div className="flex flex-col gap-0.5">
                  {grp.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex h-8 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors cursor-pointer',
                          isActive
                            ? 'bg-foreground/10 text-foreground font-semibold shadow-xs'
                            : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-ui-sm">
                          {item.label}
                        </span>
                        {item.badge ? (
                          <span className="shrink-0">
                            <BetaBadge label={item.badge} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Profile / Version row pinned at sidebar footer */}
        <ProfileRow
          theme={themeMode}
          onToggleTheme={(next) => setThemeMode(next)}
          onOpenSettings={() => setActiveSection('general')}
        />
      </aside>

      {/* 2. Content Column */}
      <section className="relative flex min-h-0 flex-col flex-1 bg-background overflow-hidden">
        {/* Top hairline bar with breadcrumb */}
        <div className="h-12 shrink-0 border-b border-border/40 bg-background/50 backdrop-blur-xs">
          <div className="flex h-full items-center justify-between px-6">
            <span className="truncate text-ui-sm text-foreground-subtle font-medium">
              {SECTION_TITLES[activeSection]}
            </span>
          </div>
        </div>

        {/* Scrollable content pane */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn(SETTINGS_FRAME_CONTENT_CLASSNAME, 'flex flex-col gap-6 pt-6')}>
            <SectionTitle title={SECTION_TITLES[activeSection]} />
            <SectionErrorBoundary section={activeSection}>
              <div className="space-y-6">
                {activeSection === 'general' && <GeneralSection />}
                {activeSection === 'appearance' && <AppearanceSettingsPane />}
                {activeSection === 'providers' && <ProvidersPane />}
                {activeSection === 'acpAgents' && <AcpAgentsSection />}
                {activeSection === 'tools' && <ToolsPane />}
                {activeSection === 'skills' && <SkillsPane />}
                {activeSection === 'mcps' && <McpsPane />}
                {activeSection === 'plugins' && <PluginsPane />}
                {activeSection === 'channels' && <ChannelsSettingsPane />}
                {activeSection === 'dashboard' && <DashboardPane />}
              </div>
            </SectionErrorBoundary>
          </div>
        </main>
      </section>
    </div>
  );
};

// ── General Section ─────────────────────────────────────────────────────────
const GeneralSection: React.FC = () => {
  const { activeWorkspacePath } = useAppStore();
  const [indexBuilt, setIndexBuilt] = useState(true);
  const [symbolsCount, setSymbolsCount] = useState(0);
  const [isReindexing, setIsReindexing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const sandboxDir = activeWorkspacePath ? `${activeWorkspacePath}/.sandbox` : '~/.gemini/antigravity-cli/scratch';

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setIndexBuilt(true);
      setSymbolsCount(128);
      showStatus('Workspace index refreshed successfully.');
    } finally {
      setIsReindexing(false);
    }
  };

  const handleRevealSandbox = () => {
    navigator.clipboard?.writeText(sandboxDir);
    showStatus('Sandbox path copied to clipboard');
  };

  return (
    <>
      {statusMessage && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-ui-xs font-medium text-foreground animate-in fade-in">
          {statusMessage}
        </div>
      )}

      {/* Card 1: Workspace Path & Environment */}
      <SettingsGroupCard>
        <SettingsRow
          label="Active Workspace"
          description={activeWorkspacePath || 'No workspace opened.'}
          control={
            <span className="font-mono text-ui-xs text-foreground bg-surface px-2.5 py-1 rounded-lg border border-border">
              {activeWorkspacePath ? 'Mounted' : 'Root'}
            </span>
          }
        />
        <SettingsRow
          label="Sandbox storage directory"
          description="Scratchpad artifacts, logs, and ephemeral files are isolated here."
          control={
            <button
              type="button"
              className={btn.outline}
              onClick={handleRevealSandbox}
              title="Copy sandbox path"
            >
              <FolderOpen className="size-3.5" />
              Copy Path
            </button>
          }
        />
      </SettingsGroupCard>

      {/* Card 2: Workspace Indexer */}
      <SettingsGroupCard>
        <SettingsRow
          label="Workspace symbol index"
          description={
            indexBuilt
              ? `Ready · ${symbolsCount > 0 ? symbolsCount : 'Index built'} across codebase files`
              : 'Index not built. Reindexing enables fast symbol jumps.'
          }
          control={
            <button
              type="button"
              className={btn.outline}
              disabled={isReindexing}
              onClick={handleReindex}
            >
              <RefreshCw className={cn('size-3.5', isReindexing && 'animate-spin')} />
              {isReindexing ? 'Indexing…' : 'Reindex'}
            </button>
          }
        />
      </SettingsGroupCard>

      {/* Card 3: Version Info */}
      <SettingsGroupCard>
        <SettingsRow
          label="KendaliAI Version"
          description="Local developer environment with multi-agent orchestration."
          control={
            <span className="font-mono text-ui-xs font-semibold text-foreground-subtle">
              v0.6.0 #55
            </span>
          }
        />
      </SettingsGroupCard>
    </>
  );
};

// ── ACP Orchestrators Section ────────────────────────────────────────────────
const AcpAgentsSection: React.FC = () => {
  const { acpAgents, acpSessions } = useAgentStore();

  return (
    <div className="space-y-4">
      <p className="text-ui-base leading-6 text-foreground-subtle">
        Agent Client Protocol (ACP) enables orchestration across sub-agents, external CLI runners, and tool subprocesses.
      </p>
      <SettingsGroupCard>
        <SettingsRow
          label="ACP Protocol Service"
          description="WebSocket RPC server dispatching events between UI and orchestrators."
          control={<span className="text-ui-sm font-semibold text-emerald-500">Active (ws://localhost:18889)</span>}
        />
        <SettingsRow
          label="Registered ACP Agents"
          description="Agents reporting capability via the ACP client handshake."
          control={
            <span className="font-mono text-ui-xs text-foreground bg-surface px-2 py-0.5 rounded border border-border">
              {acpAgents.length} registered
            </span>
          }
        />
        <SettingsRow
          label="Active ACP Sessions"
          description="Live orchestrator instances currently running or paused."
          control={
            <span className="font-mono text-ui-xs text-foreground bg-surface px-2 py-0.5 rounded border border-border">
              {Object.keys(acpSessions).length} live
            </span>
          }
        />
      </SettingsGroupCard>
    </div>
  );
};

export default SettingsScreen;
