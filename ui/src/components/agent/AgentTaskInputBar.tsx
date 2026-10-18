import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  ShieldAlert,
  ShieldCheck,
  Hand,
  Plus,
  ChevronDown,
  Brain,
  Sparkles,
  Paperclip,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { AgentExecutionMode, AgentReasoningLevel } from '../../types';

interface AgentTaskInputBarProps {
  onSendMessage: (text: string) => void;
  onStopGeneration?: () => void;
  isGenerating?: boolean;
  placeholder?: string;
}

const MODES: { id: AgentExecutionMode; label: string; desc: string; icon: any }[] = [
  {
    id: 'bypass',
    label: 'Full access',
    desc: 'Unrestricted execution of tools, terminal commands, and edits',
    icon: ShieldAlert,
  },
  {
    id: 'code',
    label: 'Approve edits',
    desc: 'Edits files freely, asks before running external scripts',
    icon: ShieldCheck,
  },
  {
    id: 'ask',
    label: 'Ask for approval',
    desc: 'Always prompts before running file changes or shell tools',
    icon: Hand,
  },
];

const REASONING_LEVELS: { id: AgentReasoningLevel; label: string }[] = [
  { id: 'off', label: 'Thinking: Off' },
  { id: 'low', label: 'Thinking: Low' },
  { id: 'medium', label: 'Thinking: Medium' },
  { id: 'high', label: 'Thinking: High' },
];

