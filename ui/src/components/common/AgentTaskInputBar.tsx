import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  ArrowUp,
  Square,
  Hand,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  Brain,
  FileText,
  Bot,
  Wrench,
  GitBranch,
  Terminal,
  Upload,
  Folder,
  ChevronDown,
  X,
  Cpu,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  ComposerControl,
  ComposerChevron,
  ComposerMenu,
  ComposerMenuItem,
  ComposerMenuLabel,
  ComposerMenuCheck,
} from './composer-ui';
import { useSessionStore } from '../../store/useSessionStore';
import { useProfileStore } from '../../store/useProfileStore';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { ProviderIcon } from '../agent/ProviderIcon';

export type AgentExecutionMode = 'ask' | 'code' | 'plan' | 'bypass';
export type AgentReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'max';

export interface AgentEngineOption {
  id: string;
  name: string;
  kind: 'native' | 'acp';
  badge: string;
  description: string;
  supportedModels?: string[];
}

export const BUILTIN_AGENT_ENGINES: AgentEngineOption[] = [
  {
    id: 'rakit-kode',
    name: 'Rakit Kode',
    kind: 'native',
    badge: 'native',
    description: 'Kendali AI native agent engine with full tool access & scratchpad execution',
    supportedModels: [
      'deepseek-v4-1-flash',
      'deepseek-v4-pro',
      'claude-sonnet-5-5',
      'gpt-6-astra',
      'gemini-3-1-flash-lite',
      'gpt-oss-120b',
    ],
  },
  {
    id: 'commandcode',
    name: 'Command Code',
    kind: 'acp',
    badge: 'ACP',
    description: 'Command Code autonomous agent connected via Agent Client Protocol (ACP)',
    supportedModels: [
      'claude-sonnet-5-5',
      'claude-sonnet-5',
      'claude-opus-5-5',
      'gpt-6-astra',
      'deepseek/deepseek-v4.1-flash',
      'google/gemini-3.8-flash',
    ],
  },
  {
    id: 'agy',
    name: 'Google Antigravity',
    kind: 'acp',
    badge: 'ACP',
    description: 'Google Antigravity autonomous coding agent CLI via stream-json',
    supportedModels: [
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-medium',
      'claude-sonnet-4-6',
      'gpt-oss-120b-medium',
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'acp',
    badge: 'ACP',
    description: 'Anthropic Claude Code CLI harness connected via ACP',
    supportedModels: [
      'sonnet',
      'opus',
      'haiku',
      'claude-sonnet-4-5',
      'claude-opus-5-5',
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    kind: 'acp',
    badge: 'ACP',
    description: 'OpenCode autonomous local agent connected via ACP',
    supportedModels: [
      'Kenari/glm-5-3-flash',
      'Kenari/deepseek-v4-1-flash',
      'Kenari/claude-haiku-5-5',
      'Kenari/gpt-6-luna',
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'acp',
    badge: 'ACP',
    description: 'Google Gemini CLI in ACP mode',
    supportedModels: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ],
  },
];

export interface PromptSubmitOptions {
  engineId?: string;
  engineKind?: 'native' | 'acp';
  model?: string;
  mode?: AgentExecutionMode;
}

interface AgentTaskInputBarProps {
  placeholder?: string;
  headerNode?: React.ReactNode;
  autoFocus?: boolean;
  onSubmitPrompt?: (prompt: string, options?: PromptSubmitOptions) => void;
  isCompact?: boolean;
  showContextStrip?: boolean;
  className?: string;
}

const MODES: { id: AgentExecutionMode; label: string; short: string; desc: string; icon: any }[] = [
  { id: 'ask', label: 'Ask for approval', short: 'Ask', desc: 'Always ask before editing files or running commands', icon: Hand },
  { id: 'code', label: 'Approve edits', short: 'Edits', desc: 'Edit files freely, ask before running commands', icon: Pencil },
  { id: 'plan', label: 'Approve for me', short: 'Auto', desc: 'Only ask for actions detected as potentially unsafe', icon: ShieldCheck },
  { id: 'bypass', label: 'Full access', short: 'Full', desc: 'Unrestricted access to the filesystem and commands', icon: ShieldAlert },
];

const REASONING_LEVELS: { id: AgentReasoningLevel; label: string; desc: string }[] = [
  { id: 'off', label: 'Off', desc: 'No reasoning' },
  { id: 'minimal', label: 'Minimal', desc: 'Lowest reasoning effort' },
  { id: 'low', label: 'Low', desc: 'Fast, lightweight reasoning' },
  { id: 'medium', label: 'Medium', desc: 'Balanced reasoning depth' },
  { id: 'high', label: 'High', desc: 'Thorough multi-step reasoning' },
  { id: 'max', label: 'Max', desc: 'Maximum available reasoning budget' },
];

export const AgentTaskInputBar: React.FC<AgentTaskInputBarProps> = ({
  placeholder = 'Ask anything, @ threads or files, $ skills, or / commands',
  headerNode,
  autoFocus = false,
  onSubmitPrompt,
  isCompact = false,
  showContextStrip = false,
  className,
}) => {
  const { sendMessage, isStreaming, stopSession, activeSession, selectSession } = useSessionStore();
  const { activeAgent, selectedAgentId } = useProfileStore();
  const { availableModels, defaultModel } = useAppStore();
  const { acpAgents, composerTarget, setComposerTarget } = useAgentStore();

  const [prompt, setPrompt] = useState('');
  const [executionMode, setExecutionMode] = useState<AgentExecutionMode>('bypass');
  const [reasoningLevel, setReasoningLevel] = useState<AgentReasoningLevel>('medium');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Dropdown states
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isEngineOpen, setIsEngineOpen] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [isEffortOpen, setIsEffortOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic merged engines: Rakit Kode & ACP's
  const engines: AgentEngineOption[] = useMemo(() => {
    const list = [...BUILTIN_AGENT_ENGINES];
    if (Array.isArray(acpAgents)) {
      for (const ag of acpAgents) {
        const existingIdx = list.findIndex((e) => e.id === ag.id);
        if (existingIdx >= 0) {
          if (ag.supportedModels && ag.supportedModels.length > 0) {
            list[existingIdx] = {
              ...list[existingIdx],
              supportedModels: ag.supportedModels,
              name: ag.name || list[existingIdx].name,
              description: ag.description || list[existingIdx].description,
            };
          }
        } else {
          list.push({
            id: ag.id,
            name: ag.name,
            kind: 'acp',
            badge: 'ACP',
            description: ag.description || 'ACP external agent orchestrator',
            supportedModels: ag.supportedModels,
          });
        }
      }
    }
    return list;
  }, [acpAgents]);

  const getTargetEngineId = (): string => {
    // 1. If an active session is currently open, follow that session's engine / ACP orchestrator
    if (activeSession?.id) {
      if (activeSession.metadata) {
        try {
          const m = JSON.parse(activeSession.metadata);
          if (m.engine === 'acp' && m.acpAgent) return m.acpAgent;
          if (m.acpAgent) return m.acpAgent;
        } catch {}
      }
      const sessAid = activeSession.agentId;
      if (sessAid && ['agy', 'antigravity', 'commandcode', 'cmd', 'claude-code', 'claude', 'gemini', 'codex', 'opencode', 'omp', 'pi'].includes(sessAid)) {
        return sessAid === 'antigravity' ? 'agy' : sessAid === 'cmd' ? 'commandcode' : sessAid;
      }
    }

    // 2. If user explicitly chose an engine in composerTarget
    if (composerTarget?.id) {
      return composerTarget.id;
    }

    // 3. Default for new task: always Native rakit-kode
    return 'rakit-kode';
  };

  const [selectedEngineId, setSelectedEngineId] = useState<string>(getTargetEngineId);

  useEffect(() => {
    setSelectedEngineId(getTargetEngineId());
  }, [
    activeSession?.id,
    activeSession?.metadata,
    activeSession?.agentId,
    selectedAgentId,
    activeAgent?.id,
    composerTarget?.id,
  ]);

  useEffect(() => {
    if (!activeSession?.id) {
      // New task: reset selectedModel so it falls back to active agent's model or default model
      setSelectedModel('');
    }
  }, [activeSession?.id, selectedAgentId]);

  const activeEngine = engines.find((e) => e.id === selectedEngineId) || engines[0];

  // Selectable models list adapted to the active engine
  const modelOptions = useMemo(() => {
    if (activeEngine.kind === 'native') {
      if (availableModels.length > 0) {
        return availableModels.map((m) => m.id);
      }
      return activeEngine.supportedModels || ['deepseek-v4-1-flash', 'claude-sonnet-5-5', 'gpt-6-astra'];
    }
    if (activeEngine.supportedModels && activeEngine.supportedModels.length > 0) {
      return activeEngine.supportedModels;
    }
    if (availableModels.length > 0) {
      return availableModels.map((m) => m.id);
    }
    return [
      'deepseek-v4-1-flash',
      'deepseek-v4-pro',
      'claude-sonnet-5-5',
      'gpt-6-astra',
      'gemini-3-1-flash-lite',
    ];
  }, [activeEngine, availableModels]);

  const isLocked = Boolean(activeSession?.id);

  let sessionModel = '';
  if (activeSession?.metadata) {
    try {
      const m = JSON.parse(activeSession.metadata);
      if (m.model) sessionModel = m.model;
    } catch {}
  }
  if (!sessionModel && (activeSession as any)?.model) {
    sessionModel = (activeSession as any).model;
  }

  // Effective model calculation: user-selectedModel first, then sessionModel, then agent/default model
  const effectiveModel =
    (selectedModel && modelOptions.includes(selectedModel) ? selectedModel : '') ||
    sessionModel ||
    (activeAgent?.model && modelOptions.includes(activeAgent.model) ? activeAgent.model : '') ||
    (defaultModel && modelOptions.includes(defaultModel) ? defaultModel : '') ||
    modelOptions[0] ||
    'deepseek-v4-1-flash';

  useEffect(() => {
    if (sessionModel) {
      setSelectedModel(sessionModel);
    }
  }, [activeSession?.id, sessionModel]);

  const currentMode = MODES.find((m) => m.id === executionMode) || MODES[3];
  const currentReasoning = REASONING_LEVELS.find((r) => r.id === reasoningLevel) || REASONING_LEVELS[3];

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const closeAllMenus = () => {
    setIsContextOpen(false);
    setIsModeOpen(false);
    setIsEngineOpen(false);
    setIsModelOpen(false);
    setIsEffortOpen(false);
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isStreaming) return;
    const text = prompt.trim();
    setPrompt('');
    closeAllMenus();

    if (onSubmitPrompt) {
      onSubmitPrompt(text, {
        engineId: activeEngine.id,
        engineKind: activeEngine.kind,
        model: effectiveModel,
        mode: executionMode,
      });
    } else {
      await sendMessage(text, {
        agentId: activeAgent?.id,
        model: effectiveModel,
        engine: activeEngine.kind,
        acpAgent: activeEngine.kind === 'acp' ? activeEngine.id : undefined,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const chipSize = isCompact ? 'xs' : 'sm';

  return (
    <div className={cn('relative w-full max-w-[var(--chat-content-max-width,46rem)] mx-auto', className)}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            setPrompt((prev) => `${prev} [Attached ${e.target.files?.length} file(s)]`);
          }
        }}
      />

      {/* Stacked top header if provided (e.g. Workspace / General chip in New Task) */}
      {headerNode && (
        <div className="chat-composer-stacked-top mx-auto w-full border border-b-0 border-[color:var(--composer-stacked-border)]">
          {headerNode}
        </div>
      )}

      {/* Main Composer Glass Surface */}
      <div className={cn(
        'chat-composer-surface relative flex flex-col',
        headerNode && 'rounded-t-none'
      )}>
        <div className={cn('flex flex-col px-3.5', isCompact ? 'pt-2 pb-1' : 'pt-3.5 pb-2')}>
          {/* Text input area */}
          <textarea
            ref={textareaRef}
            rows={isCompact ? 1 : 2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Keep typing to queue follow-up changes' : placeholder}
            className="w-full resize-none bg-transparent border-0 font-sans leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none text-[length:var(--font-size-prompt,0.9375rem)]"
          />
        </div>

        {/* Footer controls row */}
        <div className="flex min-w-0 items-center justify-between px-3 pb-2.5 pt-0.5 gap-2">
          {/* Left Pickers Cluster */}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-visible">
            {/* [+] Button */}
            <div className="relative shrink-0">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  const next = !isContextOpen;
                  closeAllMenus();
                  setIsContextOpen(next);
                }}
                pressed={isContextOpen}
                title="Add context (@)"
                className="w-7 justify-center px-0"
              >
                <Plus className="size-4" />
              </ComposerControl>

              {isContextOpen && (
                <ComposerMenu label="Add context" className="absolute bottom-full left-0 mb-2 w-56">
                  <ComposerMenuItem onClick={() => { closeAllMenus(); setPrompt((p) => p + ' @files '); }}>
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span>Files & Code</span>
                  </ComposerMenuItem>
                  <ComposerMenuItem onClick={() => { closeAllMenus(); setPrompt((p) => p + ' $skills '); }}>
                    <Bot className="size-3.5 text-muted-foreground" />
                    <span>Skills</span>
                  </ComposerMenuItem>
                  <ComposerMenuItem onClick={() => { closeAllMenus(); setPrompt((p) => p + ' /commands '); }}>
                    <Terminal className="size-3.5 text-muted-foreground" />
                    <span>Slash Commands</span>
                  </ComposerMenuItem>
                  <ComposerMenuItem onClick={() => { closeAllMenus(); fileInputRef.current?.click(); }}>
                    <Upload className="size-3.5 text-muted-foreground" />
                    <span>Upload Documents</span>
                  </ComposerMenuItem>
                </ComposerMenu>
              )}
            </div>

            {/* Permission Mode Chip */}
            <div className="relative shrink-0">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  const next = !isModeOpen;
                  closeAllMenus();
                  setIsModeOpen(next);
                }}
                pressed={isModeOpen}
                className={cn(
                  'gap-1.5 px-2 font-medium',
                  executionMode === 'bypass' && 'text-amber-500 hover:text-amber-600'
                )}
                title={`Permission: ${currentMode.label}`}
              >
                <currentMode.icon className="size-3.5 shrink-0" />
                <span className="leading-none text-ui-xs">{currentMode.short}</span>
                <ComposerChevron size={chipSize} />
              </ComposerControl>

              {isModeOpen && (
                <ComposerMenu label="Permissions" className="absolute bottom-full left-0 mb-2 w-72">
                  <ComposerMenuLabel>Permissions</ComposerMenuLabel>
                  {MODES.map((m) => {
                    const isSelected = m.id === executionMode;
                    return (
                      <ComposerMenuItem
                        key={m.id}
                        selected={isSelected}
                        onClick={() => {
                          setExecutionMode(m.id);
                          setIsModeOpen(false);
                        }}
                        className="items-start gap-2.5 py-1.5"
                      >
                        <m.icon className="mt-0.5 size-4 shrink-0 opacity-80" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-ui-sm font-medium">
                            <span>{m.label}</span>
                            {isSelected && <ComposerMenuCheck />}
                          </div>
                          <div className="mt-0.5 text-3xs text-muted-foreground">{m.desc}</div>
                        </div>
                      </ComposerMenuItem>
                    );
                  })}
                </ComposerMenu>
              )}
            </div>

            {/* Agent Engine Chip (Rakit Kode & ACP's) */}
            <div className="relative shrink-0 max-w-[145px] sm:max-w-[175px]">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  const next = !isEngineOpen;
                  closeAllMenus();
                  setIsEngineOpen(next);
                }}
                pressed={isEngineOpen}
                className="w-full justify-between gap-1.5 px-2"
                title={`Agent Engine: ${activeEngine.name} (${activeEngine.badge})`}
              >
                <ProviderIcon provider={activeEngine.id} size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left text-ui-xs leading-none font-medium">
                  {activeEngine.name}
                </span>
                <ComposerChevron size={chipSize} />
              </ComposerControl>

              {isEngineOpen && (
                <ComposerMenu label="Agent Engine" className="absolute bottom-full left-0 mb-2 max-h-80 w-72 overflow-y-auto">
                  <ComposerMenuLabel className="flex items-center justify-between">
                    <span>Agent Engines</span>
                    <span className="text-3xs font-normal normal-case tracking-normal text-muted-foreground">Rakit Kode & ACP's</span>
                  </ComposerMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    {engines.map((eng) => {
                      const isSelected = eng.id === activeEngine.id;
                      return (
                        <ComposerMenuItem
                          key={eng.id}
                          selected={isSelected}
                          onClick={() => {
                            setSelectedEngineId(eng.id);
                            setComposerTarget({ kind: eng.kind, id: eng.id });
                            if (eng.supportedModels && eng.supportedModels.length > 0) {
                              setSelectedModel(eng.supportedModels[0]);
                            }
                            setIsEngineOpen(false);

                            // Change agent on tab -> move to new task state
                            if (activeSession?.id && eng.id !== activeEngine.id) {
                              selectSession(null);
                            }
                          }}
                          className="items-start justify-between gap-2.5 p-2"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                              <ProviderIcon provider={eng.id} size={15} />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-ui-xs font-medium leading-tight">{eng.name}</span>
                                <span className={cn(
                                  'rounded px-1 py-0.2 text-4xs font-bold uppercase leading-none tracking-wider',
                                  eng.kind === 'acp'
                                    ? 'border border-primary/40 bg-primary/20 text-primary'
                                    : 'bg-surface text-foreground-subtle border border-border'
                                )}>
                                  {eng.badge}
                                </span>
                              </div>
                              <span className="mt-0.5 line-clamp-2 text-3xs leading-tight text-muted-foreground">
                                {eng.description}
                              </span>
                            </div>
                          </div>
                          {isSelected && <ComposerMenuCheck className="ml-2 mt-0.5" />}
                        </ComposerMenuItem>
                      );
                    })}
                  </div>
                </ComposerMenu>
              )}
            </div>

            {/* Model Selector Chip */}
            <div className="relative shrink-0 max-w-[130px] sm:max-w-[160px]">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  const next = !isModelOpen;
                  closeAllMenus();
                  setIsModelOpen(next);
                }}
                pressed={isModelOpen}
                className="w-full justify-between gap-1 px-2"
                title={`Model: ${effectiveModel}`}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-left text-ui-xs leading-none">
                  {effectiveModel.split('/').pop() || effectiveModel}
                </span>
                <ComposerChevron size={chipSize} />
              </ComposerControl>

              {isModelOpen && (
                <ComposerMenu label="Model" className="absolute bottom-full left-0 mb-2 max-h-72 w-64 overflow-y-auto">
                  <ComposerMenuLabel className="flex items-center justify-between">
                    <span>{activeEngine.name} Models</span>
                    {activeEngine.kind === 'acp' && (
                      <span className="rounded bg-primary/20 px-1 py-0.2 text-4xs font-bold uppercase text-primary">ACP Native</span>
                    )}
                  </ComposerMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    {modelOptions.map((m) => {
                      const isSelected = m === effectiveModel || m.split('/').pop() === effectiveModel;
                      return (
                        <ComposerMenuItem
                          key={m}
                          selected={isSelected}
                          onClick={() => {
                            setSelectedModel(m);
                            setIsModelOpen(false);
                          }}
                          className="justify-between"
                        >
                          <span className="truncate font-mono text-ui-xs">{m}</span>
                          {isSelected && <ComposerMenuCheck />}
                        </ComposerMenuItem>
                      );
                    })}
                  </div>
                </ComposerMenu>
              )}
            </div>

            {/* Thinking / Reasoning Effort Chip */}
            <div className="relative shrink-0">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  const next = !isEffortOpen;
                  closeAllMenus();
                  setIsEffortOpen(next);
                }}
                pressed={isEffortOpen}
                className="gap-1 px-2"
                title={`Reasoning Effort: ${currentReasoning.label}`}
              >
                <Brain className="size-3.5 text-primary shrink-0" />
                <span className="leading-none text-ui-xs">{currentReasoning.label}</span>
                <ComposerChevron size={chipSize} />
              </ComposerControl>

              {isEffortOpen && (
                <ComposerMenu label="Reasoning effort" className="absolute bottom-full left-0 mb-2 w-56">
                  <ComposerMenuLabel>Thinking budget</ComposerMenuLabel>
                  {REASONING_LEVELS.map((r) => {
                    const isSelected = r.id === reasoningLevel;
                    return (
                      <ComposerMenuItem
                        key={r.id}
                        selected={isSelected}
                        onClick={() => {
                          setReasoningLevel(r.id);
                          setIsEffortOpen(false);
                        }}
                        className="justify-between"
                      >
                        <div>
                          <div className="text-ui-xs font-medium">{r.label}</div>
                          <div className="text-3xs text-muted-foreground">{r.desc}</div>
                        </div>
                        {isSelected && <ComposerMenuCheck />}
                      </ComposerMenuItem>
                    );
                  })}
                </ComposerMenu>
              )}
            </div>
          </div>

          {/* Right Action Cluster: Context Gauge & Send/Stop */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Context Token Gauge */}
            <div
              className="flex items-center justify-center p-1"
              title="Session context token utilization"
            >
              <svg className="size-4 -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted/40"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-500 transition-all duration-300"
                  strokeDasharray="28, 100"
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>

            {/* Send / Stop Circular Button */}
            {isStreaming ? (
              <button
                type="button"
                onClick={() => stopSession()}
                className="flex size-7 items-center justify-center rounded-full bg-destructive text-white shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                title="Stop generation"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-white shadow-xs transition-all cursor-pointer',
                  prompt.trim()
                    ? 'bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95'
                    : 'bg-primary/40 text-white/50 cursor-not-allowed opacity-60'
                )}
                title="Send message (Enter)"
              >
                <ArrowUp className="size-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
