import React, { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ChevronRight,
  Clock,
  FileEdit,
  FileText,
  Globe,
  Loader2,
  Search,
  SquareTerminal,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ToolCallRecord } from '../../types';
import { cn } from '../../lib/cn';

/* WorkLog primitives — ported from forge-ade's components/agent/WorkLog.tsx
 * (t3 "Work log" rows) and bound to kendali's ToolCallRecord shape. */

const GroupedRows = createContext(false);

export function WorkLogList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <GroupedRows.Provider value={true}>
      <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>{children}</div>
    </GroupedRows.Provider>
  );
}

export type WorkLogStatus = 'pending' | 'running' | 'completed' | 'failed' | 'warning';

export function WorkLogStatusGlyph({ status, durationMs }: { status?: WorkLogStatus; durationMs?: number }) {
  // t3 trailing: quiet by default — only running spins and failures get a dim X.
  let glyph: ReactNode = null;
  if (status === 'running' || status === 'pending') {
    glyph = <Loader2 className="size-3 animate-spin-slow text-icon-muted shrink-0" />;
  } else if (status === 'failed') {
    glyph = <X className="size-3 shrink-0 text-tool-error-icon/60" />;
  }
  const durationText =
    durationMs && durationMs > 0 ? (durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`) : null;
  return (
    <div className="flex select-none items-center gap-1.5 text-2xs text-secondary-label shrink-0">
      {durationText && (
        <span className="flex items-center gap-0.5 font-mono text-3xs text-fg-tertiary">
          <Clock className="size-2.5 opacity-70" />
          {durationText}
        </span>
      )}
      {glyph}
    </div>
  );
}

function toolVisual(tc: ToolCallRecord): { icon: LucideIcon; label: string; detail: string } {
  const args = tc.arguments || {};
  const name = (tc.tool || '').toLowerCase();
  const path = (args.path || args.file_path || args.file || args.filename || '') as string;
  const command = (args.command || args.cmd || '') as string;
  const url = (args.url || '') as string;
  const query = (args.query || args.pattern || '') as string;

  if (name.includes('terminal') || name.includes('bash') || name.includes('shell') || name.includes('exec')) {
    return { icon: SquareTerminal, label: 'Terminal', detail: command };
  }
  if (name.includes('edit') || name.includes('write') || name.includes('patch')) {
    return { icon: FileEdit, label: name.includes('write') ? 'Write' : 'Edit', detail: path };
  }
  if (name.includes('read') || name.includes('file')) {
    return { icon: FileText, label: 'Read', detail: path };
  }
  if (name.includes('web') || name.includes('fetch') || name.includes('http') || name.includes('browser')) {
    return { icon: Globe, label: 'Fetch', detail: url };
  }
  if (name.includes('search') || name.includes('grep') || name.includes('find')) {
    return { icon: Search, label: 'Search', detail: query || path };
  }
  return { icon: Wrench, label: tc.tool || 'Tool', detail: command || path || query || '' };
}

/** Expandable disclosure row for one tool call (forge-ade WorkLogRow). */
export function WorkLogRow({
  tc,
  defaultExpanded = false,
  className,
}: {
  tc: ToolCallRecord;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const grouped = useContext(GroupedRows);
  const { icon: Icon, label, detail } = toolVisual(tc);
  const status: WorkLogStatus = !tc.status || tc.status === 'running' ? 'running' : tc.status === 'error' || tc.status === 'denied' ? 'failed' : 'completed';

  const labelNode = (
    <span className={cn('block truncate', status === 'running' && 'live-tool-shine')}>
      {label}
      {detail && <span className="ml-1.5 font-mono text-3xs text-fg-tertiary">{detail}</span>}
    </span>
  );

  return (
    <div
      className={cn(
        'group/timeline-row relative w-full min-w-0 rounded-md px-0.5 text-left transition-colors',
        className
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((p) => !p);
          }
        }}
        className={cn(
          'flex min-h-6 w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-md py-0.5 text-ui-sm leading-relaxed select-none transition-colors hover:bg-accent/70',
          grouped ? 'py-0' : 'py-0.5'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="flex size-4 shrink-0 items-center justify-center">
            <ChevronRight
              className={cn('size-3 shrink-0 text-icon-muted opacity-70 transition-transform duration-200', expanded && 'rotate-90')}
            />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="relative w-6 shrink-0 leading-0">
              <span className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden text-icon-muted">
                <Icon size={14} strokeWidth={2} />
              </span>
            </span>
            <div className="min-w-0 flex-1 truncate text-secondary-label [&_*]:whitespace-nowrap">{labelNode}</div>
          </div>
        </div>
        <WorkLogStatusGlyph status={status} durationMs={tc.durationMs} />
      </div>

      {expanded && (
        <div className="mt-0.5 mb-1.5 pb-2">
          <WorkLogDetails tc={tc} />
        </div>
      )}
    </div>
  );
}

export function WorkLogDetails({ tc }: { tc: ToolCallRecord }) {
  const args = tc.arguments || {};
  const name = (tc.tool || '').toLowerCase();
  const command = (args.command || args.cmd || '') as string;
  const isTerminal = name.includes('terminal') || name.includes('bash') || name.includes('shell') || name.includes('exec');

  return (
    <div className="ms-7 max-h-96 cursor-auto select-text overflow-auto whitespace-pre-wrap break-words px-0.5 py-1 font-mono text-3xs leading-relaxed text-secondary-label scrollbar-thin">
      {!isTerminal && Object.keys(args).length > 0 && (
        <pre className="mb-1 rounded-lg border border-border/50 bg-card/80 p-2">{JSON.stringify(args, null, 2)}</pre>
      )}
      {isTerminal && command && (
        <pre className="mb-1 rounded-lg border border-border/50 bg-card/80 p-2">
          <span className="text-success/80">$ </span>
          {command}
        </pre>
      )}
      {tc.output && (
        <pre
          className={cn(
            'rounded-lg border p-2',
            tc.status === 'error' || tc.status === 'denied'
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border/50 bg-muted/60'
          )}
        >
          {tc.output}
        </pre>
      )}
    </div>
  );
}
