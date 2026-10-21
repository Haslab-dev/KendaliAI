import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  GitMerge,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Square,
  Clock,
  User,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  FileCode,
  RotateCcw,
  Search,
  Upload,
  Download,
  AlertCircle,
  X,
} from 'lucide-react';
import { GitService, GitStatusResult, GitFileStatus, GitCommitNode, GitBranchInfo } from '../../services/gitService';
import { DiffViewer } from '../diff/DiffViewer';
import { useAppStore } from '../../store/useAppStore';

interface GitClientViewProps {
  onClose?: () => void;
  className?: string;
}

export const GitClientView: React.FC<GitClientViewProps> = ({ onClose, className = '' }) => {
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);

  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [commits, setCommits] = useState<GitCommitNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Selected file or commit for diff view
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitNode | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Branch switcher dropdown & modal
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [newBranchModalOpen, setNewBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const refreshGit = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [st, br, lg] = await Promise.all([
        GitService.getStatus(activeWorkspacePath),
        GitService.getBranches(activeWorkspacePath),
        GitService.getLog(activeWorkspacePath, 20),
      ]);
      setStatus(st);
      setBranches(br.branches);
      setCommits(lg);

      // Select first file if nothing selected
      if (!selectedFile && !selectedCommit) {
        if (st.staged.length > 0) {
          setSelectedFile({ path: st.staged[0].path, staged: true });
        } else if (st.unstaged.length > 0) {
          setSelectedFile({ path: st.unstaged[0].path, staged: false });
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to refresh git status');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspacePath, selectedFile, selectedCommit]);

  useEffect(() => {
    refreshGit();
  }, [refreshGit]);

  // Load diff when file or commit selection changes
  useEffect(() => {
    let active = true;
    const fetchDiff = async () => {
      setLoadingDiff(true);
      try {
        if (selectedCommit) {
          const out = await GitService.getCommitDiff(selectedCommit.hash, activeWorkspacePath);
          if (active) setDiffText(out);
        } else if (selectedFile) {
          const out = await GitService.getFileDiff(selectedFile.path, selectedFile.staged, activeWorkspacePath);
          if (active) setDiffText(out);
        } else {
          if (active) setDiffText('');
        }
      } catch (err: any) {
        if (active) setDiffText(`Error loading diff: ${err.message}`);
      } finally {
        if (active) setLoadingDiff(false);
      }
    };
    fetchDiff();
    return () => {
      active = false;
    };
  }, [selectedFile, selectedCommit, activeWorkspacePath]);

  const handleStageAll = async () => {
    if (!status || actionBusy) return;
    setActionBusy(true);
    try {
      const files = status.unstaged.map((f) => f.path);
      await GitService.stageFiles(files, activeWorkspacePath);
      await refreshGit();
      showToast('All changes staged');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnstageAll = async () => {
    if (!status || actionBusy) return;
    setActionBusy(true);
    try {
      const files = status.staged.map((f) => f.path);
      await GitService.unstageFiles(files, activeWorkspacePath);
      await refreshGit();
      showToast('All changes unstaged');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStageFile = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await GitService.stageFiles([path], activeWorkspacePath);
      await refreshGit();
      setSelectedFile({ path, staged: true });
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnstageFile = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await GitService.unstageFiles([path], activeWorkspacePath);
      await refreshGit();
      setSelectedFile({ path, staged: false });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDiscardFile = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Discard changes to ${path}?`)) return;
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await GitService.discardFiles([path], activeWorkspacePath);
      await refreshGit();
      showToast(`Discarded ${path}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || actionBusy || !status?.staged.length) return;
    setActionBusy(true);
    try {
      const res = await GitService.commit(commitMessage.trim(), activeWorkspacePath);
      if (res.success) {
        setCommitMessage('');
        showToast('Committed successfully');
        await refreshGit();
      } else {
        setErrorMsg(res.output || 'Commit failed');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handlePush = async () => {
    setActionBusy(true);
    try {
      const res = await GitService.push(activeWorkspacePath);
      if (res.success) {
        showToast('Pushed to remote');
        await refreshGit();
      } else {
        setErrorMsg(res.output || 'Push failed');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handlePull = async () => {
    setActionBusy(true);
    try {
      const res = await GitService.pull(activeWorkspacePath);
      if (res.success) {
        showToast('Pulled from remote');
        await refreshGit();
      } else {
        setErrorMsg(res.output || 'Pull failed');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    setBranchDropdownOpen(false);
    setActionBusy(true);
    try {
      const ok = await GitService.checkout(branchName, activeWorkspacePath);
      if (ok) {
        showToast(`Switched to branch ${branchName}`);
        await refreshGit();
      } else {
        setErrorMsg(`Failed to switch to ${branchName}`);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    setNewBranchModalOpen(false);
    setActionBusy(true);
    try {
      const ok = await GitService.createBranch(newBranchName.trim(), activeWorkspacePath);
      if (ok) {
        showToast(`Created & switched to ${newBranchName.trim()}`);
        setNewBranchName('');
        await refreshGit();
      } else {
        setErrorMsg(`Failed to create branch`);
      }
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className={`flex h-full w-full min-w-0 flex-col overflow-hidden bg-background text-foreground ${className}`}>
      {/* Top Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-chrome px-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* Branch Dropdown */}
          <div className="relative">
            <button
              onClick={() => setBranchDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-ui-xs font-medium text-foreground hover:bg-surface-hover"
            >
              <GitBranch className="size-3.5 text-primary" />
              <span className="max-w-[140px] truncate">{status?.branch || 'branch'}</span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>

            {branchDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                <div className="mb-1 border-b border-border px-2 py-1 text-2xs font-semibold text-muted-foreground">
                  Branches
                </div>
                {branches.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => handleCheckoutBranch(b.name)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-ui-xs hover:bg-surface-hover ${
                      b.isCurrent ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="truncate">{b.name}</span>
                    {b.isCurrent && <Check className="size-3 text-primary" />}
                  </button>
                ))}
                <div className="mt-1 border-t border-border pt-1">
                  <button
                    onClick={() => {
                      setBranchDropdownOpen(false);
                      setNewBranchModalOpen(true);
                    }}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-ui-xs text-primary hover:bg-primary/10"
                  >
                    <Plus className="size-3" />
                    New branch…
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Ahead / Behind Pills */}
          {status && (status.ahead > 0 || status.behind > 0) && (
            <div className="flex items-center gap-1 font-mono text-2xs text-muted-foreground">
              {status.ahead > 0 && <span className="text-emerald-500">↑{status.ahead}</span>}
              {status.behind > 0 && <span className="text-amber-500">↓{status.behind}</span>}
            </div>
          )}
        </div>

        {/* Action Buttons: Fetch, Pull, Push, Refresh, Close */}
        <div className="flex items-center gap-1">
          <button
            onClick={refreshGit}
            disabled={loading || actionBusy}
            title="Refresh Git status"
            className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handlePull}
            disabled={actionBusy}
            title="Pull from remote"
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-2xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
          >
            <Download className="size-3" />
            Pull
          </button>
          <button
            onClick={handlePush}
            disabled={actionBusy}
            title="Push to remote"
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-2xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
          >
            <Upload className="size-3" />
            Push
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error & Toast Banners */}
      {errorMsg && (
        <div className="flex items-center justify-between bg-destructive/15 px-3 py-1 text-ui-xs text-destructive">
          <span className="truncate">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-2 font-bold">×</button>
        </div>
      )}
      {toastMsg && (
        <div className="flex items-center justify-between bg-success/15 px-3 py-1 text-ui-xs text-success">
          <span className="truncate">{toastMsg}</span>
        </div>
      )}

      {/* Main Split Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Column: Changes list & Commit */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {/* Staged Changes Section */}
            <div>
              <div className="mb-1 flex items-center justify-between px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Staged Changes ({status?.staged.length || 0})</span>
                {status && status.staged.length > 0 && (
                  <button
                    onClick={handleUnstageAll}
                    disabled={actionBusy}
                    className="text-primary hover:underline"
                  >
                    Unstage all
                  </button>
                )}
              </div>
              {status?.staged.length === 0 ? (
                <div className="rounded border border-dashed border-border/60 px-2 py-2 text-center text-2xs text-muted-foreground">
                  No staged changes
                </div>
              ) : (
                <div className="space-y-0.5">
                  {status?.staged.map((f) => {
                    const isSelected = selectedFile?.path === f.path && selectedFile.staged;
                    return (
                      <div
                        key={f.path}
                        onClick={() => {
                          setSelectedCommit(null);
                          setSelectedFile({ path: f.path, staged: true });
                        }}
                        className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-ui-xs transition-colors ${
                          isSelected ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-surface-hover text-foreground'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="w-3 text-2xs font-mono font-bold text-emerald-500">{f.status}</span>
                          <span className="truncate text-ui-xs">{f.path}</span>
                        </div>
                        <button
                          onClick={(e) => handleUnstageFile(f.path, e)}
                          title="Unstage file"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Unstaged Changes Section */}
            <div>
              <div className="mb-1 flex items-center justify-between px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Changes ({status?.unstaged.length || 0})</span>
                {status && status.unstaged.length > 0 && (
                  <button
                    onClick={handleStageAll}
                    disabled={actionBusy}
                    className="text-primary hover:underline"
                  >
                    Stage all
                  </button>
                )}
              </div>
              {status?.unstaged.length === 0 ? (
                <div className="rounded border border-dashed border-border/60 px-2 py-2 text-center text-2xs text-muted-foreground">
                  Working tree clean
                </div>
              ) : (
                <div className="space-y-0.5">
                  {status?.unstaged.map((f) => {
                    const isSelected = selectedFile?.path === f.path && !selectedFile.staged;
                    return (
                      <div
                        key={f.path}
                        onClick={() => {
                          setSelectedCommit(null);
                          setSelectedFile({ path: f.path, staged: false });
                        }}
                        className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-ui-xs transition-colors ${
                          isSelected ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-surface-hover text-foreground'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`w-3 text-2xs font-mono font-bold ${
                              f.status === '??' ? 'text-amber-500' : 'text-sky-500'
                            }`}
                          >
                            {f.status}
                          </span>
                          <span className="truncate text-ui-xs">{f.path}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => handleStageFile(f.path, e)}
                            title="Stage file"
                            className="p-0.5 text-muted-foreground hover:text-primary"
                          >
                            <Plus className="size-3" />
                          </button>
                          <button
                            onClick={(e) => handleDiscardFile(f.path, e)}
                            title="Discard changes"
                            className="p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Commit Box */}
            <div className="rounded-lg border border-border bg-card p-2 space-y-2">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    handleCommit();
                  }
                }}
                placeholder="Commit message (⌘Enter to commit)..."
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-background p-1.5 text-ui-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleCommit}
                disabled={actionBusy || !commitMessage.trim() || !status?.staged.length}
                className="w-full rounded-md bg-primary py-1.5 text-ui-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Commit to {status?.branch || 'branch'}
              </button>
            </div>

            {/* Recent Commit History */}
            <div>
              <div className="mb-1 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                History
              </div>
              <div className="space-y-1">
                {commits.map((c) => {
                  const isSelected = selectedCommit?.hash === c.hash;
                  return (
                    <div
                      key={c.hash}
                      onClick={() => {
                        setSelectedFile(null);
                        setSelectedCommit(c);
                      }}
                      className={`cursor-pointer rounded p-1.5 text-ui-xs transition-colors ${
                        isSelected ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-surface-hover text-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between text-2xs text-muted-foreground">
                        <span className="font-mono">{c.shortHash}</span>
                        <span className="truncate max-w-[120px]">{c.authorName}</span>
                      </div>
                      <p className="mt-0.5 truncate text-ui-xs font-normal">{c.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Diff Viewer */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedCommit ? (
            <DiffViewer
              diff={{
                id: selectedCommit.hash,
                filePath: `Commit: ${selectedCommit.shortHash} - ${selectedCommit.message}`,
                modifiedContent: diffText,
                kind: 'git',
              }}
            />
          ) : selectedFile ? (
            <DiffViewer
              diff={{
                id: selectedFile.path,
                filePath: `${selectedFile.path} (${selectedFile.staged ? 'Staged' : 'Working Tree'})`,
                modifiedContent: diffText,
                kind: 'git',
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-ui-xs">
              Select a file or commit to inspect diff
            </div>
          )}
        </div>
      </div>

      {/* New Branch Modal */}
      {newBranchModalOpen && (
        <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-xl">
            <h3 className="text-ui-sm font-semibold text-foreground">Create New Branch</h3>
            <p className="mt-1 text-2xs text-muted-foreground">Branch off current HEAD ({status?.branch})</p>
            <input
              type="text"
              autoFocus
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
              placeholder="e.g. feature/my-new-task"
              className="mt-3 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-ui-xs text-foreground focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setNewBranchModalOpen(false)}
                className="rounded-md border border-border px-3 py-1 text-ui-xs text-muted-foreground hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="rounded-md bg-primary px-3 py-1 text-ui-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Create & Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
