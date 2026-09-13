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
      pillBg: 'bg-[#EBF5FF]',
      pillText: 'text-[#007AFF]',
      label: 'RUNNING',
      icon: <Loader2 size={12} className="animate-spin text-[#007AFF]" />,
    },
    success: {
      pillBg: 'bg-[#E8F8EE]',
      pillText: 'text-[#16A34A]',
      label: 'SUCCESS',
      icon: <CheckCircle2 size={12} className="text-[#16A34A]" />,
    },
    error: {
      pillBg: 'bg-[#FEE2E2]',
      pillText: 'text-[#DC2626]',
      label: 'ERROR',
      icon: <AlertCircle size={12} className="text-[#DC2626]" />,
    },
    denied: {
      pillBg: 'bg-[#FFF5EB]',
      pillText: 'text-[#D97706]',
      label: 'POLICY DENIED',
      icon: <ShieldAlert size={12} className="text-[#D97706]" />,
    },
  };

  const currentStatus = toolCall.status || 'success';
  const currentConfig = statusConfig[currentStatus] || statusConfig.success;

  return (
    <div className="border border-[#E5E7EB] rounded-[8px] my-2 overflow-hidden bg-[#FFFFFF] shadow-sm transition-all">
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#FFFFFF] hover:bg-[#F7F7F5] cursor-pointer text-xs select-none transition-colors"
      >
        <div className="flex items-center gap-2.5 font-medium text-[#0F0F0F]">
          <div className="p-1 rounded bg-[#F7F7F5] border border-[#E5E7EB] text-[#8A8A85]">
            <Terminal size={12} />
          </div>
          <span className="font-mono text-[#0F0F0F] font-semibold text-[12px]">{toolCall.tool}</span>
          {toolCall.durationMs !== undefined && (
            <span className="text-[11px] text-[#8A8A85] font-mono">({toolCall.durationMs}ms)</span>
          )}
          {isRunning && (
            <span className="text-[11px] text-[#007AFF] italic font-sans flex items-center gap-1">
              Executing in workspace...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-[4px] font-funnel font-bold flex items-center gap-1.5 ${currentConfig.pillBg} ${currentConfig.pillText}`}
          >
            {currentConfig.icon}
            <span>{currentConfig.label}</span>
          </span>
          {isOpen ? (
            <ChevronDown size={14} className="text-[#8A8A85]" />
          ) : (
            <ChevronRight size={14} className="text-[#8A8A85]" />
          )}
        </div>
      </div>

      {/* Expandable Body */}
      {isOpen && (
        <div className="px-3.5 py-3 border-t border-[#E5E7EB] bg-[#F7F7F5] font-mono text-[11px] space-y-2.5 text-[#333333]">
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <div className="text-[#8A8A85] text-[10px] uppercase tracking-wider mb-1 font-funnel font-bold">
                Arguments
              </div>
              <pre className="bg-[#FFFFFF] p-2.5 rounded-[6px] border border-[#E5E7EB] overflow-x-auto text-[#0F0F0F] custom-scrollbar text-[11px]">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="text-[#8A8A85] text-[10px] uppercase tracking-wider mb-1 font-funnel font-bold flex items-center justify-between">
              <span>Output</span>
              {isRunning && (
                <span className="text-[10px] text-[#007AFF] font-normal animate-pulse font-mono">
                  streaming output...
                </span>
              )}
            </div>
            <pre
              className={`bg-[#FFFFFF] p-2.5 rounded-[6px] border border-[#E5E7EB] overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar text-[11px] text-[#333333] ${
                currentStatus === 'error' ? 'text-red-500' : ''
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
