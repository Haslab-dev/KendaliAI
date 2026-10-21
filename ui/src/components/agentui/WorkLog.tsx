import React, { useState } from 'react';
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

/* WorkLog — t3-style collapsible tool-call rows: icon + label + mono stats +
 * status glyph; expandable mono details. Used by the agent Transcript. */

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

const StatusGlyph: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'running' || status === undefined) {
    return <Loader2 size={12} className="animate-spin-slow text-muted-foreground/70" />;
  }
  if (status === 'error' || status === 'denied') {
    return <X size={12} className="text-destructive/70" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-success/80" />;
};

export const WorkLogRow: React.FC<{ tc: ToolCallRecord }> = ({ tc }) => {
  const [open, setOpen] = useState(false);
  const { icon: Icon, label, detail } = toolVisual(tc);
  const running = !tc.status || tc.status === 'running';

  return (
    <div className="min-h-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/70"
      >
        <ChevronRight
          size={11}
          className={cn('shrink-0 text-subtle-fg transition-transform', open && 'rotate-90')}
        />
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className={cn('truncate text-ui-xs', running ? 'live-tool-shine' : 'text-foreground/80')}>
          {label}
          {detail && <span className="ml-1.5 font-mono text-3xs text-muted-foreground">{detail}</span>}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 font-mono text-3xs text-subtle-fg">
          {tc.durationMs != null && tc.durationMs > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock size={9} />
              {tc.durationMs > 60000 ? `${Math.round(tc.durationMs / 60000)}m` : `${(tc.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          <StatusGlyph status={tc.status} />
        </span>
      </button>
      {open && (
        <WorkLogDetails tc={tc} />
      )}
    </div>
  );
};

export const WorkLogList: React.FC<{ toolCalls?: ToolCallRecord[] }> = ({ toolCalls }) => {
  if (!toolCalls || toolCalls.length === 0) return null;
  return (
    <div className="space-y-px">
      {toolCalls.map((tc, i) => (
        <WorkLogRow key={tc.id || i} tc={tc} />
      ))}
    </div>
  );
};

const WorkLogDetails: React.FC<{ tc: ToolCallRecord }> = ({ tc }) => {
  const args = tc.arguments || {};
  const name = (tc.tool || '').toLowerCase();
  const command = (args.command || args.cmd || '') as string;
  const isTerminal = name.includes('terminal') || name.includes('bash') || name.includes('shell') || name.includes('exec');

  return (
    <div className="ms-7 mb-1.5 space-y-1.5">
      {!isTerminal && Object.keys(args).length > 0 && (
        <pre className="max-h-40 overflow-auto rounded-lg border border-border/50 bg-card/80 p-2 font-mono text-3xs leading-relaxed text-foreground/85">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
      {isTerminal && command && (
        <pre className="overflow-auto rounded-lg border border-border/50 bg-card/80 p-2 font-mono text-3xs leading-relaxed text-foreground/85">
          <span className="text-success/80">$ </span>
          {command}
        </pre>
      )}
      {tc.output ? (
        <pre
          className={cn(
            'max-h-56 overflow-auto rounded-lg border p-2 font-mono text-3xs leading-relaxed',
            tc.status === 'error' || tc.status === 'denied'
              ? 'border-destructive/30 bg-destructive/5 text-foreground/85'
              : 'border-border/50 bg-muted/60 text-foreground/80'
          )}
        >
          {tc.output}
        </pre>
      ) : null}
    </div>
  );
};

/** "Worked for Ns" collapsible group — thoughts + tool rows for one turn. */
export const WorkGroup: React.FC<{
  runningLabel?: string | null;
  elapsed?: string | null;
  thought?: string;
  toolCalls?: ToolCallRecord[];
  children?: React.ReactNode;
}> = ({ runningLabel, elapsed, thought, toolCalls, children }) => {
  const [open, setOpen] = useState(true);
  const running = !!runningLabel;
  const hasWork = (toolCalls && toolCalls.length > 0) || !!thought;

  // Collapse automatically once the turn completes (t3 behavior).
  React.useEffect(() => {
    if (!runningLabel) setOpen(false);
  }, [runningLabel]);

  return (
    <div className="border-b border-border/40 pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-2 py-1.5 text-left"
      >
        <ChevronRight size={12} className={cn('shrink-0 text-subtle-fg transition-transform', open && 'rotate-90')} />
        <span className="text-ui-sm">
          {running ? (
            <span className={cn('tabular-nums', runningLabel === 'Working' ? 'animated-gradient-text' : 'live-tool-shine')}>
              {runningLabel === 'Working' ? 'Working' : `Working · ${runningLabel}`}
              {elapsed ? ` for ${elapsed}` : '…'}
            </span>
          ) : (
            <span className="tabular-nums text-muted-foreground transition-colors group-hover:text-foreground">
              Worked{elapsed ? ` for ${elapsed}` : ''}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="space-y-1 ps-4">
          {thought && <ThoughtBlock thought={thought} />}
          {hasWork && <WorkLogList toolCalls={toolCalls} />}
          {children}
        </div>
      )}
    </div>
  );
};

const ThoughtBlock: React.FC<{ thought: string }> = ({ thought }) => {
  const [open, setOpen] = useState(false);
  const preview = thought.slice(0, 120);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/70"
      >
        <ChevronRight size={11} className={cn('shrink-0 text-subtle-fg transition-transform', open && 'rotate-90')} />
        <span className="text-ui-xs italic text-muted-foreground">
          Thought{!open && preview && <span className="not-italic text-subtle-fg"> · {preview}…</span>}
        </span>
      </button>
      {open && (
        <pre className="ms-4 mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-card/70 p-2.5 font-mono text-3xs leading-relaxed text-muted-foreground">
          {thought}
        </pre>
      )}
    </div>
  );
};
