import React, { useState, useEffect } from 'react';
import {
  Brain,
  Wrench,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
  FileCode,
  Save,
  Plus,
  BookOpen,
} from 'lucide-react';
import {
  PaneToolbar,
  PaneToolbarFilters,
  PaneToolbarActions,
  StatChip,
  SettingsSearchInput,
  Chip,
  ToolTag,
} from '../components/settings/settingsPrimitives';
import { SkillItem } from '../types';
import { cn } from '../lib/utils';

export const SkillsPane: React.FC = () => {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/skills');
      if (res.ok) {
        const data = await res.json();
        setSkills(Array.isArray(data) ? data : []);
      }
    } catch {
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSkill) {
        setSelectedSkill(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSkill]);

  const handleEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/skills?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSkill(data);
      }
    } catch (err) {
      console.error('Failed to load skill details:', err);
    }
  };

  const handleSave = async () => {
    if (!selectedSkill) return;
    setIsSaving(true);
    try {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedSkill),
      });
      showToast(`Skill "${selectedSkill.name || selectedSkill.id}" updated successfully.`);
      fetchSkills();
      setSelectedSkill(null);
    } catch (err) {
      console.error('Failed to save skill:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full space-y-6 text-foreground select-none">
      {/* Toast banner */}
      {toast && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-ui-xs font-medium text-emerald-400 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-emerald-400 hover:text-emerald-300 cursor-pointer">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <PaneToolbar>
        <PaneToolbarFilters>
          <SettingsSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter skills by keyword or domain..."
            className="w-full sm:max-w-md flex-1"
          />
        </PaneToolbarFilters>
        <PaneToolbarActions>
          <StatChip label="skills active" value={skills.length} />
          <button
            onClick={fetchSkills}
            title="Refresh skills from filesystem"
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-primary' : ''} />
          </button>
        </PaneToolbarActions>
      </PaneToolbar>

      {/* Skills Grid */}
      {filteredSkills.length === 0 ? (
        <div className="w-full p-12 text-center bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 shadow-2xs">
          <Brain size={32} className="text-muted-foreground" />
          <h4 className="text-ui-sm font-semibold text-foreground">
            {skills.length === 0 ? 'No Skills Installed' : 'No skills match your filter'}
          </h4>
          <p className="text-ui-xs text-muted-foreground max-w-sm">
            {skills.length === 0
              ? 'Tell any agent in chat "Create a skill for..." to automatically generate and save domain instructions.'
              : 'Try searching with a different term.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredSkills.map((sk) => {
            const isSelected = selectedSkill?.id === sk.id;
            const toolCount = sk.tools ? sk.tools.length : 0;

            return (
              <div
                key={sk.id}
                onClick={() => handleEdit(sk.id)}
                className={cn(
                  'group flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer shadow-2xs',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                    : 'border-border bg-card hover:border-border/80 hover:bg-accent/40'
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-primary">
                        <Brain size={14} />
                      </div>
                      <span className="font-semibold text-ui-sm text-foreground truncate">
                        {sk.name || sk.id}
                      </span>
                    </div>
                    {sk.category && (
                      <Chip tone="primary" className="text-3xs uppercase font-mono">
                        {sk.category}
                      </Chip>
                    )}
                  </div>

                  <p className="text-ui-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {sk.description || 'Custom autonomous agent guidelines and tools.'}
                  </p>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5 text-3xs text-muted-foreground">
                  <div className="flex items-center gap-1 font-mono">
                    <Wrench size={11} className="text-primary" />
                    <span>{toolCount} tool{toolCount === 1 ? '' : 's'}</span>
                  </div>
                  <span className="font-mono text-ui-xs text-foreground-subtle group-hover:text-primary transition-colors">
                    Edit SKILL.md →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal for Selected Skill */}
      {selectedSkill && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => setSelectedSkill(null)}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-3xl my-auto max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0 bg-surface/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                  <FileCode size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-ui-base font-bold text-foreground font-sans truncate">
                      {selectedSkill.name || selectedSkill.id}
                    </h3>
                    <span className="font-mono text-3xs px-2 py-0.5 rounded-md bg-surface-muted border border-border text-primary font-medium">
                      {selectedSkill.id}
                    </span>
                    {selectedSkill.category && (
                      <Chip tone="primary" className="text-3xs uppercase font-mono">
                        {selectedSkill.category}
                      </Chip>
                    )}
                  </div>
                  <p className="text-ui-xs text-muted-foreground font-sans mt-0.5 truncate">
                    SKILL.md instructions injected into agent context when this domain is activated.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer shrink-0 ml-2"
                title="Close (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar flex flex-col min-h-0">
              <div className="flex items-center justify-between text-3xs text-muted-foreground font-mono px-1">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-foreground-subtle">
                    <BookOpen size={12} className="text-primary" />
                    <span>skills/{selectedSkill.id}/SKILL.md</span>
                  </span>
                  {selectedSkill.tools && selectedSkill.tools.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Wrench size={11} className="text-primary" />
                      <span>{selectedSkill.tools.length} tool{selectedSkill.tools.length === 1 ? '' : 's'}</span>
                    </span>
                  )}
                </div>
                <span>{(selectedSkill.content || '').length.toLocaleString()} characters</span>
              </div>

              <textarea
                className="w-full flex-1 min-h-[360px] sm:min-h-[420px] rounded-xl border border-border bg-surface-muted p-4 font-mono text-ui-xs text-foreground outline-none transition-colors focus:border-primary resize-none leading-relaxed custom-scrollbar"
                value={selectedSkill.content || ''}
                onChange={(e) => setSelectedSkill({ ...selectedSkill, content: e.target.value })}
                placeholder="# Instructions for this skill..."
                spellCheck={false}
              />
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-muted/30 shrink-0">
              <span className="text-3xs text-muted-foreground hidden sm:inline">
                Press <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-foreground font-mono text-3xs">Esc</kbd> to exit without saving
              </span>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setSelectedSkill(null)}
                  className="px-4 py-2 rounded-lg border border-border text-ui-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-ui-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  <span>{isSaving ? 'Saving…' : 'Save Guidelines'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
