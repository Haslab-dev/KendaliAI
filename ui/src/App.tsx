import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAgentStore } from './store/useAgentStore';
import { useProfileStore } from './store/useProfileStore';
import { useSessionStore } from './store/useSessionStore';
import { useAgentSocket } from './hooks/useAgentSocket';
import { useRoute, navigate, navigateSettings } from './router';

import { AgentRail } from './components/layout/AgentRail';
import { AppSidebar } from './components/layout/AppSidebar';
import { ChatHome } from './components/chat/ChatHome';
import { ChatThread } from './components/chat/ChatThread';
import { AgentProfileDetail } from './components/agent/AgentProfileDetail';
import { GroupList } from './components/groups/GroupList';
import { GroupChatThread } from './components/chat/GroupChatThread';
import { ConnectionsView } from './components/connections/ConnectionsView';
import { AutomationsView } from './components/automations/AutomationsView';
import { ControlCenterView } from './components/settings/ControlCenterView';
import { LoginScreen } from './components/LoginScreen';
import { TerminalDock } from './components/forge/TerminalDock';
import { NewAgentModal } from './components/agent/NewAgentModal';
import { GitClientView } from './components/git/GitClientView';
import { SimpleEditorView } from './components/editor/SimpleEditorView';

type AuthState = 'checking' | 'ok' | 'login';

export const App: React.FC = () => {
  const {
    loadProviders,
    loadMcps,
    loadWorkspaceInfo,
  } = useAppStore();

  const {
    loadRoster,
    loadACPSessions,
    terminalOpen,
    setTerminalOpen,
  } = useAgentStore();

  const {
    loadAgents,
    loadGroups,
    activeNavTab,
    setActiveNavTab,
    activeGroup,
  } = useProfileStore();

  const {
    loadSessions,
    activeSessionId,
    activeSession,
  } = useSessionStore();

  const { route, settingsSection } = useRoute();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false);

  // Check auth status
  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => setAuthState(d.required && !d.authenticated ? 'login' : 'ok'))
      .catch(() => setAuthState('ok'));
  }, []);

  // Establish live event websocket
  useAgentSocket();

  // Terminal shortcut alias
  useEffect(() => {
    if (route === 'terminal') {
      setTerminalOpen(true);
      navigate('agent');
    }
  }, [route, setTerminalOpen]);

  // Global settings shortcut (⌘,)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setActiveNavTab('settings');
        navigateSettings('general');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveNavTab]);

  // Initial gateway data loading
  useEffect(() => {
    if (authState !== 'ok') return;
    const init = async () => {
      try {
        await Promise.all([
          loadProviders(),
          loadAgents(),
          loadGroups(),
          loadSessions(),
          loadMcps(),
          loadWorkspaceInfo(),
          loadRoster(),
          loadACPSessions(),
        ]);
      } catch (err) {
        console.error('Failed to initialize gateway data:', err);
      }
    };
    init();
  }, [authState]);

  if (authState === 'checking') {
    return <div className="h-screen w-screen bg-[#09090b]" />;
  }
  if (authState === 'login') {
    return <LoginScreen onSuccess={() => setAuthState('ok')} />;
  }

  // Determine which main view to display
  const isSettingsRoute = route === 'settings' || activeNavTab === 'settings';

  const renderMainContent = () => {
    if (isSettingsRoute) {
      return (
        <div className="flex-1 h-full min-h-0 overflow-hidden">
          <ControlCenterView section={settingsSection} />
        </div>
      );
    }

    switch (activeNavTab) {
      case 'editor':
        return <SimpleEditorView />;

      case 'git':
        return <GitClientView />;

      case 'agent':
        return <AgentProfileDetail />;

      case 'groups':
        // If in a group session or active group selected, show GroupChatThread, otherwise list groups
        if (activeGroup || (activeSessionId && activeSession?.type === 'group')) {
          return <GroupChatThread />;
        }
        return <GroupList />;

      case 'connections':
        return <ConnectionsView />;

      case 'automations':
        return <AutomationsView />;

      case 'chat':
      default:
        // Direct 1:1 agent session view — group chat sessions belong to groups
        if (activeSessionId && activeSession?.type !== 'group') {
          return <ChatThread />;
        }
        return <ChatHome />;
    }
  };

  return (
    <div className="flex h-screen max-h-screen w-screen overflow-hidden bg-background font-sans text-foreground select-none">
      {/* 1. Leftmost: Agent Rail */}
      <AgentRail
        onOpenCreateAgent={() => setIsNewAgentModalOpen(true)}
        onOpenSettings={() => {
          setActiveNavTab('settings');
          navigateSettings('general');
        }}
      />

      {/* 2. Middle-Left: Scoped Sessions & Navigation Sidebar */}
      {!isSettingsRoute && (
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* 3. Main Workspace Surface */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative bg-background">
        {renderMainContent()}

        {/* Global Terminal Dock */}
        {terminalOpen && <TerminalDock />}
      </main>

      {/* New Agent Modal */}
      <NewAgentModal
        isOpen={isNewAgentModalOpen}
        onClose={() => setIsNewAgentModalOpen(false)}
      />
    </div>
  );
};

export { navigateSettings };
export default App;
