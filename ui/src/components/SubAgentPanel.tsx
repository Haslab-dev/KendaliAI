import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Loader2, Wrench, CircleDot } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { sendPanelInstruction } from '../hooks/useAgentSocket';
import { GrokAvatar } from './GrokAvatar';
import { MarkdownView } from './MarkdownView';
import { ToolExecutionCard } from './ToolExecutionCard';
import { SessionMessage } from '../types';

// Side panel into a background sub-agent session (forge-ade style): shows the
// live process (tool steps + streaming output) and accepts instructions sent
// directly to the sub-agent without leaving the main chat. Subtask sessions
// never render as a main-chat conversation — this panel is the only window.
export const SubAgentPanel: React.FC = () => {
  const {
    subagentPanelSessionId,
    subagentPanelSession,
    subagentPanelMessages,
    closeSubAgentPanel,
    agents,
    tasks,
  } = useAppStore();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const runningTask = useMemo(
    () => tasks.find((t) => t.sessionId === subagentPanelSessionId && t.status === 'running'),
    [tasks, subagentPanelSessionId]
  );

  const lastMsg = subagentPanelMessages[subagentPanelMessages.length - 1];
  const isStreaming = !!lastMsg && lastMsg.id.startsWith('panel-stream-');
  const isWorking = !!runningTask || isStreaming;

  const agent = agents.find((a) => a.id === subagentPanelSession?.agentId);
  const agentName = agent?.name || subagentPanelSession?.title?.replace(/^🛰\s*/, '') || 'Sub-Agent';
  const model = agent?.model || subagentPanelMessages.find((m) => m.model && m.model !== 'subagent')?.model;

  const totalSteps = useMemo(
    () => subagentPanelMessages.reduce((n, m) => n + (m.toolCalls?.length || 0), 0),
    [subagentPanelMessages]
  );

  // Keep the live tail pinned to the bottom while working.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [subagentPanelMessages]);

  if (!subagentPanelSessionId) return null;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendPanelInstruction(subagentPanelSessionId, trimmed);
    setInput('');
  };

  return (
    <div className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 h-full flex-col bg-[#FFFFFF] dark:bg-[#121212] border-l border-[#E5E7EB] dark:border-[#27272A] animate-in slide-in-from-right-4 fade-in duration-150">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#E5E7EB] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#141414] select-none">
        <GrokAvatar id={agent?.avatar || subagentPanelSession?.agentId || 'purple-pebble'} size={30} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-bold text-[#000000] dark:text-white truncate">{agentName}</span>
            {model && (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[#6B7280] dark:text-[#A1A1AA] shrink-0">
                {model}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5">
            {isWorking ? (
              <span className="flex items-center gap-1 text-[#007AFF] font-bold">
                <Loader2 size={9} className="animate-spin" /> RUNNING
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CircleDot size={9} /> IDLE
              </span>
            )}
            {totalSteps > 0 && (
              <span className="text-[#8A8A85] flex items-center gap-1">
                <Wrench size={8} /> {totalSteps} steps
              </span>
            )}
          </div>
        </div>
        <button
          onClick={closeSubAgentPanel}
          className="p-1.5 text-[#8A8A85] hover:text-[#000000] dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          title="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Process tail */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3">
        {subagentPanelMessages.length === 0 && (
          <div className="text-[11px] text-[#8A8A85] text-center py-8 font-geist">
            Loading sub-agent worklog…
          </div>
        )}
        {subagentPanelMessages.map((msg) => (
          <PanelMessage key={msg.id} msg={msg} senderName={agentName} isWorking={isWorking} />
        ))}
      </div>

      {/* Direct instruction input */}
      <div className="shrink-0 px-3 py-2.5 border-t border-[#E5E7EB] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#141414]">
        <div className="flex items-end gap-1.5 bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[14px] px-2.5 py-1.5 focus-within:border-[#007AFF] transition-all">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Instruct ${agentName}…`}
            className="flex-1 bg-transparent text-[12px] text-[#000000] dark:text-white placeholder:text-[#8A8A85] resize-none outline-none py-1 max-h-28 custom-scrollbar"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`p-1.5 rounded-full transition-all shrink-0 ${
              input.trim()
                ? 'text-[#007AFF] hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer'
                : 'text-[#C4C4C0] dark:text-[#3F3F46] cursor-not-allowed'
            }`}
            title="Send instruction to sub-agent"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="text-[9px] text-[#8A8A85] mt-1 px-1 font-mono select-none">
          goes straight to the sub-agent session · Enter to send
        </div>
      </div>
    </div>
  );
};

const PanelMessage: React.FC<{ msg: SessionMessage; senderName: string; isWorking: boolean }> = ({
  msg,
  senderName,
  isWorking,
}) => {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] p-[9px_13px] bg-[#0F0F0F] dark:bg-[#1C1C1E] text-white rounded-[13px] rounded-tr-[4px] text-[12px]/[19px] font-geist whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </div>
    );
  }

  const isEmptyStreaming = !msg.content && !msg.thought && (!msg.toolCalls || msg.toolCalls.length === 0);

  return (
    <div className="flex flex-col gap-1.5">
      {msg.thought && (
        <details className="text-[11px] text-[#8A8A85] group">
          <summary className="cursor-pointer select-none font-mono flex items-center gap-1 hover:text-[#007AFF]">
            reasoning
          </summary>
          <div className="whitespace-pre-wrap mt-1 p-2 bg-[#F7F7F5] dark:bg-[#1A1A1A] rounded-lg border border-[#E5E7EB] dark:border-[#27272A] max-h-40 overflow-y-auto custom-scrollbar">
            {msg.thought}
          </div>
        </details>
      )}

      {/* Process steps */}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="space-y-1.5">
          {msg.toolCalls.map((tc) => (
            <ToolExecutionCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {msg.content && (
        <div className="p-[10px_13px] bg-[#F7F7F5] dark:bg-[#1A1A1A] rounded-[13px] rounded-tl-[4px] border border-[#E5E7EB] dark:border-[#27272A]">
          <MarkdownView content={msg.content} isStreaming={msg.id.startsWith('panel-stream-')} />
        </div>
      )}

      {isEmptyStreaming && isWorking && (
        <div className="flex items-center gap-2 text-[11px] text-[#8A8A85] font-geist px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-bounce" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-bounce [animation-delay:-0.3s]" />
          <span className="ml-1">{senderName} is working…</span>
        </div>
      )}
    </div>
  );
};
