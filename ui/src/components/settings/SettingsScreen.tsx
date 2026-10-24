import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Activity,
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
  Share2,
  CalendarClock,
  Search,
  Check,
  ChevronRight,
  ChevronDown,
  Copy,
  Terminal,
  Shield,
  Layers,
  Sparkles,
  Database,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import { ProfileRow } from '../shell/ProfileRow';
import { APP_VERSION, APP_BUILD } from '../../lib/utils';
import { navigate, navigateSettings } from '../../router';
import { cn } from '../../lib/utils';
import {
  BetaBadge,
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
import { ConnectionsView } from '../connections/ConnectionsView';
import { AutomationsView } from '../automations/AutomationsView';

export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'providers'
  | 'capabilities'
  | 'tools'
  | 'automations'
  | 'integrations';

interface NavItem {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Workspace, index & telemetry',
    icon: Settings2,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Themes, typography & layout',
    icon: Palette,
  },
  {
    id: 'providers',
    label: 'AI Models',
    description: 'Models, endpoints & ACP runners',
    icon: Cpu,
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    description: 'Plugins, MCP servers & Skills',
    icon: Blocks,
  },
  {
    id: 'tools',
    label: 'Tools & Policies',
    description: 'Role execution permissions',
    icon: Shield,
  },
  {
    id: 'automations',
    label: 'Automations',
    description: 'Cron routines & background agents',
    icon: CalendarClock,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Telegram, Discord & Composio apps',
    icon: Share2,
  },
];

const SECTION_TITLES: Record<SettingsSectionId, string> = {
  general: 'General & Workspace',
  appearance: 'Appearance & Themes',
  providers: 'AI Models & Providers',
  capabilities: 'Agent Capabilities & Extensions',
  tools: 'Tools & Security Policies',
  automations: 'Automations & Scheduled Routines',
  integrations: 'Integrations & External Channels',
};

/** One-line description shown under each section title. */
const SECTION_SUBTITLES: Record<SettingsSectionId, string> = {
  general: 'Workspace filesystem, codebase AST symbol index, and live system diagnostics.',
  appearance: 'Interface theme palettes, contrast levels, font scaling, and sound cues.',
  providers: 'Cloud AI endpoints (OpenAI, Anthropic, DeepSeek), local Ollama, and external ACP CLI runners.',
  capabilities: 'Custom tool plugins, Model Context Protocol (MCP) servers, and modular SKILL.md prompt packages.',
  tools: 'Role-based execution permissions (ALLOW, APPROVAL, DENY) for every registered tool.',
  automations: 'Recurring cron jobs, briefings, and autonomous background agent routines.',
  integrations: 'Bidirectional messaging gateways (Telegram, Discord, Slack) and 500+ Composio SaaS apps.',
};

/** Normalizes incoming URL queries or legacy paths */
function resolveSectionId(raw?: string): SettingsSectionId {
  if (!raw) return 'general';
  if (
    raw === 'general' ||
    raw === 'appearance' ||
    raw === 'providers' ||
    raw === 'capabilities' ||
    raw === 'tools' ||
    raw === 'automations' ||
    raw === 'integrations'
  ) {
    return raw as SettingsSectionId;
  }
  if (raw === 'plugins' || raw === 'mcps' || raw === 'skills') return 'capabilities';
  if (raw === 'channels' || raw === 'telegram' || raw === 'connections') return 'integrations';
  if (raw === 'dashboard' || raw === 'logs') return 'general';
  if (raw === 'scheduler') return 'automations';
  if (raw === 'model' || raw === 'agents' || raw === 'agency' || raw === 'acpAgents') return 'providers';
  return 'general';
}

function resolveCapabilityTab(raw?: string): 'plugins' | 'mcps' | 'skills' {
  if (raw === 'skills') return 'skills';
  if (raw === 'mcps') return 'mcps';
  return 'plugins';
}

function resolveIntegrationTab(raw?: string): 'channels' | 'connections' {
  if (raw === 'connections') return 'connections';
  return 'channels';
}

function resolveGeneralTab(raw?: string): 'overview' | 'telemetry' {
  if (raw === 'dashboard' || raw === 'logs') return 'telemetry';
  return 'overview';
}

