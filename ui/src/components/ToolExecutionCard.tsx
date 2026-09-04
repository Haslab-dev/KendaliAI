import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { ToolCallRecord } from '../types';

interface ToolExecutionCardProps {
  toolCall: ToolCallRecord;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({ toolCall }) => {
  const isRunning = toolCall.status === 'running';
  const [isOpen, setIsOpen] = useState(isRunning);

  // Auto-expand when running so user sees real-time action
  useEffect(() => {
    if (isRunning) {
      setIsOpen(true);
    }
  }, [isRunning]);

  const statusConfig = {
    running: {
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/40 animate-pulse',
      label: 'RUNNING',
      icon: <Loader2 size={13} className="animate-spin text-blue-400" />,
      borderColor: 'border-blue-500/40 shadow-sm shadow-blue-500/10',
    },
    success: {
      color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      label: 'SUCCESS',
      icon: <CheckCircle2 size={13} className="text-emerald-400" />,
      borderColor: 'border-[#2e2e2e]',
    },
    error: {
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      label: 'ERROR',
      icon: <AlertCircle size={13} className="text-red-400" />,
      borderColor: 'border-red-500/30',
    },
    denied: {
      color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      label: 'POLICY DENIED',
      icon: <ShieldAlert size={13} className="text-amber-400" />,
      borderColor: 'border-amber-500/30',
    },
  };

  const currentStatus = toolCall.status || 'success';
  const currentConfig = statusConfig[currentStatus] || statusConfig.success;

  return (
    <div
      className={`border rounded-xl my-2 overflow-hidden bg-[#161616] dark:bg-[#161616] light:bg-[#f9f9fa] transition-all ${currentConfig.borderColor}`}
    >
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#1b1b1b] hover:bg-[#222222] cursor-pointer text-xs select-none transition-colors"
      >
        <div className="flex items-center gap-2.5 font-medium text-neutral-200">
          <div className="p-1 rounded bg-[#252525] text-neutral-400">
            <Terminal size={13} />
          </div>
          <span className="font-mono text-neutral-200 font-semibold">{toolCall.tool}</span>
          {toolCall.durationMs !== undefined && (
            <span className="text-[11px] text-neutral-500 font-mono">({toolCall.durationMs}ms)</span>
          )}
          {isRunning && (
            <span className="text-[11px] text-blue-400 italic font-sans flex items-center gap-1">
              Executing in workspace...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 ${currentConfig.color}`}
          >
            {currentConfig.icon}
            <span>{currentConfig.label}</span>
          </span>
          {isOpen ? (
            <ChevronDown size={14} className="text-neutral-400" />
          ) : (
            <ChevronRight size={14} className="text-neutral-400" />
          )}
        </div>
      </div>

      {/* Expandable Body */}
      {isOpen && (
        <div className="px-3.5 py-3 border-t border-[#262626] bg-[#121212] font-mono text-[11px] space-y-2.5 text-neutral-300">
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-1 font-sans font-semibold">
                Arguments
              </div>
              <pre className="bg-[#0b0b0b] p-2.5 rounded-lg border border-[#222222] overflow-x-auto text-emerald-400 custom-scrollbar">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-1 font-sans font-semibold flex items-center justify-between">
              <span>Output</span>
              {isRunning && (
                <span className="text-[10px] text-blue-400 font-normal animate-pulse font-mono">
                  streaming output...
                </span>
              )}
            </div>
            <pre
              className={`bg-[#0b0b0b] p-2.5 rounded-lg border border-[#222222] overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar text-neutral-300 ${
                currentStatus === 'error' ? 'text-red-400' : ''
              }`}
            >
              {toolCall.output || (isRunning ? 'Running capability...' : 'No output returned.')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
