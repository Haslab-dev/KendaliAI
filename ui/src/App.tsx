import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAgentSocket } from './hooks/useAgentSocket';
import { IconRail } from './components/IconRail';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ManagementCenter } from './components/ManagementCenter';
import { LogsStreamingView } from './components/LogsStreamingView';

export const App: React.FC = () => {
  const {
    theme,
    loadProviders,
    loadAgents,
    loadSessions,
    loadMcps,
    activeSessionId,
    createSession,
    selectSession,
    activeView,
  } = useAppStore();

  // Connect to Agent WebSocket
  useAgentSocket();

  // Apply dark/light theme class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
  }, [theme]);

  // Initial data loading from Gateway REST API
  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([loadProviders(), loadAgents(), loadSessions(), loadMcps()]);
        const currentStore = useAppStore.getState();
        if (!currentStore.activeSessionId) {
          if (currentStore.sessions.length > 0) {
            await selectSession(currentStore.sessions[0].id);
          } else {
            await createSession();
          }
        } else {
          await selectSession(currentStore.activeSessionId);
        }
      } catch (err) {
        console.error('Failed to initialize gateway data:', err);
      }
    };

    init();
  }, [loadProviders, loadAgents, loadSessions, loadMcps, selectSession, createSession]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d] text-[#ececec] font-sans">
      {/* LibreChat Icon Rail (Far Left) */}
      <IconRail />

      {/* Main View: Logs Streaming Tab Screen or Chat Workspace */}
      {activeView === 'logs' ? (
        <LogsStreamingView />
      ) : (
        <>
          {/* Main Sidebar (Sessions, Agent info, New Chat) */}
          <Sidebar />

          {/* Central Chat & Interaction Canvas */}
          <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#0d0d0d]">
            <ChatArea />
          </div>
        </>
      )}

      {/* Slide-over / Modal Management Center */}
      <ManagementCenter />
    </div>
  );
};

export default App;
