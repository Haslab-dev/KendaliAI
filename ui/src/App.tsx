import React, { useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAgentStore } from './store/useAgentStore';
import { useAgentSocket } from './hooks/useAgentSocket';
import { useRoute, navigate, navigateSettings } from './router';
import { ForgeSidebar } from './components/forge/ForgeSidebar';
import { ForgeWorkspaceHeader } from './components/forge/WorkspaceHeader';
import { AgentHomeView } from './components/agent/AgentHomeView';
import { AgentActiveSessionView } from './components/agent/AgentActiveSessionView';
import { NewTaskModal } from './components/agentui/NewTaskModal';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { WhatsAppAssistantView } from './components/assistant/WhatsAppAssistantView';
import { LoginScreen } from './components/LoginScreen';
import { TerminalDock } from './components/forge/TerminalDock';
import { BottomNav } from './components/BottomNav';
import { isAgentTaskSession } from './types';

type AuthState = 'checking' | 'ok' | 'login';

export const App: React.FC = () => {
  const {
    loadProviders,
    loadAgents,
    loadSessions,
    loadMcps,
    loadWorkspaceInfo,
    setMode,
    mode,
  } = useAppStore();

  const {
    loadRoster,
    loadACPSessions,
    sidebarCollapsed,
    terminalOpen,
    setTerminalOpen,
  } = useAgentStore();

  const { route, settingsSection } = useRoute();

  const [authState, setAuthState] = React.useState<AuthState>('checking');

  // Password gate
  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => setAuthState(d.required && !d.authenticated ? 'login' : 'ok'))
      .catch(() => setAuthState('ok'));
  }, []);

  useAgentSocket();

  // Keep the mode in sync with the route
  useEffect(() => {
    if (route === 'assistant') setMode('assistant');
    else if (route === 'agent') setMode('agent');
  }, [route, setMode]);

  // Terminal route alias
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
        navigateSettings('general');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Initial data loading
  useEffect(() => {
    if (authState !== 'ok') return;
    const init = async () => {
      try {
        await Promise.all([
          loadProviders(),
          loadAgents(),
          loadSessions(),
          loadMcps(),
          loadWorkspaceInfo(),
          loadRoster(),
          loadACPSessions(),
        ]);
        if (!window.location.hash) {
          navigate('agent');
        }
      } catch (err) {
        console.error('Failed to initialize gateway data:', err);
      }
    };
    init();
  }, [authState]);

  if (authState === 'checking') {
    return <div className="h-screen w-screen bg-background" />;
  }
  if (authState === 'login') {
    return <LoginScreen onSuccess={() => setAuthState('ok')} />;
  }

  // In settings, full width is used. In Agent mode, the task sidebar shows on desktop.
  // In Assistant mode, the WhatsApp conversation list replaces the task sidebar.
  const isSettings = route === 'settings';
  const isAssistant = route === 'assistant';
  const showSidebar = !sidebarCollapsed && !isSettings && !isAssistant;

  return (
    <div className="flex h-screen max-h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Agent Mode Task Sidebar (Only visible in Agent Mode) */}
      {showSidebar && (
        <div className="hidden h-full shrink-0 md:flex">
          <ForgeSidebar />
        </div>
      )}

      {/* Main Surface */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden pb-[54px] md:pb-0">
        {/* Workspace Header (Shows on both modes) */}
        {!isSettings && <ForgeWorkspaceHeader />}

        {isSettings ? (
          <SettingsScreen section={settingsSection} />
        ) : isAssistant ? (
          /* Assistant Mode: WhatsApp-style Chat with Telegram Bot Integration */
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <WhatsAppAssistantView />
          </div>
        ) : (
          /* Agent Mode: ForgeADE Agent Workspace */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AgentSurface />
            {terminalOpen && <TerminalDock />}
          </div>
        )}
      </div>

      {/* Global New Task Modal (⌘N in Agent mode) */}
      <NewTaskModal />

      {/* Mobile Navigation */}
      <BottomNav />
    </div>
  );
};

/* Agent surface — loads the active agent session or home landing. */
const AgentSurface: React.FC = () => {
  const sessions = useAppStore((s) => s.sessions);
  const activeAgentSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const setActiveAgentSession = useAgentStore((s) => s.setActiveAgentSession);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    if (activeAgentSessionId) return;
    const tasks = sessions
      .filter((s) => isAgentTaskSession(s) && !s.id.startsWith('subtask_'))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (tasks.length > 0) void setActiveAgentSession(tasks[0].id);
  }, [sessions, activeAgentSessionId, setActiveAgentSession]);

  const exists = !!activeAgentSessionId && sessions.some((s) => s.id === activeAgentSessionId);
  if (!activeAgentSessionId || !exists) return <AgentHomeView />;
  return <AgentActiveSessionView sessionId={activeAgentSessionId} />;
};

export { navigateSettings };
export default App;
