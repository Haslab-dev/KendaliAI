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

  // Computer-use screenshots embed a servable URL in their JSON output.
  const screenshotUrl = (() => {
    if (!toolCall.output || toolCall.status === 'denied') return null;
    const m = toolCall.output.match(/"url"\s*:\s*"([^"]+)"\s*}/);
    return m && m[1] ? m[1] : null;
  })();

  // Auto-expand when running so user sees real-time action
  useEffect(() => {
    if (isRunning) {
      setIsOpen(true);
    }
  }, [isRunning]);

  const statusConfig = {
    running: {
      pillBg: 'bg-info/10',
      pillText: 'text-primary',
      label: 'RUNNING',
      icon: <Loader2 size={12} className="animate-spin text-primary" />,
    },
    success: {
      pillBg: 'bg-success/10',
      pillText: 'text-success',
      label: 'SUCCESS',
      icon: <CheckCircle2 size={12} className="text-success" />,
    },
    error: {
      pillBg: 'bg-destructive/10',
      pillText: 'text-destructive',
      label: 'ERROR',
      icon: <AlertCircle size={12} className="text-destructive" />,
    },
    denied: {
      pillBg: 'bg-warning/10',
      pillText: 'text-warning',
      label: 'POLICY DENIED',
      icon: <ShieldAlert size={12} className="text-warning" />,
    },
  };

  const currentStatus = toolCall.status || 'success';
  const currentConfig = statusConfig[currentStatus] || statusConfig.success;

  return (
    <div className="border border-border rounded-[8px] my-2 overflow-hidden bg-card shadow-sm transition-all">
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-card hover:bg-accent/60 cursor-pointer text-xs select-none transition-colors"
      >
        <div className="flex items-center gap-2.5 font-medium text-foreground">
          <div className="p-1 rounded bg-accent/60 border border-border text-muted-foreground">
            <Terminal size={12} />
          </div>
          <span className="font-mono text-foreground font-semibold text-[12px]">{toolCall.tool}</span>
          {toolCall.durationMs !== undefined && (
            <span className="text-[11px] text-muted-foreground font-mono">({toolCall.durationMs}ms)</span>
          )}
          {isRunning && (
            <span className="text-[11px] text-primary italic font-sans flex items-center gap-1">
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
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expandable Body */}
      {isOpen && (
        <div className="px-3.5 py-3 border-t border-border bg-accent/60 font-mono text-[11px] space-y-2.5 text-foreground/85">
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1 font-funnel font-bold">
                Arguments
              </div>
              <pre className="bg-card p-2.5 rounded-[6px] border border-border overflow-x-auto text-foreground custom-scrollbar text-[11px]">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1 font-funnel font-bold flex items-center justify-between">
              <span>Output</span>
              {isRunning && (
                <span className="text-[10px] text-primary font-normal animate-pulse font-mono">
                  streaming output...
                </span>
              )}
            </div>
            {screenshotUrl && (
              <img
                src={screenshotUrl}
                alt="Screen capture"
                className="mb-2 rounded-[6px] border border-border max-h-80 w-auto custom-scrollbar"
                onClick={() => window.open(screenshotUrl, '_blank')}
                style={{ cursor: 'zoom-in' }}
              />
            )}
            <pre
              className={`bg-card p-2.5 rounded-[6px] border border-border overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar text-[11px] text-foreground/85 ${
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
