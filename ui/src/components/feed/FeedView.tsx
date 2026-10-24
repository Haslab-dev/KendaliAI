import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Newspaper,
  Pencil,
  Sparkles,
  Loader2,
  Globe,
  MessageSquare,
  Heart,
  RefreshCw,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { ChatTopControls } from '../shell/ChatTopControls';
import { relativeTime } from '../../lib/time';
import { cn } from '../../lib/cn';

interface FeedItem {
  title: string;
  summary: string;
  source?: string;
  url?: string;
  publishedAt?: number;
  liked?: boolean;
}

interface FeedCache {
  items: FeedItem[];
  generatedAt: number;
}

const DEFAULT_FEED_PROMPT =
  'Make me a feed about my interests. Keep the tone clear and direct. Ensure it is quick to skim. Try to avoid clickbait.';

function promptKey(agentId: string) {
  return `kendali:feed-prompt:${agentId}`;
}
function cacheKey(agentId: string) {
  return `kendali:feed-cache:${agentId}`;
}

function loadFeedCache(agentId: string): FeedCache {
  try {
    const raw = localStorage.getItem(cacheKey(agentId));
    if (!raw) return { items: [], generatedAt: 0 };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) {
      return { items: parsed.items, generatedAt: parsed.generatedAt || 0 };
    }
    return { items: [], generatedAt: 0 };
  } catch {
    return { items: [], generatedAt: 0 };
  }
}

/**
 * AI-generated feed from web sources (Muse parity). The active agent researches
 * the user's feed prompt and returns a set of skimmable items; each item can be
 * discussed in a fresh chat session.
 */
