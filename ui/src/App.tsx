import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAgentSocket } from './hooks/useAgentSocket';
import { useRoute } from './router';
import { IconRail } from './components/IconRail';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { PaneHost } from './components/PaneHost';
import { BottomNav } from './components/BottomNav';

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
  } = useAppStore();

  const route = useRoute();

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
    <div className="flex h-screen w-screen overflow-hidden bg-app text-hi font-sans">
      {/* Desktop Icon Rail (hidden on mobile — BottomNav takes over) */}
      <IconRail />

      {/* Main content area: routed pane or chat workspace */}
      {route === 'chat' ? (
        <>
          {/* Session sidebar — desktop only; sessions pane covers mobile */}
          <div className="hidden md:flex h-full">
            <Sidebar />
          </div>

          {/* Central Chat & Interaction Canvas */}
          <div className="flex-1 flex flex-col h-full min-w-0 relative overflow-hidden bg-app pb-[60px] md:pb-0">
            <ChatArea />
          </div>
        </>
      ) : (
        <div className="flex-1 flex h-full min-w-0 pb-[60px] md:pb-0">
          <PaneHost route={route} />
        </div>
      )}

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  );
};

export default App;