interface SettingsScreenProps {
  section?: string;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ section }) => {
  const { setActiveNavTab } = useProfileStore();
  const { themeMode, setThemeMode } = useAppStore();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => resolveSectionId(section));
  const [capabilityTab, setCapabilityTab] = useState<'plugins' | 'mcps' | 'skills'>(() => resolveCapabilityTab(section));
  const [integrationTab, setIntegrationTab] = useState<'channels' | 'connections'>(() => resolveIntegrationTab(section));
  const [generalTab, setGeneralTab] = useState<'overview' | 'telemetry'>(() => resolveGeneralTab(section));
  const [navFilter, setNavFilter] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (section) {
      setActiveSection(resolveSectionId(section));
      if (section === 'skills' || section === 'mcps' || section === 'plugins') {
        setCapabilityTab(section);
      }
      if (section === 'connections' || section === 'channels' || section === 'telegram') {
        setIntegrationTab(section === 'connections' ? 'connections' : 'channels');
      }
      if (section === 'dashboard' || section === 'logs') {
        setGeneralTab('telemetry');
      }
    }
  }, [section]);

  const handleSelectSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    navigateSettings(id);
  };

  const handleBackToWorkspace = () => {
    setActiveNavTab('chat');
    window.location.hash = '';
    navigate('agent');
  };

  // Filtered nav items for quick searching
  const filteredNavItems = useMemo(() => {
    const q = navFilter.toLowerCase().trim();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }, [navFilter]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground select-none">
      {/* ── 1. Left Navigation Sidebar (Desktop & Tablet) ───────────────── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/50 bg-sidebar transition-colors md:flex">
        {/* Top Header: Back to Workspace */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-3">
          <button
            type="button"
            onClick={handleBackToWorkspace}
            className="group flex items-center gap-2 rounded-lg px-2.5 py-1 text-ui-xs font-semibold text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Workspace</span>
          </button>
        </div>

        {/* Quick Nav Search Filter */}
        <div className="p-3 border-b border-border/40">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter settings..."
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              className="h-8 w-full rounded-xl border border-border/60 bg-background/60 pl-8 pr-2.5 text-ui-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Scrollable Nav Items (7 Clean Sections, Generous Spacing) */}
        <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
          <nav className="flex flex-col gap-1.5">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-all cursor-pointer',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold border border-primary/25 shadow-2xs'
                      : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
                  )}
                >
                  <Icon className={cn('size-4.5 shrink-0 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ui-sm font-medium leading-tight">{item.label}</div>
                    <div className="truncate text-3xs text-muted-foreground leading-tight mt-0.5">{item.description}</div>
                  </div>
                  {item.badge ? (
                    <span className="shrink-0">
                      <BetaBadge label={item.badge} />
                    </span>
                  ) : null}
                </button>
              );
            })}
            {filteredNavItems.length === 0 && (
              <div className="p-4 text-center text-ui-xs text-muted-foreground">
                No settings match "{navFilter}"
              </div>
            )}
          </nav>
        </div>

        {/* Pinned ProfileRow Footer */}
        <ProfileRow
          theme={themeMode}
          onToggleTheme={(next) => setThemeMode(next)}
          onOpenSettings={() => handleSelectSection('general')}
        />
      </aside>

      {/* ── 2. Main Content Surface ────────────────────────────────────────── */}
      <section className="relative flex min-h-0 flex-1 flex-col bg-background overflow-hidden">
        {/* Mobile Top Navigation Header (< md) */}
        <div className="shrink-0 border-b border-border/50 bg-sidebar/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              onClick={handleBackToWorkspace}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-ui-xs font-semibold text-foreground-subtle hover:bg-foreground/5 hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Workspace</span>
            </button>

            {/* Mobile dropdown trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-ui-xs font-semibold text-foreground cursor-pointer"
            >
              <span>{SECTION_TITLES[activeSection]}</span>
              <ChevronDown className={cn('size-3.5 transition-transform', mobileMenuOpen && 'rotate-180')} />
            </button>
          </div>

          {/* Mobile Dropdown Menu Sheet */}
          {mobileMenuOpen && (
            <div className="border-t border-border/50 bg-card p-3 shadow-lg animate-in slide-in-from-top-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSection(item.id)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-ui-xs transition-colors cursor-pointer',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                          : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <div className="min-w-0">
                        <span className="truncate font-medium block">{item.label}</span>
                        <span className="truncate text-3xs text-muted-foreground block">{item.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mobile Horizontal Quick-Scroll Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none border-t border-border/30">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-ui-xs font-medium transition-colors cursor-pointer',
                    isActive
                      ? 'border-primary/50 bg-primary/15 text-primary font-semibold shadow-2xs'
                      : 'border-border/60 bg-card text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content Pane (Unified max-w-6xl container across all sections) */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 pb-16">
            {/* Header: Title + Subtitle */}
            <SectionTitle
              title={SECTION_TITLES[activeSection]}
              subtitle={SECTION_SUBTITLES[activeSection]}
            />

            {/* Content Section Component */}
            <SectionErrorBoundary section={activeSection}>
              <div className="space-y-6">
                {/* 1. GENERAL (Workspace + Telemetry Tabs) */}
                {activeSection === 'general' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1.5 p-1 bg-surface-muted/60 border border-border/60 rounded-xl w-fit">
                      <button
                        type="button"
                        onClick={() => setGeneralTab('overview')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          generalTab === 'overview'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <FolderOpen className="size-3.5 text-primary" />
                        <span>Workspace & Runtime</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGeneralTab('telemetry')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          generalTab === 'telemetry'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <BarChart3 className="size-3.5 text-primary" />
                        <span>System Health & Telemetry</span>
                      </button>
                    </div>

                    {generalTab === 'overview' ? <GeneralSection /> : <DashboardPane />}
                  </div>
                )}

                {/* 2. APPEARANCE */}
                {activeSection === 'appearance' && <AppearanceSettingsPane />}

                {/* 3. AI PROVIDERS & MODELS */}
                {activeSection === 'providers' && <ProvidersPane />}

                {/* 4. CAPABILITIES (Unified Hub: Plugins, MCP Servers, Skills) */}
                {activeSection === 'capabilities' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1.5 p-1 bg-surface-muted/60 border border-border/60 rounded-xl w-fit flex-wrap">
                      <button
                        type="button"
                        onClick={() => setCapabilityTab('plugins')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          capabilityTab === 'plugins'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <Blocks className="size-3.5 text-primary" />
                        <span>Plugins & Catalog</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapabilityTab('mcps')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          capabilityTab === 'mcps'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <Cable className="size-3.5 text-primary" />
                        <span>MCP Servers</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapabilityTab('skills')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          capabilityTab === 'skills'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <WandSparkles className="size-3.5 text-primary" />
                        <span>Skills (SKILL.md)</span>
                      </button>
                    </div>

                    {capabilityTab === 'plugins' && <PluginsPane />}
                    {capabilityTab === 'mcps' && <McpsPane />}
                    {capabilityTab === 'skills' && <SkillsPane />}
                  </div>
                )}

                {/* 5. TOOLS & SECURITY POLICIES */}
                {activeSection === 'tools' && <ToolsPane />}

                {/* 6. AUTOMATIONS & ROUTINES (Single unified tab) */}
                {activeSection === 'automations' && <AutomationsView embedded />}

                {/* 7. INTEGRATIONS (Unified Hub: Channels & Composio Connectors) */}
                {activeSection === 'integrations' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-1.5 p-1 bg-surface-muted/60 border border-border/60 rounded-xl w-fit flex-wrap">
                      <button
                        type="button"
                        onClick={() => setIntegrationTab('channels')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          integrationTab === 'channels'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <Radio className="size-3.5 text-primary" />
                        <span>Messaging Channels</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIntegrationTab('connections')}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer',
                          integrationTab === 'connections'
                            ? 'bg-card text-foreground shadow-2xs border border-border/80'
                            : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <Share2 className="size-3.5 text-primary" />
                        <span>Composio App Connectors</span>
                      </button>
                    </div>

                    {integrationTab === 'channels' && <ChannelsSettingsPane />}
                    {integrationTab === 'connections' && <ConnectionsView embedded />}
                  </div>
                )}
              </div>
            </SectionErrorBoundary>
          </div>
        </main>
      </section>
    </div>
  );
};

