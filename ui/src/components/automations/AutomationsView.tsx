import React, { useState, useEffect, useCallback } from 'react';
import {
  AlarmClock,
  Clock,
  Plus,
  Play,
  Trash2,
  RefreshCw,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  Bot,
  ArrowRight,
  Send,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import {
  SettingsGroupCard,
  SettingsRow,
  settingsButtonClasses as btn,
} from '../settings/settingsPrimitives';

interface ScheduleItem {
  id: string;
  title: string;
  jobType?: 'notification' | 'task';
  cron: string;
  humanSchedule: string;
  nextRun: string;
  status: 'running' | 'paused';
  prompt: string;
  target?: string;
  owner?: string;
  ownerType?: string;
  deliverTelegram?: boolean;
  targetType?: string;
  targetId?: string;
}

interface AutomationPreset {
  id: string;
  name: string;
  schedule: string;
  cron: string;
  prompt: string;
  desc: string;
}

const PRESETS: AutomationPreset[] = [
  {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    schedule: 'Weekdays at 8:30 AM',
    cron: '30 8 * * 1-5',
    prompt: "Read my unread emails and today's calendar. Highlight urgent replies and meetings first.",
    desc: 'Summarizes appointments, pending PRs, and top priority items before your day starts.',
  },
  {
    id: 'weekly-team-report',
    name: 'Weekly Team Report',
    schedule: 'Every Friday at 5:00 PM',
    cron: '0 17 * * 5',
    prompt: 'Summarize git commits and merged pull requests across active repositories this week.',
    desc: 'Compiles milestone achievements, bug fixes, and open blockers into a Friday digest.',
  },
  {
    id: 'competitor-watch',
    name: 'Tech & Market Watch',
    schedule: 'Every Monday at 9:00 AM',
    cron: '0 9 * * 1',
    prompt: 'Check news, changelogs, and tool releases for AI agent platforms and compile key updates.',
    desc: 'Weekly intelligence briefing on industry shifts and new open-source developer tooling.',
  },
  {
    id: 'inbox-triage',
    name: 'Daily Inbox & Alert Triage',
    schedule: 'Daily at 12:00 PM & 6:00 PM',
    cron: '0 12,18 * * *',
    prompt: 'Filter noise and forward critical server error alerts or customer pings to Telegram.',
    desc: 'Automates triage twice daily so urgent issues are escalated without constant checking.',
  },
];

export const AutomationsView: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const { agents } = useAppStore();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formSchedule, setFormSchedule] = useState('0 9 * * 1-5');
  const [formHumanSchedule, setFormHumanSchedule] = useState('Weekdays at 9:00 AM');
  const [formPrompt, setFormPrompt] = useState('');
  const [formTargetId, setFormTargetId] = useState('');
  const [formDeliverTelegram, setFormDeliverTelegram] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (agents.length > 0 && !formTargetId) {
      setFormTargetId(agents[0].id);
    }
  }, [agents, formTargetId]);

  const loadSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/routines');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: ScheduleItem[] = data.map((d: any, idx: number) => ({
            id: d.id || `sch-${idx}`,
            title: d.name || d.title || 'Scheduled Routine',
            jobType: d.jobType || 'task',
            cron: d.schedule?.includes('*') ? d.schedule : '0 9 * * 1-5',
            humanSchedule: d.schedule || 'Daily at 9:00 AM',
            nextRun: d.nextRun || 'in 1h',
            status: d.enabled === false ? 'paused' : 'running',
            prompt: d.prompt || '',
            target: d.targetId || d.owner || 'Personal Assistant',
            owner: d.owner || 'Personal Assistant',
            deliverTelegram: !!d.deliverTelegram,
            targetId: d.targetId,
          }));
          setSchedules(mapped);
          return;
        }
      }
      setSchedules([]);
    } catch {
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleToggleStatus = async (s: ScheduleItem) => {
    const next = s.status === 'running' ? 'paused' : 'running';
    setSchedules((prev) =>
      prev.map((item) => (item.id === s.id ? { ...item, status: next } : item))
    );
    try {
      await fetch(`/api/schedules/${s.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next === 'running' }),
      });
      showToast(`Routine ${next === 'running' ? 'resumed' : 'paused'}.`);
    } catch {
      /* non-fatal fallback */
    }
  };

  const handleRunNow = async (s: ScheduleItem) => {
    showToast(`Triggering "${s.title}" now...`);
    try {
      await fetch(`/api/schedules/${s.id}/run`, { method: 'POST' });
    } catch (err) {
      console.warn('Run failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    setSchedules((prev) => prev.filter((item) => item.id !== id));
    try {
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      showToast('Routine deleted.');
    } catch {
      /* local */
    }
  };

  const handleUsePreset = (preset: AutomationPreset) => {
    setFormTitle(preset.name);
    setFormSchedule(preset.cron);
    setFormHumanSchedule(preset.schedule);
    setFormPrompt(preset.prompt);
    setShowAddModal(true);
  };

  const handleSaveRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setIsSubmitting(true);
    const targetAgent = agents.find((a) => a.id === formTargetId) || agents[0];

    const newRoutine: ScheduleItem = {
      id: `sch-${Date.now()}`,
      title: formTitle.trim(),
      jobType: 'task',
      cron: formSchedule,
      humanSchedule: formHumanSchedule,
      nextRun: 'upcoming',
      status: 'running',
      prompt: formPrompt.trim(),
      target: targetAgent?.name || 'Personal Assistant',
      owner: targetAgent?.name || 'Personal Assistant',
      targetId: formTargetId,
      deliverTelegram: formDeliverTelegram,
    };

    setSchedules((prev) => [newRoutine, ...prev]);
    setShowAddModal(false);
    setFormTitle('');
    setFormPrompt('');

    try {
      await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoutine.title,
          jobType: 'task',
          schedule: newRoutine.cron,
          prompt: newRoutine.prompt,
          targetType: 'agent',
          targetId: formTargetId,
          deliverTelegram: formDeliverTelegram,
        }),
      });
      showToast(`Routine "${newRoutine.title}" created successfully.`);
      loadSchedules();
    } catch {
      showToast(`Routine created locally.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-8 text-foreground select-none">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-ui-xs font-medium text-foreground animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top Action & Daemon Bar (Clean, Unified) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-ui-xs text-muted-foreground">
            Scheduler daemon active <span className="font-mono text-foreground-subtle">· {schedules.filter((s) => s.status === 'running').length} running routines</span>
          </span>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadSchedules}
            title="Refresh schedules"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-primary' : ''} />
          </button>
          <button
            type="button"
            onClick={() => {
              setFormTitle('');
              setFormPrompt('');
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-ui-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>New Routine</span>
          </button>
        </div>
      </div>

      {/* ── Active Schedules Section ────────────────────────────────────── */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-ui-sm font-semibold text-foreground uppercase tracking-wider text-3xs text-muted-foreground">
            Active Routines ({schedules.length})
          </h3>
        </div>

        {schedules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center flex flex-col items-center justify-center gap-3 shadow-2xs">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-surface border border-border text-muted-foreground">
              <AlarmClock size={22} />
            </div>
            <div className="space-y-1">
              <h4 className="text-ui-base font-semibold text-foreground">No Scheduled Routines</h4>
              <p className="text-ui-xs text-muted-foreground max-w-md mx-auto">
                Automate repetitive work by running recurring prompts in the background. Pick a template below or create your own custom cron schedule.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-ui-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Your First Routine</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {schedules.map((s) => {
              const isRunning = s.status === 'running';

              return (
                <div
                  key={s.id}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 bg-card transition-all shadow-2xs',
                    isRunning ? 'border-border' : 'border-border/40 opacity-70'
                  )}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl border',
                        isRunning
                          ? 'bg-primary/10 border-primary/20 text-primary'
                          : 'bg-surface-muted border-border text-muted-foreground'
                      )}
                    >
                      <Clock size={16} />
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ui-sm text-foreground truncate">
                          {s.title}
                        </span>
                        <span className="inline-flex items-center gap-1 text-3xs font-mono px-2 py-0.5 rounded-md bg-surface-muted border border-border text-muted-foreground">
                          {s.cron}
                        </span>
                        <span
                          className={cn(
                            'text-3xs font-semibold px-2 py-0.5 rounded-full uppercase',
                            isRunning
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                          )}
                        >
                          {isRunning ? 'Active' : 'Paused'}
                        </span>
                      </div>

                      {s.prompt && (
                        <p className="text-ui-xs text-muted-foreground line-clamp-1 italic">
                          "{s.prompt}"
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-3xs text-muted-foreground font-mono pt-0.5">
                        <span>Schedule: <strong className="font-sans text-foreground">{s.humanSchedule}</strong></span>
                        {s.target && <span>Agent: <strong className="font-sans text-foreground">{s.target}</strong></span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleRunNow(s)}
                      title="Run now immediately"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-ui-xs font-medium text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
                    >
                      <Play size={11} className="fill-current text-primary" />
                      <span>Run Now</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(s)}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-ui-xs font-semibold border transition-colors cursor-pointer',
                        isRunning
                          ? 'border-border bg-card text-muted-foreground hover:text-foreground'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      )}
                    >
                      {isRunning ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      title="Delete routine"
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer rounded-lg hover:bg-destructive/10"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Start Presets Section ─────────────────────────────────── */}
      <div className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-ui-base font-semibold text-foreground">
              Quick Automation Templates
            </h3>
          </div>
          <span className="text-3xs text-muted-foreground">Click to customize and activate</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80 hover:shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-ui-sm text-foreground">{preset.name}</h4>
                  <span className="font-mono text-3xs text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    {preset.schedule}
                  </span>
                </div>
                <p className="text-ui-xs text-muted-foreground leading-relaxed">
                  {preset.desc}
                </p>
                <div className="rounded-lg bg-surface-muted border border-border/50 p-2 font-mono text-3xs text-muted-foreground line-clamp-2">
                  {preset.prompt}
                </div>
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleUsePreset(preset)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-ui-xs font-semibold text-foreground transition-colors cursor-pointer"
                >
                  <span>Use Template</span>
                  <ArrowRight size={12} className="text-primary" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Add / Edit Routine Modal ────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <h3 className="text-ui-base font-semibold text-foreground">Schedule Automation</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRoutine} className="space-y-4">
              <div>
                <label className="text-ui-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Routine Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Standup Digest"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-ui-sm text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-ui-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Schedule Interval
                  </label>
                  <select
                    value={formSchedule}
                    onChange={(e) => {
                      setFormSchedule(e.target.value);
                      const opt = e.target.selectedOptions[0]?.text;
                      if (opt) setFormHumanSchedule(opt);
                    }}
                    className="mt-1 w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-ui-xs text-foreground outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="0 9 * * 1-5">Weekdays at 9:00 AM</option>
                    <option value="30 8 * * 1-5">Weekdays at 8:30 AM</option>
                    <option value="0 17 * * 5">Every Friday at 5:00 PM</option>
                    <option value="0 9 * * *">Every Day at 9:00 AM</option>
                    <option value="0 * * * *">Hourly</option>
                    <option value="*/30 * * * *">Every 30 minutes</option>
                  </select>
                </div>

                <div>
                  <label className="text-ui-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Assigned Agent
                  </label>
                  <select
                    value={formTargetId}
                    onChange={(e) => setFormTargetId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-ui-xs text-foreground outline-none focus:border-primary cursor-pointer"
                  >
                    {agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name || ag.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-ui-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Agent Prompt Instructions
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="What should the agent execute on each run? (e.g. Check git status, summarize commits, compile report...)"
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface-muted p-3 text-ui-xs text-foreground outline-none focus:border-primary resize-y font-mono leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="deliverTelegram"
                  checked={formDeliverTelegram}
                  onChange={(e) => setFormDeliverTelegram(e.target.checked)}
                  className="rounded border-border accent-primary cursor-pointer size-4"
                />
                <label htmlFor="deliverTelegram" className="text-ui-xs text-muted-foreground cursor-pointer">
                  Forward output to connected Telegram bot channel
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-border bg-surface text-ui-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formTitle.trim()}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-ui-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating…' : 'Activate Routine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default AutomationsView;
