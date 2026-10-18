import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Folder,
  ChevronDown,
  ChevronRight,
  Code2,
  Terminal,
  Trash2,
  Brain,
  Sparkles,
  Bot,
  User,
  Presentation,
  Video,
  Copy,
  Check,
  RotateCcw,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { SessionMessage, ToolCallRecord, SessionMetadata } from '../../types';
import { sendSocketMessage } from '../../hooks/useAgentSocket';
import { MarkdownView } from '../MarkdownView';
import { ToolExecutionCard } from '../ToolExecutionCard';
import { AgentTaskInputBar } from './AgentTaskInputBar';

interface AgentChatViewProps {
  onOpenPreview?: (filePath: string) => void;
  onToggleSidebarExplorer?: () => void;
}

function parseSessionMeta(metadataStr?: string): SessionMetadata {
  if (!metadataStr) return {};
  try {
    return JSON.parse(metadataStr);
  } catch {
    return {};
  }
}

/**
 * ThinkingAccordion: Replicates Forge ADE's "Worked for 1s >" expandable reasoning block.
 */
const ThinkingAccordion: React.FC<{
  thought: string;
  isGenerating?: boolean;
}> = ({ thought, isGenerating }) => {
  const [isOpen, setIsOpen] = useState(isGenerating);

  if (!thought) return null;

  return (
    <div className="my-2 select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-raised hover:bg-white/10 text-dim hover:text-hi text-xs transition-colors border border-line/60"
      >
        <Brain size={13} className="text-cyan-400 shrink-0" />
        <span className="font-medium text-[11px]">
          {isGenerating ? 'Thinking...' : 'Worked for 1s'}
        </span>
        {isOpen ? (
          <ChevronDown size={12} className="text-dim shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-dim shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-1.5 p-3 rounded-[8px] bg-panel border border-line/70 text-[11px] font-mono text-mid whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar leading-relaxed">
          {thought}
        </div>
      )}
    </div>
  );
};

