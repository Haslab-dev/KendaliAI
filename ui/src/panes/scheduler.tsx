import React, { useState, useEffect, useCallback } from 'react';
import {
  AlarmClock,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  BellRing,
  Server,
  Sparkles,
  Check,
  X,
  Clock,
  Send,
  Calendar,
} from 'lucide-react';

interface ScheduleItem {
  id: string;
  title: string;
  cron: string;
  humanSchedule: string;
  nextRun: string;
  status: 'running' | 'paused';
  prompt: string;
  target?: string;
}

const DEFAULT_SCHEDULES: ScheduleItem[] = [
  {
    id: 'sch-1',
    title: 'Wake-up reminder',
    cron: '0 5 * * *',
    humanSchedule: 'daily 5:00 AM',
    nextRun: 'in 6h 12m',
    status: 'running',
    prompt: 'Wake up! Good morning, here is your daily agenda.',
    target: 'telegram',
  },
  {
    id: 'sch-2',
    title: 'Stretch reminder',
    cron: '*/45 9-17 * * 1-5',
    humanSchedule: 'weekdays, every 45 min',
    nextRun: 'in 22m',
    status: 'running',
    prompt: 'Time to stretch 🧘 Take a short break and drink water.',
    target: 'web',
  },
  {
    id: 'sch-3',
    title: 'Weekly research digest',
    cron: '0 18 * * 5',
    humanSchedule: 'fridays 6:00 PM',
    nextRun: 'in 2d 4h',
    status: 'running',
    prompt: 'Compile a summary of all knowledge base updates this week.',
    target: 'web',
  },
  {
    id: 'sch-4',
    title: 'Standup notes to Telegram',
    cron: '30 8 * * 1-5',
    humanSchedule: 'weekdays 8:30 AM',
    nextRun: 'in 14h',
    status: 'running',
    prompt: 'Send daily standup questions to @kendaliai_bot channel.',
    target: 'telegram',
  },
  {
    id: 'sch-5',
    title: 'Old backup job',
    cron: '0 23 * * *',
    humanSchedule: 'daily 11:00 PM',
    nextRun: '—',
    status: 'paused',
    prompt: 'Run git worktree backup and export database snapshot.',
    target: 'local',
  },
];

