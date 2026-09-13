import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  X,
  Search,
  Check,
  ChevronRight,
  ChevronDown,
  Code2,
  FolderPlus,
} from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  modTime: string;
  gitStatus?: string;
  children?: FileItem[];
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
}

export const EditorPane: React.FC = () => {
  const [tree, setTree] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['.']));
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Modal dialog states
  const [showNewModal, setShowNewModal] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [selectedFolderForNew, setSelectedFolderForNew] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Load tree from backend
  const loadTree = useCallback(async () => {
    setIsLoadingTree(true);
    try {
      const res = await fetch('/api/workspace/tree?depth=4');
      if (res.ok) {
        const data = await res.json();
        setTree(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load workspace tree:', err);
    } finally {
      setIsLoadingTree(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Open a file
  const openFile = async (item: FileItem) => {
    if (item.isDir) {
      toggleFolder(item.path);
      return;
    }

    const existing = openTabs.find((t) => t.path === item.path);
    if (existing) {
      setActiveTabPath(item.path);
      return;
    }

    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(item.path)}`);
      if (res.ok) {
        const data = await res.json();
        const tab: OpenTab = {
          path: item.path,
          name: item.name,
          content: data.content || '',
          savedContent: data.content || '',
          isDirty: false,
        };
        setOpenTabs((prev) => [...prev, tab]);
        setActiveTabPath(item.path);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  // Close a tab
  const closeTab = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const remaining = openTabs.filter((t) => t.path !== path);
    setOpenTabs(remaining);
    if (activeTabPath === path) {
      setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  };

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const activeTab = openTabs.find((t) => t.path === activeTabPath);

  // Content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (!activeTabPath) return;

    setOpenTabs((prev) =>
      prev.map((t) =>
        t.path === activeTabPath
          ? {
              ...t,
              content: val,
              isDirty: val !== t.savedContent,
            }
          : t
      )
    );
  };

  // Save active file
  const saveActiveFile = async () => {
    if (!activeTab || !activeTab.isDirty) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeTab.path,
          content: activeTab.content,
        }),
      });
      if (res.ok) {
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.path === activeTab.path
              ? { ...t, savedContent: t.content, isDirty: false }
              : t
          )
        );
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(null), 2000);
        loadTree();
      } else {
        setSaveStatus('Error saving');
      }
    } catch (err) {
      setSaveStatus('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Sync scroll for line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Tab key indents with 2 spaces
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const current = ta.value;
      const updated = current.substring(0, start) + '  ' + current.substring(end);
      ta.value = updated;
      ta.selectionStart = ta.selectionEnd = start + 2;
      handleContentChange({ target: { value: updated } } as any);
    }
  };

  // Create new item
  const handleCreateNew = async () => {
    if (!newItemName.trim() || !showNewModal) return;
    const cleanName = newItemName.trim();
    const targetPath = selectedFolderForNew
      ? `${selectedFolderForNew}/${cleanName}`
      : cleanName;

    try {
      if (showNewModal === 'file') {
        await fetch('/api/workspace/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath, content: '' }),
        });
        openFile({
          name: cleanName,
          path: targetPath,
          fullPath: targetPath,
          isDir: false,
          size: 0,
          modTime: '',
        });
      } else {
        await fetch('/api/workspace/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath }),
        });
      }
      setShowNewModal(null);
      setNewItemName('');
      loadTree();
    } catch (err) {
      console.error('Failed to create:', err);
    }
  };

  // Delete item
  const handleDeleteItem = async (item: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete ${item.isDir ? 'folder' : 'file'} "${item.name}"?`)) return;

    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(item.path)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        closeTab(item.path);
        loadTree();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Icon chooser
  const getFileIcon = (name: string, isDir: boolean, isExpanded: boolean) => {
    if (isDir) {
      return isExpanded ? (
        <FolderOpen size={14} className="text-[#007AFF] flex-shrink-0" />
      ) : (
        <Folder size={14} className="text-[#007AFF] flex-shrink-0" />
      );
    }
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'go':
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'py':
      case 'rs':
        return <FileCode size={14} className="text-[#8A8A85] flex-shrink-0" />;
      case 'json':
      case 'yaml':
      case 'yml':
      case 'toml':
        return <FileJson size={14} className="text-[#8A8A85] flex-shrink-0" />;
      case 'md':
      case 'txt':
        return <FileText size={14} className="text-[#8A8A85] flex-shrink-0" />;
      default:
        return <File size={14} className="text-[#8A8A85] flex-shrink-0" />;
    }
  };

  // Render tree node recursively matching refs/desktop/code-editor.html
  const renderTree = (items: FileItem[], level = 0) => {
    return items
      .filter((i) => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .map((item) => {
        const isExpanded = expandedFolders.has(item.path);
        const isSelected = activeTabPath === item.path;

        return (
          <div key={item.path} className="select-none">
            <div
              onClick={() => openFile(item)}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
              className={`flex items-center gap-1.5 py-1.5 pr-2 rounded-[4px] cursor-pointer group text-xs transition-colors ${
                isSelected
                  ? 'bg-[#FFF5EB] text-[#000000] font-medium'
                  : 'text-[#333333] hover:text-[#000000] hover:bg-[#F7F7F5]'
              }`}
            >
              {item.isDir ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(item.path);
                  }}
                  className="w-3 text-[9px] text-[#8A8A85] hover:text-[#000000] flex items-center justify-center font-geist"
                >
                  {isExpanded ? '▾' : '▸'}
                </span>
              ) : (
                <span className="w-3" />
              )}

              {getFileIcon(item.name, item.isDir, isExpanded)}
              <span className="truncate flex-1 font-geist text-[12px]">{item.name}</span>

              {/* Git Status Badge matching reference */}
              {item.gitStatus && (
                <span
                  className={`text-[9px] font-mono font-bold px-1 rounded-[2px] ${
                    item.gitStatus === 'M'
                      ? 'text-[#D97706] bg-[#FFF5EB]'
                      : item.gitStatus === 'U' || item.gitStatus === '?'
                      ? 'text-[#16A34A] bg-[#E8F8EE]'
                      : 'text-red-500 bg-red-50'
                  }`}
                >
                  {item.gitStatus}
                </span>
              )}

              {/* Actions on hover */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-auto">
                {item.isDir && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFolderForNew(item.path);
                      setShowNewModal('file');
                    }}
                    title="New File inside folder"
                    className="p-1 hover:text-[#000000] text-[#8A8A85]"
                  >
                    <Plus size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => handleDeleteItem(item, e)}
                  title="Delete"
                  className="p-1 hover:text-red-500 text-[#8A8A85]"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Render children if expanded */}
            {item.isDir && isExpanded && item.children && item.children.length > 0 && (
              <div>{renderTree(item.children, level + 1)}</div>
            )}
          </div>
        );
      });
  };

  const lineCount = activeTab ? activeTab.content.split('\n').length : 0;
  const lineNumbers = Array.from({ length: Math.max(1, lineCount) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full w-full bg-[#F7F7F5] overflow-hidden">
      {/* Top Page Header matching refs/desktop/code-editor.html */}
      <div className="w-full shrink-0 h-[80px] flex flex-row gap-3.5 px-6 sm:px-9 items-center bg-[#FFFFFF] border-b border-[#E5E7EB] z-10 select-none">
        <div className="flex-1 flex flex-col gap-0.5 justify-start items-start">
          <div className="text-[20px] text-[#000000] font-inter font-bold">
            Workspace Editor
          </div>
          <div className="text-[12px] text-[#8A8A85] font-funnel font-normal">
            Sandboxed file explorer · git status annotations · ⌘S to save
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedFolderForNew('');
              setShowNewModal('file');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
            title="Create New File"
          >
            <Plus size={13} />
            <span>New File</span>
          </button>
          <button
            onClick={() => {
              setSelectedFolderForNew('');
              setShowNewModal('folder');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs"
            title="Create New Folder"
          >
            <FolderPlus size={13} />
            <span>New Folder</span>
          </button>
          <button
            onClick={loadTree}
            className="p-2 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[#333333] transition-colors shadow-2xs"
            title="Refresh Explorer"
          >
            <RefreshCw size={13} className={isLoadingTree ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Split Container */}
      <div className="w-full flex-1 flex flex-row overflow-hidden">
        {/* Left File Tree Sidebar */}
        <div className="w-[280px] shrink-0 h-full flex flex-col gap-1 p-[14px_10px] bg-[#FFFFFF] border-r border-[#E5E7EB]">
          {/* Tree Search */}
          <div className="w-full shrink-0 flex flex-row gap-2 p-[7px_10px] items-center bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] mb-1">
            <Search size={13} className="text-[#8A8A85] shrink-0" />
            <input
              type="text"
              placeholder="Filter files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-[11px] text-[#000000] placeholder:text-[#8A8A85] font-geist outline-none w-full"
            />
          </div>

          {/* Tree list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
            {tree.length === 0 ? (
              <div className="text-center text-[#8A8A85] py-8 text-xs font-funnel">
                {isLoadingTree ? 'Loading workspace...' : 'Workspace is empty.'}
              </div>
            ) : (
              renderTree(tree)
            )}
          </div>
        </div>

        {/* Right Editor Pane */}
        <div className="flex-1 h-full flex flex-col bg-[#FFFFFF] overflow-hidden">
          {/* Tabs Bar */}
          <div className="w-full h-[38px] shrink-0 flex flex-row gap-0.5 px-3 pt-2 items-end border-b border-[#E5E7EB] bg-[#FFFFFF] overflow-x-auto select-none">
            {openTabs.map((tab) => {
              const isActive = tab.path === activeTabPath;
              return (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-[4px] cursor-pointer text-[11px] font-mono transition-all ${
                    isActive
                      ? 'bg-[#FFFFFF] border border-b-0 border-[#E5E7EB] text-[#000000] font-bold'
                      : 'bg-[#F7F7F5] text-[#8A8A85] hover:text-[#000000]'
                  }`}
                >
                  <FileCode size={12} className={isActive ? 'text-[#007AFF]' : 'text-[#8A8A85]'} />
                  <span className="truncate max-w-[140px]">{tab.name}</span>
                  {tab.isDirty && (
                    <div className="w-[6px] h-[6px] bg-[#D97706] rounded-full shrink-0" title="Unsaved changes" />
                  )}
                  <button
                    onClick={(e) => closeTab(tab.path, e)}
                    className="p-0.5 text-[#8A8A85] hover:text-[#000000] rounded"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}

            {openTabs.length === 0 && (
              <div className="text-[#8A8A85] text-[11px] font-funnel italic px-2 pb-1.5">
                No file open — select a file from explorer
              </div>
            )}
          </div>

          {activeTab ? (
            <>
              {/* Code Area with deep black dark theme */}
              <div className="flex-1 flex flex-row overflow-hidden bg-[#0F0F0F]">
                {/* Line numbers column */}
                <div
                  ref={lineNumbersRef}
                  className="w-12 py-3 bg-[#0A0A0A] border-r border-[#222222] text-[#555555] text-right pr-3 select-none overflow-hidden font-mono text-[12px] leading-5 shrink-0"
                >
                  {lineNumbers.map((num) => (
                    <div key={num}>{num}</div>
                  ))}
                </div>

                {/* Monospace code textarea */}
                <textarea
                  ref={textareaRef}
                  value={activeTab.content}
                  onChange={handleContentChange}
                  onScroll={handleScroll}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="flex-1 p-3 bg-[#0F0F0F] text-[#E5E7EB] resize-none focus:outline-none font-mono text-[12px] leading-5 overflow-auto custom-scrollbar whitespace-pre tab-2"
                />
              </div>

              {/* Status Bar matching refs/desktop/code-editor.html */}
              <div className="w-full h-[38px] shrink-0 flex flex-row gap-2.5 px-4 items-center bg-[#FFFFFF] border-t border-[#E5E7EB]">
                {activeTab.isDirty ? (
                  <div className="text-[10px] text-[#D97706] font-funnel font-normal">
                    ● Unsaved changes
                  </div>
                ) : (
                  <div className="text-[10px] text-[#16A34A] font-funnel font-normal flex items-center gap-1">
                    <Check size={11} /> Saved
                  </div>
                )}

                <div className="flex-1" />

                <div className="text-[10px] text-[#8A8A85] font-funnel">
                  ⌘S save · UTF-8 · {activeTab.name.split('.').pop()?.toUpperCase() || 'PLAIN'} · {lineCount} lines
                </div>

                <button
                  onClick={saveActiveFile}
                  disabled={!activeTab.isDirty || isSaving}
                  className="px-3 py-1 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white text-[10px] font-funnel font-bold rounded-[4px] transition-colors shadow-2xs"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#F7F7F5]">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#FFFFFF] border border-[#E5E7EB] text-[#8A8A85] mb-3 shadow-2xs">
                <Code2 size={24} />
              </div>
              <h2 className="text-sm font-bold font-inter text-[#000000] mb-1">No File Open</h2>
              <p className="text-xs text-[#8A8A85] font-funnel max-w-sm">
                Select a file from the workspace explorer to view, edit, and save changes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New File / Folder Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-5 w-full max-w-sm shadow-2xl space-y-3">
            <h3 className="text-sm font-bold font-inter text-[#000000]">
              New {showNewModal === 'file' ? 'File' : 'Folder'}
            </h3>
            {selectedFolderForNew && (
              <p className="text-xs text-[#8A8A85] font-funnel">
                Location: <span className="font-mono text-[#000000]">{selectedFolderForNew}/</span>
              </p>
            )}
            <input
              type="text"
              autoFocus
              placeholder={`Enter ${showNewModal} name...`}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNew();
                if (e.key === 'Escape') setShowNewModal(null);
              }}
              className="w-full bg-[#F7F7F5] border border-[#E5E7EB] rounded-[4px] px-3 py-2 text-xs text-[#000000] focus:outline-none focus:border-[#007AFF] font-geist"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewModal(null)}
                className="px-3 py-1.5 rounded-[4px] border border-[#E5E7EB] text-xs text-[#8A8A85] hover:text-[#000000] font-funnel"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNew}
                disabled={!newItemName.trim()}
                className="px-4 py-1.5 rounded-[4px] bg-[#007AFF] text-white text-xs font-bold font-funnel hover:bg-[#0066D6] disabled:opacity-50"
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
