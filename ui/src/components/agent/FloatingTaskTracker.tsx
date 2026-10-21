import React from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';

interface FloatingTaskTrackerProps {
  running: boolean;
  activeTool?: string;
  elapsedSeconds?: number;
  onScrollToBottom: () => void;
}

export const FloatingTaskTracker: React.FC<FloatingTaskTrackerProps> = ({
  running,
  activeTool,
  elapsedSeconds = 0,
  onScrollToBottom,
}) => {
  if (!running && !activeTool) return null;

  return (
    <div
      onClick={onScrollToBottom}
      className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-20 right-6 z-30 flex cursor-pointer items-center gap-2 rounded-full border border-border/80 bg-popover/90 px-3.5 py-1.5 text-ui-xs text-foreground shadow-lg backdrop-blur-md transition-transform hover:scale-105"
    >
      <Loader2 className="size-3.5 animate-spin text-primary" />
      <span className="font-medium text-foreground">
        {activeTool ? `Executing ${activeTool}` : 'Agent running'}
      </span>
      {elapsedSeconds > 0 && (
        <span className="font-mono text-2xs text-muted-foreground">({elapsedSeconds}s)</span>
      )}
      <ArrowDown className="size-3 text-muted-foreground ml-1" />
    </div>
  );
};
