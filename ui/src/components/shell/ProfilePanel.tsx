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
  Copy,
  Trash2,
  Download,
} from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useUIStore } from '../../store/useUIStore';
import { useAppStore } from '../../store/useAppStore';
import { GrokAvatar, AI_BOT_AVATARS, CLASSIC_SHAPE_AVATARS } from '../GrokAvatar';
import { cn } from '../../lib/cn';

type SoulFileKey = 'identity' | 'soul' | 'style' | 'instructions' | 'memory';

interface SoulFileDef {
  key: SoulFileKey;
  label: string;
  filename: string;
  hint: string;
  cardClass: string;
}

const SOUL_FILES: SoulFileDef[] = [
  {
    key: 'identity',
    label: 'IDENTITY',
    filename: 'IDENTITY.md',
    hint: 'Who this agent is — core instructions and persona',
    cardClass: 'from-violet-600/80 to-fuchsia-600/70 border-violet-500/40',
  },
  {
    key: 'soul',
    label: 'SOUL',
    filename: 'SOUL.md',
    hint: 'Worldview, values, and opinions',
    cardClass: 'from-rose-600/80 to-red-600/70 border-rose-500/40',
  },
  {
    key: 'style',
    label: 'STYLE',
    filename: 'STYLE.md',
    hint: 'Voice, tone, and formatting',
    cardClass: 'from-amber-600/80 to-orange-600/70 border-amber-500/40',
  },
  {
    key: 'instructions',
    label: 'INSTRUCTIONS',
    filename: 'INSTRUCTIONS.md',
    hint: 'Operating instructions and workflows',
    cardClass: 'from-emerald-600/80 to-teal-600/70 border-emerald-500/40',
  },
  {
    key: 'memory',
    label: 'MEMORY',
    filename: 'MEMORY.md',
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
 * Muse-style floating right panel showing and editing the agent profile:
 * Avatar, Name, Role, Model, Description, and Soul Stack (IDENTITY.md, SOUL.md, STYLE.md, INSTRUCTIONS.md, MEMORY.md).
 * All editing is performed directly inside this panel without navigating away.
 */
export const ProfilePanel: React.FC = () => {
  const { activeAgent, updateAgent, duplicateAgent, deleteAgent } = useProfileStore();
  const { availableModels, defaultModel } = useAppStore();
  const { rightPanel, closePanels } = useUIStore();

  const isOpen = rightPanel === 'profile';

  // Avatar picker state
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarCategory, setAvatarCategory] = useState<'ai-bot' | 'classic'>('ai-bot');

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Role editing state
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [roleDraft, setRoleDraft] = useState('');

  // Description editing state
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  // Model dropdown state
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Soul stack file editing state
  const [expanded, setExpanded] = useState<Record<SoulFileKey, boolean>>({
    identity: true,
    soul: false,
    style: false,
    instructions: false,
    memory: false,
  });
  const [editingKey, setEditingKey] = useState<SoulFileKey | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync drafts when activeAgent changes
  useEffect(() => {
    if (activeAgent) {
      setNameDraft(activeAgent.name || '');
      setRoleDraft(activeAgent.role || '');
      setDescDraft(activeAgent.description || '');
    }
  }, [activeAgent]);

  useEffect(() => {
    if (!isOpen) {
      setEditingKey(null);
      setShowAvatarPicker(false);
      setIsEditingName(false);
      setIsEditingRole(false);
      setIsEditingDesc(false);
      setShowModelDropdown(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAvatarPicker) {
          setShowAvatarPicker(false);
          return;
        }
        if (isEditingName) {
          setIsEditingName(false);
          return;
        }
        if (isEditingRole) {
          setIsEditingRole(false);
          return;
        }
        if (isEditingDesc) {
          setIsEditingDesc(false);
          return;
        }
        if (showModelDropdown) {
          setShowModelDropdown(false);
          return;
        }
        if (editingKey) {
          setEditingKey(null);
          return;
        }
        closePanels();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isOpen,
    showAvatarPicker,
    isEditingName,
    isEditingRole,
    isEditingDesc,
    showModelDropdown,
    editingKey,
    closePanels,
  ]);

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

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== activeAgent.name) {
      await updateAgent({ id: activeAgent.id, name: trimmed });
    }
    setIsEditingName(false);
  };

  const handleSaveRole = async () => {
    const trimmed = roleDraft.trim();
    if (trimmed !== (activeAgent.role || '')) {
      await updateAgent({ id: activeAgent.id, role: trimmed });
    }
    setIsEditingRole(false);
  };

  const handleSaveDesc = async () => {
    const trimmed = descDraft.trim();
    if (trimmed !== (activeAgent.description || '')) {
      await updateAgent({ id: activeAgent.id, description: trimmed });
    }
    setIsEditingDesc(false);
  };

  const handleDuplicate = async () => {
    await duplicateAgent(activeAgent.id);
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${activeAgent.name}?`)) {
      await deleteAgent(activeAgent.id);
      closePanels();
    }
  };

  const handleExport = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(activeAgent, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute(
      'download',
      `${activeAgent.name.toLowerCase().replace(/\s+/g, '_')}_config.json`
    );
    dlAnchor.click();
  };

  return (
    <>
      {/* Transparent click-catcher */}
      <div className="fixed inset-0 z-40" onClick={closePanels} />

      <aside className="panel-slide-in-right fixed right-0 top-0 z-50 h-full w-[340px] shrink-0 bg-sidebar/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl flex flex-col select-none overflow-hidden">
        {/* Header with close */}
        <div className="flex shrink-0 items-center justify-between px-4 h-10 border-b border-border/40">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Agent Profile
          </span>
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

        {/* In-sidebar Avatar Picker Overlay */}
        {showAvatarPicker && (
          <div className="absolute inset-0 z-30 bg-sidebar/98 backdrop-blur-xl p-4 flex flex-col animate-in fade-in-50 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <h3 className="text-ui-sm font-semibold text-foreground">Choose Avatar</h3>
              <button
                type="button"
                onClick={() => setShowAvatarPicker(false)}
                className="size-7 rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex items-center justify-center cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1 my-3 p-1 bg-surface/60 rounded-xl border border-border/40 text-ui-xs shrink-0">
              <button
                type="button"
                onClick={() => setAvatarCategory('ai-bot')}
                className={cn(
                  'flex-1 py-1 px-2 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5',
                  avatarCategory === 'ai-bot'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-foreground-subtle hover:text-foreground'
                )}
              >
                <span>AI Avatars</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/15 text-primary font-mono font-bold">
                  {AI_BOT_AVATARS.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAvatarCategory('classic')}
                className={cn(
                  'flex-1 py-1 px-2 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5',
                  avatarCategory === 'classic'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-foreground-subtle hover:text-foreground'
                )}
              >
                <span>Classic</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-hover text-foreground-subtle font-mono">
                  {CLASSIC_SHAPE_AVATARS.length}
                </span>
              </button>
            </div>

            {/* Avatars Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2.5 p-1 scrollbar-thin">
              {(avatarCategory === 'ai-bot' ? AI_BOT_AVATARS : CLASSIC_SHAPE_AVATARS).map((av) => {
                const isSelected = (activeAgent.avatar || 'amber-cube') === av.id;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={async () => {
                      await updateAgent({ id: activeAgent.id, avatar: av.id });
                      setShowAvatarPicker(false);
                    }}
                    className={cn(
                      'relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer hover:scale-105',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-xs'
                        : 'border-border/50 bg-card/60 hover:border-border hover:bg-surface'
                    )}
                    title={`${av.name} • ${av.role}`}
                  >
                    <GrokAvatar id={av.id} size={48} />
                    <span className="mt-1 text-[10px] text-foreground-subtle font-medium truncate w-full text-center">
                      {av.name.split(' ')[0]}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 size-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="size-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-thin scrollbar-thumb-border">
          {/* Avatar + Name + Role + Status */}
          <div className="flex flex-col items-center text-center gap-2.5 pt-3">
            {/* Avatar Button */}
            <button
              type="button"
              onClick={() => setShowAvatarPicker(true)}
              className="group relative size-24 rounded-full overflow-hidden flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
              title="Click to change avatar"
            >
              <GrokAvatar id={activeAgent.avatar || 'amber-cube'} size={96} />
              <div className="absolute bottom-0 right-0 size-7 rounded-full bg-card border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                <Pencil className="size-3 text-foreground" />
              </div>
            </button>

            {/* Editable Name */}
            <div className="w-full flex justify-center">
              {isEditingName ? (
                <div className="flex items-center justify-center gap-1.5">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') {
                        setNameDraft(activeAgent.name || '');
                        setIsEditingName(false);
                      }
                    }}
                    autoFocus
                    className="text-lg font-bold text-center text-foreground bg-surface border border-primary/60 rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 w-48"
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    className="size-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors cursor-pointer"
                    title="Save name"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(activeAgent.name || '');
                      setIsEditingName(false);
                    }}
                    className="size-7 rounded-lg hover:bg-foreground/5 text-muted-foreground flex items-center justify-center transition-colors cursor-pointer"
                    title="Cancel"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setNameDraft(activeAgent.name || '');
                    setIsEditingName(true);
                  }}
                  className="group inline-flex items-center gap-1.5 cursor-pointer rounded-xl px-2.5 py-1 hover:bg-foreground/5 transition-colors"
                  title="Click to edit name"
                >
                  <h2 className="text-lg font-bold text-foreground tracking-tight">
                    {activeAgent.name || 'Agent'}
                  </h2>
                  <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>

            {/* Editable Role */}
            <div className="w-full flex justify-center">
              {isEditingRole ? (
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="text"
                    value={roleDraft}
                    onChange={(e) => setRoleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRole();
                      if (e.key === 'Escape') {
                        setRoleDraft(activeAgent.role || '');
                        setIsEditingRole(false);
                      }
                    }}
                    placeholder="Role (e.g. Educator)"
                    autoFocus
                    className="text-2xs font-medium text-center text-foreground bg-surface border border-primary/60 rounded-full px-2.5 py-0.5 focus:outline-none w-36"
                  />
                  <button
                    type="button"
                    onClick={handleSaveRole}
                    className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 cursor-pointer"
                  >
                    <Check className="size-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRoleDraft(activeAgent.role || '');
                      setIsEditingRole(false);
                    }}
                    className="size-5 rounded-full hover:bg-foreground/5 text-muted-foreground flex items-center justify-center cursor-pointer"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRoleDraft(activeAgent.role || '');
                    setIsEditingRole(true);
                  }}
                  className="group inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-foreground/5 border border-border/50 text-2xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all cursor-pointer"
                  title="Click to edit role"
                >
                  <span>{activeAgent.role || 'Add role'}</span>
                  <Pencil className="size-2 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>

            {/* Model & Engine Status + Selector */}
            <div className="flex flex-col items-center gap-1.5 mt-0.5">
              <div className="inline-flex items-center gap-1 text-ui-xs text-muted-foreground">
                <Check className="size-3.5 text-emerald-500" />
                <span>
                  {activeAgent.engine === 'acp'
                    ? `Connected · ${activeAgent.acpAgent || 'ACP'}`
                    : 'Connected'}
                </span>
              </div>

              {availableModels && availableModels.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-muted hover:bg-surface border border-border/50 text-3xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Switch agent model"
                  >
                    <span className="truncate max-w-[150px]">
                      {activeAgent.model || defaultModel || 'Default Model'}
                    </span>
                    <ChevronDown className="size-2.5 opacity-60" />
                  </button>

                  {showModelDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowModelDropdown(false)}
                      />
                      <div className="dropdown-glass absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-56 max-h-56 overflow-y-auto rounded-xl bg-card/95 backdrop-blur-xl border border-border p-1 shadow-2xl scrollbar-thin">
                        {availableModels.map((m) => {
                          const modelId = m.id || m.name;
                          const isSelected =
                            (activeAgent.model || defaultModel) === modelId;
                          return (
                            <button
                              key={modelId}
                              type="button"
                              onClick={() => {
                                updateAgent({ id: activeAgent.id, model: modelId });
                                setShowModelDropdown(false);
                              }}
                              className={cn(
                                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-ui-xs font-mono transition-colors cursor-pointer',
                                isSelected
                                  ? 'bg-primary/15 text-primary font-semibold'
                                  : 'text-foreground-subtle hover:bg-surface hover:text-foreground'
                              )}
                            >
                              <span className="truncate">{m.name || m.id}</span>
                              {isSelected && (
                                <Check className="size-3 text-primary shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section label */}
          <div className="flex items-center gap-1.5 mt-6 mb-2 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Fingerprint className="size-3" />
            <span>Soul Stack</span>
          </div>

          {/* Identity / Soul / Style / Instructions / Memory cards */}
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
                            placeholder={`Write ${file.filename} here…`}
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
                                Nothing written yet — click to write {file.filename}
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
                                title={`Edit ${file.filename}`}
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

          {/* Editable Description */}
          {isEditingDesc ? (
            <div className="mt-4 space-y-1.5 px-1">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Agent description..."
                className="w-full rounded-xl bg-surface border border-border p-2 text-2xs leading-relaxed text-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDescDraft(activeAgent.description || '');
                    setIsEditingDesc(false);
                  }}
                  className="px-2 py-0.5 rounded text-2xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDesc}
                  className="px-2.5 py-0.5 rounded bg-primary text-2xs font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                setDescDraft(activeAgent.description || '');
                setIsEditingDesc(true);
              }}
              className="mt-4 flex items-start gap-1.5 px-1 text-2xs text-muted-foreground/70 leading-relaxed cursor-pointer hover:text-muted-foreground transition-colors group"
              title="Click to edit description"
            >
              <Sparkles className="size-3 mt-0.5 shrink-0" />
              <span className="flex-1">
                {activeAgent.description || 'Add agent description...'}
              </span>
              <Pencil className="size-2.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          )}

          {/* Agent Action Buttons */}
          <div className="mt-6 pt-4 border-t border-border/40 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDuplicate}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-2xs font-medium text-foreground-subtle hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
                title="Duplicate this agent"
              >
                <Copy className="size-3 text-muted-foreground" />
                <span>Duplicate</span>
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-2xs font-medium text-foreground-subtle hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
                title="Export agent config as JSON"
              >
                <Download className="size-3 text-muted-foreground" />
                <span>Export</span>
              </button>
            </div>

            {!activeAgent.isDefault && (
              <button
                type="button"
                onClick={handleDelete}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-2xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <Trash2 className="size-3" />
                <span>Delete agent</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default ProfilePanel;
