import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Save,
  X,
  Terminal,
  Play,
  Trash2,
  CornerDownLeft,
  Check,
  Maximize2,
  Minimize2,
  Code2,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useProfileStore } from '../../store/useProfileStore';

interface FileNode {
  name: string;
  path: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  modTime: string;
  gitStatus?: string;
  children?: FileNode[];
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isModified: boolean;
}

export const SimpleEditorView: React.FC = () => {
  const { setActiveNavTab } = useProfileStore();

  // Workspace & Files
  const [rootPath, setRootPath] = useState<string>('');
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(false);

  // Tabs & Editor State
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Shell Control State
  const [shellOpen, setShellOpen] = useState<boolean>(true);
  const [shellHeight, setShellHeight] = useState<number>(200);
  const [shellCwd, setShellCwd] = useState<string>('');
  const [shellInput, setShellInput] = useState<string>('');
  const [shellLogs, setShellLogs] = useState<Array<{ cmd: string; output: string; exitCode: number }>>([]);
  const [shellHistory, setShellHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isRunningCommand, setIsRunningCommand] = useState<boolean>(false);

  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch workspace root and tree
  const loadWorkspace = async () => {
    setIsLoadingTree(true);
    try {
      const rootRes = await fetch('/api/workspace/root');
      if (rootRes.ok) {
        const rootData = await rootRes.json();
        setRootPath(rootData.current || '');
        setShellCwd(rootData.current || '');
      }

      const filesRes = await fetch('/api/workspace/files');
      if (filesRes.ok) {
        const items = await filesRes.json();
        setFileTree(Array.isArray(items) ? items : []);
      }
    } catch (err) {
      console.error('Failed to load workspace files:', err);
    } finally {
      setIsLoadingTree(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const updateNodeChildren = (nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] => {
    return nodes.map((n) => {
      if (n.path === targetPath) {
        return { ...n, children };
      }
      if (n.children && n.children.length > 0) {
        return { ...n, children: updateNodeChildren(n.children, targetPath, children) };
      }
      return n;
    });
  };

  const toggleFolder = async (folder: FileNode) => {
    const isNowExpanded = !expandedFolders[folder.path];
    setExpandedFolders((prev) => ({
      ...prev,
      [folder.path]: isNowExpanded,
    }));

    if (isNowExpanded && (!folder.children || folder.children.length === 0)) {
      try {
        const res = await fetch(`/api/workspace/files?path=${encodeURIComponent(folder.path)}`);
        if (res.ok) {
          const subItems: FileNode[] = await res.json();
          setFileTree((prev) => updateNodeChildren(prev, folder.path, subItems));
        }
      } catch (err) {
        console.error('Failed to load subfolder files:', err);
      }
    }
  };

  const handleOpenFile = async (file: FileNode) => {
    if (file.isDir) {
      toggleFolder(file);
      return;
    }

    // Check if already open
    const existing = openTabs.find((t) => t.path === file.path);
    if (existing) {
      setActiveTabPath(file.path);
      return;
    }

    // Read file from backend
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`);
      if (!res.ok) throw new Error('Failed to read file');
      const data = await res.json();
      const content = data.content || '';

      const newTab: OpenTab = {
        path: file.path,
        name: file.name,
        content,
        originalContent: content,
        isModified: false,
      };

      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabPath(file.path);
    } catch (err: any) {
      alert(`Could not open file: ${err.message}`);
    }
  };

  const handleCloseTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tabToClose = openTabs.find((t) => t.path === path);
    if (tabToClose?.isModified) {
      if (!window.confirm(`File "${tabToClose.name}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    const remaining = openTabs.filter((t) => t.path !== path);
    setOpenTabs(remaining);
    if (activeTabPath === path) {
      setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!activeTabPath) return;
    setOpenTabs((prev) =>
      prev.map((tab) => {
        if (tab.path === activeTabPath) {
          return {
            ...tab,
            content: newContent,
            isModified: newContent !== tab.originalContent,
          };
        }
        return tab;
      })
    );
  };

  const handleSaveCurrentFile = async () => {
    const currentTab = openTabs.find((t) => t.path === activeTabPath);
    if (!currentTab || !currentTab.isModified) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentTab.path,
          content: currentTab.content,
        }),
      });

      if (!res.ok) throw new Error('Save failed');

      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === currentTab.path
            ? { ...t, originalContent: t.content, isModified: false }
            : t
        )
      );

      setSaveNotice('Saved!');
      setTimeout(() => setSaveNotice(null), 2000);
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Shell command execution
  const runShellCommand = async (cmdToRun: string) => {
    const cmd = cmdToRun.trim();
    if (!cmd) return;

    if (cmd === 'clear') {
      setShellLogs([]);
      setShellInput('');
      return;
    }

    setIsRunningCommand(true);
    setShellHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setShellInput('');

    try {
      const res = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          cwd: shellCwd || rootPath,
        }),
      });

      const data = await res.json();
      if (data.cwd) {
        setShellCwd(data.cwd);
      }

      setShellLogs((prev) => [
        ...prev,
        {
          cmd,
          output: data.output || '',
          exitCode: data.exitCode || 0,
        },
      ]);
    } catch (err: any) {
      setShellLogs((prev) => [
        ...prev,
        {
          cmd,
          output: `Command failed: ${err.message}`,
          exitCode: 1,
        },
      ]);
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleShellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      runShellCommand(shellInput);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (shellHistory.length === 0) return;
      const nextIndex = historyIndex === -1 ? shellHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setShellInput(shellHistory[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= shellHistory.length) {
        setHistoryIndex(-1);
        setShellInput('');
      } else {
        setHistoryIndex(nextIndex);
        setShellInput(shellHistory[nextIndex]);
      }
    }
  };

  const activeTab = openTabs.find((t) => t.path === activeTabPath);

  // Tab key indent handler for code textarea
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const updated = val.substring(0, start) + '  ' + val.substring(end);
      handleContentChange(updated);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  const projectName = rootPath ? rootPath.split('/').filter(Boolean).pop() || 'Workspace' : 'Workspace';

  // Recursive tree renderer
  const renderTree = (nodes: FileNode[]) => {
    return nodes.map((node) => {
      const isExpanded = !!expandedFolders[node.path];
      const isSelected = activeTabPath === node.path;

      // Filter matches
      if (searchFilter && !node.isDir && !node.name.toLowerCase().includes(searchFilter.toLowerCase())) {
        return null;
      }

      return (
        <div key={node.path} className="text-ui-xs">
          <div
            onClick={() => handleOpenFile(node)}
            className={cn(
              'flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors group select-none',
              isSelected
                ? 'bg-primary/20 text-primary font-medium'
                : 'hover:bg-foreground/5 text-foreground/85'
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {node.isDir ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="size-3.5 text-primary shrink-0" />
                  ) : (
                    <Folder className="size-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-3" />
                  <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                </>
              )}
              <span className="truncate">{node.name}</span>
            </div>

            {node.gitStatus && (
              <span
                className={cn(
                  'font-mono text-3xs font-semibold px-1 rounded',
                  node.gitStatus === 'M' && 'text-amber-500 bg-amber-500/15',
                  (node.gitStatus === '?' || node.gitStatus === '??' || node.gitStatus === 'U') && 'text-emerald-500 bg-emerald-500/15',
                  node.gitStatus === 'D' && 'text-rose-500 bg-rose-500/15'
                )}
              >
                {node.gitStatus}
              </span>
            )}
          </div>

          {node.isDir && isExpanded && node.children && (
            <div className="pl-3 border-l border-border/30 ml-2">
              {renderTree(node.children)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground select-none overflow-hidden font-sans">
      {/* Top Workspace & Tabs Bar */}
      <header className="flex h-[44px] shrink-0 items-center justify-between border-b border-border bg-chrome px-3 gap-2">
        {/* Left: Back to Chat + Project Title */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveNavTab('chat')}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors cursor-pointer"
            title="Return to Chat"
          >
            <ArrowLeft className="size-3.5" />
            <span>Chat</span>
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 text-ui-xs font-semibold text-foreground">
            <Code2 className="size-4 text-primary" />
            <span>Editor</span>
            <span className="text-muted-foreground/60 font-mono text-3xs font-normal">({projectName})</span>
          </div>
        </div>

        {/* Center: Open File Tabs */}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-none min-w-0 px-2">
          {openTabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => setActiveTabPath(tab.path)}
                className={cn(
                  'flex items-center gap-1.5 rounded-t-md px-2.5 py-1 text-ui-xs cursor-pointer border-t-2 transition-all shrink-0 max-w-[180px]',
                  isActive
                    ? 'border-primary bg-background text-foreground font-medium shadow-2xs'
                    : 'border-transparent text-muted-foreground hover:bg-background/50 hover:text-foreground'
                )}
              >
                <FileCode className="size-3.5 shrink-0" />
                <span className="truncate">{tab.name}</span>
                {tab.isModified && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.path, e)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right Tools: Save button + Shell Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeTab && (
            <button
              type="button"
              onClick={handleSaveCurrentFile}
              disabled={isSaving || !activeTab.isModified}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-ui-xs font-medium transition-all cursor-pointer',
                activeTab.isModified
                  ? 'bg-primary text-primary-foreground shadow-xs hover:opacity-90'
                  : 'bg-muted/40 text-muted-foreground opacity-50'
              )}
            >
              <Save className="size-3.5" />
              <span>{isSaving ? 'Saving…' : saveNotice || 'Save'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShellOpen(!shellOpen)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-ui-xs font-medium border border-border transition-colors cursor-pointer',
              shellOpen ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-card text-muted-foreground hover:text-foreground'
            )}
            title="Toggle Shell Control"
          >
            <Terminal className="size-3.5" />
            <span>Shell</span>
          </button>
        </div>
      </header>

      {/* Main Split: File Explorer (Left) + Code Area & Shell (Right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Pane: File Explorer */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace Files
            </span>
            <button
              type="button"
              onClick={loadWorkspace}
              title="Refresh files"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RefreshCw className={cn('size-3.5', isLoadingTree && 'animate-spin')} />
            </button>
          </div>

          {/* Search Filter */}
          <div className="p-2 border-b border-border/40">
            <div className="relative flex items-center">
              <Search className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter files..."
                className="w-full h-6.5 rounded-md bg-muted/20 border border-border/40 pl-6 pr-2 text-ui-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
          </div>

          {/* Tree View */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
            {fileTree.length > 0 ? (
              renderTree(fileTree)
            ) : (
              <div className="p-4 text-center text-ui-xs text-muted-foreground">
                {isLoadingTree ? 'Loading files…' : 'No files found in workspace'}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Editor Content + Bottom Shell Control */}
        <div className="flex flex-1 flex-col min-w-0 bg-background overflow-hidden">
          {/* Code Editor Pane */}
          <div className="flex-1 min-h-0 relative flex overflow-hidden">
            {activeTab ? (
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Line Numbers Gutter */}
                <div className="w-12 shrink-0 select-none bg-muted/15 border-r border-border/30 py-3 text-right font-mono text-ui-xs text-muted-foreground/50 pr-2">
                  {activeTab.content.split('\n').map((_, i) => (
                    <div key={i} className="leading-5">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Textarea Code Surface */}
                <textarea
                  ref={editorTextareaRef}
                  value={activeTab.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  spellCheck={false}
                  className="flex-1 min-w-0 h-full resize-none bg-background p-3 font-mono text-ui-xs leading-5 text-foreground focus:outline-hidden selection:bg-primary/25 border-none"
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <FileCode className="size-10 opacity-30 mb-2" />
                <p className="text-ui-sm font-medium">No file open</p>
                <p className="text-ui-xs opacity-70 mt-1">
                  Select a file from the explorer on the left to start editing.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Shell Control (Integrated Terminal) */}
          {shellOpen && (
            <div
              style={{ height: `${shellHeight}px` }}
              className="flex shrink-0 flex-col border-t border-border bg-card/60 shadow-lg min-h-[120px] max-h-[500px]"
            >
              {/* Shell Header & Actions */}
              <div className="flex h-8 shrink-0 items-center justify-between px-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <Terminal className="size-3.5 text-primary" />
                  <span className="text-[11px] font-semibold text-foreground">Shell Control</span>
                  <span className="font-mono text-3xs text-muted-foreground truncate max-w-[280px]">
                    {shellCwd || rootPath}
                  </span>
                </div>

                {/* Quick actions pills */}
                <div className="flex items-center gap-1 text-3xs font-mono">
                  <button
                    type="button"
                    onClick={() => runShellCommand('git status')}
                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground/80 hover:text-foreground cursor-pointer"
                  >
                    git status
                  </button>
                  <button
                    type="button"
                    onClick={() => runShellCommand('npm run build')}
                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground/80 hover:text-foreground cursor-pointer"
                  >
                    npm build
                  </button>
                  <button
                    type="button"
                    onClick={() => runShellCommand('ls -la')}
                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground/80 hover:text-foreground cursor-pointer"
                  >
                    ls
                  </button>
                  <button
                    type="button"
                    onClick={() => setShellLogs([])}
                    title="Clear terminal output"
                    className="p-1 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>

              {/* Terminal Logs Output */}
              <div
                ref={terminalOutputRef}
                className="flex-1 min-h-0 overflow-y-auto p-2.5 font-mono text-2xs space-y-2 select-text"
              >
                {shellLogs.map((log, index) => (
                  <div key={index} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-primary font-semibold">
                      <span>$</span>
                      <span>{log.cmd}</span>
                      {log.exitCode !== 0 && (
                        <span className="text-destructive font-mono text-3xs">
                          (exit {log.exitCode})
                        </span>
                      )}
                    </div>
                    {log.output && (
                      <pre className="whitespace-pre-wrap break-all text-foreground/80 pl-2 leading-relaxed font-mono">
                        {log.output}
                      </pre>
                    )}
                  </div>
                ))}
                {isRunningCommand && (
                  <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
                    <RefreshCw className="size-3 animate-spin" />
                    <span>Running command…</span>
                  </div>
                )}
              </div>

              {/* Shell Command Input Bar */}
              <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 border-t border-border bg-background">
                <span className="font-mono text-ui-xs font-bold text-primary">$</span>
                <input
                  type="text"
                  value={shellInput}
                  onChange={(e) => setShellInput(e.target.value)}
                  onKeyDown={handleShellKeyDown}
                  disabled={isRunningCommand}
                  placeholder="Execute server command (e.g. npm test, ls, git log)..."
                  className="flex-1 h-6 bg-transparent font-mono text-ui-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => runShellCommand(shellInput)}
                  disabled={isRunningCommand || !shellInput.trim()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-3xs font-semibold hover:opacity-90 disabled:opacity-30 cursor-pointer"
                >
                  <Play className="size-2.5" />
                  <span>Run</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default SimpleEditorView;