export const SchedulerPane: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>(DEFAULT_SCHEDULES);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Natural Language parse card
  const [nlInput, setNlInput] = useState('remind me to stretch every 45 minutes on weekdays');
  const [parsedCron, setParsedCron] = useState('*/45 9-17 * * 1-5');

  // Active Reminder Banner
  const [activeToast, setActiveToast] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState('Time to stretch 🧘');

  // Modal Form
  const [formTitle, setFormTitle] = useState('');
  const [formSchedule, setFormSchedule] = useState('every weekday at 9am');
  const [formPrompt, setFormPrompt] = useState('');
  const [formTarget, setFormTarget] = useState('web');

  const loadSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: ScheduleItem[] = data.map((d: any, idx: number) => ({
            id: d.id || `sch-${idx}`,
            title: d.name || d.title || 'Scheduled Agent Task',
            cron: d.schedule?.includes('*') ? d.schedule : '0 9 * * 1-5',
            humanSchedule: d.schedule || 'daily at 9:00 AM',
            nextRun: d.nextRun || 'in 1h',
            status: d.enabled === false ? 'paused' : 'running',
            prompt: d.prompt || '',
            target: d.channel || 'web',
          }));
          setSchedules(mapped);
        }
      }
    } catch {
      // Use defaults
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Natural language parsing simulation
  const handleParseNL = (text: string) => {
    setNlInput(text);
    const lower = text.toLowerCase();
    if (lower.includes('45 minute') || lower.includes('stretch')) {
      setParsedCron('*/45 9-17 * * 1-5');
    } else if (lower.includes('daily') || lower.includes('every day')) {
      setParsedCron('0 9 * * *');
    } else if (lower.includes('hour')) {
      setParsedCron('0 * * * *');
    } else if (lower.includes('friday')) {
      setParsedCron('0 18 * * 5');
    } else {
      setParsedCron('0 9 * * 1-5');
    }
  };

  const handleToggleStatus = async (id: string, current: 'running' | 'paused') => {
    const next = current === 'running' ? 'paused' : 'running';
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: next, nextRun: next === 'paused' ? '—' : 'in 1h' } : s))
    );
    try {
      await fetch(`/api/schedules/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next === 'running' }),
      });
    } catch (err) {
      console.warn('Status toggle local fallback:', err);
    }
  };

  const handleRunNow = async (s: ScheduleItem) => {
    setToastMessage(`Fired: ${s.title}`);
    setActiveToast(true);
    try {
      await fetch(`/api/schedules/${s.id}/run`, { method: 'POST' });
    } catch (err) {
      console.warn('Trigger local fallback:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Delete local fallback:', err);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const newItem: ScheduleItem = {
      id: `sch-${Date.now()}`,
      title: formTitle.trim(),
      cron: parsedCron || '0 9 * * 1-5',
      humanSchedule: formSchedule.trim() || 'Custom Schedule',
      nextRun: 'in 45m',
      status: 'running',
      prompt: formPrompt.trim() || formTitle.trim(),
      target: formTarget,
    };

    setSchedules((prev) => [newItem, ...prev]);
    setShowAddModal(false);
    setFormTitle('');
    setFormPrompt('');

    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItem.title,
          schedule: newItem.cron,
          prompt: newItem.prompt,
          channel: newItem.target,
        }),
      });
    } catch (err) {
      console.warn('Schedule created locally:', err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col">
      {/* Page Header matching scheduler.html */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
            Scheduler &amp; Reminders
          </h1>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Natural language or cron — "every weekday at 9am" · "in 15 minutes" · 0 1 * * *
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSchedules}
            title="Refresh schedules"
            className="p-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>New Schedule</span>
          </button>
        </div>
      </div>

      {/* Main Split Container */}
      <div className="flex-1 w-full px-6 lg:px-9 py-6 flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: NL Parse Card + Schedules List */}
        <div className="flex-1 w-full flex flex-col gap-3">
          {/* NL Parse Card matching scheduler.html */}
          <div className="w-full bg-[#EBF5FF] border border-[#BFDBFE] rounded-[8px] p-[18px] flex flex-col gap-2.5">
            <div className="w-full flex items-center gap-2.5">
              <Sparkles size={15} className="text-[#007AFF] shrink-0" />
              <input
                type="text"
                value={nlInput}
                onChange={(e) => handleParseNL(e.target.value)}
                placeholder="Type in plain English e.g. remind me to stretch every 45 minutes"
                className="w-full bg-transparent border-none text-[12px] font-['Geist_Mono',monospace] text-[#000000] focus:outline-none placeholder-[#8A8A85]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className="bg-[#007AFF] text-[#FFFFFF] rounded-[4px] px-2.5 py-1 text-[10px] font-['Geist_Mono',monospace]">
                cron: {parsedCron}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormTitle(nlInput);
                  setFormSchedule(parsedCron);
                  setShowAddModal(true);
                }}
                className="bg-[#FFFFFF] border border-[#E5E7EB] text-[#333333] hover:text-[#000000] rounded-[4px] px-2.5 py-1 text-[10px] font-['Geist_Mono',monospace] transition-colors cursor-pointer"
              >
                Create from this prompt
              </button>
            </div>
          </div>

          {/* Schedule List matching scheduler.html */}
          <div className="flex flex-col gap-3 w-full">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="w-full bg-[#FFFFFF] shadow-[0px_1px_2px_0px_#0000000a] border border-[#E5E7EB] rounded-[8px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 transition-all hover:border-[#D4D4D0]"
              >
                {/* Left: Icon & Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-[38px] h-[38px] shrink-0 flex items-center justify-center bg-[#FFF5EB] rounded-[4px]">
                    <AlarmClock size={17} className="text-[#F97316]" />
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col gap-[3px]">
                    {/* Row 1: Title & Status Badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-[#000000] font-sans">
                        {s.title}
                      </span>
                      <div
                        className={`rounded-[4px] px-2 py-[2px] flex items-center ${
                          s.status === 'running' ? 'bg-[#DCFCE7]' : 'bg-[#FEF3C7]'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-bold font-['Funnel_Sans',sans-serif] ${
                            s.status === 'running' ? 'text-[#16A34A]' : 'text-[#D97706]'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                    </div>

                    {/* Cron string & description */}
                    <div className="text-[11px] text-[#333333] font-['Geist_Mono',monospace] truncate">
                      {s.cron} · {s.humanSchedule}
                    </div>
                  </div>
                </div>

                {/* Next run time */}
                <div className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif] shrink-0 sm:px-3">
                  next {s.nextRun}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    title="Run Now"
                    onClick={() => handleRunNow(s)}
                    className="w-[30px] h-[30px] flex items-center justify-center bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] text-[#333333] hover:text-[#007AFF] hover:border-[#007AFF] transition-colors"
                  >
                    <Play size={12} />
                  </button>

                  <button
                    type="button"
                    title={s.status === 'running' ? 'Pause' : 'Resume'}
                    onClick={() => handleToggleStatus(s.id, s.status)}
                    className="w-[30px] h-[30px] flex items-center justify-center bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] text-[#333333] hover:text-[#000000] hover:border-[#000000] transition-colors"
                  >
                    {s.status === 'running' ? <Pause size={12} /> : <Play size={12} />}
                  </button>

                  <button
                    type="button"
                    title="Delete"
                    onClick={() => handleDelete(s.id)}
                    className="w-[30px] h-[30px] flex items-center justify-center bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] text-[#DC2626] hover:bg-red-50 hover:border-red-200 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column matching scheduler.html (Reminder Toast + Daemon Card) */}
        <div className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4">
          {/* Reminder Triggered Toast */}
          {activeToast && (
            <div className="w-full bg-[#0F0F0F] rounded-[8px] p-4 flex flex-col gap-2 text-[#FFFFFF] shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing size={15} className="text-[#F97316]" />
                  <span className="text-[11px] font-bold text-[#F97316] font-['Funnel_Sans',sans-serif] tracking-wider uppercase">
                    REMINDER TRIGGERED
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveToast(false)}
                  className="text-[#8A8A85] hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="text-[15px] font-bold text-[#FFFFFF] font-sans">
                {toastMessage}
              </div>

              <p className="text-[12px] leading-[18px] text-[#A3A3A0] font-['Geist',sans-serif]">
                Fired from "Stretch reminder" · also broadcast to Telegram and any open session.
              </p>

              <div className="w-full flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveToast(false)}
                  className="flex-1 py-1.5 border border-[#3F3F3C] rounded-[4px] text-[11px] text-[#FFFFFF] font-['Funnel_Sans',sans-serif] hover:bg-white/10 transition-colors text-center cursor-pointer"
                >
                  Snooze 10m
                </button>
                <button
                  type="button"
                  onClick={() => setActiveToast(false)}
                  className="flex-1 py-1.5 bg-[#007AFF] rounded-[4px] text-[11px] text-[#FFFFFF] font-bold font-['Funnel_Sans',sans-serif] hover:bg-[#007AFF]/90 transition-colors text-center cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Scheduler Daemon Status Card */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col gap-2.5">
            <div className="w-full flex items-center justify-between pb-1 border-b border-[#F7F7F5]">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-[#16A34A]" />
                <span className="text-[13px] font-bold text-[#000000] font-sans">
                  Scheduler daemon
                </span>
              </div>
              <div className="w-[7px] h-[7px] bg-[#16A34A] rounded-full" />
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">Uptime</span>
              <span className="flex-1 mx-2 border-b border-[#E5E7EB]" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-[#000000]">14d 6h</span>
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">Fired today</span>
              <span className="flex-1 mx-2 border-b border-[#E5E7EB]" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-[#000000]">9</span>
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">Active</span>
              <span className="flex-1 mx-2 border-b border-[#E5E7EB]" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-[#000000]">{schedules.filter(s => s.status === 'running').length}</span>
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">Paused</span>
              <span className="flex-1 mx-2 border-b border-[#E5E7EB]" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-[#000000]">{schedules.filter(s => s.status === 'paused').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* New Schedule Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#FFF5EB] flex items-center justify-center text-[#F97316]">
                  <AlarmClock size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000]">Create Scheduled Job</h3>
                  <p className="text-[11px] text-[#8A8A85]">Natural language recurrence or 5-part cron syntax</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Task Title / Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Standup Reminder"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Recurrence / Cron Expression</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. */30 9-17 * * 1-5 or every weekday at 9am"
                  value={formSchedule}
                  onChange={(e) => {
                    setFormSchedule(e.target.value);
                    handleParseNL(e.target.value);
                  }}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
                <span className="text-[10px] text-[#007AFF] font-mono">Parsed cron: {parsedCron}</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Agent Instruction / Prompt</label>
                <textarea
                  rows={3}
                  placeholder="What prompt should run or what message should be sent?"
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F] resize-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Broadcast Target</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTarget('web')}
                    className={`py-1.5 px-3 rounded-[6px] text-[12px] font-bold border transition-colors ${
                      formTarget === 'web'
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] border-[#0F0F0F]'
                        : 'bg-[#FFFFFF] text-[#8A8A85] border-[#E5E7EB]'
                    }`}
                  >
                    Web Session UI
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTarget('telegram')}
                    className={`py-1.5 px-3 rounded-[6px] text-[12px] font-bold border transition-colors ${
                      formTarget === 'telegram'
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] border-[#0F0F0F]'
                        : 'bg-[#FFFFFF] text-[#8A8A85] border-[#E5E7EB]'
                    }`}
                  >
                    Telegram Bot
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-[#000000]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[6px] hover:bg-black/90"
                >
                  Schedule Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
