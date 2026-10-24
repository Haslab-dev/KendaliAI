import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  Fingerprint,
  Heart,
  Sparkles,
  Settings2,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useUIStore } from '../../store/useUIStore';
import { GrokAvatar } from '../GrokAvatar';
import { cn } from '../../lib/cn';

type SoulFileKey = 'identity' | 'soul' | 'memory';

interface SoulFileDef {
  key: SoulFileKey;
  label: string;
  hint: string;
  /** Tailwind gradient classes for the Muse-style card */
  cardClass: string;
}

const SOUL_FILES: SoulFileDef[] = [
  {
    key: 'identity',
    label: 'IDENTITY',
    hint: 'Who this agent is — core instructions and persona',
    cardClass: 'from-violet-600/80 to-fuchsia-600/70 border-violet-500/40',
  },
  {
    key: 'soul',
    label: 'SOUL',
    hint: 'Worldview, values, and opinions',
    cardClass: 'from-rose-600/80 to-red-600/70 border-rose-500/40',
  },
  {
    key: 'memory',
    label: 'MEMORY',
    hint: 'Continuity and context to carry forward',
    cardClass: 'from-blue-600/80 to-indigo-600/70 border-blue-500/40',
  },
];

function formatDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${String(d.getFullYear()).slice(2)}`;
}

/**
 * Muse-style floating right panel showing the agent's soul stack:
 * IDENTITY.md, SOUL.md, and MEMORY.md. Opens when the top-center profile
 * avatar is clicked.
 */
export const ProfilePanel: React.FC = () => {
  const { activeAgent, updateAgent, setActiveNavTab } = useProfileStore();
  const { rightPanel, closePanels } = useUIStore();

  const isOpen = rightPanel === 'profile';
  const [expanded, setExpanded] = useState<Record<SoulFileKey, boolean>>({
    identity: true,
    soul: false,
    memory: false,
  });
  const [editingKey, setEditingKey] = useState<SoulFileKey | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEditingKey(null);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanels();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closePanels]);

  if (!isOpen || !activeAgent) return null;

  const soul = activeAgent.soulStack || {};

  const getContent = (key: SoulFileKey): string => {
    if (key === 'identity') return activeAgent.systemPrompt || '';
    return soul[key] || '';
  };

  const startEdit = (key: SoulFileKey) => {
    setEditingKey(key);
    setDraft(getContent(key));
    setExpanded((prev) => ({ ...prev, [key]: true }));
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      if (editingKey === 'identity') {
        await updateAgent({ id: activeAgent.id, systemPrompt: draft });
      } else {
        await updateAgent({
          id: activeAgent.id,
          soulStack: { ...soul, [editingKey]: draft },
        });
      }
      setEditingKey(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Transparent click-catcher */}
      <div className="fixed inset-0 z-40" onClick={closePanels} />

      <aside className="panel-slide-in-right fixed right-0 top-0 z-50 h-full w-[340px] shrink-0 bg-sidebar/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl flex flex-col select-none overflow-hidden">
        {/* Header with close */}
        <div className="flex shrink-0 items-center justify-end px-3 h-10">
          <button
            type="button"
            onClick={closePanels}
            aria-label="Close profile"
            title="Close"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-thin scrollbar-thumb-border">
          {/* Avatar + Name + Status (Muse parity) */}
          <div className="flex flex-col items-center text-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                closePanels();
                setActiveNavTab('agent');
              }}
              className="group relative size-24 rounded-full overflow-hidden flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
              title="Open full agent configuration"
            >
              <GrokAvatar id={activeAgent.avatar || 'amber-cube'} size={96} />
              <div className="absolute bottom-0 right-0 size-7 rounded-full bg-card border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="size-3 text-foreground" />
              </div>
            </button>

            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                {activeAgent.name || 'Agent'}
              </h2>
              <div className="mt-0.5 inline-flex items-center gap-1 text-ui-xs text-muted-foreground">
                <Check className="size-3.5 text-emerald-500" />
                <span>
                  {activeAgent.engine === 'acp'
                    ? `Connected · ${activeAgent.acpAgent || 'ACP'}`
                    : 'Connected'}
                </span>
              </div>
            </div>

            {activeAgent.role && (
              <span className="px-2.5 py-0.5 rounded-full bg-foreground/5 border border-border/50 text-2xs font-medium text-muted-foreground">
                {activeAgent.role}
              </span>
            )}
          </div>

          {/* Section label */}
          <div className="flex items-center gap-1.5 mt-6 mb-2 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Fingerprint className="size-3" />
            <span>Soul Stack</span>
          </div>

          {/* Identity / Soul / Memory cards */}
          <div className="space-y-2.5">
            {SOUL_FILES.map((file) => {
              const content = getContent(file.key);
              const isExpanded = expanded[file.key];
              const isEditing = editingKey === file.key;
              const isEmpty = !content.trim();

              return (
                <div
                  key={file.key}
                  className={cn(
                    'rounded-2xl border bg-gradient-to-br transition-all overflow-hidden',
                    file.cardClass
                  )}
                >
                  {/* Card header */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [file.key]: !prev[file.key] }))
                    }
                    className="w-full flex items-center justify-between px-3.5 pt-3 pb-1.5 text-left cursor-pointer"
                  >
                    <div>
                      <span className="font-mono text-ui-sm font-bold text-white tracking-wide">
                        {file.label}
                        <span className="text-white/60">.md</span>
                      </span>
                      <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold mt-0.5">
                        {isEmpty ? 'Empty — click to write' : 'Access with care'}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-white/70 shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 text-white/70 shrink-0" />
                    )}
                  </button>

                  {/* Card body */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={8}
                            autoFocus
                            placeholder={`Write ${file.label}.md here…`}
                            className="w-full rounded-xl bg-black/30 border border-white/20 p-2.5 font-mono text-ui-xs leading-relaxed text-white placeholder:text-white/40 focus:outline-none focus:border-white/50 resize-none"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingKey(null)}
                              className="rounded-lg px-2.5 py-1 text-ui-xs font-medium text-white/70 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={saving}
                              className="rounded-lg bg-white/90 px-3 py-1 text-ui-xs font-semibold text-gray-900 hover:bg-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60"
                            >
                              <Save className="size-3" />
                              <span>{saving ? 'Saving…' : 'Save'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p
                            onClick={() => startEdit(file.key)}
                            title={file.hint}
                            className={cn(
                              'rounded-xl cursor-pointer text-ui-xs leading-relaxed text-white/90 whitespace-pre-wrap transition-colors hover:bg-white/5 p-1 -m-1',
                              !isExpanded && 'line-clamp-3'
                            )}
                          >
                            {isEmpty ? (
                              <span className="text-white/50 italic">
                                Nothing written yet — click to write {file.label}.md
                              </span>
                            ) : (
                              content
                            )}
                          </p>

                          <div className="mt-2 flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 text-2xs text-white/60 font-mono">
                              {formatDate(activeAgent.updatedAt) || formatDate(Date.now())}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(file.key)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-semibold text-white/80 hover:bg-white/15 hover:text-white cursor-pointer transition-colors"
                                title={`Edit ${file.label}.md`}
                              >
                                <Pencil className="size-2.5" />
                                <span>Edit</span>
                              </button>
                              <span
                                className="inline-flex items-center justify-center size-6 rounded-full text-white/70"
                                title="Cherished"
                              >
                                <Heart className="size-3 fill-white/40" />
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Full configuration escape hatch */}
          <button
            type="button"
            onClick={() => {
              closePanels();
              setActiveNavTab('agent');
            }}
            className="mt-4 w-full flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-ui-xs font-medium text-foreground-subtle hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
          >
            <Settings2 className="size-3.5" />
            <span>Full agent configuration</span>
          </button>

          {activeAgent.description && (
            <div className="mt-4 flex items-start gap-1.5 px-1 text-2xs text-muted-foreground/70 leading-relaxed">
              <Sparkles className="size-3 mt-0.5 shrink-0" />
              <span>{activeAgent.description}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default ProfilePanel;
