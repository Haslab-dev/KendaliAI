import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useAgentStore } from '../store/useAgentStore';
import { isAgentTaskSession } from '../types';
import { HomeView } from '../components/agentui/HomeView';
import { Transcript } from '../components/agentui/Transcript';
import { Composer } from '../components/agentui/Composer';
import { ApprovalCard } from '../components/agentui/ApprovalCard';

/* AgentPane — the forgeADE-style agent workspace canvas: home landing when no
 * task is active, otherwise the live transcript + approval cards + composer.
 * Session management lives in the global SessionSidebar. */

export const AgentPane: React.FC = () => {
  const sessions = useAppStore((s) => s.sessions);
  const activeAgentSessionId = useAgentStore((s) => s.activeAgentSessionId);
  const setActiveAgentSession = useAgentStore((s) => s.setActiveAgentSession);

  // Land on the most recent task instead of an empty home when returning.
  useEffect(() => {
    if (activeAgentSessionId) return;
    const tasks = sessions
      .filter((s) => isAgentTaskSession(s) && !s.id.startsWith('subtask_'))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (tasks.length > 0) {
      setActiveAgentSession(tasks[0].id);
    }
  }, [sessions, activeAgentSessionId, setActiveAgentSession]);

  const session = sessions.find((s) => s.id === activeAgentSessionId) || null;

  if (!activeAgentSessionId || !session) {
    return <HomeView />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <Transcript sessionId={activeAgentSessionId} />
      <ApprovalCard sessionId={activeAgentSessionId} />
      <Composer />
    </div>
  );
};
