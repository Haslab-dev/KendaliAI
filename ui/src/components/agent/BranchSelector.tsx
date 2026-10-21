import React, { useState, useEffect } from 'react';
import { GitBranch, Check, Plus, ChevronDown } from 'lucide-react';
import { GitService, GitBranchInfo } from '../../services/gitService';
import { useAppStore } from '../../store/useAppStore';

export const BranchSelector: React.FC<{ onOpenGit?: () => void; align?: 'start' | 'end' }> = ({ onOpenGit, align = 'start' }) => {
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const loadBranches = async () => {
    try {
      const res = await GitService.getBranches(activeWorkspacePath);
      setBranches(res.branches);
      setCurrentBranch(res.current || 'main');
    } catch {}
  };

  useEffect(() => {
    loadBranches();
  }, [activeWorkspacePath]);

  const handleCheckout = async (name: string) => {
    setOpen(false);
    await GitService.checkout(name, activeWorkspacePath);
    await loadBranches();
  };

  const handleCreate = async () => {
    if (!newBranchName.trim()) return;
    setModalOpen(false);
    await GitService.createBranch(newBranchName.trim(), activeWorkspacePath);
    setNewBranchName('');
    await loadBranches();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-toolbar-control px-2 text-ui-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
        title="Git Branch"
      >
        <GitBranch className="size-3.5 text-primary" />
        <span className="max-w-[120px] truncate">{currentBranch}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {open && (
        <div className={`absolute ${align === 'end' ? 'right-0' : 'left-0'} bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 z-50 max-h-60 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg`}>
          <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Branches
          </div>
          {branches.map((b) => (
            <button
              key={b.name}
              onClick={() => handleCheckout(b.name)}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-ui-xs hover:bg-surface-hover ${
                b.name === currentBranch ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground'
              }`}
            >
              <span className="truncate">{b.name}</span>
              {b.name === currentBranch && <Check className="size-3 text-primary" />}
            </button>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            <button
              onClick={() => {
                setOpen(false);
                setModalOpen(true);
              }}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-ui-xs text-primary hover:bg-primary/10"
            >
              <Plus className="size-3" />
              New branch…
            </button>
            {onOpenGit && (
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenGit();
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-ui-xs text-muted-foreground hover:bg-surface-hover"
              >
                Open Git Client…
              </button>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-xl">
            <h3 className="text-ui-sm font-semibold text-foreground">New Branch</h3>
            <input
              type="text"
              autoFocus
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. feat/agent-mode"
              className="mt-3 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-ui-xs text-foreground focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-border px-3 py-1 text-ui-xs text-muted-foreground hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newBranchName.trim()}
                className="rounded-md bg-primary px-3 py-1 text-ui-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
