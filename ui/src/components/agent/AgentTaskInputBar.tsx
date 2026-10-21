import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  ChevronRight,
  FileText,
  GitBranch,
  Terminal,
  Upload,
  ArrowUp,
  Square,
  ShieldAlert,
  ShieldCheck,
  Hand,
  Pencil,
  Wrench,
  X,
  Brain,
  Bot,
  Image as ImageIcon,
  Compass,
  Folder,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { parseSessionMetadata } from '../../types';
import { cn } from '../../lib/cn';
import { AtMentionMenu, extractAtQuery, type AtMentionItem } from './AtMentionMenu';
import { ProviderIcon } from './ProviderIcon';
import { GrokAvatar } from '../GrokAvatar';
import { BranchSelector } from './BranchSelector';
import {
  ComposerControl,
  ComposerChevron,
  ComposerMenu,
  ComposerMenuItem,
  ComposerMenuLabel,
  ComposerMenuCheck,
  ComposerKbd,
} from '../forge/composer-ui';

export type AgentExecutionMode = 'ask' | 'code' | 'plan' | 'bypass';
export type AgentReasoningLevel = 'off' | 'low' | 'medium' | 'high' | 'max';

export interface SlashCommandItem {
  name: string;
  description: string;
  category: string;
}

export interface AgentTaskInputBarProps {
  sessionId?: string | null;
  placeholder?: string;
  headerNode?: React.ReactNode;
  autoFocus?: boolean;
  onSubmitPrompt?: (prompt: string) => void;
  onSendMessage?: (prompt: string) => void;
  onStopGeneration?: () => void;
  isGenerating?: boolean;
  isCompact?: boolean;
  fillWidth?: boolean;
  showContextStrip?: boolean;
}

const MODES: { id: AgentExecutionMode; label: string; short: string; desc: string; icon: any }[] = [
  {
    id: 'ask',
    label: 'Ask for approval',
    short: 'Ask',
    desc: 'Always ask before editing files or running commands',
    icon: Hand,
  },
  {
    id: 'code',
    label: 'Approve edits',
    short: 'Edits',
    desc: 'Edit files freely, ask before running commands',
    icon: Pencil,
  },
  {
    id: 'plan',
    label: 'Approve for me',
    short: 'Auto',
    desc: 'Only ask for actions detected as potentially unsafe',
    icon: ShieldCheck,
  },
  {
    id: 'bypass',
    label: 'Full access',
    short: 'Full',
    desc: 'Unrestricted access to the filesystem and commands',
    icon: ShieldAlert,
  },
];

const REASONING_LEVELS: { id: AgentReasoningLevel; label: string; desc: string }[] = [
  { id: 'off', label: 'Off', desc: 'No reasoning' },
  { id: 'low', label: 'Low', desc: 'Fast, lightweight reasoning' },
  { id: 'medium', label: 'Medium', desc: 'Balanced reasoning depth' },
  { id: 'high', label: 'High', desc: 'Thorough multi-step reasoning' },
  { id: 'max', label: 'Max', desc: 'Maximum available reasoning budget' },
];

