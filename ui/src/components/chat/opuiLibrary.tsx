import React from 'react';
import { z } from 'zod/v4';
import {
  defineComponent,
  defineAction,
  action,
  createLibrary,
  useRenderNode,
  useTriggerAction,
} from '@openuidev/react-lang';
import type { ActionEvent } from '@openuidev/react-lang';

/* Base OpenUI component library for chat-rendered generative UI.
 * The gateway teaches the model this exact component set (see
 * internal/gateway/opui.go) — keep the two in sync. Styling maps onto the
 * app's Tailwind design tokens. */

/** The one library action a generated Button can run: send text back into
 * the chat. Fired onAction as { type: 'send_prompt', params: { prompt } }. */
export const sendPromptAction = defineAction({
  name: 'send_prompt',
  description: 'Send a prompt back into the chat as the next user message',
  params: z.object({
    prompt: z.string().describe('The text to send as the next user message'),
  }),
});

/** Places feedback text into the chat input (without sending) so the user can
 * review, edit, and submit it themselves. Fired as { type: 'feedback' }. */
export const feedbackAction = defineAction({
  name: 'feedback',
  description: 'Put feedback text into the chat input box for review instead of sending it immediately',
  params: z.object({
    text: z.string().describe('Feedback text to place in the chat input'),
  }),
});

const toneClass = (tone?: string) => {
  switch (tone) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    case 'warning':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    case 'danger':
      return 'bg-red-500/15 text-red-500 border-red-500/30';
    default:
      return 'bg-primary/10 text-primary border-primary/30';
  }
};

/** Renders an array of child element nodes produced by the parser. */
function useChildren(children?: unknown[]) {
  const renderNode = useRenderNode();
  if (!children || children.length === 0) return null;
  return children.map((child, i) => <React.Fragment key={i}>{renderNode(child)}</React.Fragment>);
}

export const Card = defineComponent({
  name: 'Card',
  description: 'A bordered surface grouping related UI. Call: Card([children], "Title", "Subtitle")',
  props: z.object({
    children: z.array(z.any()).optional().describe('Card content'),
    title: z.string().optional().describe('Card heading'),
    subtitle: z.string().optional().describe('Muted line under the heading'),
  }),
  component: ({ props }) => {
    const children = useChildren(props.children as unknown[] | undefined);
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {props.title && <div className="text-sm font-semibold text-foreground">{props.title}</div>}
        {props.subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{props.subtitle}</div>}
        {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
      </div>
    );
  },
});

export const Stack = defineComponent({
  name: 'Stack',
  description: 'Lays out children vertically or horizontally. Call: Stack([children], "vertical")',
  props: z.object({
    children: z.array(z.any()).optional().describe('Child elements'),
    direction: z.enum(['vertical', 'horizontal']).optional().describe('Layout direction'),
    gap: z.number().optional().describe('Gap between children'),
  }),
  component: ({ props }) => {
    const children = useChildren(props.children as unknown[] | undefined);
    return (
      <div className={(props.direction === 'horizontal' ? 'flex flex-row items-center ' : 'flex flex-col ') + 'gap-2'}>
        {children}
      </div>
    );
  },
});

export const Text = defineComponent({
  name: 'Text',
  description: 'A paragraph of text',
  props: z.object({
    content: z.string().describe('The text to show'),
  }),
  component: ({ props }) => <p className="text-sm text-foreground/90 leading-relaxed">{props.content}</p>,
});