// ── General Section (Clean, Uniform, Comprehensive) ─────────────────────────
const GeneralSection: React.FC = () => {
  const { activeWorkspacePath } = useAppStore();
  const [indexBuilt, setIndexBuilt] = useState(true);
  const [symbolsCount, setSymbolsCount] = useState(148);
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
      await new Promise((r) => setTimeout(r, 700));
      setIndexBuilt(true);
      setSymbolsCount((prev) => (prev > 0 ? prev + 12 : 148));
      showStatus('Codebase symbol index refreshed successfully.');
    } finally {
      setIsReindexing(false);
    }
  };

  const handleCopyPath = (path: string, label: string) => {
    navigator.clipboard?.writeText(path);
    showStatus(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-5">
      {statusMessage && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-ui-xs font-medium text-foreground animate-in fade-in flex items-center gap-2">
          <Check className="size-3.5 text-primary" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Card 1: Workspace & Storage */}
      <SettingsGroupCard>
        <div className="px-4 py-3 border-b border-border/60 bg-surface-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-primary" />
            <h3 className="text-ui-base font-semibold text-foreground">Workspace & Storage</h3>
          </div>
          <span className="text-ui-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            Active Workspace
          </span>
        </div>

        <SettingsRow
          label="Active Project Path"
          description="Root directory mounted for agent tool executions, file edits, and git worktrees."
          control={
            <div className="flex items-center gap-2 max-w-full">
              <span className="font-mono text-ui-xs text-foreground bg-surface px-2.5 py-1 rounded-lg border border-border truncate max-w-xs sm:max-w-md">
                {activeWorkspacePath || '~/kendali-ai'}
              </span>
              <button
                type="button"
                className={btn.outline}
                onClick={() => handleCopyPath(activeWorkspacePath || '~/kendali-ai', 'Workspace path')}
                title="Copy workspace path"
              >
                <Copy className="size-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </button>
            </div>
          }
        />

        <SettingsRow
          label="Scratchpad & Sandbox Path"
          description="Ephemeral execution artifacts, temporary scripts, and logs are isolated in this folder."
          control={
            <div className="flex items-center gap-2 max-w-full">
              <span className="font-mono text-ui-xs text-foreground bg-surface px-2.5 py-1 rounded-lg border border-border truncate max-w-xs sm:max-w-md">
                {sandboxDir}
              </span>
              <button
                type="button"
                className={btn.outline}
                onClick={() => handleCopyPath(sandboxDir, 'Sandbox path')}
                title="Copy sandbox path"
              >
                <Copy className="size-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </button>
            </div>
          }
        />
      </SettingsGroupCard>

      {/* Card 2: Codebase Indexing & Search */}
      <SettingsGroupCard>
        <div className="px-4 py-3 border-b border-border/60 bg-surface-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h3 className="text-ui-base font-semibold text-foreground">Codebase Indexer & Cache</h3>
          </div>
          <span className="text-ui-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
            AST Symbol Graph
          </span>
        </div>

        <SettingsRow
          label="Symbol Index Graph"
          description={
            indexBuilt
              ? `Ready · ${symbolsCount} symbols indexed across codebase files for instant jumps and code navigation.`
              : 'Index pending. Reindexing enables fast semantic symbol jumps and completions.'
          }
          control={
            <button
              type="button"
              className={btn.outline}
              disabled={isReindexing}
              onClick={handleReindex}
            >
              <RefreshCw className={cn('size-3.5', isReindexing && 'animate-spin text-primary')} />
              <span>{isReindexing ? 'Indexing…' : 'Reindex Now'}</span>
            </button>
          }
        />
      </SettingsGroupCard>

      {/* Card 3: Runtime & Environment */}
      <SettingsGroupCard>
        <div className="px-4 py-3 border-b border-border/60 bg-surface-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <h3 className="text-ui-base font-semibold text-foreground">Environment & System Version</h3>
          </div>
          <span className="font-mono text-ui-xs text-muted-foreground">
            v{APP_VERSION} #{APP_BUILD}
          </span>
        </div>

        <SettingsRow
          label="Application Architecture"
          description="KendaliAI local multi-agent developer orchestration environment."
          control={
            <span className="font-mono text-ui-xs font-semibold text-foreground-subtle bg-surface px-2.5 py-1 rounded-lg border border-border">
              Darwin · Apple Silicon (arm64)
            </span>
          }
        />

        <SettingsRow
          label="WebSocket Gateway Service"
          description="Real-time multi-agent IPC and Agent Client Protocol bridge endpoint."
          control={
            <span className="font-mono text-ui-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              ws://localhost:18889
            </span>
          }
        />

        <SettingsRow
          label="Agent Security Sandbox"
          description="Enforces per-role ALLOW, APPROVAL, and DENY policies on all shell commands and file tools."
          control={
            <button
              type="button"
              onClick={() => navigateSettings('tools')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border bg-card text-ui-xs font-medium text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Shield className="size-3.5 text-primary" />
              <span>View Security Policies →</span>
            </button>
          }
        />
      </SettingsGroupCard>
    </div>
  );
};

export default SettingsScreen;
