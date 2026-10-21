import React, { useState } from 'react';
import {
  FileDiff as FileDiffIcon,
  GitBranch,
  SquareTerminal,
  Users2,
  X,
  FileCode,
} from 'lucide-react';
import { GitClientView } from '../git/GitClientView';
import { DiffViewer } from '../diff/DiffViewer';
import { SubAgentPanel } from '../SubAgentPanel';

export type RightSidebarTab = 'git' | 'diffs' | 'terminal' | 'subagents';

interface AgentRightSidebarProps {
  onClose: () => void;
  initialTab?: RightSidebarTab;
}

export const AgentRightSidebar: React.FC<AgentRightSidebarProps> = ({ onClose, initialTab = 'git' }) => {
  const [activeTab, setActiveTab] = useState<RightSidebarTab>(initialTab);

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-sidebar/50 backdrop-blur-md">
      {/* Tab Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-chrome px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('git')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs font-medium transition-colors ${
              activeTab === 'git'
                ? 'bg-card text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <GitBranch className="size-3.5 text-primary" />
            Git
          </button>
          <button
            onClick={() => setActiveTab('diffs')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs font-medium transition-colors ${
              activeTab === 'diffs'
                ? 'bg-card text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileDiffIcon className="size-3.5 text-emerald-500" />
            Diff
          </button>
          <button
            onClick={() => setActiveTab('subagents')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs font-medium transition-colors ${
              activeTab === 'subagents'
                ? 'bg-card text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users2 className="size-3.5 text-purple-500" />
            Subagents
          </button>
        </div>

        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
          title="Close sidebar"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tab Surface */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'git' && <GitClientView onClose={onClose} />}
        {activeTab === 'diffs' && (
          <DiffViewer
            diff={{
              id: 'session-diff',
              filePath: 'Session Changes',
              kind: 'git',
            }}
            isInline
            onClose={onClose}
          />
        )}
        {activeTab === 'subagents' && (
          <div className="h-full overflow-y-auto p-2">
            <SubAgentPanel />
          </div>
        )}
      </div>
    </aside>
  );
};
