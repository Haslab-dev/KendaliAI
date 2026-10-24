import React, { useEffect, useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  FileCode,
  FileText,
  FileJson,
  File,
  Code2,
  Presentation,
  Video,
  Download,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export interface FileNode {
  name: string;
  path: string;
  fullPath?: string;
  isDir: boolean;
  size?: number;
  modTime?: string;
  gitStatus?: string;
  children?: FileNode[];
}

interface SidebarFileExplorerProps {
  onSelectFile?: (filePath: string) => void;
  activeFilePath?: string | null;
}

function getIconForFile(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.deck.html') || lower.endsWith('.slide.html')) {
    return <Presentation size={14} className="text-amber-500 shrink-0" />;
  }
  if (lower.endsWith('.motion.html') || lower.endsWith('.video.html')) {
    return <Video size={14} className="text-purple-500 shrink-0" />;
  }
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx')) {
    return <FileCode size={14} className="text-blue-400 shrink-0" />;
  }
  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return <FileJson size={14} className="text-amber-400 shrink-0" />;
  }
  if (lower.endsWith('.go')) {
    return <Code2 size={14} className="text-cyan-400 shrink-0" />;
  }
  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    return <FileText size={14} className="text-neutral-400 shrink-0" />;
  }
  return <File size={14} className="text-neutral-400 shrink-0" />;
}

export const SidebarFileExplorer: React.FC<SidebarFileExplorerProps> = ({
  onSelectFile,
  activeFilePath,
}) => {
  const { activeWorkspacePath } = useAppStore();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '.': true });
  const [isLoading, setIsLoading] = useState(false);

  const loadTree = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/workspace/tree?depth=4');
      if (res.ok) {
        const data = await res.json();
        setTree(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load file explorer tree:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, [activeWorkspacePath]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const filterTreeNodes = (nodes: FileNode[], q: string): FileNode[] => {
    if (!q) return nodes;
    const lower = q.toLowerCase();
    const result: FileNode[] = [];
    for (const n of nodes) {
      const nameMatch = (n.name || '').toLowerCase().includes(lower);
      if (n.isDir) {
        const childMatches = n.children ? filterTreeNodes(n.children, q) : [];
        if (nameMatch || childMatches.length > 0) {
          result.push({ ...n, children: childMatches });
        }
      } else if (nameMatch) {
        result.push(n);
      }
    }
    return result;
  };

  const filteredTree = useMemo(() => filterTreeNodes(tree, query.trim()), [tree, query]);

  const renderNode = (node: FileNode, depth = 0) => {
    const isDir = node.isDir;
    const isExpanded = !!expanded[node.path] || !!query.trim();
    const isActive = activeFilePath === node.path || activeFilePath === node.fullPath;

    if (isDir) {
      return (
        <div key={node.path || node.name} className="select-none">
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className="w-full flex items-center gap-1.5 py-1 px-2 rounded hover:bg-white/5 text-mid hover:text-hi text-xs transition-colors text-left group"
          >
            {isExpanded ? (
              <ChevronDown size={12} className="text-dim group-hover:text-mid shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-dim group-hover:text-mid shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="text-amber-400 shrink-0" />
            ) : (
              <Folder size={14} className="text-amber-400/80 shrink-0" />
            )}
            <span className="truncate flex-1 font-mono text-[11.5px]">{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    return (
      <div key={node.path || node.name} className="select-none group/row flex items-center">
        <button
          type="button"
          onClick={() => onSelectFile?.(node.path)}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          className={`w-full flex items-center gap-1.5 py-1 px-2 rounded text-xs transition-colors text-left ${
            isActive
              ? 'bg-[#007AFF]/15 text-[#007AFF] font-medium'
              : 'hover:bg-white/5 text-mid hover:text-hi'
          }`}
          title={node.path}
        >
          {getIconForFile(node.name)}
          <span className="truncate flex-1 font-mono text-[11.5px]">{node.name}</span>
          {node.name.endsWith('.deck.html') && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-sans">
              Deck
            </span>
          )}
          {node.name.endsWith('.motion.html') && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-sans">
              Motion
            </span>
          )}
          <a
            href={`/api/workspace/download?path=${encodeURIComponent(node.path)}`}
            download
            onClick={(e) => e.stopPropagation()}
            title={`Download ${node.name}`}
            className="p-1 rounded hover:bg-white/10 text-dim hover:text-hi opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
          >
            <Download size={12} />
          </a>
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent text-hi font-sans select-none">
      {/* Search & Actions */}
      <div className="p-2 border-b border-line/60 flex items-center gap-1.5">
        <div className="relative flex-1 flex items-center">
          <Search size={12} className="absolute left-2.5 text-dim pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-inputbg text-hi text-[11px] font-sans pl-7 pr-2 py-1 rounded-[6px] border border-line focus:outline-none focus:border-[#007AFF]"
          />
        </div>
        <button
          type="button"
          onClick={loadTree}
          className="p-1 rounded hover:bg-white/10 text-dim hover:text-hi transition-colors"
          title="Refresh tree"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tree list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
        {filteredTree.length === 0 ? (
          <div className="p-4 text-center text-dim text-xs">
            {isLoading ? 'Scanning workspace...' : 'No files found'}
          </div>
        ) : (
          filteredTree.map((item) => renderNode(item, 0))
        )}
      </div>
    </div>
  );
};