export const AgentTaskInputBar: React.FC<AgentTaskInputBarProps> = ({
  sessionId,
  placeholder = 'Ask anything, @ threads or files, $ skills, or / commands',
  headerNode,
  autoFocus = false,
  onSubmitPrompt,
  onSendMessage,
  onStopGeneration,
  isGenerating = false,
  isCompact = false,
  fillWidth = false,
  showContextStrip = true,
}) => {
  const storeIsGenerating = useAppStore((s) => s.isGenerating);
  const sessions = useAppStore((s) => s.sessions);
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const availableModels = useAppStore((s) => s.availableModels);
  const activeModel = useAppStore((s) => s.activeModel);
  const setActiveModel = useAppStore((s) => s.setActiveModel);
  const defaultModel = useAppStore((s) => s.defaultModel);
  const agents = useAppStore((s) => s.agents);
  const activeAgent = useAppStore((s) => s.activeAgent);
  const setActiveAgent = useAppStore((s) => s.setActiveAgent);
  const mcps = useAppStore((s) => s.mcps);

  const acpAgents = useAgentStore((s) => s.acpAgents);
  const composerTarget = useAgentStore((s) => s.composerTarget);
  const setComposerTarget = useAgentStore((s) => s.setComposerTarget);
  const openNewTask = useAgentStore((s) => s.openNewTask);
  const executionMode = useAgentStore((s) => s.executionMode);
  const setExecutionMode = useAgentStore((s) => s.setExecutionMode);
  const sendPrompt = useAgentStore((s) => s.sendPrompt);
  const stopTask = useAgentStore((s) => s.stopTask);

  const isRunning = isGenerating || storeIsGenerating;

  const [prompt, setPrompt] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [reasoningLevel, setReasoningLevel] = useState<AgentReasoningLevel>('low');
  const [attachedFiles, setAttachedFiles] = useState<{
    name: string;
    path?: string;
    isImage?: boolean;
    previewUrl?: string;
    size?: number;
  }[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Menus state
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isEffortPickerOpen, setIsEffortPickerOpen] = useState(false);
  const [isUsageContextOpen, setIsUsageContextOpen] = useState(false);

  // Mention and Slash state
  const [atOpen, setAtOpen] = useState(false);
  const [atItems, setAtItems] = useState<AtMentionItem[]>([]);
  const [atIndex, setAtIndex] = useState(0);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsContextOpen(false);
        setIsModeOpen(false);
        setIsAgentPickerOpen(false);
        setIsModelPickerOpen(false);
        setIsEffortPickerOpen(false);
        setIsUsageContextOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      const minH = isCompact ? 32 : 44;
      const maxH = 180;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, minH), maxH)}px`;
    }
  }, [prompt, isCompact]);

  const currentMode = useMemo(() => {
    return MODES.find((m) => m.id === executionMode) || MODES[0];
  }, [executionMode]);

  const currentReasoning = useMemo(() => {
    return REASONING_LEVELS.find((r) => r.id === reasoningLevel) || REASONING_LEVELS[1];
  }, [reasoningLevel]);

  const isAcpTarget = composerTarget?.kind === 'acp';
  const activeAcpAgent = isAcpTarget ? acpAgents.find((a) => a.id === composerTarget?.id) : null;

  const currentModelName = useMemo(() => {
    if (isAcpTarget) {
      return activeModel || composerTarget?.model || activeAcpAgent?.defaultModel || 'default';
    }
    return activeModel || defaultModel || 'gemini-2.5-flash';
  }, [isAcpTarget, activeModel, composerTarget?.model, activeAcpAgent?.defaultModel, defaultModel]);

  // Slash commands catalog
  const slashCommands = useMemo<SlashCommandItem[]>(() => {
    return [
      { name: '/plan', description: 'Switch to planning mode with deep thought structure', category: 'plan' },
      { name: '/git', description: 'Inspect git branches, status and pending diffs', category: 'git' },
      { name: '/terminal', description: 'Execute bash commands or background scripts', category: 'terminal' },
      { name: '/mcp', description: `Access ${mcps.length} connected MCP servers`, category: 'mcp' },
      { name: '/clean', description: 'Clear conversation history and temporary scratch files', category: 'system' },
      { name: '/model', description: `Current model: ${currentModelName}`, category: 'system' },
    ];
  }, [mcps.length, currentModelName]);

  const filteredSlash = useMemo(() => {
    if (!slashQuery) return slashCommands;
    const q = slashQuery.toLowerCase();
    return slashCommands.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [slashCommands, slashQuery]);

  const updateSlashState = () => {
    const el = textareaRef.current;
    if (!el) return;
    const text = el.value.slice(0, el.selectionStart);
    const lastWord = text.split(/\s/).pop() || '';
    if (lastWord.startsWith('/') && !lastWord.includes(' ')) {
      setSlashQuery(lastWord.slice(1));
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const updateAtState = () => {
    const el = textareaRef.current;
    if (!el) return;
    const text = el.value.slice(0, el.selectionStart);
    const query = extractAtQuery(text);
    if (query !== null) {
      const candidates: AtMentionItem[] = [
        { path: 'src/', isDir: true },
        { path: 'src/App.tsx', isDir: false },
        { path: 'package.json', isDir: false },
        { path: 'README.md', isDir: false },
        { path: 'tsconfig.json', isDir: false },
      ].filter((c) => c.path.toLowerCase().includes(query.toLowerCase()));
      setAtItems(candidates);
      setAtOpen(candidates.length > 0);
      setAtIndex(0);
    } else {
      setAtOpen(false);
    }
  };

  const applyAtMention = (item: AtMentionItem) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const textBefore = prompt.slice(0, cursor);
    const textAfter = prompt.slice(cursor);
    const match = /(?:^|\s)@([^\s]*)$/.exec(textBefore);
    if (match) {
      const start = match.index + (match[0].startsWith(' ') ? 1 : 0);
      const replaced = prompt.slice(0, start) + `@${item.path} ` + textAfter;
      setPrompt(replaced);
    }
    setAtOpen(false);
    textareaRef.current?.focus();
  };

  const applySlash = (item: SlashCommandItem) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const textBefore = prompt.slice(0, cursor);
    const textAfter = prompt.slice(cursor);
    const words = textBefore.split(/\s/);
    words.pop();
    const replaced = (words.length > 0 ? words.join(' ') + ' ' : '') + item.name + ' ' + textAfter;
    setPrompt(replaced);
    setSlashOpen(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % filteredSlash.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + filteredSlash.length) % filteredSlash.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySlash(filteredSlash[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }

    if (atOpen && atItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtIndex((prev) => (prev + 1) % atItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtIndex((prev) => (prev - 1 + atItems.length) % atItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyAtMention(atItems[atIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAtOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!prompt.trim() && attachedFiles.length === 0) return;

    if (isRunning) {
      // If running and user hits submit, trigger stop or queue
      return;
    }

    let effectivePrompt = prompt.trim();
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles.map((f) => f.path || f.name).join(', ');
      effectivePrompt = `${effectivePrompt}\n\n[Attached: ${fileRefs}]`;
    }

    if (onSubmitPrompt) {
      onSubmitPrompt(effectivePrompt);
    } else if (onSendMessage) {
      onSendMessage(effectivePrompt);
    } else {
      void sendPrompt(effectivePrompt);
    }

    setPrompt('');
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleStop = () => {
    if (onStopGeneration) {
      onStopGeneration();
    } else {
      void stopTask(sessionId || undefined);
    }
  };

  const insertContextTag = (tag: string) => {
    setPrompt((prev) => (prev ? `${prev} @${tag} ` : `@${tag} `));
    setIsContextOpen(false);
    textareaRef.current?.focus();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/');
      setAttachedFiles((prev) => [
        ...prev,
        {
          name: file.name,
          path: file.name,
          isImage: isImg,
          previewUrl: isImg ? URL.createObjectURL(file) : undefined,
          size: file.size,
        },
      ]);
    });
    e.target.value = '';
  };

  const chipSize = isCompact ? 'xs' : 'sm';
  const isFullAccess = executionMode === 'bypass';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mx-auto w-full select-none',
        fillWidth ? 'max-w-none px-1' : 'max-w-[48rem]'
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          Array.from(e.dataTransfer.files).forEach((file) => {
            const isImg = file.type.startsWith('image/');
            setAttachedFiles((prev) => [
              ...prev,
              {
                name: file.name,
                path: file.name,
                isImage: isImg,
                previewUrl: isImg ? URL.createObjectURL(file) : undefined,
                size: file.size,
              },
            ]);
          });
        }
      }}
    >
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {headerNode && (
        <div className="mx-auto -mb-px w-14/15 min-w-0 border border-b-0 border-border/40 rounded-t-xl bg-chrome/60 px-3 py-1.5 text-2xs">
          {headerNode}
        </div>
      )}

      {/* Main Composer Surface (T3Code Glass Card) */}
      <div className="relative flex flex-col rounded-2xl border border-border/80 bg-card/95 shadow-xl backdrop-blur-xl transition-all focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20">
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col px-3 sm:px-3.5',
            isCompact ? 'gap-1 pt-2 pb-1' : 'gap-1.5 pt-3 pb-2 sm:px-4 sm:pt-3.5'
          )}
        >
          {/* Drag Overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-xs select-none">
              <div className="rounded-full bg-primary/10 p-2.5 text-primary animate-pulse">
                <ImageIcon className="size-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-ui-sm font-semibold text-foreground">Drop files or images here</span>
                <span className="text-ui-xs text-muted-foreground">Attach to task prompt</span>
              </div>
            </div>
          )}

          {/* Attached Files Badges */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-1.5">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-accent/40 px-2 py-1 text-ui-xs text-foreground group transition-colors hover:bg-accent/70"
                >
                  {file.isImage && file.previewUrl ? (
                    <img
                      src={file.previewUrl}
                      alt={file.name}
                      className="size-6 rounded object-cover border border-border/60 shrink-0"
                    />
                  ) : (
                    <FileText className="size-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className="max-w-[140px] truncate font-medium">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-surface hover:text-destructive cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* At-mention popup menu */}
          {atOpen && atItems.length > 0 && (
            <AtMentionMenu items={atItems} index={atIndex} onSelect={applyAtMention} />
          )}

          {/* Slash commands popup menu */}
          {slashOpen && filteredSlash.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 z-40 mb-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl divide-y divide-border/40">
              <div className="flex items-center justify-between px-3 py-1.5 text-2xs font-semibold text-muted-foreground select-none">
                <span>Slash Commands & Actions</span>
                <span className="font-mono text-3xs">{filteredSlash.length} available</span>
              </div>
              <div className="py-0.5">
                {filteredSlash.map((it, i) => (
                  <button
                    key={it.name}
                    type="button"
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-ui-xs transition-colors select-none',
                      i === slashIndex ? 'bg-primary/10 text-primary dark:bg-card/60' : 'text-foreground hover:bg-surface-hover'
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applySlash(it);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono font-semibold">{it.name}</span>
                      <span className="truncate text-muted-foreground">{it.description}</span>
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-3xs font-medium uppercase text-muted-foreground">
                      {it.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Auto-growing Textarea */}
          <textarea
            ref={textareaRef}
            rows={isCompact ? 1 : 2}
            autoFocus={autoFocus}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              updateSlashState();
              updateAtState();
            }}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? 'Keep typing to queue follow-up changes...' : placeholder}
            className={cn(
              'w-full resize-none border-0 bg-transparent font-sans leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none',
              isCompact ? 'min-h-[30px] text-ui-sm' : 'min-h-[44px] text-ui-base'
            )}
          />
        </div>

        {/* Composer Footer Bar */}
        <div
          className={cn(
            'flex min-w-0 items-center justify-between px-3 sm:px-3.5',
            isCompact ? 'gap-1.5 pb-2 pt-0.5' : 'gap-2 pb-2.5 pt-1 sm:px-4'
          )}
        >
          {/* Left Controls Tray */}
          <div className="relative flex min-w-0 flex-1 items-center gap-1 overflow-visible">
            {/* [+] Context Button */}
            <div className="relative shrink-0">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  setIsContextOpen((v) => !v);
                  setActiveSubMenu(null);
                  setIsModeOpen(false);
                  setIsAgentPickerOpen(false);
                  setIsModelPickerOpen(false);
                  setIsEffortPickerOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={isContextOpen}
                pressed={isContextOpen}
                title="Add context (@)"
                className="w-7 justify-center px-0"
              >
                <Plus className="size-4" />
              </ComposerControl>

              {/* Context Dropdown Popover */}
              {isContextOpen && (
                <ComposerMenu label="Add context" className="absolute bottom-full left-0 mb-2 w-56">
                  {/* Files Submenu */}
                  <div className="relative">
                    <button
                      type="button"
                      onMouseEnter={() => setActiveSubMenu('files')}
                      onClick={() => setActiveSubMenu((p) => (p === 'files' ? null : 'files'))}
                      className="flex min-h-7 w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1 text-left text-ui-sm text-foreground outline-none transition-colors hover:bg-accent"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span>Files</span>
                      </span>
                      <ChevronRight className="size-3 text-muted-foreground" />
                    </button>

                    {activeSubMenu === 'files' && (
                      <div className="absolute left-full top-0 z-50 ml-1 max-h-56 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-2xl">
                        {['src/App.tsx', 'src/router.ts', 'package.json', 'README.md'].map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => insertContextTag(`file:${f}`)}
                            className="flex min-h-7 w-full cursor-pointer items-center gap-2 truncate rounded-sm px-2 py-1 text-left font-mono text-ui-xs text-foreground outline-none transition-colors hover:bg-accent"
                          >
                            <FileText className="size-3 shrink-0 text-emerald-500" />
                            <span className="truncate">{f}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Skills */}
                  <button
                    type="button"
                    onClick={() => insertContextTag('skills')}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-ui-sm text-foreground outline-none transition-colors hover:bg-accent"
                  >
                    <Bot className="size-3.5 text-muted-foreground" />
                    <span>Skills catalog</span>
                  </button>

                  {/* MCP Tools */}
                  <button
                    type="button"
                    onClick={() => insertContextTag('mcp')}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-ui-sm text-foreground outline-none transition-colors hover:bg-accent"
                  >
                    <Wrench className="size-3.5 text-muted-foreground" />
                    <span>MCP Tools ({mcps.length})</span>
                  </button>

                  {/* Git */}
                  <button
                    type="button"
                    onClick={() => insertContextTag('git')}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-ui-sm text-foreground outline-none transition-colors hover:bg-accent"
                  >
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    <span>Git Status & Diff</span>
                  </button>

                  {/* Terminal */}
                  <button
                    type="button"
                    onClick={() => insertContextTag('terminal')}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-ui-sm text-foreground outline-none transition-colors hover:bg-accent"
                  >
                    <Terminal className="size-3.5 text-muted-foreground" />
                    <span>Terminal Session</span>
                  </button>

                  <div className="mx-1 my-1 h-px bg-border/50" />

                  {/* Attach File */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-ui-sm text-foreground outline-none transition-colors hover:bg-accent"
                  >
                    <Upload className="size-3.5 text-muted-foreground" />
                    <span>Attach Local File</span>
                  </button>
                </ComposerMenu>
              )}
            </div>

            {/* Permission Mode Selector Chip */}
            <div className="relative shrink-0">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  setIsModeOpen((v) => !v);
                  setIsContextOpen(false);
                  setIsAgentPickerOpen(false);
                  setIsModelPickerOpen(false);
                  setIsEffortPickerOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={isModeOpen}
                pressed={isModeOpen}
                className={cn('min-w-0', isFullAccess && 'text-amber-500 dark:text-amber-400')}
                title={`Permission mode: ${currentMode.label}`}
              >
                <currentMode.icon className="size-3.5" />
                <span className="truncate text-ui-xs leading-none">{currentMode.short}</span>
                <ComposerChevron size={chipSize} />
              </ComposerControl>

              {isModeOpen && (
                <ComposerMenu label="Permission mode" className="absolute bottom-full left-0 mb-2 w-64">
                  <ComposerMenuLabel>Permission Mode</ComposerMenuLabel>
                  {MODES.map((m) => {
                    const isSelected = m.id === executionMode;
                    const ModeIco = m.icon;
                    return (
                      <ComposerMenuItem
                        key={m.id}
                        role="menuitemradio"
                        selected={isSelected}
                        onClick={() => {
                          setExecutionMode(m.id);
                          setIsModeOpen(false);
                        }}
                        className="items-start gap-2.5 py-1.5"
                      >
                        <ModeIco className="mt-0.5 size-4 shrink-0 opacity-80" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between text-ui-sm font-medium">
                            <span>{m.label}</span>
                            {isSelected && <ComposerMenuCheck />}
                          </span>
                          <span className="mt-0.5 block text-ui-xs leading-snug text-muted-foreground">
                            {m.desc}
                          </span>
                        </span>
                      </ComposerMenuItem>
                    );
                  })}
                </ComposerMenu>
              )}
            </div>

            {/* Agent Orchestrator Picker */}
            <div className="relative shrink min-w-[36px] max-w-[130px] sm:max-w-[160px]">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  setIsAgentPickerOpen((v) => !v);
                  setIsContextOpen(false);
                  setIsModeOpen(false);
                  setIsModelPickerOpen(false);
                  setIsEffortPickerOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={isAgentPickerOpen}
                pressed={isAgentPickerOpen}
                className="w-full shrink items-center justify-between gap-1 px-1.5 sm:px-2"
                title={`Agent Orchestrator: ${composerTarget?.kind === 'acp' ? (acpAgents.find((a) => a.id === composerTarget.id)?.name || composerTarget.id) : (activeAgent?.name || 'Agent')}`}
              >
                {composerTarget?.kind === 'acp' ? (
                  <ProviderIcon provider={composerTarget.id} size={14} className="size-3.5 shrink-0" />
                ) : activeAgent?.avatar ? (
                  <GrokAvatar id={activeAgent.avatar} size={14} className="size-3.5 shrink-0" />
                ) : (
                  <ProviderIcon provider="forge-ade" size={14} className="size-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-left text-ui-xs leading-none">
                  {composerTarget?.kind === 'acp'
                    ? (acpAgents.find((a) => a.id === composerTarget.id)?.name || composerTarget.id)
                    : (activeAgent?.name || 'Agent')}
                </span>
                <ComposerChevron size={chipSize} className="shrink-0" />
              </ComposerControl>

              {isAgentPickerOpen && (
                <ComposerMenu label="Select Agent Orchestrator" className="absolute bottom-full left-0 mb-2 max-h-80 w-72 overflow-y-auto">
                  <ComposerMenuLabel className="flex items-center justify-between">
                    <span>Agent Orchestrators</span>
                    <span className="text-3xs font-normal text-muted-foreground">Native / ACP</span>
                  </ComposerMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    {agents.map((ag) => {
                      const isSelected = (!composerTarget || composerTarget.kind === 'native') && ag.id === activeAgent?.id;
                      return (
                        <ComposerMenuItem
                          key={ag.id}
                          selected={isSelected}
                          onClick={() => {
                            setActiveAgent(ag);
                            setComposerTarget({ kind: 'native', id: ag.id, model: ag.model });
                            if (ag.model) setActiveModel(ag.model);
                            setIsAgentPickerOpen(false);

                            // If in an active task session and switching away to a different agent, start new task with this agent
                            if (sessionId) {
                              const curr = sessions.find((s) => s.id === sessionId);
                              const meta = curr ? parseSessionMetadata(curr) : {};
                              if (meta.engine === 'acp' || (curr?.agentId && curr.agentId !== ag.id)) {
                                openNewTask({ kind: 'native', agentId: ag.id });
                              }
                            }
                          }}
                          className="items-start justify-between gap-2 p-2"
                        >
                          <span className="flex min-w-0 items-start gap-2.5">
                            <GrokAvatar id={ag.avatar || ag.id} size={18} className="mt-0.5 shrink-0" />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-ui-xs font-medium">{ag.name}</span>
                              <span className="mt-0.5 line-clamp-1 text-3xs text-muted-foreground">
                                {ag.description || ag.role || ag.systemPrompt?.slice(0, 50)}
                              </span>
                            </span>
                          </span>
                          {isSelected && <ComposerMenuCheck className="ml-2" />}
                        </ComposerMenuItem>
                      );
                    })}

                    {acpAgents.length > 0 && (
                      <>
                        <ComposerMenuLabel className="mt-1 border-t border-border/40 pt-1">
                          External ACP Agents
                        </ComposerMenuLabel>
                        {acpAgents.map((acp) => {
                          const isSelected = composerTarget?.kind === 'acp' && composerTarget?.id === acp.id;
                          return (
                            <ComposerMenuItem
                              key={acp.id}
                              selected={isSelected}
                              disabled={!acp.available}
                              onClick={() => {
                                if (!acp.available) return;
                                setComposerTarget({
                                  kind: 'acp',
                                  id: acp.id,
                                  model: acp.defaultModel,
                                });
                                if (acp.defaultModel) {
                                  setActiveModel(acp.defaultModel);
                                }
                                setIsAgentPickerOpen(false);

                                // If in an active task session and switching away to a different ACP agent (or from native)
                                if (sessionId) {
                                  const curr = sessions.find((s) => s.id === sessionId);
                                  const meta = curr ? parseSessionMetadata(curr) : {};
                                  if (meta.engine !== 'acp' || meta.acpAgent !== acp.id) {
                                    openNewTask({ kind: 'acp', agentId: acp.id });
                                  }
                                }
                              }}
                              className={`items-start justify-between gap-2 p-2 ${!acp.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span className="flex min-w-0 items-start gap-2.5">
                                <ProviderIcon provider={acp.id} size={18} className="mt-0.5 shrink-0" />
                                <span className="flex min-w-0 flex-col">
                                  <span className="flex items-center gap-1.5 truncate text-ui-xs font-medium">
                                    <span>{acp.name}</span>
                                    {acp.available ? (
                                      <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" title="Available on this computer" />
                                    ) : (
                                      <span className="text-4xs text-muted-foreground font-normal">(not installed)</span>
                                    )}
                                  </span>
                                  <span className="mt-0.5 line-clamp-1 text-3xs text-muted-foreground">
                                    {acp.description || `Command: ${acp.command}`}
                                  </span>
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="rounded bg-primary/10 px-1 py-0.5 font-mono text-4xs font-bold uppercase text-primary">
                                  ACP
                                </span>
                                {isSelected && <ComposerMenuCheck className="ml-1" />}
                              </span>
                            </ComposerMenuItem>
                          );
                        })}
                      </>
                    )}
                  </div>
                </ComposerMenu>
              )}
            </div>

            {/* Model Selector Chip */}
            <div className="relative shrink min-w-[36px] max-w-[130px] sm:max-w-[160px]">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  setIsModelPickerOpen((v) => !v);
                  setIsContextOpen(false);
                  setIsModeOpen(false);
                  setIsAgentPickerOpen(false);
                  setIsEffortPickerOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={isModelPickerOpen}
                pressed={isModelPickerOpen}
                className="w-full shrink items-center justify-between gap-1 px-1.5 sm:px-2"
                title={`Model: ${currentModelName}`}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-left text-ui-xs leading-none">
                  {currentModelName.split('/').pop()?.split(':')?.[0] || 'Model'}
                </span>
                <ComposerChevron size={chipSize} className="shrink-0" />
              </ComposerControl>

              {isModelPickerOpen && (
                <ComposerMenu label="Select Model" className="absolute bottom-full left-0 mb-2 max-h-80 w-72 overflow-y-auto">
                  {isAcpTarget && activeAcpAgent ? (
                    <div>
                      <ComposerMenuLabel className="flex items-center justify-between normal-case text-primary font-medium">
                        <span>{activeAcpAgent.name} Models</span>
                        <span className="rounded bg-primary/15 px-1 py-0.5 font-mono text-4xs font-bold uppercase text-primary">
                          ACP Native
                        </span>
                      </ComposerMenuLabel>
                      <div className="flex flex-col gap-0.5">
                        {(activeAcpAgent.supportedModels || []).map((m: string) => {
                          const isSelected = m === currentModelName;
                          return (
                            <ComposerMenuItem
                              key={`acp-model-${m}`}
                              selected={isSelected}
                              onClick={() => {
                                setActiveModel(m);
                                if (composerTarget) {
                                  setComposerTarget({ ...composerTarget, model: m });
                                }
                                setIsModelPickerOpen(false);
                              }}
                              className="justify-between"
                            >
                              <span className="truncate font-mono">{m}</span>
                              {isSelected && <ComposerMenuCheck />}
                            </ComposerMenuItem>
                          );
                        })}
                      </div>
                      <div className="mt-2 border-t border-border/40 px-1 pb-1 pt-2">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const val = customModelInput.trim();
                            if (val) {
                              setActiveModel(val);
                              if (composerTarget) {
                                setComposerTarget({ ...composerTarget, model: val });
                              }
                              setCustomModelInput('');
                              setIsModelPickerOpen(false);
                            }
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={customModelInput}
                            onChange={(e) => setCustomModelInput(e.target.value)}
                            placeholder="Custom model..."
                            className="min-w-0 flex-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-ui-xs text-foreground focus:border-primary focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!customModelInput.trim()}
                            className="rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
                          >
                            Set
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <ComposerMenuLabel>Available Models</ComposerMenuLabel>
                      <div className="flex flex-col gap-0.5">
                        {availableModels.length === 0 ? (
                          ['gemini-2.5-flash', 'claude-3-7-sonnet', 'gpt-4o', 'deepseek-r1'].map((m) => {
                            const isSelected = m === currentModelName;
                            return (
                              <ComposerMenuItem
                                key={m}
                                selected={isSelected}
                                onClick={() => {
                                  setActiveModel(m);
                                  setIsModelPickerOpen(false);
                                }}
                                className="justify-between"
                              >
                                <span className="truncate font-mono">{m}</span>
                                {isSelected && <ComposerMenuCheck />}
                              </ComposerMenuItem>
                            );
                          })
                        ) : (
                          availableModels.map((opt) => {
                            const isSelected = opt.id === currentModelName;
                            return (
                              <ComposerMenuItem
                                key={opt.id}
                                selected={isSelected}
                                onClick={() => {
                                  setActiveModel(opt.id);
                                  setIsModelPickerOpen(false);
                                }}
                                className="justify-between"
                              >
                                <span className="truncate font-mono">{opt.id}</span>
                                {isSelected && <ComposerMenuCheck />}
                              </ComposerMenuItem>
                            );
                          })
                        )}
                      </div>
                      <div className="mt-2 border-t border-border/40 px-1 pb-1 pt-2">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const val = customModelInput.trim();
                            if (val) {
                              setActiveModel(val);
                              setCustomModelInput('');
                              setIsModelPickerOpen(false);
                            }
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={customModelInput}
                            onChange={(e) => setCustomModelInput(e.target.value)}
                            placeholder="Custom model..."
                            className="min-w-0 flex-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-ui-xs text-foreground focus:border-primary focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!customModelInput.trim()}
                            className="rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
                          >
                            Set
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </ComposerMenu>
              )}
            </div>

            {/* Thinking Effort Selector */}
            <div className="relative shrink-0">
              <ComposerControl
                size={chipSize}
                onClick={() => {
                  setIsEffortPickerOpen((v) => !v);
                  setIsContextOpen(false);
                  setIsModeOpen(false);
                  setIsAgentPickerOpen(false);
                  setIsModelPickerOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={isEffortPickerOpen}
                pressed={isEffortPickerOpen}
                className={cn(
                  'shrink-0 gap-1 px-1.5 sm:px-2 font-normal',
                  currentReasoning.id !== 'off' ? 'text-primary' : 'text-muted-foreground'
                )}
                title={`Thinking effort: ${currentReasoning.label}`}
              >
                <Brain className="size-3.5 shrink-0" />
                <span className="hidden sm:inline truncate text-ui-xs leading-none">
                  {currentReasoning.label}
                </span>
                <ComposerChevron size={chipSize} className="shrink-0" />
              </ComposerControl>

              {isEffortPickerOpen && (
                <ComposerMenu label="Thinking Effort" className="absolute bottom-full right-0 mb-2 w-60">
                  <ComposerMenuLabel>Thinking Effort</ComposerMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    {REASONING_LEVELS.map((r) => {
                      const isSelected = r.id === currentReasoning.id;
                      return (
                        <ComposerMenuItem
                          key={r.id}
                          role="menuitemradio"
                          selected={isSelected}
                          onClick={() => {
                            setReasoningLevel(r.id);
                            setIsEffortPickerOpen(false);
                          }}
                          className="justify-between"
                        >
                          <span className="flex flex-col">
                            <span className="text-ui-sm font-medium">{r.label}</span>
                            <span className="text-3xs text-muted-foreground">{r.desc}</span>
                          </span>
                          {isSelected && <ComposerMenuCheck className="ml-2" />}
                        </ComposerMenuItem>
                      );
                    })}
                  </div>
                </ComposerMenu>
              )}
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="relative flex shrink-0 items-center gap-1.5 ml-auto">
            {/* Context Gauge SVG */}
            <button
              type="button"
              onClick={() => setIsUsageContextOpen((v) => !v)}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-accent transition-colors"
              title="Context Window Usage"
            >
              <svg className="size-3.5 -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-border"
                  strokeWidth="5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-500"
                  strokeWidth="5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  strokeDasharray="18, 100"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </button>

            {isUsageContextOpen && (
              <ComposerMenu label="Context Window" className="absolute bottom-full right-0 mb-2 w-56 p-3">
                <div className="flex flex-col gap-1">
                  <div className="text-ui-xs font-medium text-muted-foreground">Context Window</div>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-ui-sm font-semibold text-foreground">
                      18.4K <span className="text-ui-xs text-muted-foreground">/ 1M</span>
                    </span>
                    <span className="font-mono text-ui-xs text-emerald-500 font-medium">1.8%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-accent">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: '1.8%' }} />
                  </div>
                </div>
              </ComposerMenu>
            )}

            {/* Send / Stop Buttons */}
            {isRunning ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Stop task"
                  className={cn(
                    'flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-xs transition-colors hover:bg-destructive/90',
                    isCompact ? 'size-7' : 'size-8'
                  )}
                  title="Stop execution"
                >
                  <Square className={isCompact ? 'size-2.5 fill-current' : 'size-3 fill-current'} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim() && attachedFiles.length === 0}
                aria-label="Send message"
                className={cn(
                  'relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-message-action text-message-action-foreground shadow-xs transition-all duration-150 hover:scale-105 hover:bg-message-action-hover active:scale-100 disabled:pointer-events-none disabled:opacity-40 disabled:hover:scale-100',
                  isCompact ? 'size-7' : 'size-8'
                )}
                title="Send instruction (Enter)"
              >
                <ArrowUp className={isCompact ? 'size-3.5' : 'size-4'} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stacked Context Strip below input */}
      {showContextStrip && (
        <div className="mx-auto -mt-px w-14/15 min-w-0 rounded-b-xl border border-t-0 border-border/40 bg-chrome/40 px-3 py-1 text-2xs text-muted-foreground">
          <div className="flex min-h-7 w-full items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Folder className="size-3 shrink-0 text-primary" />
              <span className="truncate font-mono">
                {activeWorkspacePath?.split('/').pop() || 'Workspace'}
              </span>
            </div>
            <div className="flex items-center shrink-0">
              <BranchSelector align="end" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentTaskInputBar;
