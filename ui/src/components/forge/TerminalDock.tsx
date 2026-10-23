import React from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import { TerminalPane } from '../../panes/terminal';

/* TerminalDock — docked interactive PTY shell drawer with native macOS window controls. */
export const TerminalDock: React.FC = () => {
  const setTerminalOpen = useAgentStore((s) => s.setTerminalOpen);

  return (
    <div className="flex h-[320px] shrink-0 flex-col border-t border-border bg-background shadow-2xl z-20 overflow-hidden">
      <TerminalPane onClose={() => setTerminalOpen(false)} />
    </div>
  );
};

export default TerminalDock;
