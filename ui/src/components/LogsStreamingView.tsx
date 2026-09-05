import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Search,
  ArrowDown,
  Smartphone,
  Globe,
  Wrench,
  Brain,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { GatewayLogEvent } from '../types';

interface LogsStreamingViewProps {
  onClose?: () => void;
}

export const LogsStreamingView: React.FC<LogsStreamingViewProps> = ({ onClose }) => {
  const { logs, loadLogs, clearLogs } = useAppStore();
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initial load of historical logs from backend
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-scroll on incoming logs unless paused or disabled
  useEffect(() => {
    if (autoScroll && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Channel filter
      if (channelFilter !== 'all') {
        const ch = (log.channel || 'web').toLowerCase();
        if (channelFilter === 'telegram' && ch !== 'telegram') return false;
        if (channelFilter === 'web' && ch !== 'web') return false;
      }

      // 2. Category filter
      if (categoryFilter !== 'all') {
        const type = (log.type || '').toLowerCase();
        if (categoryFilter === 'chat' && !type.includes('message')) return false;
        if (categoryFilter === 'tools' && !type.includes('tool')) return false;
        if (categoryFilter === 'thinking' && !type.includes('thinking')) return false;
        if (categoryFilter === 'sessions' && !type.includes('session')) return false;
        if (categoryFilter === 'errors' && !type.includes('failed') && !type.includes('error')) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const jsonStr = JSON.stringify(log).toLowerCase();
        return jsonStr.includes(query);
      }

      return true;
    });
  }, [logs, channelFilter, categoryFilter, searchQuery]);

  // Real-time telemetry counters
  const metrics = useMemo(() => {
    let webCount = 0;
    let telegramCount = 0;
    let toolCount = 0;
    logs.forEach((l) => {
      const ch = (l.channel || 'web').toLowerCase();
      if (ch === 'telegram') telegramCount++;
      else webCount++;
      if (l.type && l.type.includes('tool')) toolCount++;
    });
    return {
      total: logs.length,
      web: webCount,
      telegram: telegramCount,
      tools: toolCount,
    };
  }, [logs]);

  const handleCopyLogs = () => {
    const text = JSON.stringify(filteredLogs, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-rail text-hi overflow-hidden font-mono select-text">
      {/* Header Bar */}
      <header className="h-[52px] border-b border-line bg-rail px-4 flex items-center justify-between z-10 flex-shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-raised text-hi border bg-raised">
              <Terminal size={16} />
            </div>
            <span className="font-bold text-sm text-hi font-sans">
              Gateway Logs Stream
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-raised border bg-raised text-[11px] text-hi font-medium">
            <span className="w-2 h-2 rounded-full bg-hi animate-pulse" />
            <span>{isPaused ? 'PAUSED' : 'LIVE STREAMING'}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-sans transition-colors ${
              isPaused
                ? 'hover:bg-raised text-mid border bg-raised'
                : 'bg-inputbg bg-hoverbg text-mid'
            }`}
            title={isPaused ? 'Resume stream' : 'Pause stream'}
          >
            {isPaused ? <Play size={13} /> : <Pause size={13} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-sans transition-colors ${
              autoScroll
                ? 'hover:bg-raised text-hi border bg-raised'
                : 'bg-inputbg bg-hoverbg text-mid'
            }`}
            title="Auto-scroll to latest event"
          >
            <ArrowDown size={13} />
            <span>Auto-scroll</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-inputbg hover:bg-hoverbg text-mid rounded-lg text-xs font-sans transition-colors"
            title="Copy logs JSON"
          >
            {copied ? <Check size={13} className="text-hi" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Export'}</span>
          </button>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-inputbg hover:bg-hoverbg text-mid hover:text-red-400 rounded-lg text-xs font-sans transition-colors"
            title="Clear logs view"
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>

          {onClose ? (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-mid hover:text-hi hover:bg-raised"
              title="Close Logs"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={() => navigate('chat')}
              className="px-3 py-1.5 bg-hi hover:bg-hi text-app rounded-lg text-xs font-semibold font-sans transition-colors shadow-sm"
            >
              Back to Chat
            </button>
          )}
        </div>
      </header>

      {/* Metrics Counter Strip */}
      <div className="bg-rail border-b border-line px-4 py-2 flex items-center justify-between text-xs text-mid flex-shrink-0 select-none">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="text-lo">Total Events:</span>
            <span className="font-bold text-hi">{metrics.total}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Globe size={13} className="text-hi" />
            <span className="text-lo">Web:</span>
            <span className="font-bold text-hi">{metrics.web}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Smartphone size={13} className="text-hi" />
            <span className="text-lo">Telegram Bot:</span>
            <span className="font-bold text-hi">{metrics.telegram}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wrench size={13} className="text-mid" />
            <span className="text-lo">Tool Calls:</span>
            <span className="font-bold text-mid">{metrics.tools}</span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3">
          {/* Channel Filter */}
          <div className="flex items-center gap-1.5 text-[11px] font-sans">
            <span className="text-lo">Channel:</span>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-inputbg border border-line rounded px-2 py-1 text-hi text-xs outline-none"
            >
              <option value="all">All Channels</option>
              <option value="web">Web UI (web)</option>
              <option value="telegram">Telegram Bot (telegram)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-[11px] font-sans">
            <span className="text-lo">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-inputbg border border-line rounded px-2 py-1 text-hi text-xs outline-none"
            >
              <option value="all">All Events</option>
              <option value="chat">Chat Messages</option>
              <option value="tools">Tool Calls & Results</option>
              <option value="thinking">Thinking / Reasoning</option>
              <option value="sessions">Session Lifecycle</option>
              <option value="errors">Errors & Failures</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-inputbg border border-line rounded text-xs font-sans">
            <Search size={12} className="text-lo" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="bg-transparent text-hi placeholder:text-lo outline-none w-32 font-mono text-[11px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-lo hover:text-hi text-[10px]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Streaming Logs Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-rail">
        {filteredLogs.length === 0 && (
          <div className="py-20 text-center text-xs text-lo font-sans">
            <Terminal size={32} className="mx-auto mb-2 text-lo" />
            <div>No events recorded yet in stream.</div>
            <div className="text-[11px] text-lo mt-1">
              Send a message in Web Chat or to your Telegram Bot (@haslabai_bots) to see real-time streaming telemetry!
            </div>
          </div>
        )}

        {filteredLogs.map((log, idx) => {
          const isExpanded = expandedLogId === (log.id || `idx-${idx}`);
          const ch = (log.channel || 'web').toLowerCase();
          const isTelegram = ch === 'telegram';

          // Format timestamp
          let timeStr = '';
          try {
            const date = log.timestamp ? new Date(log.timestamp) : new Date();
            timeStr = date.toTimeString().split(' ')[0] + '.' + String(date.getMilliseconds()).padStart(3, '0');
          } catch {
            timeStr = '--:--:--.---';
          }

          return (
            <div
              key={log.id || idx}
              className="border hover:border-line hover:border-line bg-rail rounded-lg p-2.5 transition-colors text-xs space-y-1.5"
            >
              {/* Event Header Row */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Timestamp */}
                  <span className="text-lo select-none font-mono">[{timeStr}]</span>

                  {/* Channel Badge */}
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider border ${
                      isTelegram
                        ? 'bg-raised text-hi bg-raised'
                        : 'bg-raised text-hi bg-raised'
                    }`}
                  >
                    {isTelegram ? <Smartphone size={10} /> : <Globe size={10} />}
                    <span>{ch}</span>
                  </span>

                  {/* Event Type Badge */}
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${getEventTypeStyle(log.type)}`}>
                    {log.type}
                  </span>

                  {/* Agent Tag */}
                  {log.agentId && (
                    <span className="text-hi bg-raised px-1.5 rounded text-[10px] border bg-raised">
                      agent:{log.agentId}
                    </span>
                  )}

                  {/* Session ID */}
                  {log.sessionId && (
                    <span className="text-lo text-[10px]">
                      sess:<code className="text-mid">{log.sessionId}</code>
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setExpandedLogId(isExpanded ? null : (log.id || `idx-${idx}`))}
                  className="text-[11px] text-lo hover:text-mid font-sans transition-colors"
                >
                  {isExpanded ? 'Collapse' : 'Details'}
                </button>
              </div>

              {/* Event Summary Row */}
              <div className="text-mid pl-1 leading-relaxed break-words font-mono text-[11px]">
                {renderEventSummary(log)}
              </div>

              {/* Expanded JSON Inspector */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-line">
                  <pre className="bg-app p-2.5 rounded border border-line overflow-x-auto text-hi text-[10px] leading-relaxed custom-scrollbar">
                    {JSON.stringify(log, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

// Helper: Format event type badges
function getEventTypeStyle(type: string): string {
  switch (type) {
    case 'message.created':
      return 'bg-raised text-hi border bg-raised';
    case 'agent.started':
      return 'bg-raised text-mid border bg-raised';
    case 'agent.thinking':
    case 'agent.thinking.delta':
      return 'bg-raised text-hi border bg-raised';
    case 'agent.tool_call':
      return 'bg-raised text-mid border bg-raised animate-pulse';
    case 'agent.tool_result':
      return 'bg-raised text-hi border bg-raised';
    case 'agent.completed':
      return 'bg-raised text-hi border bg-raised';
    case 'agent.failed':
      return 'bg-red-500/20 text-red-400 border border-red-500/30';
    default:
      return 'bg-raised text-mid border border-neutral-700';
  }
}

// Helper: Render readable summary per event
function renderEventSummary(log: GatewayLogEvent): React.ReactNode {
  switch (log.type) {
    case 'message.created': {
      const msg = log.payload;
      const role = msg?.role || 'user';
      const text = msg?.content || '';
      return (
        <div className="flex items-start gap-1.5">
          <span className={`font-semibold ${role === 'user' ? 'text-hi' : 'text-hi'}`}>
            [{role.toUpperCase()}]:
          </span>
          <span className="text-hi line-clamp-2">{text}</span>
        </div>
      );
    }

    case 'agent.tool_call': {
      const tc = log.payload;
      return (
        <div className="flex items-center gap-2 text-mid">
          <Wrench size={12} className="text-mid" />
          <span className="font-bold">tool_call({tc?.tool}):</span>
          <span className="text-mid truncate max-w-xl">
            {JSON.stringify(tc?.arguments || {})}
          </span>
        </div>
      );
    }

    case 'agent.tool_result': {
      const tr = log.payload;
      const duration = tr?.durationMs !== undefined ? `(${tr.durationMs}ms)` : '';
      return (
        <div className="flex items-center gap-2 text-hi">
          <CheckCircle2 size={12} className="text-hi" />
          <span className="font-bold">tool_result({tr?.tool}) {duration}:</span>
          <span className="text-mid truncate max-w-xl">
            {typeof tr?.output === 'string' ? tr.output.slice(0, 160) : JSON.stringify(tr?.output)}
          </span>
        </div>
      );
    }

    case 'agent.thinking': {
      return (
        <div className="flex items-center gap-1.5 text-hi italic">
          <Brain size={12} className="text-hi" />
          <span>{String(log.payload || 'Thinking...')}</span>
        </div>
      );
    }

    case 'agent.completed': {
      const p = log.payload;
      const tok = p?.tokens ? `(${p.tokens} tokens)` : '';
      const preview = p?.content ? p.content.slice(0, 120) : 'Turn finished.';
      return (
        <div className="flex items-center gap-2 text-hi">
          <span className="font-semibold">Turn completed {tok}:</span>
          <span className="text-mid truncate max-w-xl">{preview}</span>
        </div>
      );
    }

    case 'agent.failed': {
      return (
        <div className="flex items-center gap-1.5 text-red-400 font-bold">
          <AlertCircle size={12} />
          <span>Failed: {String(log.payload)}</span>
        </div>
      );
    }

    default:
      return (
        <span className="text-mid truncate">
          {typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload)}
        </span>
      );
  }
}
