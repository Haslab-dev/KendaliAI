import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

// Application-wide singleton WebSocket connection
let globalWs: WebSocket | null = null;
let reconnectTimeout: any = null;
let isExplicitDisconnect = false;
let subscriberCount = 0;

// ---------------------------------------------------------------------------
// Streaming delta coalescing.
// Model tokens arrive as one WS event each (often 20-60+/s). Applying every
// token to the store re-renders the chat per token, which collapses to O(n^2)
// on long messages. Buffer deltas and flush them into the store at most every
// FLUSH_MS; the rendered result is identical, the update rate is not.
// ---------------------------------------------------------------------------
const FLUSH_MS = 80;
let textBuf = '';
let thinkBuf = '';
let bufSessionId: string | null = null;
let flushTimer: any = null;
let flushSeq = 0;

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushDeltas();
  }, FLUSH_MS);
}

function flushDeltas() {
  if (!textBuf && !thinkBuf) return;
  const store = useAppStore.getState();

  // User switched session while deltas were in flight: drop them instead of
  // leaking the tail of one conversation into another.
  if (bufSessionId && store.activeSessionId && bufSessionId !== store.activeSessionId) {
    textBuf = '';
    thinkBuf = '';
    return;
  }

  if (thinkBuf) {
    store.appendThinkingDelta(thinkBuf);
    store.appendLogEvent({
      id: `delta-flush-${++flushSeq}`,
      type: 'agent.thinking.delta',
      sessionId: bufSessionId || undefined,
      payload: { delta: thinkBuf },
    } as any);
    thinkBuf = '';
  }
  if (textBuf) {
    store.appendTextDelta(textBuf);
    store.appendLogEvent({
      id: `delta-flush-${++flushSeq}`,
      type: 'agent.text.delta',
      sessionId: bufSessionId || undefined,
      payload: { delta: textBuf },
    } as any);
    textBuf = '';
  }
}

