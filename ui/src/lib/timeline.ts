import { SessionMessage, ToolCallRecord } from '../types';
import { ToolExecution } from '../components/agent/ToolBlockViews';

export interface ThoughtStep {
  id: string;
  thoughtText: string;
  durationSeconds?: number;
  seq?: number;
  createdAtMs?: number;
  turn?: number;
}

export interface TimelineItem {
  id: string;
  turn: number;
  kind: 'thought' | 'text' | 'tool';
  thought?: ThoughtStep;
  text?: string;
  tool?: ToolExecution;
  order: number;
}

export function chatText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const text = (part as { text?: unknown }).text;
          if (typeof text === 'string') return text;
          const contentField = (part as { content?: unknown }).content;
          if (typeof contentField === 'string') return contentField;
        }
        return '';
      })
      .filter(Boolean)
      .join('');
  }
  return content ? String(content) : '';
}

/**
 * Builds chronological timeline items from a session message or turn.
 */
export function buildTimelineForTurn(
  assistantMessages: SessionMessage[],
  isTurnRunning: boolean
): { processItems: TimelineItem[]; finalItems: TimelineItem[] } {
  const items: TimelineItem[] = [];

  assistantMessages.forEach((msg, mIdx) => {
    // 1. Thoughts
    if (msg.thought) {
      items.push({
        id: `th-${msg.id || mIdx}`,
        turn: mIdx + 1,
        kind: 'thought',
        thought: {
          id: `th-step-${msg.id || mIdx}`,
          thoughtText: msg.thought,
          durationSeconds: msg.durationMs ? Math.round(msg.durationMs / 1000) : undefined,
          createdAtMs: msg.createdAt,
        },
        order: (msg.createdAt || Date.now()) + mIdx * 10,
      });
    }

    // 2. Tool calls
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      msg.toolCalls.forEach((tc, tcIdx) => {
        const toolObj: ToolExecution = {
          id: tc.id || `tc-${mIdx}-${tcIdx}`,
          toolName: tc.tool,
          command: typeof tc.arguments === 'object' ? JSON.stringify(tc.arguments) : String(tc.arguments || ''),
          output: tc.output,
          status: tc.status === 'running' ? 'running' : tc.status === 'error' ? 'failed' : 'completed',
          durationMs: tc.durationMs,
        };
        items.push({
          id: toolObj.id,
          turn: mIdx + 1,
          kind: 'tool',
          tool: toolObj,
          order: (msg.createdAt || Date.now()) + mIdx * 10 + 20 + tcIdx,
        });
      });
    }

    // 3. Text content
    if (msg.content && msg.content.trim()) {
      items.push({
        id: `text-${msg.id || mIdx}`,
        turn: mIdx + 1,
        kind: 'text',
        text: msg.content.trim(),
        order: (msg.createdAt || Date.now()) + mIdx * 10 + 40,
      });
    }
  });

  items.sort((a, b) => a.order - b.order);

  // Split process items vs final response:
  // If turn is finished, find the last text block as the final response.
  // All preceding thoughts, tools, and intermediate texts are processItems.
  let finalIndex = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'text') {
      finalIndex = i;
      break;
    }
  }

  const processItems: TimelineItem[] = [];
  const finalItems: TimelineItem[] = [];

  if (finalIndex >= 0 && (!isTurnRunning || items.length > 1)) {
    items.forEach((item, idx) => {
      if (idx === finalIndex) {
        finalItems.push(item);
      } else {
        processItems.push(item);
      }
    });
  } else {
    processItems.push(...items);
  }

  return { processItems, finalItems };
}