export const FeedView: React.FC = () => {
  const { activeAgent } = useProfileStore();
  const { availableModels, defaultModel } = useAppStore();
  const { createSessionForAgent, sendMessage } = useSessionStore();

  const agentId = activeAgent?.id || 'lutfi';

  const [prompt, setPrompt] = useState<string>(
    () => localStorage.getItem(promptKey(agentId)) || DEFAULT_FEED_PROMPT
  );
  const [promptDraft, setPromptDraft] = useState(prompt);
  const [editingPrompt, setEditingPrompt] = useState(false);

  const [items, setItems] = useState<FeedItem[]>(() => loadFeedCache(agentId).items);
  const [generatedAt, setGeneratedAt] = useState<number>(() => loadFeedCache(agentId).generatedAt);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<number, boolean>>({});
  const [startingDiscuss, setStartingDiscuss] = useState<number | null>(null);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const modelName = useMemo(
    () => activeAgent?.model || defaultModel || availableModels[0]?.name || '',
    [activeAgent, defaultModel, availableModels]
  );

  // Reload cache when switching agents
  useEffect(() => {
    setPrompt(localStorage.getItem(promptKey(agentId)) || DEFAULT_FEED_PROMPT);
    const cached = loadFeedCache(agentId);
    setItems(cached.items);
    setGeneratedAt(cached.generatedAt);
  }, [agentId]);

  useEffect(() => {
    if (editingPrompt) {
      promptDraft && promptRef.current?.focus();
    }
  }, [editingPrompt]);

  const savePromptDraft = () => {
    const next = promptDraft.trim() || DEFAULT_FEED_PROMPT;
    setPrompt(next);
    localStorage.setItem(promptKey(agentId), next);
    setEditingPrompt(false);
  };

  const generateFeed = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          model: modelName || undefined,
          messages: [
            {
              role: 'system',
              content:
                'You are a feed generator. Research the web using your available tools when possible, then respond with ONLY a strict JSON array (no markdown fences, no prose). Each element: {"title": string, "summary": string (2-3 sentences, skimmable, no clickbait), "source": string (site or org name), "url": string (omit if unknown), "publishedAt": number (epoch ms, omit if unknown)}. Produce between 4 and 8 items, most recent / most relevant first.',
            },
            {
              role: 'user',
              content: `Today is ${new Date().toDateString()}.\n\nFeed prompt from the user: ${prompt}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const data = await res.json();
      const raw: string = data?.choices?.[0]?.message?.content || '';

      // Extract the JSON array even if wrapped in prose or fences
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('The agent did not return a parseable feed.');
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('The agent returned an empty feed.');
      }

      const next: FeedItem[] = parsed
        .filter((it: any) => it && typeof it.title === 'string')
        .slice(0, 12)
        .map((it: any) => ({
          title: String(it.title),
          summary: String(it.summary || ''),
          source: it.source ? String(it.source) : undefined,
          url: it.url ? String(it.url) : undefined,
          publishedAt: typeof it.publishedAt === 'number' ? it.publishedAt : undefined,
        }));

      const payload: FeedCache = { items: next, generatedAt: Date.now() };
      localStorage.setItem(cacheKey(agentId), JSON.stringify(payload));
      setItems(next);
      setGeneratedAt(payload.generatedAt);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate the feed.');
    } finally {
      setGenerating(false);
    }
  };

  const discussItem = async (item: FeedItem, idx: number) => {
    setStartingDiscuss(idx);
    try {
      const targetAgent = activeAgent?.id || 'lutfi';
      await createSessionForAgent(targetAgent, item.title.slice(0, 36));
      await sendMessage(
        `Let's discuss this from my feed:\n\n"${item.title}"${item.source ? ` — ${item.source}` : ''}${
          item.url ? ` (${item.url})` : ''
        }\n\n${item.summary}`,
        { agentId: targetAgent }
      );
      useProfileStore.getState().setActiveNavTab('chat');
    } finally {
      setStartingDiscuss(null);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-background text-foreground select-none relative overflow-hidden">
      {/* Floating top-right controls (no header bar) */}
      <ChatTopControls scrolled={headerScrolled} />

      <div
        onScroll={(e) => setHeaderScrolled((e.target as HTMLDivElement).scrollTop > 24)}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 scrollbar-thin scrollbar-thumb-border"
      >
        <div className="chat-content-lane space-y-6 pt-10 pb-16">
          {/* Title */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <Newspaper className="size-6 text-primary" />
              Feed
            </h1>
            {generatedAt > 0 && (
              <button
                type="button"
                onClick={generateFeed}
                disabled={generating}
                className="inline-flex items-center gap-1.5 text-ui-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                title="Regenerate feed"
              >
                <RefreshCw className={cn('size-3.5', generating && 'animate-spin')} />
                Refresh
              </button>
            )}
          </div>

          {/* Feed prompt card */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 shadow-xs">
            <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your feed prompt
            </div>

            {editingPrompt ? (
              <>
                <textarea
                  ref={promptRef}
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border/70 bg-surface-muted p-3 text-ui-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                  placeholder="Describe what your feed should cover…"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPromptDraft(prompt);
                      setEditingPrompt(false);
                    }}
                    className="rounded-xl px-3 py-1.5 text-ui-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={savePromptDraft}
                    className="rounded-xl border border-border/70 bg-surface px-3.5 py-1.5 text-ui-xs font-semibold text-foreground hover:bg-accent flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Check className="size-3.5" />
                    Save prompt
                  </button>
                </div>
              </>
            ) : (
              <>
                <p
                  onClick={() => {
                    setPromptDraft(prompt);
                    setEditingPrompt(true);
                  }}
                  className="text-ui-sm leading-relaxed text-foreground cursor-pointer rounded-lg hover:bg-surface/60 transition-colors p-1 -m-1"
                  title="Click to edit your feed prompt"
                >
                  {prompt}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPromptDraft(prompt);
                      setEditingPrompt(true);
                    }}
                    className="rounded-xl border border-border/70 bg-surface px-3.5 py-1.5 text-ui-xs font-semibold text-foreground hover:bg-accent flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={generateFeed}
                    disabled={generating}
                    className="rounded-xl bg-primary px-4 py-1.5 text-ui-xs font-semibold text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {generating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {generating ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-ui-xs text-destructive animate-in fade-in">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 shrink-0" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded p-0.5 hover:bg-destructive/20 cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Generating skeleton */}
          {generating && items.length === 0 && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3.5 animate-pulse">
                  <div className="size-10 rounded-xl bg-muted shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-full" />
                    <div className="h-3 bg-muted rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!generating && items.length === 0 && !error && (
            <div className="py-16 text-center text-muted-foreground space-y-3">
              <Newspaper className="w-9 h-9 text-muted-foreground/60 mx-auto opacity-70" />
              <p className="font-medium text-sm text-foreground">Your feed is empty</p>
              <p className="text-ui-xs text-muted-foreground max-w-sm mx-auto">
                Tune the feed prompt above, then hit Generate. The agent researches the web and
                distills a skimmable feed for you.
              </p>
            </div>
          )}

          {/* Feed items */}
          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="group/feed-item flex gap-3.5 rounded-2xl px-3 py-4 -mx-3 transition-colors hover:bg-card/60"
                >
                  {/* Source glyph */}
                  <div className="size-10 rounded-xl bg-surface-muted border border-border/50 flex items-center justify-center shrink-0 text-foreground/80">
                    <Globe className="size-4.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ui-base font-semibold text-foreground hover:text-primary transition-colors leading-snug"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <span className="text-ui-base font-semibold text-foreground leading-snug">
                          {item.title}
                        </span>
                      )}
                      <span className="shrink-0 text-2xs text-muted-foreground/70 whitespace-nowrap pt-1">
                        {item.publishedAt
                          ? relativeTime(item.publishedAt)
                          : generatedAt
                            ? relativeTime(generatedAt)
                            : ''}
                      </span>
                    </div>

                    {/* Summary */}
                    <p className="mt-1 text-ui-sm leading-relaxed text-foreground-subtle line-clamp-3">
                      {item.summary}
                      {item.source && (
                        <span className="text-muted-foreground/60"> — {item.source}</span>
                      )}
                    </p>

                    {/* Actions */}
                    <div className="mt-2.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => discussItem(item, idx)}
                        disabled={startingDiscuss !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-ui-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {startingDiscuss === idx ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="size-3.5" />
                        )}
                        Discuss
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setLikedMap((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className={cn(
                          'inline-flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer hover:bg-accent',
                          likedMap[idx] ? 'text-rose-500' : 'text-muted-foreground hover:text-foreground'
                        )}
                        title="Like"
                      >
                        <Heart className={cn('size-3.5', likedMap[idx] && 'fill-rose-500')} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedView;