function connectGlobalSocket() {
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws`;

  try {
    const ws = new WebSocket(wsUrl);
    globalWs = ws;

    ws.onopen = () => {
      console.log('✅ Connected to KendaliAI Gateway Event Stream');
      // Subscribe to all gateway events (Web + Telegram + System)
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: '*' }));
    };

    ws.onmessage = (event) => {
      try {
        const ev = JSON.parse(event.data);
        if (!ev || !ev.type) return;

        const store = useAppStore.getState();
        const isDelta = ev.type === 'agent.text.delta' || ev.type === 'agent.thinking.delta';

        // 1. Record in global streaming logs — except raw deltas, which are
        //    logged once per coalesced flush in flushDeltas() instead.
        if (!isDelta) {
          store.appendLogEvent(ev);
        }

        // 2. Dispatch reminder notifications and task events globally
        if (ev.type === 'reminder.triggered') {
          window.dispatchEvent(new CustomEvent('kendali:reminder', { detail: ev.payload }));
        }
        if (ev.type.startsWith('task.')) {
          store.loadTasks();
          window.dispatchEvent(new CustomEvent('kendali:tasks_updated', { detail: ev }));
        }

        // 3. Handle active session chat updates if matching active session
        const currentSid = store.activeSessionId;
        const isCurrentSession = !currentSid || ev.sessionId === currentSid;

        switch (ev.type) {
          case 'session.created':
          case 'session.updated':
            store.loadSessions();
            break;

          case 'message.created':
            store.loadSessions();
            if (isCurrentSession && ev.payload) {
              store.appendMessage(ev.payload);
            }
            break;

          case 'message.reaction':
            if (isCurrentSession && ev.payload?.messageId && ev.payload?.emoji) {
              store.addMessageReaction(ev.payload.messageId, {
                emoji: ev.payload.emoji,
                senderId: ev.payload.senderId || ev.agentId || 'agent',
                senderName: ev.payload.senderName || ev.agentId || 'Agent',
              });
            }
            break;

          case 'message.deleted':
            if (ev.payload?.ids) {
              store.removeMessages(ev.payload.ids);
            }
            break;

          case 'discussion.active':
            if (isCurrentSession) {
              store.setDiscussionState(true, ev.payload?.currentRound || 1);
            }
            break;

          case 'discussion.stopped':
            if (isCurrentSession) {
              store.setDiscussionState(false, 0);
              store.setIsGenerating(false);
            }
            break;

          case 'agent.started':
            if (isCurrentSession) {
              const payload = (typeof ev.payload === 'object' && ev.payload !== null) ? ev.payload : {};
              const startedAgentId = payload.agentId || ev.agentId || store.activeAgent?.id;
              const matchedAgent = store.agents.find((a) => a.id === startedAgentId);
              const startedAgentName = payload.agentName || matchedAgent?.name || store.activeAgent?.name || 'Agent';
              const startedAvatar = payload.avatar || matchedAgent?.avatar || store.activeAgent?.avatar || 'purple-pebble';
              const startedModel = payload.model || matchedAgent?.model || store.activeModel;

              store.setIsGenerating(true);
              store.setTypingAgent({
                id: startedAgentId,
                name: startedAgentName,
                avatar: startedAvatar,
              });
              store.setThinkingStatus(`${startedAgentName} is typing...`);
              store.startStreamingAssistantMessage(
                'asst-stream-' + Date.now(),
                startedModel,
                startedAgentId,
                startedAgentName,
                startedAvatar
              );
            }
            break;

          case 'agent.thinking':
            if (isCurrentSession) {
              store.setIsGenerating(true);
              const statusText = typeof ev.payload === 'string' ? ev.payload : 'Thinking...';
              store.setThinkingStatus(statusText);
            }
            break;

          case 'agent.thinking.delta':
            if (isCurrentSession) {
              if (!store.isGenerating) store.setIsGenerating(true);
              if (store.thinkingStatus !== 'Reasoning...') store.setThinkingStatus('Reasoning...');
              if (ev.payload?.delta) {
                thinkBuf += ev.payload.delta;
                bufSessionId = ev.sessionId || bufSessionId;
                scheduleFlush();
              }
            }
            break;

          case 'agent.text.delta':
            if (isCurrentSession) {
              if (!store.isGenerating) store.setIsGenerating(true);
              if (store.thinkingStatus !== 'Responding...') store.setThinkingStatus('Responding...');
              if (ev.payload?.delta) {
                textBuf += ev.payload.delta;
                bufSessionId = ev.sessionId || bufSessionId;
                scheduleFlush();
              }
            }
            break;

          case 'agent.tool_call':
            if (isCurrentSession && ev.payload) {
              store.setIsGenerating(true);
              store.setThinkingStatus(`Running ${ev.payload.tool}...`);
              store.appendStreamingToolCall({
                id: ev.payload.id || 'tc-' + Date.now(),
                tool: ev.payload.tool,
                arguments: ev.payload.arguments,
                status: 'running',
                output: 'Executing capability in workspace...',
              });
            }
            break;

          case 'agent.tool_result':
            if (isCurrentSession && ev.payload) {
              store.setThinkingStatus(`Finished ${ev.payload.tool}`);
              store.updateStreamingToolResult({
                id: ev.payload.id,
                tool: ev.payload.tool,
                arguments: {},
                output: ev.payload.output,
                status: ev.payload.status || 'success',
                durationMs: ev.payload.durationMs,
              });
            }
            break;

          case 'agent.completed':
            flushDeltas();
            if (isCurrentSession) {
              store.setIsGenerating(false);
              store.setTypingAgent(null);
              if (ev.payload) {
                store.finalizeStreamingMessage(ev.payload);
              }
            }
            store.loadSessions();
            break;

          case 'agent.failed':
            if (isCurrentSession) {
              store.setIsGenerating(false);
              store.setTypingAgent(null);
              const errContent = `❌ Error: ${ev.payload || 'An unexpected execution error occurred.'}`;
              const errId = ev.id ? `err-${ev.id}` : `err-${ev.sessionId || currentSid || 'cur'}-${Date.now()}`;
              store.appendMessage({
                id: errId,
                sessionId: ev.sessionId || currentSid || '',
                channel: ev.channel || 'web',
                role: 'assistant',
                content: errContent,
                createdAt: Date.now(),
              });
            }
            break;
        }

        // 4. Mirror events into the sub-agent focus panel when it is open on
        //    this session (live process tail, independent of the main chat).
        if (store.subagentPanelSessionId && ev.sessionId === store.subagentPanelSessionId) {
          store.applyPanelEvent(ev);
        }
      } catch (e) {
        console.error('Error handling WS event:', e);
      }
    };

    ws.onclose = () => {
      console.warn('WebSocket connection closed. Reconnecting in 2.5s...');
      globalWs = null;
      if (!isExplicitDisconnect && subscriberCount > 0) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectGlobalSocket, 2500);
      }
    };

    ws.onerror = (err) => {
      console.warn('WebSocket encountered error:', err);
      try {
        ws.close();
      } catch {}
    };
  } catch (err) {
    console.error('Failed to create WebSocket:', err);
    clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connectGlobalSocket, 2500);
  }
}

export async function sendSocketMessage(content: string) {
  if (!content.trim()) return;

  const store = useAppStore.getState();
  const currentSessionId = store.activeSessionId || 'sess_' + Date.now();
  const existingSession = store.sessions.find((s) => s.id === currentSessionId);
  const isDirect = existingSession?.type === 'direct';
  const partnerAgent = isDirect
    ? store.agents.find((a) => a.id === existingSession?.agentId) || store.activeAgent
    : null;

  const userMsg = {
    id: 'user-' + Date.now(),
    sessionId: currentSessionId,
    channel: 'web',
    role: 'user' as const,
    content,
    createdAt: Date.now(),
  };

  store.appendMessage(userMsg);
  store.setIsGenerating(true);
  if (partnerAgent) {
    store.setTypingAgent({
      id: partnerAgent.id,
      name: partnerAgent.name,
      avatar: partnerAgent.avatar,
    });
    store.setThinkingStatus(`${partnerAgent.name} is typing...`);
  } else {
    store.setThinkingStatus('Agent is typing...');
  }

  // Ensure agentId respects the current session's actual owner
  const agentId = existingSession?.agentId || (store.activeAgent ? store.activeAgent.id : 'personal-assistant');
  const modelToUse = store.activeModel || store.activeAgent?.model;

  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(
      JSON.stringify({
        type: 'message.send',
        sessionId: currentSessionId,
        agentId,
        model: modelToUse,
        content,
      })
    );
  } else {
    // REST API fallback
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          agentId,
          model: modelToUse,
          messages: [{ role: 'user', content }],
        }),
      });
      const data = await res.json();
      store.setIsGenerating(false);
      store.setTypingAgent(null);
      if (data.choices && data.choices.length > 0) {
        store.appendMessage({
          id: 'asst-' + Date.now(),
          sessionId: currentSessionId,
          channel: 'web',
          role: 'assistant',
          content: data.choices[0].message.content,
          createdAt: Date.now(),
        });
      }
    } catch (err: any) {
      store.setIsGenerating(false);
      store.setTypingAgent(null);
      store.appendMessage({
        id: 'err-' + Date.now(),
        sessionId: currentSessionId,
        channel: 'web',
        role: 'assistant',
        content: '❌ Error: ' + err.message,
        createdAt: Date.now(),
      });
    }
  }
}

// Send a follow-up instruction straight into a background sub-agent session
// without leaving the main chat. The gateway resolves the session's own agent
// when agentId is omitted.
export async function sendPanelInstruction(sessionId: string, content: string) {
  if (!sessionId || !content.trim()) return;

  useAppStore.getState().appendPanelMessage({
    id: 'user-' + Date.now(),
    sessionId,
    channel: 'web',
    role: 'user',
    content,
    createdAt: Date.now(),
  });

  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify({ type: 'message.send', sessionId, content }));
    return;
  }

  // REST fallback when the socket is down.
  try {
    const store = useAppStore.getState();
    const sess = store.sessions.find((s) => s.id === sessionId);
    const res = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        agentId: sess?.agentId,
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await res.json();
    if (data.choices && data.choices.length > 0) {
      store.appendPanelMessage({
        id: 'asst-' + Date.now(),
        sessionId,
        channel: 'web',
        role: 'assistant',
        content: data.choices[0].message.content,
        createdAt: Date.now(),
      });
    }
  } catch (err: any) {
    useAppStore.getState().appendPanelMessage({
      id: 'err-' + Date.now(),
      sessionId,
      channel: 'web',
      role: 'assistant',
      content: '❌ Error: ' + err.message,
      createdAt: Date.now(),
    });
  }
}

export function useAgentSocket() {
  const { loadTasks } = useAppStore();

  useEffect(() => {
    subscriberCount++;
    isExplicitDisconnect = false;
    connectGlobalSocket();

    loadTasks();
    const taskInterval = setInterval(() => {
      loadTasks();
    }, 4000);

    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1);
      clearInterval(taskInterval);
      if (subscriberCount === 0) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [loadTasks]);

  return { sendMessage: sendSocketMessage };
}
