import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useAgentSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    activeSessionId,
    activeAgent,
    activeModel,
    appendMessage,
    appendToolCall,
    updateToolCall,
    startStreamingAssistantMessage,
    appendThinkingDelta,
    appendTextDelta,
    appendStreamingToolCall,
    updateStreamingToolResult,
    finalizeStreamingMessage,
    setIsGenerating,
    setThinkingStatus,
    loadSessions,
    appendLogEvent,
  } = useAppStore();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Connected to KendaliAI Gateway Event Stream');
      // Subscribe to all gateway events (Web + Telegram + System)
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: '*' }));
    };

    ws.onmessage = (event) => {
      try {
        const ev = JSON.parse(event.data);
        if (!ev || !ev.type) return;

        // 1. Always record in global streaming logs
        appendLogEvent(ev);

        // 2. Handle active session chat updates if matching active session
        const isCurrentSession = !activeSessionId || ev.sessionId === activeSessionId;

        switch (ev.type) {
          case 'session.created':
          case 'session.updated':
            loadSessions();
            break;

          case 'message.created':
            loadSessions();
            if (isCurrentSession && ev.payload) {
              const msgPayload = ev.payload;
              const currentMsgs = useAppStore.getState().messages;

              // 1. Check if exact ID already exists
              if (currentMsgs.some((m) => m.id === msgPayload.id)) {
                break;
              }

              // 2. If it's a user message from web, reconcile with optimistic message
              if (msgPayload.role === 'user') {
                const optIdx = currentMsgs.findIndex(
                  (m) =>
                    m.role === 'user' &&
                    (m.id.startsWith('user-') || m.id.startsWith('opt-')) &&
                    m.content.trim() === (msgPayload.content || '').trim()
                );
                if (optIdx !== -1) {
                  const updated = [...currentMsgs];
                  updated[optIdx] = msgPayload;
                  useAppStore.setState({ messages: updated });
                  break;
                }
              }

              appendMessage(msgPayload);
            }
            break;

          case 'agent.started':
            if (isCurrentSession) {
              setIsGenerating(true);
              setThinkingStatus('Planning next step...');
              startStreamingAssistantMessage('asst-stream-' + Date.now(), activeModel || activeAgent?.model);
            }
            break;

          case 'agent.thinking':
            if (isCurrentSession) {
              setIsGenerating(true);
              setThinkingStatus(typeof ev.payload === 'string' ? ev.payload : 'Thinking...');
            }
            break;

          case 'agent.thinking.delta':
            if (isCurrentSession) {
              setIsGenerating(true);
              setThinkingStatus('Reasoning...');
              if (ev.payload?.delta) {
                appendThinkingDelta(ev.payload.delta);
              }
            }
            break;

          case 'agent.text.delta':
            if (isCurrentSession) {
              setIsGenerating(true);
              setThinkingStatus('Responding...');
              if (ev.payload?.delta) {
                appendTextDelta(ev.payload.delta);
              }
            }
            break;

          case 'agent.tool_call':
            if (isCurrentSession && ev.payload) {
              setIsGenerating(true);
              setThinkingStatus(`Running ${ev.payload.tool}...`);
              appendStreamingToolCall({
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
              setThinkingStatus(`Finished ${ev.payload.tool}`);
              updateStreamingToolResult({
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
            if (isCurrentSession) {
              setIsGenerating(false);
              if (ev.payload) {
                finalizeStreamingMessage(ev.payload);
              }
            }
            loadSessions();
            break;

          case 'agent.failed':
            if (isCurrentSession) {
              setIsGenerating(false);
              appendMessage({
                id: 'err-' + Date.now(),
                sessionId: activeSessionId || '',
                channel: ev.channel || 'web',
                role: 'assistant',
                content: `❌ Error: ${ev.payload || 'An unexpected execution error occurred.'}`,
                createdAt: Date.now(),
              });
            }
            break;
        }
      } catch (e) {
        console.error('Error handling WS event:', e);
      }
    };

    ws.onclose = () => {
      console.warn('WebSocket connection closed.');
    };

    return () => {
      ws.close();
    };
  }, [activeSessionId]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const currentSession = activeSessionId || 'sess_' + Date.now();
    const userMsg = {
      id: 'user-' + Date.now(),
      sessionId: currentSession,
      channel: 'web',
      role: 'user' as const,
      content,
      createdAt: Date.now(),
    };
    appendMessage(userMsg);
    setIsGenerating(true);
    setThinkingStatus('Thinking...');

    const agentId = activeAgent ? activeAgent.id : 'personal-assistant';
    const modelToUse = activeModel || activeAgent?.model;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'message.send',
          sessionId: currentSession,
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
            sessionId: currentSession,
            agentId,
            model: modelToUse,
            messages: [{ role: 'user', content }],
          }),
        });
        const data = await res.json();
        setIsGenerating(false);
        if (data.choices && data.choices.length > 0) {
          appendMessage({
            id: 'asst-' + Date.now(),
            sessionId: currentSession,
            channel: 'web',
            role: 'assistant',
            content: data.choices[0].message.content,
            createdAt: Date.now(),
          });
        }
      } catch (err: any) {
        setIsGenerating(false);
        appendMessage({
          id: 'err-' + Date.now(),
          sessionId: currentSession,
          channel: 'web',
          role: 'assistant',
          content: 'Error: ' + err.message,
          createdAt: Date.now(),
        });
      }
    }
  };

  return { sendMessage };
}
