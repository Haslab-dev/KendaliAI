import React from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { TerminalPane } from '../../panes/terminal';

/* TerminalDock — forge BottomTerminal parity: the shell lives in a collapsible
 * strip docked to the bottom of the agent workspace, with a compact title bar
 * (traffic dots + folder + close). Toggled from the workspace header or the
 * sidebar Terminal action. */

export const TerminalDock: React.FC = () => {
  const setTerminalOpen = useAgentStore((s) => s.setTerminalOpen);
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);

  return (
    <div className="flex h-[340px] shrink-0 flex-col border-t border-border/70 bg-background">
      {/* Dock title bar */}
      <div className="flex h-9 shrink-0 select-none items-center gap-2 border-b border-border/60 bg-chrome/70 px-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/80" />
          <span className="size-2.5 rounded-full bg-warning/80" />
          <span className="size-2.5 rounded-full bg-success/80" />
        </span>
        <span className="text-ui-xs font-medium text-foreground/85">Terminal</span>
        {activeWorkspacePath && (
          <span className="truncate font-mono text-3xs text-muted-foreground">
            {activeWorkspacePath.split('/').filter(Boolean).pop()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setTerminalOpen(false)}
            aria-label="Close terminal"
            title="Close terminal"
            className="flex size-6 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {/* Shell */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <TerminalPane />
      </div>
    </div>
  );
};
