import React, { useState, useEffect, useRef } from 'react';
import {
  FolderGit2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Plus,
  Minus,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  ExternalLink,
  History,
  FileCode,
  AlertCircle,
  FolderOpen,
  X,
  Upload,
  Download,
  Terminal,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { InternalFolderPickerModal } from '../common/InternalFolderPickerModal';
import { parseUnifiedDiff } from '../diff/DiffViewer';

interface GitStatusFile {
  path: string;
  status: string;
  staging: 'staged' | 'unstaged' | 'untracked';
  additions?: number;
  deletions?: number;
}

interface CommitItem {
  hash: string;
  short_hash: string;
  author_name: string;
  author_email: string;
  timestamp: string;
  message: string;
  decorations: string;
}

interface RepoInfo {
  name: string;
  path: string;
  branch: string;
}

export interface GitClientViewProps {
  onClose?: () => void;
  initialDir?: string;
}

export const GitClientView: React.FC<GitClientViewProps> = ({ onClose, initialDir }) => {
  // Target folder state
  const [currentDir, setCurrentDir] = useState<string>(initialDir || '');
  const [isRepo, setIsRepo] = useState<boolean>(true);
  const [branch, setBranch] = useState<string>('');
  const [branches, setBranches] = useState<string[]>([]);
  const [ahead, setAhead] = useState<number>(0);
  const [behind, setBehind] = useState<number>(0);

  // Files & Commits
  const [stagedFiles, setStagedFiles] = useState<GitStatusFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitStatusFile[]>([]);
  const [untrackedFiles, setUntrackedFiles] = useState<GitStatusFile[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);

  // Selection & Diff
  const [selectedFile, setSelectedFile] = useState<GitStatusFile | null>(null);
  const [fileDiff, setFileDiff] = useState<string>('');
  const [isLoadingDiff, setIsLoadingDiff] = useState<boolean>(false);

  // Commit form
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [commitDescription, setCommitDescription] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Navigation & Dropdowns
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes');
  const [folderDropdownOpen, setFolderDropdownOpen] = useState<boolean>(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState<boolean>(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState<boolean>(false);
  const [discoveredRepos, setDiscoveredRepos] = useState<RepoInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const folderMenuRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
      }
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Initial load: discover repos and initialize with workspace root
  useEffect(() => {
    const init = async () => {
      try {
        const rootRes = await fetch('/api/workspace/root');
        if (rootRes.ok) {
          const rootData = await rootRes.json();
          if (rootData.current) {
            setCurrentDir(rootData.current);
            refreshStatus(rootData.current);
          }
        }
        const reposRes = await fetch('/api/git/repos');
        if (reposRes.ok) {
          const reposData = await reposRes.json();
          if (Array.isArray(reposData)) {
            setDiscoveredRepos(reposData);
          }
        }
      } catch (err) {
        console.error('Failed to init git view:', err);
      }
    };
    init();
  }, []);

  const refreshStatus = async (dirToQuery?: string) => {
    const target = dirToQuery || currentDir;
    if (!target) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/git/status?dir=${encodeURIComponent(target)}`);
      if (res.ok) {
        const data = await res.json();
        setIsRepo(Boolean(data.isRepo));
        setBranch(data.branch || '');
        setAhead(data.ahead || 0);
        setBehind(data.behind || 0);
        setStagedFiles(data.staged || []);
        setUnstagedFiles(data.unstaged || []);
        setUntrackedFiles(data.untracked || []);

        if (data.path && data.path !== currentDir) {
          setCurrentDir(data.path);
        }

        // Auto select first file if none selected
        const allChanges = [...(data.staged || []), ...(data.unstaged || []), ...(data.untracked || [])];
        if (allChanges.length > 0 && !selectedFile) {
          handleSelectFile(allChanges[0], data.path || target);
        } else if (selectedFile) {
          // Refresh diff for currently selected file
          loadDiff(selectedFile, data.path || target);
        }
      }

      // Fetch branches
      const branchRes = await fetch(`/api/git/branches?dir=${encodeURIComponent(target)}`);
      if (branchRes.ok) {
        const bData = await branchRes.json();
        setBranches(bData.branches || []);
      }

      // Fetch commits
      const logRes = await fetch(`/api/git/log?dir=${encodeURIComponent(target)}&limit=35`);
      if (logRes.ok) {
        const lData = await logRes.json();
        setCommits(lData.commits || []);
      }
    } catch (err) {
      console.error('refreshStatus error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = (file: GitStatusFile, dir?: string) => {
    setSelectedFile(file);
    loadDiff(file, dir);
  };

  const loadDiff = async (file: GitStatusFile, dir?: string) => {
    const targetDir = dir || currentDir;
    if (!targetDir || !file) return;
    setIsLoadingDiff(true);
    try {
      const isStaged = file.staging === 'staged';
      const res = await fetch(
        `/api/git/diff?dir=${encodeURIComponent(targetDir)}&path=${encodeURIComponent(
          file.path
        )}&staged=${isStaged}`
      );
      if (res.ok) {
        const data = await res.json();
        setFileDiff(data.diff || '');
      }
    } catch (err) {
      setFileDiff('');
    } finally {
      setIsLoadingDiff(false);
    }
  };

  // Git Actions
  const handleStage = async (paths: string[], all: boolean = false) => {
    try {
      await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir, paths, all }),
      });
      refreshStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnstage = async (paths: string[], all: boolean = false) => {
    try {
      await fetch('/api/git/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir, paths, all }),
      });
      refreshStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDiscard = async (paths: string[], all: boolean = false) => {
    if (!window.confirm(all ? 'Discard ALL unstaged changes?' : `Discard changes in ${paths.join(', ')}?`)) {
      return;
    }
    try {
      await fetch('/api/git/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir, paths, all }),
      });
      refreshStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dir: currentDir,
          message: commitMessage.trim(),
          description: commitDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ type: 'err', text: data.error || 'Commit failed' });
      } else {
        setCommitMessage('');
        setCommitDescription('');
        setActionNotice({ type: 'ok', text: 'Changes committed successfully!' });
        setTimeout(() => setActionNotice(null), 3000);
        refreshStatus();
      }
    } catch (err: any) {
      setActionNotice({ type: 'err', text: err?.message || 'Commit failed' });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleGitAction = async (action: 'push' | 'pull' | 'fetch') => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/git/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ type: 'err', text: `Git ${action} failed: ${data.error || 'Error'}` });
      } else {
        setActionNotice({ type: 'ok', text: `Git ${action} finished!` });
        setTimeout(() => setActionNotice(null), 3000);
        refreshStatus();
      }
    } catch (err: any) {
      setActionNotice({ type: 'err', text: err?.message || 'Action failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckoutBranch = async (targetBranch: string) => {
    try {
      const res = await fetch('/api/git/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentDir, branch: targetBranch }),
      });
      if (res.ok) {
        setBranchDropdownOpen(false);
        refreshStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const folderName = currentDir ? currentDir.split('/').filter(Boolean).pop() || currentDir : 'Select Folder';
  const totalChanges = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

  const parsedDiff = React.useMemo(() => parseUnifiedDiff(fileDiff), [fileDiff]);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground select-none overflow-hidden">
      {/* Top Header / Server Folder Picker Bar */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border bg-chrome px-4">
        {/* Left: Folder Picker Dropdown */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative" ref={folderMenuRef}>
            <button
              type="button"
              onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-1 text-ui-sm font-semibold text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <FolderGit2 className="size-4 text-primary shrink-0" />
              <span className="truncate max-w-[200px]">{folderName}</span>
              <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
            </button>

            {folderDropdownOpen && (
              <div className="dropdown-glass absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl p-1 shadow-2xl border border-border">
                <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Repository (Server)
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-border/20 py-1">
                  {discoveredRepos.map((repo) => (
                    <button
                      key={repo.path}
                      type="button"
                      onClick={() => {
                        setCurrentDir(repo.path);
                        setFolderDropdownOpen(false);
                        refreshStatus(repo.path);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs transition-colors cursor-pointer',
                        currentDir === repo.path ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground hover:bg-foreground/5'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{repo.name}</div>
                        <div className="truncate text-3xs text-muted-foreground font-mono">{repo.path}</div>
                      </div>
                      <span className="ml-1.5 shrink-0 rounded bg-muted/40 px-1 py-0.2 text-3xs font-mono text-muted-foreground">
                        {repo.branch}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="my-1 h-px bg-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    setFolderDropdownOpen(false);
                    setIsFolderPickerOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-ui-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                >
                  <FolderOpen className="size-3.5" />
                  <span>Browse Server Folders...</span>
                </button>
              </div>
            )}
          </div>

          {/* Branch Selector Dropdown */}
          {isRepo && (
            <div className="relative" ref={branchMenuRef}>
              <button
                type="button"
                onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1 text-ui-xs font-mono text-foreground/90 hover:bg-surface-hover transition-colors cursor-pointer"
                title="Current Branch"
              >
                <GitBranch className="size-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[140px]">{branch || 'detached'}</span>
                <ChevronDown className="size-3 text-muted-foreground shrink-0" />
              </button>

              {branchDropdownOpen && (
                <div className="dropdown-glass absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl p-1 shadow-2xl border border-border">
                  <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Branches
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {branches.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleCheckoutBranch(b)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-ui-xs font-mono transition-colors cursor-pointer',
                          b === branch ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground hover:bg-foreground/5'
                        )}
                      >
                        <span className="truncate">{b}</span>
                        {b === branch && <Check className="size-3 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ahead / Behind Pills */}
          {(ahead > 0 || behind > 0) && (
            <div className="flex items-center gap-1 text-2xs font-mono text-muted-foreground">
              {ahead > 0 && <span className="flex items-center text-primary"><ArrowUp className="size-3" />{ahead}</span>}
              {behind > 0 && <span className="flex items-center text-rose-400"><ArrowDown className="size-3" />{behind}</span>}
            </div>
          )}
        </div>

        {/* Center: Tabs (Changes vs History) */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('changes')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-ui-xs font-semibold transition-all cursor-pointer',
              activeTab === 'changes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <GitCommit className="size-3.5" />
            <span>Changes</span>
            {totalChanges > 0 && (
              <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-3xs font-mono">
                {totalChanges}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-ui-xs font-semibold transition-all cursor-pointer',
              activeTab === 'history'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="size-3.5" />
            <span>History</span>
          </button>
        </div>

        {/* Right: Remote Actions & Refresh */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleGitAction('fetch')}
            disabled={isLoading || !isRepo}
            title="Fetch from remote (git fetch)"
            className="flex items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-1 text-ui-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Download className="size-3 text-muted-foreground" />
            <span>Fetch</span>
          </button>

          <button
            type="button"
            onClick={() => handleGitAction('pull')}
            disabled={isLoading || !isRepo}
            title="Pull from remote (git pull)"
            className="flex items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-1 text-ui-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ArrowDown className="size-3 text-muted-foreground" />
            <span>Pull</span>
          </button>

          <button
            type="button"
            onClick={() => handleGitAction('push')}
            disabled={isLoading || !isRepo}
            title="Push to remote (git push)"
            className="flex items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-1 text-ui-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ArrowUp className="size-3 text-muted-foreground" />
            <span>Push</span>
          </button>

          <button
            type="button"
            onClick={() => refreshStatus()}
            disabled={isLoading}
            title="Refresh Git status"
            className="flex size-7 items-center justify-center rounded-md border border-border/80 bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close Git view"
              className="flex size-7 items-center justify-center rounded-md border border-border/80 bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer ml-1"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={cn(
            'flex items-center justify-between px-4 py-1.5 text-ui-xs font-medium border-b animate-in fade-in duration-100',
            actionNotice.type === 'ok'
              ? 'bg-success/15 border-success/30 text-success'
              : 'bg-destructive/15 border-destructive/30 text-destructive'
          )}
        >
          <span>{actionNotice.text}</span>
          <button type="button" onClick={() => setActionNotice(null)}>
            <X className="size-3.5 cursor-pointer opacity-70 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Main Body */}
      {!isRepo ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <FolderGit2 className="size-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-ui-base font-semibold text-foreground">Folder is not a Git Repository</h3>
          <p className="mt-1 text-ui-xs text-muted-foreground max-w-md">
            The selected server directory <span className="font-mono text-foreground">{currentDir}</span> does not have a Git repository initialized.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFolderPickerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-ui-xs font-medium text-foreground hover:bg-surface-hover cursor-pointer"
            >
              <FolderOpen className="size-3.5" />
              <span>Choose Another Folder</span>
            </button>
          </div>
        </div>
      ) : activeTab === 'changes' ? (
        /* Changes Tab (SourceTree / GitHub Desktop UX) */
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Changed Files List & Commit Box */}
          <div className="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar/40">
            {/* Files List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
              {/* Staged Changes Section */}
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>Staged Changes</span>
                    <span className="rounded bg-primary/20 px-1 py-0.1 text-primary font-mono">
                      {stagedFiles.length}
                    </span>
                  </div>
                  {stagedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleUnstage([], true)}
                      className="text-primary hover:underline cursor-pointer lowercase font-normal"
                    >
                      unstage all
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {stagedFiles.map((file) => {
                    const isSelected = selectedFile?.path === file.path && selectedFile?.staging === 'staged';
                    return (
                      <div
                        key={`staged-${file.path}`}
                        onClick={() => handleSelectFile(file)}
                        className={cn(
                          'flex items-center justify-between rounded-md px-2 py-1 text-ui-xs cursor-pointer transition-colors group',
                          isSelected
                            ? 'bg-primary/15 text-foreground font-medium'
                            : 'hover:bg-foreground/5 text-foreground/85'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-3.5 text-center font-mono font-bold text-success text-2xs">
                            {file.status}
                          </span>
                          <span className="truncate">{file.path}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnstage([file.path]);
                          }}
                          title="Unstage file"
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Minus className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                  {stagedFiles.length === 0 && (
                    <div className="px-2 py-1.5 text-2xs text-muted-foreground/60 italic">
                      No staged files
                    </div>
                  )}
                </div>
              </div>

              {/* Unstaged & Untracked Section */}
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>Changes</span>
                    <span className="rounded bg-muted px-1 py-0.1 font-mono text-muted-foreground">
                      {unstagedFiles.length + untrackedFiles.length}
                    </span>
                  </div>
                  {(unstagedFiles.length > 0 || untrackedFiles.length > 0) && (
                    <div className="flex items-center gap-2 lowercase font-normal text-ui-xs">
                      <button
                        type="button"
                        onClick={() => handleStage([], true)}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        stage all
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscard([], true)}
                        className="text-destructive hover:underline cursor-pointer"
                      >
                        discard all
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {[...unstagedFiles, ...untrackedFiles].map((file) => {
                    const isSelected = selectedFile?.path === file.path && selectedFile?.staging !== 'staged';
                    const isUntracked = file.staging === 'untracked';
                    return (
                      <div
                        key={`unstaged-${file.path}`}
                        onClick={() => handleSelectFile(file)}
                        className={cn(
                          'flex items-center justify-between rounded-md px-2 py-1 text-ui-xs cursor-pointer transition-colors group',
                          isSelected
                            ? 'bg-primary/15 text-foreground font-medium'
                            : 'hover:bg-foreground/5 text-foreground/85'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'w-3.5 text-center font-mono font-bold text-2xs',
                              isUntracked ? 'text-muted-foreground' : 'text-amber-500'
                            )}
                          >
                            {file.status}
                          </span>
                          <span className="truncate">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStage([file.path]);
                            }}
                            title="Stage file"
                            className="p-0.5 hover:bg-foreground/10 rounded text-primary cursor-pointer"
                          >
                            <Plus className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscard([file.path]);
                            }}
                            title="Discard changes"
                            className="p-0.5 hover:bg-foreground/10 rounded text-destructive cursor-pointer"
                          >
                            <RotateCcw className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {unstagedFiles.length === 0 && untrackedFiles.length === 0 && (
                    <div className="px-2 py-1.5 text-2xs text-muted-foreground/60 italic">
                      Working tree clean
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Commit Box */}
            <div className="shrink-0 border-t border-border p-3 bg-card/40 flex flex-col gap-2">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit summary..."
                className="w-full h-7 rounded-md border border-border bg-background px-2.5 text-ui-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary"
              />
              <textarea
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full rounded-md border border-border bg-background p-2 text-ui-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary resize-none"
              />
              <button
                type="button"
                onClick={handleCommit}
                disabled={isCommitting || !commitMessage.trim() || stagedFiles.length === 0}
                className="flex items-center justify-center gap-1.5 w-full h-8 rounded-lg bg-primary text-primary-foreground text-ui-xs font-semibold shadow-xs disabled:opacity-40 hover:opacity-95 transition-all cursor-pointer"
              >
                <GitCommit className="size-3.5" />
                <span>
                  {stagedFiles.length === 0
                    ? 'Stage changes to commit'
                    : `Commit ${stagedFiles.length} file${stagedFiles.length > 1 ? 's' : ''} to ${branch || 'HEAD'}`}
                </span>
              </button>
            </div>
          </div>

          {/* Right Column: Diff Viewer */}
          <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
            {selectedFile ? (
              <>
                <div className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
                  <div className="flex items-center gap-2 min-w-0 font-mono text-ui-xs">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.2 text-3xs font-semibold uppercase',
                        selectedFile.staging === 'staged'
                          ? 'bg-success/15 text-success'
                          : 'bg-amber-500/15 text-amber-500'
                      )}
                    >
                      {selectedFile.staging}
                    </span>
                    <span className="font-semibold text-foreground truncate">{selectedFile.path}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedFile.staging === 'staged' ? (
                      <button
                        type="button"
                        onClick={() => handleUnstage([selectedFile.path])}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-card text-ui-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Minus className="size-3" />
                        <span>Unstage</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStage([selectedFile.path])}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-card text-ui-xs text-primary hover:bg-primary/10 cursor-pointer"
                      >
                        <Plus className="size-3" />
                        <span>Stage</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-auto p-3 font-mono text-2xs">
                  {isLoadingDiff ? (
                    <div className="p-8 text-center text-muted-foreground animate-pulse">Loading diff…</div>
                  ) : parsedDiff.lines.length > 0 ? (
                    <div className="divide-y divide-border/20 rounded-lg border border-border bg-card overflow-hidden">
                      {parsedDiff.lines.map((line, idx) => {
                        if (line.type === 'file-header') return null;
                        if (line.type === 'header') {
                          return (
                            <div key={idx} className="bg-sky-500/10 px-3 py-1 font-semibold text-sky-400">
                              {line.text}
                            </div>
                          );
                        }
                        const isAdd = line.type === 'add';
                        const isDel = line.type === 'del';
                        return (
                          <div
                            key={idx}
                            className={cn(
                              'flex items-baseline px-2 py-0.5',
                              isAdd && 'bg-emerald-500/15 text-emerald-400',
                              isDel && 'bg-rose-500/15 text-rose-400',
                              !isAdd && !isDel && 'text-foreground/80'
                            )}
                          >
                            <span className="w-8 shrink-0 text-right text-muted-foreground/50 select-none pr-2">
                              {line.origLine ?? ''}
                            </span>
                            <span className="w-8 shrink-0 text-right text-muted-foreground/50 select-none pr-2">
                              {line.modLine ?? ''}
                            </span>
                            <span className="w-4 shrink-0 font-bold select-none">
                              {isAdd ? '+' : isDel ? '-' : ' '}
                            </span>
                            <span className="whitespace-pre-wrap break-all">{line.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No diff available for this file.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-ui-xs text-muted-foreground">
                Select a changed file on the left to inspect its diff.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="flex-1 min-h-0 overflow-y-auto p-4 divide-y divide-border/30">
          {commits.length === 0 ? (
            <div className="p-8 text-center text-ui-xs text-muted-foreground">
              No commit history found.
            </div>
          ) : (
            commits.map((c) => (
              <div key={c.hash} className="py-2.5 flex items-start justify-between gap-3 group hover:bg-foreground/5 px-3 rounded-lg transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">
                    <GitCommit className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-ui-sm font-semibold text-foreground truncate">{c.message}</span>
                      {c.decorations && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.2 text-3xs font-mono font-medium text-primary shrink-0">
                          {c.decorations.replace(/[()]/g, '')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted-foreground">
                      <span>{c.author_name}</span>
                      <span>•</span>
                      <span>{new Date(c.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <span className="shrink-0 rounded border border-border bg-card px-2 py-0.5 font-mono text-2xs text-foreground/80">
                  {c.short_hash}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Internal Server Folder Picker Modal */}
      <InternalFolderPickerModal
        isOpen={isFolderPickerOpen}
        initialPath={currentDir}
        onSelectFolder={(selectedPath) => {
          setCurrentDir(selectedPath);
          refreshStatus(selectedPath);
        }}
        onClose={() => setIsFolderPickerOpen(false)}
        title="Select Target Git Repository on Server"
      />
    </div>
  );
};
export default GitClientView;
