import { ACPAgentDescriptor, ACPSessionInfo, Session, SessionMessage } from '../types';

/* REST client for the gateway's ACP surface (/api/acp/*). */

export async function listACPAgents(): Promise<ACPAgentDescriptor[]> {
  const res = await fetch('/api/acp/agents');
  if (!res.ok) throw new Error(`acp agents: ${res.status}`);
  const data = await res.json();
  return data.agents || [];
}

export async function listACPSessions(): Promise<ACPSessionInfo[]> {
  const res = await fetch('/api/acp/sessions');
  if (!res.ok) throw new Error(`acp sessions: ${res.status}`);
  return (await res.json()) || [];
}

export async function startACPSession(opts: {
  agentId: string;
  cwd?: string;
  model?: string;
  autoApprove?: boolean;
}): Promise<ACPSessionInfo> {
  const res = await fetch('/api/acp/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error((await res.text()) || `acp start: ${res.status}`);
  return res.json();
}

export async function getACPSession(
  id: string
): Promise<{ session: ACPSessionInfo; messages: SessionMessage[] }> {
  const res = await fetch(`/api/acp/sessions/${id}`);
  if (!res.ok) throw new Error(`acp session: ${res.status}`);
  return res.json();
}

export async function resumeACPSession(id: string): Promise<ACPSessionInfo> {
  const res = await fetch(`/api/acp/sessions/${id}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.text()) || `acp resume: ${res.status}`);
  return res.json();
}

export async function promptACPSession(id: string, text: string): Promise<void> {
  const res = await fetch(`/api/acp/sessions/${id}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error((await res.text()) || `acp prompt: ${res.status}`);
}

export async function cancelACPSession(id: string): Promise<void> {
  await fetch(`/api/acp/sessions/${id}/cancel`, { method: 'POST' });
}

export async function respondACPPermission(id: string, requestId: string, optionId: string): Promise<void> {
  await fetch(`/api/acp/sessions/${id}/permission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, optionId }),
  });
}

export async function closeACPSession(id: string): Promise<void> {
  await fetch(`/api/acp/sessions/${id}/close`, { method: 'POST' });
}

export async function deleteACPSession(id: string): Promise<void> {
  await fetch(`/api/acp/sessions/${id}`, { method: 'DELETE' });
}

export async function setACPAutoApprove(id: string, enabled: boolean): Promise<void> {
  await fetch(`/api/acp/sessions/${id}/auto-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

/** Convenience: map an ACP session id to its persisted gateway session. */
export function findSessionForACP(sessions: Session[], acpId: string): Session | undefined {
  return sessions.find((s) => s.id === acpId);
}
