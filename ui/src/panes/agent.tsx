import React, { useState, useEffect } from 'react';
import { AgentSidebar } from '../components/agent/AgentSidebar';
import { AgentChatView } from '../components/agent/AgentChatView';
import { DeckMotionViewer } from '../components/DeckMotionViewer';
import { useAppStore } from '../store/useAppStore';
import { X, ExternalLink, Presentation, Video } from 'lucide-react';

export const AgentPane: React.FC = () => {
  const {
    activeAgentSessionId,
    activeSessionId,
    sessions,
    createAgentSession,
    selectAgentSession,
    activeWorkspacePath,
  } = useAppStore();

  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSidebarExplorerVisible, setIsSidebarExplorerVisible] = useState(false);

  // Ensure an agent session is active when entering this pane
  useEffect(() => {
    const currentId = activeAgentSessionId || activeSessionId;
    const currentSess = sessions.find((s) => s.id === currentId);
    const isAgent = currentSess?.type === 'agent' || currentSess?.metadata?.includes('"mode":"agent"');

    if (!isAgent) {
      // Find the most recent agent session
      const existingAgent = sessions.find(
        (s) => !s.id.startsWith('subtask_') && (s.type === 'agent' || s.metadata?.includes('"mode":"agent"'))
      );
      if (existingAgent) {
        selectAgentSession(existingAgent.id);
      } else {
        createAgentSession(activeWorkspacePath);
      }
    }
  }, [activeAgentSessionId, activeSessionId, sessions, selectAgentSession, createAgentSession, activeWorkspacePath]);

  // Load preview content when previewFilePath changes
  const handleOpenPreview = async (filePath: string) => {
    setPreviewFilePath(filePath);
    setIsPreviewOpen(true);

    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content || '');
      }
    } catch (err) {
      console.error('Failed to load file for preview:', err);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewFilePath(null);
    setPreviewContent('');
  };

  const isDeckOrMotion =
    previewFilePath &&
    (previewFilePath.endsWith('.deck.html') ||
      previewFilePath.endsWith('.motion.html') ||
      previewFilePath.endsWith('.html'));

  return (
    <div className="flex h-full w-full min-w-0 min-h-0 overflow-hidden bg-app">
      {/* Left: Agent Sidebar (Tasks grouped by projects + Sidebar File Explorer) */}
      <AgentSidebar
        onSelectFile={handleOpenPreview}
        activeFilePath={previewFilePath}
      />

      {/* Center: Agent Chat (Active Session Conversation) */}
      <div className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden">
        <AgentChatView
          onOpenPreview={handleOpenPreview}
          onToggleSidebarExplorer={() => setIsSidebarExplorerVisible(!isSidebarExplorerVisible)}
        />
      </div>

      {/* Right: Slide-out Preview Drawer for Open Design Slides & HyperFrames Motion */}
      {isPreviewOpen && previewFilePath && (
        <div className="w-[500px] xl:w-[620px] shrink-0 h-full border-l border-line bg-panel flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="h-[50px] shrink-0 border-b border-line px-4 flex items-center justify-between bg-raised/50 select-none">
            <div className="flex items-center gap-2 min-w-0">
              {previewFilePath.endsWith('.deck.html') ? (
                <Presentation size={15} className="text-amber-400 shrink-0" />
              ) : previewFilePath.endsWith('.motion.html') ? (
                <Video size={15} className="text-purple-400 shrink-0" />
              ) : (
                <span className="text-sm">📄</span>
              )}
              <span className="text-xs font-semibold font-mono truncate text-hi">
                {previewFilePath.split('/').pop()}
              </span>
            </div>

            <button
              type="button"
              onClick={handleClosePreview}
              className="p-1.5 rounded-[6px] hover:bg-white/10 text-mid hover:text-hi transition-colors"
              title="Close preview"
            >
              <X size={15} />
            </button>
          </div>

          {/* Drawer Body: DeckMotionViewer or Monospace Code Viewer */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {isDeckOrMotion ? (
              <DeckMotionViewer
                filePath={previewFilePath}
                fileName={previewFilePath.split('/').pop() || 'Preview'}
                htmlContent={previewContent}
                onClose={handleClosePreview}
              />
            ) : (
              <pre className="p-4 font-mono text-xs text-hi overflow-auto h-full whitespace-pre-wrap select-text">
                {previewContent}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
