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
      color: 'bg-raised text-hi bg-raised animate-pulse',
      label: 'RUNNING',
      icon: <Loader2 size={13} className="animate-spin text-hi" />,
      borderColor: 'bg-raised shadow-sm',
    },
    success: {
      color: 'bg-raised text-hi bg-raised',
      label: 'SUCCESS',
      icon: <CheckCircle2 size={13} className="text-hi" />,
      borderColor: 'border-line',
    },
    error: {
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      label: 'ERROR',
      icon: <AlertCircle size={13} className="text-red-400" />,
      borderColor: 'border-red-500/30',
    },
    denied: {
      color: 'bg-raised text-mid bg-raised',
      label: 'POLICY DENIED',
      icon: <ShieldAlert size={13} className="text-mid" />,
      borderColor: 'bg-raised',
    },
  };

  const currentStatus = toolCall.status || 'success';
  const currentConfig = statusConfig[currentStatus] || statusConfig.success;

  return (
    <div
      className={`border rounded-xl my-2 overflow-hidden bg-inputbg  transition-all ${currentConfig.borderColor}`}
    >
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-inputbg hover:bg-raised cursor-pointer text-xs select-none transition-colors"
      >
        <div className="flex items-center gap-2.5 font-medium text-hi">
          <div className="p-1 rounded bg-raised text-mid">
            <Terminal size={13} />
          </div>
          <span className="font-mono text-hi font-semibold">{toolCall.tool}</span>
          {toolCall.durationMs !== undefined && (
            <span className="text-[11px] text-lo font-mono">({toolCall.durationMs}ms)</span>
          )}
          {isRunning && (
            <span className="text-[11px] text-hi italic font-sans flex items-center gap-1">
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
            <ChevronDown size={14} className="text-mid" />
          ) : (
            <ChevronRight size={14} className="text-mid" />
          )}
        </div>
      </div>

      {/* Expandable Body */}
      {isOpen && (
        <div className="px-3.5 py-3 border-t border-line bg-rail font-mono text-[11px] space-y-2.5 text-mid">
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <div className="text-lo text-[10px] uppercase tracking-wider mb-1 font-sans font-semibold">
                Arguments
              </div>
              <pre className="bg-hoverbg p-2.5 rounded-lg border border-line overflow-x-auto text-hi custom-scrollbar">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="text-lo text-[10px] uppercase tracking-wider mb-1 font-sans font-semibold flex items-center justify-between">
              <span>Output</span>
              {isRunning && (
                <span className="text-[10px] text-hi font-normal animate-pulse font-mono">
                  streaming output...
                </span>
              )}
            </div>
            <pre
              className={`bg-hoverbg p-2.5 rounded-lg border border-line overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar text-mid ${
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
