import React, { useState, useMemo } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { navigateSettings } from '../../router';
import { PluginCheckboxGrid, usePluginCatalog } from '../shell/PluginCatalog';
import {
  Edit3,
  Copy,
  Trash2,
  ChevronRight,
  ChevronDown,
  Download,
  Upload,
  FolderInput,
  Check,
  X,
  Save,
  ArrowLeft,
  Puzzle,
} from 'lucide-react';
import { GrokAvatar, GROK_AVATARS, AI_BOT_AVATARS, CLASSIC_SHAPE_AVATARS } from '../GrokAvatar';
import { BUILTIN_AGENT_ENGINES } from '../common/AgentTaskInputBar';
import { cn } from '../../lib/utils';

export const AgentProfileDetail: React.FC = () => {
  const { activeAgent, updateAgent, duplicateAgent, deleteAgent, setActiveNavTab } = useProfileStore();
  const { availableModels, defaultModel } = useAppStore();
  const acpAgents = useAgentStore((s) => s.acpAgents);
  const catalog = usePluginCatalog();

  const [activeTab, setActiveTab] = useState<'prompt' | 'channels' | 'behavior' | 'tools' | 'mcp' | 'skills' | 'plugins'>('prompt');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarCategory, setAvatarCategory] = useState<'ai-bot' | 'classic'>('ai-bot');
  const [hoveredAvatar, setHoveredAvatar] = useState<string | null>(null);
  const [isEngineDropdownOpen, setIsEngineDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Modal state for editing system prompt or soul files
  const [editingFile, setEditingFile] = useState<{
    key: 'systemPrompt' | 'soul' | 'style' | 'instructions' | 'memory';
    title: string;
    description?: string;
    content: string;
  } | null>(null);

  interface EngineOption {
    id: string;
    name: string;
    kind: string;
    badge: string;
    supportedModels?: string[];
  }

  const engineOptions: EngineOption[] = useMemo(() => {
    const list: EngineOption[] = [
      ...BUILTIN_AGENT_ENGINES.map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        badge: e.badge,
        supportedModels: e.supportedModels,
      })),
    ];
    if (Array.isArray(acpAgents)) {
      for (const ag of acpAgents) {
        const existingIdx = list.findIndex((e) => e.id === ag.id);
        if (existingIdx >= 0) {
          if (ag.supportedModels && ag.supportedModels.length > 0) {
            list[existingIdx] = {
              ...list[existingIdx],
              supportedModels: ag.supportedModels,
              name: ag.name || list[existingIdx].name,
            };
          }
        } else {
          list.push({
            id: ag.id,
            name: ag.name,
            kind: 'acp',
            badge: 'ACP',
            supportedModels: ag.supportedModels,
          });
        }
      }
    }
    return list;
  }, [acpAgents]);

  // Effective enabled plugins: explicit list wins; undefined = catalog defaults.
  const effectivePlugins = useMemo(() => {
    if (activeAgent?.plugins) return activeAgent.plugins;
    if (!catalog) return [];
    return catalog.plugins.filter((p) => p.defaultOn).map((p) => p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent?.plugins, catalog]);

  if (!activeAgent) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-ui-xs text-muted-foreground">
        No agent selected. Select an agent from the left rail.
      </div>
    );
  }

  const soul = activeAgent.soulStack || {};
  const currentEngineId = activeAgent.acpAgent || (activeAgent.engine === 'acp' ? 'claude-code' : 'rakit');
  const activeEngine = engineOptions.find((e) => e.id === currentEngineId) || engineOptions[0];

  const modelOptions = useMemo(() => {
    if (activeEngine.supportedModels && activeEngine.supportedModels.length > 0) {
      return activeEngine.supportedModels;
    }
    if (availableModels.length > 0) {
      return availableModels.map((m) => m.name || m.id);
    }
    return [
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4-pro',
      'claude-3-7-sonnet',
      'claude-3-5-sonnet',
      'gpt-4o',
      'gemini-2.0-flash',
    ];
  }, [activeEngine, availableModels]);

  const activeModelName = activeAgent.model || modelOptions[0] || defaultModel || 'Select model';

  const handleOpenEditor = (
    key: 'systemPrompt' | 'soul' | 'style' | 'instructions' | 'memory',
    title: string,
    description?: string
  ) => {
    let content = '';
    if (key === 'systemPrompt') {
      content = activeAgent.systemPrompt || '';
    } else {
      content = soul[key] || '';
    }
    setEditingFile({ key, title, description, content });
  };

  const handleSaveEditor = async () => {
    if (!editingFile) return;

    if (editingFile.key === 'systemPrompt') {
      await updateAgent({ id: activeAgent.id, systemPrompt: editingFile.content });
    } else {
      const updatedSoul = {
        ...soul,
        [editingFile.key]: editingFile.content,
      };
      await updateAgent({ id: activeAgent.id, soulStack: updatedSoul });
    }

    setEditingFile(null);
  };

  const handleSelectEngine = (engineId: string) => {
    if (engineId === 'rakit') {
      updateAgent({ id: activeAgent.id, engine: 'rakit', acpAgent: undefined });
    } else {
      updateAgent({ id: activeAgent.id, engine: 'acp', acpAgent: engineId });
    }
    setIsEngineDropdownOpen(false);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background px-4 sm:px-8 py-8 select-none">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <button
            onClick={() => setActiveNavTab('chat')}
            className="flex items-center gap-1.5 text-ui-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Chat</span>
          </button>
          <span className="text-ui-xs text-muted-foreground font-mono">Agent Configuration</span>
        </div>

        {/* 1. Centerpiece: Avatar, Glowing Amber Name Pill, Engine & Model */}
        <div className="flex flex-col items-center text-center space-y-3">
          {/* Avatar with Amber Diamond Cube */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
              className="group relative flex size-20 items-center justify-center rounded-3xl bg-transparent transition-transform hover:scale-105 active:scale-95 cursor-pointer mx-auto"
              title="Click to change avatar icon"
            >
              <div className="absolute -inset-1 rounded-3xl bg-amber-500/20 blur-md group-hover:bg-amber-500/30 transition-all" />
              <div className="relative size-16 flex items-center justify-center">
                <GrokAvatar id={activeAgent.avatar || 'amber-cube'} size={64} />
              </div>
            </button>

            {/* Quick Avatar Picker Popover */}
            {showAvatarPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAvatarPicker(false)}
                />
                <div className="dropdown-glass absolute left-1/2 top-full z-50 mt-3 -translate-x-1/2 w-80 sm:w-88 rounded-2xl p-3 shadow-2xl animate-in zoom-in-95 bg-card/95 backdrop-blur-xl border border-border flex flex-col gap-2.5">
                  {/* Category switcher */}
                  <div className="flex items-center justify-between gap-1 p-1 bg-surface/60 rounded-xl border border-border/40 text-ui-xs">
                    <button
                      type="button"
                      onClick={() => setAvatarCategory('ai-bot')}
                      className={cn(
                        'flex-1 py-1 px-2.5 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5',
                        avatarCategory === 'ai-bot'
                          ? 'bg-card text-foreground shadow-xs font-semibold'
                          : 'text-foreground-subtle hover:text-foreground'
                      )}
                    >
                      <span>AI Avatars</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/15 text-primary font-mono font-bold">
                        {AI_BOT_AVATARS.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarCategory('classic')}
                      className={cn(
                        'flex-1 py-1 px-2.5 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5',
                        avatarCategory === 'classic'
                          ? 'bg-card text-foreground shadow-xs font-semibold'
                          : 'text-foreground-subtle hover:text-foreground'
                      )}
                    >
                      <span>Classic Shapes</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-hover text-foreground-subtle font-mono">
                        {CLASSIC_SHAPE_AVATARS.length}
                      </span>
                    </button>
                  </div>

                  {/* Grid of Avatars */}
                  <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto p-1">
                    {(avatarCategory === 'ai-bot' ? AI_BOT_AVATARS : CLASSIC_SHAPE_AVATARS).map((av) => {
                      const isSelected = (activeAgent.avatar || 'amber-cube') === av.id;
                      return (
                        <button
                          key={av.id}
                          type="button"
                          onMouseEnter={() => setHoveredAvatar(`${av.name} • ${av.role}`)}
                          onMouseLeave={() => setHoveredAvatar(null)}
                          onClick={() => {
                            updateAgent({ id: activeAgent.id, avatar: av.id });
                            setShowAvatarPicker(false);
                          }}
                          className={cn(
                            'group relative flex size-12 items-center justify-center rounded-xl p-1 transition-all cursor-pointer hover:scale-105 active:scale-95',
                            isSelected
                              ? 'bg-primary/20 ring-2 ring-primary shadow-sm'
                              : 'hover:bg-surface/80'
                          )}
                          title={`${av.name} (${av.role})`}
                        >
                          <GrokAvatar id={av.id} size={36} />
                        </button>
                      );
                    })}
                  </div>

                  {/* Footer hint showing hovered or active avatar info */}
                  <div className="pt-1.5 border-t border-border/50 text-[11px] text-foreground-subtle truncate text-center min-h-[20px]">
                    {hoveredAvatar || (
                      (() => {
                        const current = GROK_AVATARS.find((a) => a.id === (activeAgent.avatar || 'amber-cube'));
                        return current ? `${current.name} • ${current.role}` : 'Choose an avatar personality';
                      })()
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Glowing Golden Name Input Pill (Exact Screenshot Parity) */}
          <div className="relative max-w-md w-full mx-auto">
            <div className="rounded-2xl border-2 border-amber-500/80 bg-card shadow-[0_0_24px_rgba(234,179,8,0.25)] px-6 py-2.5 flex items-center justify-center transition-all focus-within:ring-2 focus-within:ring-amber-500/50">
              <input
                type="text"
                value={activeAgent.name || ''}
                onChange={(e) => updateAgent({ id: activeAgent.id, name: e.target.value })}
                placeholder="Default Bot"
                className="w-full text-center text-2xl sm:text-3xl font-bold tracking-tight text-foreground bg-transparent focus:outline-none"
              />
            </div>
          </div>

          {/* Engine & Model Subtitle Row */}
          <div className="flex items-center justify-center gap-2 text-ui-xs text-foreground-subtle">
            {/* Engine Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsEngineDropdownOpen(!isEngineDropdownOpen);
                  setIsModelDropdownOpen(false);
                }}
                className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors cursor-pointer"
              >
                <span>{activeEngine.name}</span>
                <ChevronDown className="size-3 opacity-70" />
              </button>

              {isEngineDropdownOpen && (
                <div className="dropdown-glass absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 w-60 rounded-xl p-1 shadow-2xl bg-card border border-border">
                  {engineOptions.map((eng) => (
                    <button
                      key={eng.id}
                      type="button"
                      onClick={() => handleSelectEngine(eng.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs transition-colors cursor-pointer',
                        currentEngineId === eng.id ? 'bg-primary/15 text-foreground font-semibold' : 'text-foreground-subtle hover:bg-surface hover:text-foreground'
                      )}
                    >
                      <span className="truncate">{eng.name}</span>
                      <span className="text-4xs font-bold uppercase rounded px-1 py-0.5 bg-surface text-muted-foreground border border-border">
                        {eng.badge}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span>·</span>

            {/* Model Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsModelDropdownOpen(!isModelDropdownOpen);
                  setIsEngineDropdownOpen(false);
                }}
                className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors cursor-pointer"
              >
                <span className="truncate max-w-[150px]">{activeModelName}</span>
                <ChevronDown className="size-3 opacity-70" />
              </button>

              {isModelDropdownOpen && (
                <div className="dropdown-glass absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 max-h-56 w-64 overflow-y-auto rounded-xl p-1 shadow-2xl scrollbar-thin bg-card border border-border">
                  {modelOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        updateAgent({ id: activeAgent.id, model: m });
                        setIsModelDropdownOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-mono text-ui-xs transition-colors cursor-pointer',
                        activeModelName === m ? 'bg-primary/15 text-foreground font-semibold' : 'text-foreground-subtle hover:bg-surface hover:text-foreground'
                      )}
                    >
                      <span className="truncate">{m}</span>
                      {activeModelName === m && <Check className="size-3 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Segmented Pill Tab Bar (Exact Screenshot Parity) */}
        <div className="flex items-center justify-center gap-1 rounded-full bg-surface-muted p-1 border border-border/50 text-ui-xs max-w-lg mx-auto overflow-x-auto scrollbar-none">
          {[
            { id: 'prompt', label: 'Prompt' },
            { id: 'channels', label: 'Channels 0/4' },
            { id: 'behavior', label: 'Behavior' },
            { id: 'tools', label: `Tools ${activeAgent.tools?.length || 13}` },
            { id: 'mcp', label: `MCP ${activeAgent.mcp?.length || 0}` },
            { id: 'skills', label: `Skills ${activeAgent.skills?.length || 8}` },
            { id: 'plugins', label: `Plugins ${effectivePlugins.length}` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'rounded-full px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-foreground-subtle hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 3. Tab Contents */}
        {activeTab === 'prompt' && (
          <div className="space-y-4">
            {/* System prompt Card (Exact Screenshot Parity) */}
            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
              <div className="flex items-center justify-between text-ui-xs">
                <span className="font-semibold text-foreground">System prompt</span>
                <button
                  type="button"
                  onClick={() => handleOpenEditor('systemPrompt', 'System prompt', 'Instructions sent to the agent at session initialization.')}
                  className="inline-flex items-center gap-1 font-medium text-foreground-subtle hover:text-foreground cursor-pointer"
                >
                  <Edit3 className="size-3" />
                  <span>Edit</span>
                </button>
              </div>
              <div
                onClick={() => handleOpenEditor('systemPrompt', 'System prompt', 'Instructions sent to the agent at session initialization.')}
                className="rounded-xl border border-border/40 bg-surface-muted p-3 text-ui-xs text-foreground-subtle min-h-[56px] cursor-pointer hover:border-border transition-colors font-mono whitespace-pre-wrap line-clamp-3"
              >
                {activeAgent.systemPrompt || 'Click to edit...'}
              </div>
            </div>

            {/* Agent prompt Section Header */}
            <div className="text-ui-sm font-medium text-foreground-subtle pt-2">
              Agent prompt
            </div>

            {/* 2x2 Grid of Soul Stack Markdown Cards (Exact Screenshot Parity) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* SOUL.md */}
              <button
                type="button"
                onClick={() =>
                  handleOpenEditor(
                    'soul',
                    'SOUL.md',
                    'Identity, worldview, and opinions'
                  )
                }
                className="group flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-border hover:bg-surface cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-ui-sm font-semibold text-foreground">SOUL.md</span>
                  <ChevronRight className="size-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5" />
                </div>
                <span className="mt-2 text-ui-xs text-foreground-subtle">
                  Identity, worldview, and opinions
                </span>
              </button>

              {/* STYLE.md */}
              <button
                type="button"
                onClick={() =>
                  handleOpenEditor(
                    'style',
                    'STYLE.md',
                    'Voice, tone, and formatting'
                  )
                }
                className="group flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-border hover:bg-surface cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-ui-sm font-semibold text-foreground">STYLE.md</span>
                  <ChevronRight className="size-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5" />
                </div>
                <span className="mt-2 text-ui-xs text-foreground-subtle">
                  Voice, tone, and formatting
                </span>
              </button>

              {/* INSTRUCTIONS.md */}
              <button
                type="button"
                onClick={() =>
                  handleOpenEditor(
                    'instructions',
                    'INSTRUCTIONS.md',
                    'Operating instructions and workflows'
                  )
                }
                className="group flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-border hover:bg-surface cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-ui-sm font-semibold text-foreground">INSTRUCTIONS.md</span>
                  <ChevronRight className="size-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5" />
                </div>
                <span className="mt-2 text-ui-xs text-foreground-subtle">
                  Operating instructions and workflows
                </span>
              </button>

              {/* MEMORY.md */}
              <button
                type="button"
                onClick={() =>
                  handleOpenEditor(
                    'memory',
                    'MEMORY.md',
                    'Continuity and context to carry forward'
                  )
                }
                className="group flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-border hover:bg-surface cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-ui-sm font-semibold text-foreground">MEMORY.md</span>
                  <ChevronRight className="size-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5" />
                </div>
                <span className="mt-2 text-ui-xs text-foreground-subtle">
                  Continuity and context to carry forward
                </span>
              </button>
            </div>

            {/* Change histories link */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {}}
                className="inline-flex items-center gap-1 text-ui-xs text-foreground-subtle hover:text-foreground cursor-pointer transition-colors"
              >
                <span>Change histories</span>
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'telegram', label: 'Telegram', desc: 'Sync turns with official Bot API token' },
              { id: 'discord', label: 'Discord', desc: 'Connect agent to community guilds & threads' },
              { id: 'slack', label: 'Slack', desc: 'Enterprise workplace message dispatch' },
              { id: 'whatsapp', label: 'WhatsApp', desc: 'Webhook automation & phone bridge' },
            ].map((ch) => (
              <div
                key={ch.id}
                className="rounded-2xl border border-border/60 bg-card p-4 text-left"
              >
                <div className="font-semibold text-ui-sm text-foreground">{ch.label}</div>
                <div className="mt-1 text-ui-xs text-foreground-subtle">{ch.desc}</div>
                <div className="mt-3 text-4xs font-mono uppercase text-muted-foreground">Not connected</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'behavior' && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 text-ui-xs">
            <h3 className="font-semibold text-foreground">Agent Behavior & Execution</h3>
            <p className="text-foreground-subtle">
              Configure how this agent behaves in sessions, executes tools, and confirms actions with you.
            </p>
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeAgent.isDefault}
                  onChange={(e) => updateAgent({ id: activeAgent.id, isDefault: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-0"
                />
                <span className="text-foreground">Set as default organization agent</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 text-ui-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Assigned Tools</h3>
              <span className="text-foreground-subtle">{activeAgent.tools?.length || 13} tools enabled</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {(activeAgent.tools || ['read_file', 'write_file', 'bash', 'search_files', 'web_search']).map((tool) => (
                <span
                  key={tool}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-border font-mono text-foreground text-[11px]"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-ui-xs text-foreground-subtle">
            No external MCP servers attached. Manage servers in Settings.
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="grid grid-cols-2 gap-2 text-ui-xs">
            {['codebase-analysis', 'git-commit-helper', 'markdown-docs', 'unit-test-runner', 'figma-tokens', 'api-scaffolder', 'docker-builder', 'seo-auditor'].map((sk) => (
              <div key={sk} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between">
                <span className="font-mono">{sk}</span>
                <Check className="size-3.5 text-primary" />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'plugins' && (
          catalog ? (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
              <div className="flex items-center gap-2 pb-4">
                <Puzzle className="size-4 text-primary" />
                <span className="font-semibold text-ui-base text-foreground">
                  Capability plugins — {activeAgent.name}
                </span>
              </div>
              <PluginCheckboxGrid
                catalog={catalog}
                enabled={effectivePlugins}
                onToggle={(pluginId) => {
                  const next = effectivePlugins.includes(pluginId)
                    ? effectivePlugins.filter((id) => id !== pluginId)
                    : [...effectivePlugins, pluginId];
                  updateAgent({ id: activeAgent.id, plugins: next });
                }}
                onOpenConnections={() => {
                  setActiveNavTab('settings');
                  navigateSettings('connections');
                }}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-5 text-ui-xs text-muted-foreground animate-pulse">
              Loading plugin catalog…
            </div>
          )
        )}

        {/* 4. Action Buttons (2x2 Grid + Destructive Row) (Exact Screenshot Parity) */}
        <div className="space-y-2.5 pt-4">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {}}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface cursor-pointer"
            >
              <Download className="size-4 text-foreground-subtle" />
              <span>Import agent</span>
            </button>
            <button
              type="button"
              onClick={() => {}}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface cursor-pointer"
            >
              <Upload className="size-4 text-foreground-subtle" />
              <span>Export agent</span>
            </button>
            <button
              type="button"
              onClick={() => {}}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface cursor-pointer"
            >
              <FolderInput className="size-4 text-foreground-subtle" />
              <span>Move agent</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const copy = await duplicateAgent(activeAgent.id);
                if (copy) setActiveNavTab('agent');
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface cursor-pointer"
            >
              <Copy className="size-4 text-foreground-subtle" />
              <span>Duplicate</span>
            </button>
          </div>

          {!activeAgent.isDefault && (
            <button
              type="button"
              onClick={async () => {
                if (confirm(`Are you sure you want to delete ${activeAgent.name}?`)) {
                  await deleteAgent(activeAgent.id);
                  setActiveNavTab('chat');
                }
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-ui-sm font-medium text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
            >
              <Trash2 className="size-4" />
              <span>Delete agent</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Modal for Soul & System Prompt */}
      {editingFile && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-ui-base font-bold text-foreground">{editingFile.title}</h3>
                {editingFile.description && (
                  <p className="text-2xs text-muted-foreground">{editingFile.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingFile(null)}
                className="size-7 rounded-lg hover:bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 flex-1">
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                rows={12}
                className="w-full rounded-xl border border-border/70 bg-surface-muted p-3 font-mono text-ui-xs leading-relaxed text-foreground focus:outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="px-5 py-3 border-t border-border/60 flex items-center justify-end gap-2 bg-surface">
              <button
                type="button"
                onClick={() => setEditingFile(null)}
                className="rounded-xl px-3.5 py-1.5 text-ui-xs font-medium text-foreground-subtle hover:bg-surface-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditor}
                className="rounded-xl bg-primary px-4 py-1.5 text-ui-xs font-semibold text-white hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="size-3.5" />
                <span>Save changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