export const AgentChatView: React.FC<AgentChatViewProps> = ({
  onOpenPreview,
  onToggleSidebarExplorer,
}) => {
  const {
    sessions,
    activeSessionId,
    activeAgentSessionId,
    messages,
    isGenerating,
    thinkingStatus,
    activeWorkspacePath,
    workspacePresets,
    loadWorkspaceInfo,
    switchWorkspace,
    clearSessionMessages,
    deleteSession,
    createAgentSession,
  } = useAppStore();

  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load workspace info on mount
  useEffect(() => {
    loadWorkspaceInfo();
  }, [loadWorkspaceInfo]);

  // Current session
  const currentSessionId = activeAgentSessionId || activeSessionId;
  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === currentSessionId);
  }, [sessions, currentSessionId]);

  useEffect(() => {
    if (currentSession?.title) {
      setTaskTitle(currentSession.title);
    }
  }, [currentSession]);

  // Close workspace dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        workspaceDropdownRef.current &&
        !workspaceDropdownRef.current.contains(e.target as Node)
      ) {
        setIsWorkspaceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const meta = parseSessionMeta(currentSession?.metadata);
  const workspaceName =
    meta.workspaceName ||
    (activeWorkspacePath ? activeWorkspacePath.split('/').filter(Boolean).pop() : 'General');

  const handleSendMessage = (text: string) => {
    sendSocketMessage(text);
  };

  // Detect any generated presentation deck or motion file in messages
  const detectDeckOrMotion = (content: string) => {
    const deckMatch = content.match(/([a-zA-Z0-9_\-./]+\.deck\.html)/i);
    const motionMatch = content.match(/([a-zA-Z0-9_\-./]+\.motion\.html)/i);
    return {
      deck: deckMatch ? deckMatch[1] : null,
      motion: motionMatch ? motionMatch[1] : null,
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-app text-hi relative overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-[50px] shrink-0 border-b border-line px-4 flex items-center justify-between bg-panel select-none z-10">
        {/* Left: Task Title & Workspace Pill */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate text-hi max-w-[280px] md:max-w-md">
              {taskTitle || 'Untitled Task'}
            </span>
          </div>

          {/* Workspace Pill Dropdown */}
          <div className="relative" ref={workspaceDropdownRef}>
            <button
              type="button"
              onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-raised hover:bg-white/10 text-mid hover:text-hi border border-line text-xs transition-colors"
            >
              <span className="text-amber-400">📁</span>
              <span className="font-medium text-[11px] truncate max-w-[140px]">
                {workspaceName}
              </span>
              <ChevronDown size={11} className="text-dim" />
            </button>

            {isWorkspaceDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 rounded-[8px] bg-panel border border-line shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-dim tracking-wider border-b border-line/60">
                  Switch Workspace
                </div>
                <div className="p-2 space-y-1">
                  {workspacePresets.map((preset) => (
                    <button
                      key={preset.path}
                      type="button"
                      onClick={() => {
                        switchWorkspace(preset.path);
                        setIsWorkspaceDropdownOpen(false);
                      }}
                      className={`w-full flex items-start gap-2 p-2 rounded text-left transition-colors ${
                        activeWorkspacePath === preset.path
                          ? 'bg-[#007AFF]/15 text-[#007AFF]'
                          : 'hover:bg-white/5 text-mid'
                      }`}
                    >
                      <Folder size={14} className="mt-0.5 text-amber-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold truncate">{preset.label}</div>
                        <div className="text-[10px] text-dim font-mono truncate">{preset.path}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSidebarExplorer}
            className="p-1.5 rounded-[6px] hover:bg-white/10 text-mid hover:text-hi transition-colors"
            title="Toggle File Explorer"
          >
            <Folder size={15} />
          </button>

          {currentSessionId && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear messages for this task?')) {
                  clearSessionMessages(currentSessionId);
                }
              }}
              className="p-1.5 rounded-[6px] hover:bg-white/10 text-mid hover:text-hi transition-colors"
              title="Clear messages"
            >
              <RotateCcw size={14} />
            </button>
          )}

          {currentSessionId && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this task session?')) {
                  deleteSession(currentSessionId);
                }
              }}
              className="p-1.5 rounded-[6px] hover:bg-red-400/10 text-mid hover:text-red-400 transition-colors"
              title="Delete task"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Main Conversation Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-6 md:px-8 space-y-6">
        {messages.length === 0 ? (
          /* Empty State Starter View */
          <div className="max-w-2xl mx-auto py-12 text-center space-y-6 select-none animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#007AFF] to-blue-600 flex items-center justify-center mx-auto text-white shadow-xl">
              <Bot size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold font-sans text-hi">Agent Workspace</h2>
              <p className="text-xs text-dim mt-1.5 max-w-md mx-auto">
                Dedicated autonomous workspace for multi-step tasks, Open Design presentations,
                HyperFrames motion animations, codebase refactoring, and tool execution.
              </p>
            </div>

            {/* Quick Action Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left pt-2">
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Create an 8-slide modern presentation deck about Autonomous AI Agents using open-design-slides.'
                  )
                }
                className="p-3 rounded-[10px] bg-raised hover:bg-white/10 border border-line/70 transition-all text-xs flex items-start gap-2.5 group"
              >
                <Presentation size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-hi group-hover:text-[#007AFF]">
                    Create Presentation Slides
                  </div>
                  <div className="text-[11px] text-dim mt-0.5">
                    Generate 8 slides with Open Design system into *.deck.html
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Generate a 60 FPS studio HyperFrames motion animation video for a futuristic AI dashboard release.'
                  )
                }
                className="p-3 rounded-[10px] bg-raised hover:bg-white/10 border border-line/70 transition-all text-xs flex items-start gap-2.5 group"
              >
                <Video size={16} className="text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-hi group-hover:text-purple-400">
                    Generate HyperFrames Motion
                  </div>
                  <div className="text-[11px] text-dim mt-0.5">
                    Studio motion graphics with 60 FPS MP4 video export
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Analyze the current codebase structure, inspect dependencies, and propose optimizations.'
                  )
                }
                className="p-3 rounded-[10px] bg-raised hover:bg-white/10 border border-line/70 transition-all text-xs flex items-start gap-2.5 group"
              >
                <Code2 size={16} className="text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-hi group-hover:text-blue-400">
                    Codebase Inspection
                  </div>
                  <div className="text-[11px] text-dim mt-0.5">
                    Scan repository, check test coverage, and inspect architecture
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Run full test suite using terminal exec tool and summarize any failures.'
                  )
                }
                className="p-3 rounded-[10px] bg-raised hover:bg-white/10 border border-line/70 transition-all text-xs flex items-start gap-2.5 group"
              >
                <Terminal size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-hi group-hover:text-emerald-400">
                    Run Shell & Tests
                  </div>
                  <div className="text-[11px] text-dim mt-0.5">
                    Execute workspace commands with real-time streaming output
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const { deck, motion } = detectDeckOrMotion(msg.content);

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-4xl mx-auto ${
                  isUser ? 'justify-end' : 'justify-start'
                }`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#007AFF] to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Bot size={14} />
                  </div>
                )}

                <div
                  className={`flex flex-col min-w-0 max-w-[85%] ${
                    isUser ? 'items-end' : 'items-start flex-1'
                  }`}
                >
                  {/* Thinking Duration Accordion */}
                  {!isUser && msg.thought && (
                    <ThinkingAccordion thought={msg.thought} isGenerating={false} />
                  )}

                  {/* Tool Execution Cards */}
                  {!isUser &&
                    msg.toolCalls &&
                    msg.toolCalls.map((tc) => (
                      <div key={tc.id} className="w-full">
                        <ToolExecutionCard toolCall={tc} />
                      </div>
                    ))}

                  {/* Message Bubble */}
                  <div
                    className={`rounded-[12px] px-4 py-3 text-[13px] leading-relaxed shadow-xs ${
                      isUser
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-panel border border-line text-hi'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap select-text">{msg.content}</p>
                    ) : (
                      <MarkdownView content={msg.content} />
                    )}
                  </div>

                  {/* Open Deck / Motion Interactive Action Pill */}
                  {!isUser && (deck || motion) && (
                    <div className="mt-2.5 flex items-center gap-2">
                      {deck && (
                        <button
                          type="button"
                          onClick={() => onOpenPreview?.(deck)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-medium transition-all shadow-sm"
                        >
                          <Presentation size={14} />
                          <span>Open Presentation Deck ({deck.split('/').pop()})</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
                      {motion && (
                        <button
                          type="button"
                          onClick={() => onOpenPreview?.(motion)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-medium transition-all shadow-sm"
                        >
                          <Video size={14} />
                          <span>Open HyperFrames Studio ({motion.split('/').pop()})</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-raised text-mid border border-line flex items-center justify-center shrink-0 mt-0.5">
                    <User size={14} />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live Generating / Thinking Status */}
        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-dim italic animate-pulse max-w-4xl mx-auto pl-10">
            <span className="size-2 rounded-full bg-[#007AFF] animate-ping" />
            <span>{thinkingStatus || 'Agent is executing task in workspace...'}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Task Input Bar at the Bottom */}
      <div className="shrink-0 pt-2 bg-gradient-to-t from-app via-app/95 to-transparent">
        <AgentTaskInputBar
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          placeholder="Ask for follow-up changes, create slides, generate motions, or write code..."
        />
      </div>
    </div>
  );
};
