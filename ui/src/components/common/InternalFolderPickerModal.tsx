import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderGit2,
  CornerLeftUp,
  Search,
  Check,
  X,
  RefreshCw,
  HardDrive,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/cn';

interface DirectoryEntry {
  name: string;
  path: string;
  isGit: boolean;
  modTime?: string;
}

interface BrowseResponse {
  current: string;
  parent: string;
  isGit: boolean;
  dirs: DirectoryEntry[];
  presets: Array<{ label: string; path: string }>;
}

interface InternalFolderPickerModalProps {
  isOpen: boolean;
  initialPath?: string;
  onSelectFolder: (path: string) => void;
  onClose: () => void;
  title?: string;
}

export const InternalFolderPickerModal: React.FC<InternalFolderPickerModalProps> = ({
  isOpen,
  initialPath,
  onSelectFolder,
  onClose,
  title = 'Pick Server Folder',
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '');
  const [pathInput, setPathInput] = useState<string>(initialPath || '');
  const [parentPath, setParentPath] = useState<string>('');
  const [isCurrentGit, setIsCurrentGit] = useState<boolean>(false);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [presets, setPresets] = useState<Array<{ label: string; path: string }>>([]);
  const [selectedDir, setSelectedDir] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = target
        ? `/api/workspace/browse?dir=${encodeURIComponent(target)}`
        : '/api/workspace/browse';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to read folder (${res.status})`);
      }
      const data: BrowseResponse = await res.json();
      setCurrentPath(data.current);
      setPathInput(data.current);
      setParentPath(data.parent || '');
      setIsCurrentGit(Boolean(data.isGit));
      setDirectories(data.dirs || []);
      setPresets(data.presets || []);
      setSelectedDir(data.current);
    } catch (err: any) {
      setError(err?.message || 'Could not load directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDirectory(initialPath || '');
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const filteredDirs = directories.filter((d) =>
    d.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  const handleNavigateBreadcrumb = (index: number) => {
    const target = '/' + breadcrumbs.slice(0, index + 1).join('/');
    fetchDirectory(target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="flex flex-col w-full max-w-2xl max-h-[85vh] rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4.5 text-primary" />
            <h2 className="text-ui-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Quick Presets */}
        {presets.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 px-4 py-2 border-b border-border/60 bg-muted/10 overflow-x-auto scrollbar-none text-ui-xs">
            <span className="text-muted-foreground shrink-0 font-medium mr-1">Presets:</span>
            {presets.map((preset) => (
              <button
                key={preset.path}
                type="button"
                onClick={() => fetchDirectory(preset.path)}
                className={cn(
                  'px-2 py-0.5 rounded-md border border-border/50 transition-colors shrink-0 cursor-pointer',
                  currentPath === preset.path
                    ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                    : 'bg-card text-foreground/80 hover:bg-foreground/5 hover:text-foreground'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Path Bar & Breadcrumbs */}
        <div className="flex shrink-0 flex-col gap-1.5 px-4 py-2.5 border-b border-border bg-muted/5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!parentPath || loading}
              onClick={() => parentPath && fetchDirectory(parentPath)}
              title="Go to parent directory"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <CornerLeftUp className="size-3.5" />
            </button>
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pathInput.trim()) {
                    fetchDirectory(pathInput.trim());
                  }
                }}
                placeholder="Enter server folder path..."
                className="w-full h-7 rounded-md border border-border bg-background px-2.5 text-ui-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchDirectory(pathInput.trim())}
              disabled={loading}
              className="px-2.5 h-7 rounded-md bg-accent border border-border text-ui-xs font-medium text-foreground hover:bg-accent/80 transition-colors cursor-pointer shrink-0"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => fetchDirectory(currentPath)}
              disabled={loading}
              title="Refresh"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors cursor-pointer"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </div>

          {/* Breadcrumbs Row */}
          <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-mono text-muted-foreground scrollbar-none py-0.5">
            <span
              onClick={() => fetchDirectory('/')}
              className="cursor-pointer hover:text-foreground hover:underline"
            >
              /
            </span>
            {breadcrumbs.map((seg, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight className="size-3 shrink-0 opacity-40" />
                <span
                  onClick={() => handleNavigateBreadcrumb(idx)}
                  className={cn(
                    'cursor-pointer hover:text-foreground truncate max-w-[120px]',
                    idx === breadcrumbs.length - 1 ? 'text-primary font-semibold' : 'hover:underline'
                  )}
                >
                  {seg}
                </span>
              </React.Fragment>
            ))}
            {isCurrentGit && (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.2 text-[10px] font-medium text-success shrink-0">
                <FolderGit2 className="size-3" />
                Git Repo
              </span>
            )}
          </div>
        </div>

        {/* Search inside folder */}
        <div className="flex shrink-0 items-center px-4 py-2 border-b border-border/50">
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter subfolders..."
              className="w-full h-7 rounded-md bg-muted/20 border border-border/40 pl-7 pr-3 text-ui-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:border-primary"
            />
          </div>
        </div>

        {/* Directory List */}
        <div className="flex-1 min-h-[220px] max-h-[360px] overflow-y-auto p-2 divide-y divide-border/20">
          {error && (
            <div className="p-4 text-center text-ui-xs text-destructive">
              {error}
            </div>
          )}

          {!error && !loading && filteredDirs.length === 0 && (
            <div className="p-8 text-center text-ui-xs text-muted-foreground">
              {filterQuery ? 'No subfolders match your filter.' : 'No subfolders found in this directory.'}
            </div>
          )}

          {filteredDirs.map((dir) => {
            const isSelected = selectedDir === dir.path;
            return (
              <div
                key={dir.path}
                onClick={() => setSelectedDir(dir.path)}
                onDoubleClick={() => fetchDirectory(dir.path)}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors group',
                  isSelected
                    ? 'bg-primary/15 text-foreground font-medium border border-primary/30'
                    : 'hover:bg-foreground/5 text-foreground/85'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {dir.isGit ? (
                    <FolderGit2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <Folder className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  )}
                  <span className="truncate text-ui-sm font-medium">{dir.name}</span>
                  {dir.isGit && (
                    <span className="text-[10px] rounded px-1.5 py-0.2 bg-primary/10 text-primary font-semibold shrink-0">
                      Git
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchDirectory(dir.path);
                    }}
                    className="text-ui-xs px-2 py-0.5 rounded bg-muted/40 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
          <div className="text-ui-xs text-muted-foreground truncate max-w-[340px]">
            Selected: <span className="font-mono text-foreground font-medium">{selectedDir || currentPath}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-ui-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const target = selectedDir || currentPath;
                if (target) {
                  onSelectFolder(target);
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-ui-xs font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Check className="size-3.5" />
              <span>Select Folder</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default InternalFolderPickerModal;
