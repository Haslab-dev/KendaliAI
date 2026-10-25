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
  Mic,
  Loader2,
  Paperclip,
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
import { Attachment } from '../../types';
import { COMPOSER_FILL_EVENT } from '../../lib/composerEvents';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024;
const IMAGE_DOWNSCALE_THRESHOLD = 2 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 2048;

export const ATTACHMENT_ACCEPT =
  'image/*,.pdf,.txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.sql,.log,.docx,.xlsx,.pptx,.zip';

// Downscale large images in the browser so uploads stay fast and vision
// requests stay within provider limits.
async function prepareAttachmentFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= IMAGE_DOWNSCALE_THRESHOLD) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const usePng = file.type === 'image/png';
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, usePng ? 'image/png' : 'image/jpeg', 0.88)
    );
    if (!blob || blob.size >= file.size) return file;
    const ext = usePng ? '.png' : '.jpg';
    const name = file.name.replace(/\.[^.]+$/, '') + ext;
    return new File([blob], name, { type: usePng ? 'image/png' : 'image/jpeg' });
  } catch {
    return file;
  }
}

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
  attachments?: Attachment[];
}

interface AgentTaskInputBarProps {
  placeholder?: string;
  headerNode?: React.ReactNode;
  autoFocus?: boolean;
  onSubmitPrompt?: (prompt: string, options?: PromptSubmitOptions) => void;
  isCompact?: boolean;
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
  className,
}) => {
  const { sendMessage, isStreaming, stopSession, activeSession, selectSession, usageBySession } = useSessionStore();
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
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileTextareaRef.current) {
      mobileTextareaRef.current.style.height = 'auto';
      mobileTextareaRef.current.style.height = `${Math.min(mobileTextareaRef.current.scrollHeight, 120)}px`;
    }
  }, [prompt]);

  // OpenUI `feedback` actions put their text here instead of sending it, so
  // the user can review, edit, and submit it themselves.
  useEffect(() => {
    const handleComposerFill = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (typeof text !== 'string' || !text.trim()) return;
      setPrompt(text);
      requestAnimationFrame(() => {
        const desktop = textareaRef.current;
        const mobile = mobileTextareaRef.current;
        // offsetParent is null when the element (or an ancestor) is hidden.
        const el = desktop && desktop.offsetParent !== null ? desktop : mobile;
        if (!el) return;
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
      });
    };
    window.addEventListener(COMPOSER_FILL_EVENT, handleComposerFill);
    return () => window.removeEventListener(COMPOSER_FILL_EVENT, handleComposerFill);
  }, []);

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

  const handleFiles = async (incoming: FileList | File[]) => {
    setAttachmentError('');
    const list = Array.from(incoming);
    if (list.length === 0) return;

    if (attachments.length + list.length > MAX_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(`"${file.name}" is larger than 5 MB.`);
        return;
      }
    }
    const total =
      attachments.reduce((sum, a) => sum + (a.size || 0), 0) +
      list.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
      setAttachmentError('Attachments exceed the 20 MB total limit.');
      return;
    }

    setUploadingAttachments(true);
    try {
      const form = new FormData();
      if (activeSession?.id) form.append('sessionId', activeSession.id);
      for (const file of list) {
        form.append('files', await prepareAttachmentFile(file));
      }
      const res = await fetch('/api/attachments', { method: 'POST', body: form });
      if (!res.ok) {
        const detail = (await res.text()).trim();
        throw new Error(detail || `Upload failed (${res.status})`);
      }
      const uploaded: Attachment[] = await res.json();
      setAttachments((prev) => [...prev, ...(Array.isArray(uploaded) ? uploaded : [])]);
    } catch (err: any) {
      setAttachmentError(err?.message || 'Upload failed');
    } finally {
      setUploadingAttachments(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isStreaming || uploadingAttachments) return;
    const text = prompt.trim();
    const outgoing = attachments;
    setPrompt('');
    setAttachments([]);
    setAttachmentError('');
    closeAllMenus();

    if (onSubmitPrompt) {
      onSubmitPrompt(text, {
        engineId: activeEngine.id,
        engineKind: activeEngine.kind,
        model: effectiveModel,
        mode: executionMode,
        attachments: outgoing,
      });
    } else {
      await sendMessage(text, {
        agentId: activeAgent?.id,
        model: effectiveModel,
        engine: activeEngine.kind,
        acpAgent: activeEngine.kind === 'acp' ? activeEngine.id : undefined,
        attachments: outgoing,
      });
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Never submit while an IME composition (CJK input) is in progress.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const chipSize = isCompact ? 'xs' : 'sm';

  const usage = activeSession?.id ? usageBySession[activeSession.id] : undefined;
  const usagePercent = Math.max(0, Math.min(100, usage?.percent ?? 0));
  const usageColor =
    usagePercent >= 90 ? 'text-red-500' : usagePercent >= 70 ? 'text-amber-500' : 'text-emerald-500';
  const formatTokens = (n?: number) => {
    if (!n || n <= 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
    return String(n);
  };

  return (
    <div
      className={cn('relative w-full max-w-[var(--chat-content-max-width,46rem)] mx-auto', className)}
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          setIsDraggingFiles(true);
        }
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFiles(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          void handleFiles(e.dataTransfer.files);
        }
      }}
    >
      {isDraggingFiles && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 backdrop-blur-[1px]">
          <span className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-ui-xs font-medium text-foreground shadow-md">
            <Paperclip className="size-3.5" /> Drop files or images
          </span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {(attachments.length > 0 || uploadingAttachments || attachmentError) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1 sm:px-0">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/90 py-1 pl-1 pr-1.5 text-3xs text-foreground shadow-xs"
              title={`${att.name} · ${(att.size / 1024).toFixed(0)} KB`}
            >
              {att.kind === 'image' ? (
                <img src={att.url} alt={att.name} className="size-7 rounded object-cover" />
              ) : (
                <FileText className="size-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Remove attachment"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {uploadingAttachments && (
            <span className="flex items-center gap-1 text-3xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Uploading…
            </span>
          )}
          {attachmentError && <span className="text-3xs text-destructive">{attachmentError}</span>}
        </div>
      )}

      {/* Stacked top header if provided (e.g. Workspace / General chip in New Task) */}
      {headerNode && (
        <div className="chat-composer-stacked-top mx-auto w-full border border-b-0 border-[color:var(--composer-stacked-border)]">
          {headerNode}
        </div>
      )}

      {/* 1. Mobile Pill Composer (Muse AI parity) */}
      <div className="flex sm:hidden items-center gap-2 w-full bg-card/95 border border-border/80 shadow-lg rounded-full px-3 py-1.5 backdrop-blur-xl focus-within:ring-2 focus-within:ring-primary/30 transition-all">
        {/* [+] Trigger Button */}
        <button
          type="button"
          onClick={() => setIsMobileSheetOpen(true)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-foreground hover:bg-surface-hover active:scale-95 transition-all cursor-pointer"
          title="Add context, switch engine or model"
        >
          <Plus className="size-4" />
        </button>

        {/* Mobile Input */}
        <textarea
          ref={mobileTextareaRef}
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isStreaming ? 'Thinking…' : placeholder}
          className="flex-1 min-w-0 bg-transparent border-0 font-sans leading-snug text-foreground placeholder:text-muted-foreground/60 focus:outline-none text-sm py-1 resize-none max-h-24"
        />

        {/* Context usage (compact) */}
        {usage && (
          <span
            className={cn('shrink-0 font-mono text-3xs font-semibold tabular-nums', usageColor)}
            title={`${formatTokens(usage.usedTokens)} / ${formatTokens(usage.contextWindow)} tokens`}
          >
            {usagePercent.toFixed(0)}%
          </span>
        )}

        {/* Send or Stop */}
        {isStreaming ? (
          <button
            type="button"
            onClick={() => stopSession()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive text-white shadow-xs active:scale-95 cursor-pointer"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full shadow-xs transition-all cursor-pointer active:scale-95',
              prompt.trim()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-surface text-muted-foreground/40 cursor-default'
            )}
            title="Send"
          >
            <ArrowUp className="size-4 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* 2. Desktop Surface */}
      <div className={cn(
        'hidden sm:flex chat-composer-surface relative flex-col',
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
            onPaste={handlePaste}
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
            {/* Context Token Gauge — real usage for the active session */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUsageOpen((v) => !v)}
                className="flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors hover:bg-foreground/5"
                title={
                  usage
                    ? `Context: ${formatTokens(usage.usedTokens)} / ${formatTokens(usage.contextWindow)} tokens (${usagePercent.toFixed(1)}%)`
                    : 'Session context token utilization'
                }
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
                    className={cn(usageColor, 'transition-all duration-300')}
                    strokeDasharray={`${usagePercent}, 100`}
                    strokeWidth="4"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
              </button>

              {isUsageOpen && (
                <div className="absolute bottom-full right-0 z-50 mb-2 w-60 rounded-lg border border-border bg-card p-3 shadow-xl">
                  <div className="flex items-center justify-between text-ui-xs">
                    <span className="font-medium text-foreground">Context window</span>
                    <span className={cn('font-mono font-semibold', usageColor)}>
                      {usagePercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2 font-mono text-3xs text-muted-foreground">
                    <span className="truncate">
                      {formatTokens(usage?.usedTokens)} / {formatTokens(usage?.contextWindow)}
                    </span>
                    <span className="shrink-0 truncate">{usage?.model || effectiveModel || 'model'}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-3xs text-muted-foreground">
                    {usage
                      ? 'Approximate context used by this session.'
                      : 'Usage appears after the first turn.'}
                  </div>
                </div>
              )}
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

      {/* 3. Mobile Options Bottom Sheet */}
      {isMobileSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:hidden select-none">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setIsMobileSheetOpen(false)}
          />
          <div className="relative z-10 bg-card/98 backdrop-blur-2xl border-t border-border rounded-t-3xl p-4 shadow-2xl max-h-[82vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <h3 className="text-ui-base font-bold text-foreground">Task Settings</h3>
              <button
                type="button"
                onClick={() => setIsMobileSheetOpen(false)}
                className="size-7 rounded-lg text-muted-foreground hover:bg-surface flex items-center justify-center cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Engine Selection */}
            <div className="space-y-1.5">
              <label className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agent Engine
              </label>
              <div className="flex flex-wrap gap-1.5">
                {engines.map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => {
                      setSelectedEngineId(eng.id);
                      setComposerTarget({ kind: eng.kind, id: eng.id });
                      if (eng.supportedModels?.length) setSelectedModel(eng.supportedModels[0]);
                    }}
                    className={cn(
                      'px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer',
                      eng.id === activeEngine.id
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border/60 bg-surface/60 text-muted-foreground'
                    )}
                  >
                    <ProviderIcon provider={eng.id} size={14} />
                    <span>{eng.name}</span>
                    <span className="text-4xs px-1 py-0.2 rounded bg-surface border border-border">
                      {eng.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-1.5">
              <label className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </label>
              <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto p-0.5">
                {modelOptions.map((m) => {
                  const isSelected = m === effectiveModel || m.split('/').pop() === effectiveModel;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedModel(m)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-mono border transition-all cursor-pointer text-left',
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border/40 bg-surface/40 text-muted-foreground hover:bg-surface'
                      )}
                    >
                      <span className="truncate">{m}</span>
                      {isSelected && <ComposerMenuCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Permissions / Execution Mode */}
            <div className="space-y-1.5">
              <label className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Permissions
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExecutionMode(m.id)}
                    className={cn(
                      'px-2.5 py-2 rounded-xl text-xs font-medium border flex items-center gap-2 transition-all text-left cursor-pointer',
                      executionMode === m.id
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border/60 bg-surface/60 text-muted-foreground'
                    )}
                  >
                    <m.icon className="size-4 shrink-0" />
                    <div className="truncate">{m.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reasoning Effort */}
            <div className="space-y-1.5">
              <label className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Thinking Budget
              </label>
              <div className="flex gap-1.5">
                {REASONING_LEVELS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReasoningLevel(r.id)}
                    className={cn(
                      'flex-1 py-1.5 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer',
                      reasoningLevel === r.id
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border/60 bg-surface/60 text-muted-foreground'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Attachments / Context */}
            <div className="space-y-1.5 pt-1">
              <label className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Add Context
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPrompt((p) => p + ' @files ');
                    setIsMobileSheetOpen(false);
                  }}
                  className="p-2.5 rounded-xl border border-border/60 bg-surface/60 text-xs text-foreground flex items-center gap-2 cursor-pointer hover:bg-surface"
                >
                  <FileText className="size-3.5 text-primary" />
                  <span>@files</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt((p) => p + ' $skills ');
                    setIsMobileSheetOpen(false);
                  }}
                  className="p-2.5 rounded-xl border border-border/60 bg-surface/60 text-xs text-foreground flex items-center gap-2 cursor-pointer hover:bg-surface"
                >
                  <Bot className="size-3.5 text-primary" />
                  <span>$skills</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsMobileSheetOpen(false);
                  }}
                  className="p-2.5 rounded-xl border border-border/60 bg-surface/60 text-xs text-foreground flex items-center gap-2 cursor-pointer hover:bg-surface"
                >
                  <Upload className="size-3.5 text-primary" />
                  <span>Upload File</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt((p) => p + ' /commands ');
                    setIsMobileSheetOpen(false);
                  }}
                  className="p-2.5 rounded-xl border border-border/60 bg-surface/60 text-xs text-foreground flex items-center gap-2 cursor-pointer hover:bg-surface"
                >
                  <Terminal className="size-3.5 text-primary" />
                  <span>/commands</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileSheetOpen(false)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs mt-2 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