export const Heading = defineComponent({
  name: 'Heading',
  description: 'A section heading',
  props: z.object({
    content: z.string().describe('Heading text'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe('Heading level'),
  }),
  component: ({ props }) => {
    const size = props.level === 1 ? 'text-base' : props.level === 3 ? 'text-xs' : 'text-sm';
    return <div className={`${size} font-semibold text-foreground`}>{props.content}</div>;
  },
});

export const Metric = defineComponent({
  name: 'Metric',
  description: 'A KPI value with label and trend',
  props: z.object({
    label: z.string().describe('What is measured'),
    value: z.string().describe('The value'),
    trend: z.enum(['up', 'down', 'flat']).optional().describe('Direction of change'),
  }),
  component: ({ props }) => (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="font-mono text-lg font-semibold text-foreground">{props.value}</span>
      {props.trend && props.trend !== 'flat' && (
        <span className={`text-3xs font-semibold ${props.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
          {props.trend === 'up' ? '▲' : '▼'}
        </span>
      )}
    </div>
  ),
});

export const Badge = defineComponent({
  name: 'Badge',
  description: 'A small status pill',
  props: z.object({
    text: z.string().describe('Badge label'),
    tone: z.enum(['default', 'success', 'warning', 'danger']).optional().describe('Color tone'),
  }),
  component: ({ props }) => (
    <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-3xs font-semibold ${toneClass(props.tone)}`}>
      {props.text}
    </span>
  ),
});

export const Button = defineComponent({
  name: 'Button',
  description: 'A clickable button that runs an action, e.g. action: @send_prompt("text")',
  props: z.object({
    label: z.string().describe('Button text'),
    action: action().optional().describe('The action to run on click'),
  }),
  component: ({ props }) => {
    const triggerAction = useTriggerAction();
    return (
      <button
        type="button"
        className="w-fit rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary/90"
        onClick={() => triggerAction(props.label, undefined, props.action as never)}
      >
        {props.label}
      </button>
    );
  },
});

export const Table = defineComponent({
  name: 'Table',
  description: 'A simple data table',
  props: z.object({
    headers: z.array(z.string()).describe('Column headers'),
    rows: z.array(z.array(z.string())).describe('Rows of cell text'),
  }),
  component: ({ props }) => (
    <div className="my-1 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            {props.headers.map((h: string, i: number) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row: string[], r: number) => (
            <tr key={r} className="border-t border-border/60">
              {row.map((cell: string, c: number) => (
                <td key={c} className="px-3 py-1.5 text-foreground/90">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});

export const List = defineComponent({
  name: 'List',
  description: 'A bulleted list',
  props: z.object({
    items: z.array(z.string()).describe('List items'),
  }),
  component: ({ props }) => (
    <ul className="my-1 list-disc space-y-1 pl-5 text-sm text-foreground/90">
      {props.items.map((it: string, i: number) => <li key={i}>{it}</li>)}
    </ul>
  ),
});

export const Image = defineComponent({
  name: 'Image',
  description: 'An image',
  props: z.object({
    url: z.string().describe('Image URL'),
    alt: z.string().optional().describe('Alt text'),
  }),
  component: ({ props }) => (
    <img src={props.url} alt={props.alt || ''} className="my-1 max-h-64 rounded-lg border border-border" loading="lazy" />
  ),
});

export const Divider = defineComponent({
  name: 'Divider',
  description: 'A horizontal separator line',
  props: z.object({}),
  component: () => <hr className="my-2 border-border/60" />,
});

/** The library the chat renderer accepts. `Card` is the root so generated
 * programs always wrap content in a Card surface. */
export const opuiLibrary = createLibrary({
  components: [Card, Stack, Text, Heading, Metric, Badge, Button, Table, List, Image, Divider],
  actions: [sendPromptAction, feedbackAction],
  root: 'Card',
});

/** Map a Renderer ActionEvent onto this app: send chat prompts, fill the
 * composer with feedback, or open URLs. */
export function handleOpenUIAction(
  event: ActionEvent,
  sendPrompt: (text: string) => void,
  fillInput: (text: string) => void
) {
  if (event.type === 'open_url') {
    const url = (event.params as { url?: string }).url;
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }
  if (event.type === 'send_prompt') {
    const prompt = (event.params as { prompt?: string }).prompt || event.humanFriendlyMessage;
    if (prompt) sendPrompt(prompt);
    return;
  }
  if (event.type === 'feedback' || event.type === 'fill_input') {
    const text = (event.params as { text?: string }).text || event.humanFriendlyMessage;
    if (text) fillInput(text);
    return;
  }
  if (event.type === 'continue_conversation') {
    const text = event.humanFriendlyMessage || ((event.params as { context?: string }).context ?? '');
    if (text) sendPrompt(text);
  }
}

export default opuiLibrary;