export const AgentTaskInputBar: React.FC<AgentTaskInputBarProps> = ({
  onSendMessage,
  onStopGeneration,
  isGenerating = false,
  placeholder = 'Ask for follow-up changes...',
}) => {
  const {
    availableModels,
    activeModel,
    setActiveModel,
    defaultModel,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<AgentExecutionMode>('bypass');
  const [selectedReasoning, setSelectedReasoning] = useState<AgentReasoningLevel>('low');

  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isReasoningDropdownOpen, setIsReasoningDropdownOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setIsModeDropdownOpen(false);
      }
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (reasoningRef.current && !reasoningRef.current.contains(e.target as Node)) {
        setIsReasoningDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resize textarea
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isGenerating) {
      onStopGeneration?.();
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const currentModeObj = MODES.find((m) => m.id === selectedMode) || MODES[0];
  const ModeIcon = currentModeObj.icon;

  const currentModelName = activeModel || defaultModel || 'gpt-4o';
  const displayModel = currentModelName.split('/').pop()?.split(':')?.[0] || 'Model';

  const currentReasoningLabel =
    REASONING_LEVELS.find((r) => r.id === selectedReasoning)?.label || 'Thinking: Low';

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4">
      <div className="relative rounded-[16px] bg-[#FFFFFF] dark:bg-[#18181A] border border-line shadow-2xl transition-all focus-within:border-[#007AFF] focus-within:ring-1 focus-within:ring-[#007AFF]/30">
        {/* Text Input Area */}
        <div className="p-3">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent text-hi text-[13px] leading-relaxed resize-none focus:outline-none placeholder:text-dim font-sans custom-scrollbar min-h-[38px] max-h-[180px]"
          />
        </div>

        {/* Bottom Action Controls */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-line/40 text-xs">
          {/* Left Pill Controls */}
          <div className="flex items-center gap-1.5">
            {/* Quick action / attach button */}
            <button
              type="button"
              className="p-1.5 rounded-[6px] hover:bg-white/10 text-mid hover:text-hi transition-colors"
              title="Add context or prompt starter"
              onClick={() => {
                setInput((prev) =>
                  prev
                    ? prev + ' --format deck'
                    : 'Create a modern presentation deck with 8 slides using Open Design system.'
                );
                adjustHeight();
              }}
            >
              <Plus size={15} />
            </button>

            {/* Permission Mode Pill */}
            <div className="relative" ref={modeRef}>
              <button
                type="button"
                onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-raised hover:bg-white/10 text-mid hover:text-hi border border-line/60 transition-colors"
              >
                <ModeIcon size={13} className="text-[#007AFF]" />
                <span className="text-[11px] font-medium">{currentModeObj.label}</span>
                <ChevronDown size={11} className="text-dim" />
              </button>

              {isModeDropdownOpen && (
                <div className="absolute left-0 bottom-full mb-1.5 w-64 rounded-[8px] bg-panel border border-line shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-dim tracking-wider">
                    Execution Permissions
                  </div>
                  {MODES.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setSelectedMode(mode.id);
                          setIsModeDropdownOpen(false);
                        }}
                        className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors ${
                          selectedMode === mode.id ? 'text-[#007AFF]' : 'text-mid'
                        }`}
                      >
                        <Icon size={14} className="mt-0.5 shrink-0" />
                        <div>
                          <div className="text-[11px] font-semibold">{mode.label}</div>
                          <div className="text-[10px] text-dim">{mode.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pandu-Mikro Neural Reflex Badge */}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-[6px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono cursor-default shadow-xs"
              title="Pandu-Mikro In-Process Neural Engine (<40µs reflex, zero API cost)"
            >
              <Zap size={11} className="text-emerald-400 shrink-0" />
              <span className="font-semibold text-[11px]">Pandu-Mikro</span>
              <span className="text-[9px] opacity-75 hidden sm:inline">24µs</span>
            </div>
          </div>

          {/* Right Controls: Model, Reasoning Effort & Send */}
          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <div className="relative" ref={modelRef}>
              <button
                type="button"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] hover:bg-white/10 text-mid hover:text-hi text-[11px] font-mono transition-colors"
                title={currentModelName}
              >
                <Sparkles size={12} className="text-amber-400" />
                <span className="max-w-[120px] truncate">{displayModel}</span>
                <ChevronDown size={11} className="text-dim" />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-1.5 w-56 rounded-[8px] bg-panel border border-line shadow-xl py-1 z-50 max-h-56 overflow-y-auto custom-scrollbar">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-dim tracking-wider">
                    Select Model
                  </div>
                  {availableModels.length > 0 ? (
                    availableModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setActiveModel(m.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[11px] hover:bg-white/5 font-mono ${
                          activeModel === m.id ? 'text-[#007AFF] font-bold' : 'text-mid'
                        }`}
                      >
                        <span className="truncate">{m.name || m.id}</span>
                        {activeModel === m.id && <span className="text-xs">✓</span>}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-dim">Using configured default</div>
                  )}
                </div>
              )}
            </div>

            {/* Reasoning Effort Selector */}
            <div className="relative" ref={reasoningRef}>
              <button
                type="button"
                onClick={() => setIsReasoningDropdownOpen(!isReasoningDropdownOpen)}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-[6px] hover:bg-white/10 text-mid hover:text-hi text-[11px] transition-colors"
              >
                <Brain size={12} className="text-cyan-400" />
                <span>{currentReasoningLabel}</span>
                <ChevronDown size={11} className="text-dim" />
              </button>

              {isReasoningDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-1.5 w-44 rounded-[8px] bg-panel border border-line shadow-xl py-1 z-50">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-dim tracking-wider">
                    Reasoning Effort
                  </div>
                  {REASONING_LEVELS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedReasoning(r.id);
                        setIsReasoningDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[11px] hover:bg-white/5 ${
                        selectedReasoning === r.id ? 'text-[#007AFF] font-bold' : 'text-mid'
                      }`}
                    >
                      <span>{r.label}</span>
                      {selectedReasoning === r.id && <span className="text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Circular Send / Stop Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isGenerating && !input.trim()}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                isGenerating
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : input.trim()
                  ? 'bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-sm'
                  : 'bg-white/10 text-dim cursor-not-allowed'
              }`}
              title={isGenerating ? 'Stop generation' : 'Send prompt (Enter)'}
            >
              {isGenerating ? <Square size={12} fill="currentColor" /> : <ArrowUp size={14} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
