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
  X,
  Search,
  Check,
  Code2,
  FolderPlus,
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { navigate } from '../router';

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

interface RootPreset {
  label: string;
  path: string;
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

  // Responsive mobile view switcher ('tree' for file explorer, 'editor' for code viewer)
  const [mobileView, setMobileView] = useState<'tree' | 'editor'>('tree');

  // Workspace Root & Picker states
  const [currentRoot, setCurrentRoot] = useState<string>('');
  const [presets, setPresets] = useState<RootPreset[]>([]);
  const [showPickerModal, setShowPickerModal] = useState<boolean>(false);
  const [manualPathInput, setManualPathInput] = useState<string>('');
  const [isSwitchingRoot, setIsSwitchingRoot] = useState<boolean>(false);

  // Modal dialog states
  const [showNewModal, setShowNewModal] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [selectedFolderForNew, setSelectedFolderForNew] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Load workspace root
  const loadRoot = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/root');
      if (res.ok) {
        const data = await res.json();
        if (data.current) {
          setCurrentRoot(data.current);
          setManualPathInput(data.current);
        }
        if (Array.isArray(data.presets)) {
          setPresets(data.presets);
        }
      }
    } catch (err) {
      console.error('Failed to load workspace root:', err);
    }
  }, []);

  // Switch workspace root
  const switchRoot = async (targetPath: string) => {
    if (!targetPath.trim()) return;
    setIsSwitchingRoot(true);
    try {
      const res = await fetch('/api/workspace/root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.current) {
          setCurrentRoot(data.current);
          setManualPathInput(data.current);
          setShowPickerModal(false);
          setExpandedFolders(new Set(['.']));
          setOpenTabs([]);
          setActiveTabPath(null);
          await loadTree();
        }
      }
    } catch (err) {
      console.error('Failed to switch workspace root:', err);
    } finally {
      setIsSwitchingRoot(false);
    }
  };

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
    loadRoot();
    loadTree();
  }, [loadRoot, loadTree]);

  // Open a file
  const openFile = async (item: FileItem) => {
    if (item.isDir) {
      toggleFolder(item.path);
      return;
    }

    const existing = openTabs.find((t) => t.path === item.path);
    if (existing) {
      setActiveTabPath(item.path);
      setMobileView('editor');
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
        setMobileView('editor');
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
    if (remaining.length === 0) {
      setMobileView('tree');
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
    } catch {
      setSaveStatus('Error saving');
    } finally {
      setIsSaving(false);
    }
  };

  // Sync scroll
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveActiveFile();
    }
  };

  // Create new file or folder
  const handleCreateNew = async () => {
    if (!newItemName.trim()) return;

    const targetPath = selectedFolderForNew
      ? `${selectedFolderForNew}/${newItemName.trim()}`
      : newItemName.trim();

    if (showNewModal === 'file') {
      try {
        const res = await fetch('/api/workspace/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath, content: '' }),
        });
        if (res.ok) {
          setShowNewModal(null);
          setNewItemName('');
          await loadTree();
          const item: FileItem = {
            name: newItemName.trim(),
            path: targetPath,
            fullPath: targetPath,
            isDir: false,
            size: 0,
            modTime: new Date().toISOString(),
          };
          openFile(item);
        }
      } catch (err) {
        console.error('Failed to create file:', err);
      }
    } else if (showNewModal === 'folder') {
      try {
        const res = await fetch('/api/workspace/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath }),
        });
        if (res.ok) {
          setShowNewModal(null);
          setNewItemName('');
          await loadTree();
        }
      } catch (err) {
        console.error('Failed to create folder:', err);
      }
    }
  };

  // Delete item
  const handleDeleteItem = async (item: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;

    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(item.path)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        closeTab(item.path);
        loadTree();
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const getFileIcon = (name: string, isDir: boolean, isExpanded: boolean) => {
    if (isDir) {
      return isExpanded ? (
        <FolderOpen size={14} className="text-[#007AFF] flex-shrink-0" />
      ) : (
        <Folder size={14} className="text-[#8A8A85] flex-shrink-0" />
      );
    }
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'go':
      case 'py':
      case 'rs':
      case 'sh':
        return <FileCode size={14} className="text-[#007AFF] flex-shrink-0" />;
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
      {/* Top Page Header */}
      <div className="w-full shrink-0 h-[64px] sm:h-[70px] flex flex-row gap-2 sm:gap-3.5 px-3 sm:px-6 md:px-9 items-center bg-[#FFFFFF] border-b border-[#E5E7EB] z-10 select-none">
        <div className="flex-1 flex flex-col gap-0.5 justify-start items-start min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 max-w-full">
            <span className="text-[15px] sm:text-[18px] text-[#000000] font-inter font-bold truncate">Workspace</span>
            <button
              onClick={() => setShowPickerModal(true)}
              className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 bg-[#F7F7F5] hover:bg-[#EBF5FF] text-[#007AFF] text-[10px] sm:text-[11px] font-mono rounded border border-[#E5E7EB] hover:border-[#BFDBFE] transition-colors cursor-pointer truncate max-w-[130px] sm:max-w-[220px]"
              title="Click to switch root folder"
            >
              <FolderOpen size={11} className="shrink-0" />
              <span className="truncate">{currentRoot.split('/').pop() || '~'}</span>
              <ChevronDown size={11} className="shrink-0" />
            </button>
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#8A8A85] font-funnel font-normal truncate max-w-xs sm:max-w-lg hidden xs:block">
            Active: <span className="font-mono text-[#333333]">{currentRoot}</span>
          </div>
        </div>

        {/* Mobile View Toggle if tabs open */}
        {openTabs.length > 0 && (
          <div className="flex md:hidden items-center bg-[#F7F7F5] p-0.5 rounded-[6px] border border-[#E5E7EB]">
            <button
              onClick={() => setMobileView('tree')}
              className={`px-2 py-1 text-[10px] font-funnel rounded-[4px] transition-colors ${
                mobileView === 'tree' ? 'bg-[#FFFFFF] text-[#007AFF] font-bold shadow-2xs' : 'text-[#8A8A85]'
              }`}
            >
              Files
            </button>
            <button
              onClick={() => setMobileView('editor')}
              className={`px-2 py-1 text-[10px] font-funnel rounded-[4px] transition-colors ${
                mobileView === 'editor' ? 'bg-[#FFFFFF] text-[#007AFF] font-bold shadow-2xs' : 'text-[#8A8A85]'
              }`}
            >
              Code {openTabs.some((t) => t.isDirty) && '●'}
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Dedicated Shell Terminal Nav Button */}
          <button
            onClick={() => navigate('terminal')}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs cursor-pointer"
            title="Open Dedicated Shell Terminal"
          >
            <TerminalIcon size={13} className="text-[#16A34A]" />
            <span className="hidden sm:inline">Shell</span>
          </button>

          <button
            onClick={() => {
              setSelectedFolderForNew('');
              setShowNewModal('file');
            }}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs cursor-pointer"
            title="Create New File"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">File</span>
          </button>
          <button
            onClick={() => {
              setSelectedFolderForNew('');
              setShowNewModal('folder');
            }}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[11px] font-funnel text-[#333333] transition-colors shadow-2xs cursor-pointer"
            title="Create New Folder"
          >
            <FolderPlus size={13} />
            <span className="hidden sm:inline">Folder</span>
          </button>
          <button
            onClick={loadTree}
            className="p-1.5 sm:p-2 bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#333333] rounded-[4px] text-[#333333] transition-colors shadow-2xs cursor-pointer"
            title="Refresh Explorer"
          >
            <RefreshCw size={13} className={isLoadingTree ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Split Container */}
      <div className="w-full flex-1 flex flex-row overflow-hidden min-h-0">
        {/* Left File Tree Sidebar - on mobile, full width when in 'tree' mode, hidden when in 'editor' mode */}
        <div className={`w-full md:w-[280px] shrink-0 h-full flex flex-col gap-1 p-[10px_8px] sm:p-[14px_10px] bg-[#FFFFFF] border-r border-[#E5E7EB] ${
          mobileView === 'editor' ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Quick Root Folder Display */}
          <div
            onClick={() => setShowPickerModal(true)}
            className="w-full flex items-center justify-between p-2 mb-1 bg-[#F7F7F5] hover:bg-[#EBF5FF] border border-[#E5E7EB] rounded-[4px] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Folder size={13} className="text-[#007AFF] shrink-0" />
              <span className="text-[11px] font-mono font-medium text-black truncate" title={currentRoot}>
                {currentRoot.split('/').pop() || '~'}
              </span>
            </div>
            <span className="text-[10px] text-[#007AFF] font-funnel shrink-0 font-medium">Switch</span>
          </div>

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
                {isLoadingTree ? 'Loading workspace...' : 'Directory is empty.'}
              </div>
            ) : (
              renderTree(tree)
            )}
          </div>
        </div>

        {/* Right Editor Pane - on mobile, full width when in 'editor' mode, hidden when in 'tree' mode */}
        <div className={`flex-1 h-full flex flex-col bg-[#FFFFFF] overflow-hidden ${
          mobileView === 'tree' ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Tabs Bar */}
          <div className="w-full h-[38px] shrink-0 flex flex-row items-center gap-0.5 px-2 sm:px-3 border-b border-[#E5E7EB] bg-[#FFFFFF] overflow-x-auto select-none">
            {/* Mobile Back to Tree button */}
            <button
              onClick={() => setMobileView('tree')}
              className="md:hidden flex items-center gap-1 px-2 py-1 bg-[#F7F7F5] hover:bg-[#E5E7EB] border border-[#E5E7EB] rounded text-[11px] font-funnel text-[#333333] shrink-0 mr-1 cursor-pointer"
              title="Back to file list"
            >
              <ArrowLeft size={12} />
              <span>Files</span>
            </button>

            {openTabs.map((tab) => {
              const isActive = tab.path === activeTabPath;
              return (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-t-[4px] cursor-pointer text-[11px] font-mono transition-all ${
                    isActive
                      ? 'bg-[#FFFFFF] border border-b-0 border-[#E5E7EB] text-[#000000] font-bold'
                      : 'bg-[#F7F7F5] text-[#8A8A85] hover:text-[#000000]'
                  }`}
                >
                  <FileCode size={12} className={isActive ? 'text-[#007AFF]' : 'text-[#8A8A85]'} />
                  <span className="truncate max-w-[110px] sm:max-w-[140px]">{tab.name}</span>
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
              <div className="text-[#8A8A85] text-[11px] font-funnel italic px-2">
                No file open — select a file from explorer
              </div>
            )}
          </div>

          {/* Main Workspace Area (Code Editor) */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeTab ? (
              <>
                <div className="flex-1 flex flex-row overflow-hidden bg-[#0F0F0F]">
                  <div
                    ref={lineNumbersRef}
                    className="w-10 sm:w-12 py-3 bg-[#0A0A0A] border-r border-[#222222] text-[#555555] text-right pr-2 sm:pr-3 select-none overflow-hidden font-mono text-[11px] sm:text-[12px] leading-5 shrink-0"
                  >
                    {lineNumbers.map((num) => (
                      <div key={num}>{num}</div>
                    ))}
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={activeTab.content}
                    onChange={handleContentChange}
                    onScroll={handleScroll}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    className="flex-1 p-2 sm:p-3 bg-[#0F0F0F] text-[#E5E7EB] resize-none focus:outline-none font-mono text-[11px] sm:text-[12px] leading-5 overflow-auto custom-scrollbar whitespace-pre tab-2"
                  />
                </div>

                <div className="w-full h-[36px] shrink-0 flex flex-row gap-2 px-3 sm:px-4 items-center bg-[#FFFFFF] border-t border-[#E5E7EB]">
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

                  <div className="text-[10px] text-[#8A8A85] font-funnel hidden sm:block">
                    ⌘S save · UTF-8 · {activeTab.name.split('.').pop()?.toUpperCase() || 'PLAIN'} · {lineCount} lines
                  </div>

                  <button
                    onClick={saveActiveFile}
                    disabled={!activeTab.isDirty || isSaving}
                    className="px-3 py-1 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white text-[10px] font-funnel font-bold rounded-[4px] transition-colors shadow-2xs cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 sm:p-8 bg-[#F7F7F5]">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#FFFFFF] border border-[#E5E7EB] text-[#8A8A85] mb-3 shadow-2xs">
                  <Code2 size={24} />
                </div>
                <h2 className="text-sm font-bold font-inter text-[#000000] mb-1">No File Open</h2>
                <p className="text-xs text-[#8A8A85] font-funnel max-w-sm mb-4">
                  Select a file from the workspace explorer to view or edit code.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMobileView('tree')}
                    className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-[#007AFF] text-white text-xs font-bold rounded-[6px] cursor-pointer"
                  >
                    <Folder size={13} />
                    <span>Browse Files</span>
                  </button>
                  <button
                    onClick={() => navigate('terminal')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0F0F] text-white text-xs font-bold rounded-[6px] cursor-pointer"
                  >
                    <TerminalIcon size={13} />
                    <span>Open Shell Terminal</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 📁 Folder Picker Modal (Switch Root Directory) */}
      {showPickerModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[10px] p-6 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-[#007AFF]" />
                <h3 className="text-sm font-bold font-inter text-black dark:text-white">
                  Pick Workspace Root Directory
                </h3>
              </div>
              <button onClick={() => setShowPickerModal(false)} className="text-[#8A8A85] hover:text-black dark:hover:text-white">
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-[#8A8A85] font-funnel">
              Select a quick preset or enter any absolute/relative directory on disk to explore and edit.
            </p>

            {/* Quick Presets */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[#8A8A85] uppercase tracking-wider">Presets</div>
              <div className="grid grid-cols-1 gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.path}
                    onClick={() => switchRoot(preset.path)}
                    className="w-full p-2.5 bg-[#F7F7F5] dark:bg-[#1C1C1E] hover:bg-[#EBF5FF] dark:hover:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-left flex items-center justify-between transition-colors group cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium text-black dark:text-white font-sans">
                        {preset.label}
                      </span>
                      <span className="text-[10px] text-[#8A8A85] font-mono truncate max-w-xs">
                        {preset.path}
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-[#8A8A85] group-hover:text-[#007AFF] transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Path Input */}
            <div className="space-y-2 pt-2 border-t border-[#E5E7EB] dark:border-[#27272A]">
              <label className="text-[11px] font-bold text-[#8A8A85] uppercase tracking-wider">
                Or Enter Custom Directory Path
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualPathInput}
                  onChange={(e) => setManualPathInput(e.target.value)}
                  placeholder="e.g. ~/workspaces or /Users/..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') switchRoot(manualPathInput);
                  }}
                  className="flex-1 bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] px-3 py-2 text-xs font-mono text-black dark:text-white outline-none focus:border-[#007AFF]"
                />
                <button
                  onClick={() => switchRoot(manualPathInput)}
                  disabled={isSwitchingRoot || !manualPathInput.trim()}
                  className="px-4 py-2 bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-40 text-white text-xs font-bold font-funnel rounded-[6px] transition-colors"
                >
                  {isSwitchingRoot ? 'Opening...' : 'Open'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
