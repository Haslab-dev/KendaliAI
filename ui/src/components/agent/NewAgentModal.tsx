import React, { useState, useMemo } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Upload,
  Download,
  FolderInput,
  Copy,
  Trash2,
  Check,
  Pencil,
  Plus,
  Radio,
  FileCode,
  Shield,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useSessionStore } from '../../store/useSessionStore';
import { GrokAvatar, GROK_AVATARS, AI_BOT_AVATARS, CLASSIC_SHAPE_AVATARS } from '../GrokAvatar';
import { cn } from '../../lib/cn';
import { BUILTIN_AGENT_ENGINES } from '../common/AgentTaskInputBar';

interface NewAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'prompt' | 'channels' | 'behavior' | 'tools' | 'mcp' | 'skills';

const DEFAULT_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'run_command',
  'search_web',
  'list_dir',
  'grep_search',
  'git_status',
  'git_diff',
  'git_commit',
  'terminal_exec',
  'browser_open',
  'code_symbols',
];

export const NewAgentModal: React.FC<NewAgentModalProps> = ({ isOpen, onClose }) => {
  const { createAgent, selectAgent, setActiveNavTab } = useProfileStore();
  const { availableModels, defaultModel, mcps } = useAppStore();
  const { acpAgents } = useAgentStore();

  const [activeTab, setActiveTab] = useState<TabType>('prompt');
  const [name, setName] = useState('Default Bot');
  const [avatar, setAvatar] = useState('amber-cube');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarCategory, setAvatarCategory] = useState<'ai-bot' | 'classic'>('ai-bot');
  const [hoveredAvatar, setHoveredAvatar] = useState<string | null>(null);

  // Engine & Model
  const [engineType, setEngineType] = useState('rakit'); // 'rakit', 'commandcode', etc.
  const [isEngineDropdownOpen, setIsEngineDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Prompts & Soul stack
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a specialized AI assistant. You help plan, reason, and execute tasks safely and efficiently.'
  );
  const [soulStack, setSoulStack] = useState({
    soul: '## Identity & Worldview\nYou are an autonomous agent with high taste in software design, craftsmanship, and pragmatic engineering.',
    style: '## Voice & Tone\nDirect, clear, concise. Use markdown formatting, bullet points, and code blocks with syntax highlighting.',
    instructions: '## Operating Instructions\nAlways inspect existing code before editing. Test your changes before confirming completion.',
    memory: '## Memory & Continuity\nRetain user preferences for TypeScript strictness, theme aesthetics, and clean project structure.',
  });

  // Selected tools, channels, skills
  const [selectedTools, setSelectedTools] = useState<string[]>(DEFAULT_TOOLS);
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sub-editor modal for editing SOUL.md, STYLE.md, INSTRUCTIONS.md, or MEMORY.md
  const [editingFile, setEditingFile] = useState<{
    key: 'soul' | 'style' | 'instructions' | 'memory';
    title: string;
    description: string;
    content: string;
  } | null>(null);

  // Merge available engines
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

  const activeEngine = engineOptions.find((e) => e.id === engineType) || engineOptions[0];

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

  const activeModelName = selectedModel || modelOptions[0] || defaultModel || 'Select model';

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const isACP = engineType !== 'rakit';
      const created = await createAgent({
        name: name.trim(),
        role: 'Autonomous Agent',
        description: `${name.trim()} - Autonomous agent`,
        avatar,
        engine: isACP ? 'acp' : 'rakit',
        acpAgent: isACP ? engineType : undefined,
        model: activeModelName !== 'Select model' ? activeModelName : 'gpt-4o',
        systemPrompt: systemPrompt.trim(),
        soulStack,
        tools: selectedTools,
        mcp: selectedMcps,
      });

      selectAgent(created.id);
      setActiveNavTab('chat');
      // New agents land on their permanent Main Chat.
      void useSessionStore.getState().openMainSession(created.id);
      onClose();
    } catch (err) {
      console.error('Failed to create agent:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditor = () => {
    if (!editingFile) return;
    setSoulStack((prev) => ({
      ...prev,
      [editingFile.key]: editingFile.content,
    }));
    setEditingFile(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-3xl bg-card border border-border/70 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] text-foreground">
        {/* Top Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-20 flex size-8 items-center justify-center rounded-full text-foreground-subtle transition-colors hover:bg-surface hover:text-foreground cursor-pointer"
          title="Close (Esc)"
        >
          <X className="size-4" />
        </button>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto px-6 pt-8 pb-6 space-y-6 scrollbar-thin">
          {/* 1. Centerpiece: Avatar, Glowing Name Pill, Engine/Model */}
          <div className="flex flex-col items-center text-center space-y-3">
            {/* Avatar with Glow and click to select */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                className="group relative flex size-20 items-center justify-center rounded-3xl bg-transparent transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                title="Click to change avatar icon"
              >
                <div className="absolute -inset-1 rounded-3xl bg-amber-500/20 blur-md group-hover:bg-amber-500/30 transition-all" />
                <div className="relative size-16 flex items-center justify-center">
                  <GrokAvatar id={avatar} size={64} />
                </div>
              </button>

              {/* Avatar Selector Popover */}
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
                        const isSelected = avatar === av.id;
                        return (
                          <button
                            key={av.id}
                            type="button"
                            onMouseEnter={() => setHoveredAvatar(`${av.name} • ${av.role}`)}
                            onMouseLeave={() => setHoveredAvatar(null)}
                            onClick={() => {
                              setAvatar(av.id);
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
                          const current = GROK_AVATARS.find((a) => a.id === avatar);
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
              <div className="rounded-2xl border-2 border-amber-500/80 bg-background/80 shadow-[0_0_24px_rgba(234,179,8,0.25)] px-6 py-2.5 flex items-center justify-center transition-all focus-within:ring-2 focus-within:ring-amber-500/50">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Default Bot"
                  className="w-full text-center text-2xl sm:text-3xl font-bold tracking-tight text-foreground bg-transparent focus:outline-none"
                  autoFocus
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
                  <div className="dropdown-glass absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 w-60 rounded-xl p-1 shadow-2xl">
                    {engineOptions.map((eng) => (
                      <button
                        key={eng.id}
                        type="button"
                        onClick={() => {
                          setEngineType(eng.id);
                          setIsEngineDropdownOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs transition-colors cursor-pointer',
                          engineType === eng.id ? 'bg-primary/15 text-foreground font-semibold' : 'text-foreground-subtle hover:bg-surface hover:text-foreground'
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
                  <span className="truncate max-w-[140px]">{activeModelName}</span>
                  <ChevronDown className="size-3 opacity-70" />
                </button>

                {isModelDropdownOpen && (
                  <div className="dropdown-glass absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 max-h-56 w-64 overflow-y-auto rounded-xl p-1 shadow-2xl scrollbar-thin">
                    {modelOptions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSelectedModel(m);
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
          <div className="flex items-center justify-center gap-1 rounded-full bg-surface-muted p-1 border border-border/50 text-ui-xs overflow-x-auto scrollbar-none">
            {[
              { id: 'prompt', label: 'Prompt' },
              { id: 'channels', label: `Channels ${selectedChannels.length}/4` },
              { id: 'behavior', label: 'Behavior' },
              { id: 'tools', label: `Tools ${selectedTools.length}` },
              { id: 'mcp', label: `MCP ${selectedMcps.length}` },
              { id: 'skills', label: 'Skills 8' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={cn(
                    'rounded-full px-4 py-1.5 font-medium transition-all cursor-pointer shrink-0',
                    isActive
                      ? 'bg-card text-foreground font-semibold shadow-xs'
                      : 'text-foreground-subtle hover:text-foreground hover:bg-surface/50'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 3. Tab Contents */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              {/* System Prompt Box */}
              <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-ui-sm font-medium text-foreground">System prompt</span>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('agent-system-prompt-textarea');
                      el?.focus();
                    }}
                    className="flex items-center gap-1 text-ui-xs text-foreground-subtle hover:text-foreground cursor-pointer transition-colors"
                  >
                    <Pencil className="size-3" />
                    <span>Edit</span>
                  </button>
                </div>
                <textarea
                  id="agent-system-prompt-textarea"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Click to edit..."
                  rows={2}
                  className="w-full resize-none bg-transparent font-mono text-ui-xs leading-relaxed text-foreground-subtle focus:text-foreground focus:outline-none placeholder:text-foreground-subtlest"
                />
              </div>

              {/* Agent Prompt Subtitle */}
              <div className="text-ui-sm font-medium text-foreground-subtle pt-2">
                Agent prompt
              </div>

              {/* 2x2 Grid of Soul Stack Markdown Cards (Exact Screenshot Parity) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* SOUL.md */}
                <button
                  type="button"
                  onClick={() =>
                    setEditingFile({
                      key: 'soul',
                      title: 'SOUL.md',
                      description: 'Identity, worldview, and opinions',
                      content: soulStack.soul,
                    })
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
                    setEditingFile({
                      key: 'style',
                      title: 'STYLE.md',
                      description: 'Voice, tone, and formatting',
                      content: soulStack.style,
                    })
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
                    setEditingFile({
                      key: 'instructions',
                      title: 'INSTRUCTIONS.md',
                      description: 'Operating instructions and workflows',
                      content: soulStack.instructions,
                    })
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
                    setEditingFile({
                      key: 'memory',
                      title: 'MEMORY.md',
                      description: 'Continuity and context to carry forward',
                      content: soulStack.memory,
                    })
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
              ].map((ch) => {
                const isConnected = selectedChannels.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      if (isConnected) {
                        setSelectedChannels(selectedChannels.filter((c) => c !== ch.id));
                      } else {
                        setSelectedChannels([...selectedChannels, ch.id]);
                      }
                    }}
                    className={cn(
                      'flex flex-col items-start p-4 rounded-2xl border text-left transition-all cursor-pointer',
                      isConnected ? 'bg-primary/10 border-primary' : 'bg-card border-border/60 hover:bg-surface'
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-ui-sm text-foreground">{ch.label}</span>
                      <span className={cn('text-3xs px-2 py-0.5 rounded-full font-medium', isConnected ? 'bg-primary text-white' : 'bg-surface text-muted-foreground')}>
                        {isConnected ? 'Linked' : 'Available'}
                      </span>
                    </div>
                    <span className="mt-1 text-ui-xs text-muted-foreground">{ch.desc}</span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="space-y-2">
              <div className="text-ui-xs text-foreground-subtle mb-3">
                Check tools this agent is authorized to invoke autonomously during runs:
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_TOOLS.map((t) => {
                  const isChecked = selectedTools.includes(t);
                  return (
                    <label
                      key={t}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border p-2.5 text-ui-xs cursor-pointer transition-colors',
                        isChecked ? 'bg-surface border-border text-foreground' : 'bg-card border-border/40 text-muted-foreground'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedTools(selectedTools.filter((item) => item !== t));
                          } else {
                            setSelectedTools([...selectedTools, t]);
                          }
                        }}
                        className="rounded accent-primary size-3.5"
                      />
                      <span className="font-mono">{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'behavior' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
                <span className="font-medium text-ui-sm text-foreground block">Execution Safety & Reasoning</span>
                <div className="text-ui-xs text-muted-foreground leading-relaxed">
                  Agents default to unrestricted sandbox execution with approval pauses on destructive disk modifications.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mcp' && (
            <div className="space-y-3">
              {mcps.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-ui-xs text-muted-foreground">
                  No MCP servers registered. Configure MCP servers in Settings.
                </div>
              ) : (
                mcps.map((m) => (
                  <div key={m.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between">
                    <span className="font-medium text-ui-sm">{m.name}</span>
                    <span className="text-ui-xs text-emerald-500 font-medium">Ready</span>
                  </div>
                ))
              )}
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

          {/* 4. Action Buttons (2x2 Grid + Destructive Row) (Exact Screenshot Parity) */}
          <div className="space-y-2.5 pt-2">
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
                onClick={() => {}}
                className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface cursor-pointer"
              >
                <Copy className="size-4 text-foreground-subtle" />
                <span>Duplicate</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-ui-sm font-medium text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
            >
              <Trash2 className="size-4" />
              <span>Delete agent</span>
            </button>
          </div>
        </div>

        {/* 5. Sticky Bottom Submission Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border/40 bg-surface-muted px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-ui-sm font-medium text-foreground-subtle transition-colors hover:bg-surface hover:text-foreground cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || isSubmitting}
            onClick={() => handleSubmit()}
            className="rounded-xl bg-primary px-5 py-2 text-ui-sm font-semibold text-white shadow-md transition-all hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Creating…' : 'Create Agent'}
          </button>
        </div>
      </div>

      {/* Sub-Editor Modal for SOUL.md / STYLE.md / INSTRUCTIONS.md / MEMORY.md */}
      {editingFile && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-ui-base font-bold text-foreground">{editingFile.title}</h3>
                <p className="text-2xs text-muted-foreground">{editingFile.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFile(null)}
                className="size-7 rounded-lg hover:bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"
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
                className="rounded-xl px-3.5 py-1.5 text-ui-xs font-medium text-foreground-subtle hover:bg-surface hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditor}
                className="rounded-xl bg-primary px-4 py-1.5 text-ui-xs font-semibold text-white hover:bg-primary/90"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default NewAgentModal;
