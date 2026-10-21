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
  Users,
  Bot,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

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

export const SchedulerPane: React.FC = () => {
  const { agents, sessions, telegramAgents } = useAppStore();
  const groupSessions = sessions.filter((s) => s.type === 'group');

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Natural Language parse card
  const [nlInput, setNlInput] = useState('remind me to stretch every 45 minutes on weekdays');
  const [parsedCron, setParsedCron] = useState('*/45 9-17 * * 1-5');

  // Active Reminder Banner
  const [activeToast, setActiveToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState('');

  // Modal Form
  const [formTitle, setFormTitle] = useState('');
  const [formJobType, setFormJobType] = useState<'notification' | 'task'>('notification');
  const [formSchedule, setFormSchedule] = useState('every weekday at 9am');
  const [formPrompt, setFormPrompt] = useState('');
  const [formOwner, setFormOwner] = useState('Personal Assistant');
  const [formTargetType, setFormTargetType] = useState<'agent' | 'group'>('agent');
  const [formTargetId, setFormTargetId] = useState('');
  const [formDeliverTelegram, setFormDeliverTelegram] = useState(true);

  useEffect(() => {
    if (agents.length > 0 && !formTargetId) {
      setFormTargetId(agents[0].id);
      setFormOwner(agents[0].name);
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
            jobType: d.jobType || 'notification',
            cron: d.schedule?.includes('*') ? d.schedule : '0 9 * * 1-5',
            humanSchedule: d.schedule || 'daily at 9:00 AM',
            nextRun: d.nextRun || 'in 1h',
            status: d.enabled === false ? 'paused' : 'running',
            prompt: d.prompt || '',
            target: d.targetType ? `${d.targetType}: ${d.targetId}` : (d.channel || 'web'),
            owner: d.owner || (d.targetId ? d.targetId : 'Personal Assistant'),
            ownerType: d.ownerType || 'agent',
            deliverTelegram: d.deliverTelegram,
            targetType: d.targetType,
            targetId: d.targetId,
          }));
          setSchedules(mapped);
        } else {
          setSchedules([]);
        }
      }
    } catch {
      setSchedules([]);
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
    setToastMessage(`Triggering: ${s.title}...`);
    setActiveToast(true);
    try {
      const res = await fetch(`/api/schedules/${s.id}/run`, { method: 'POST' });
      if (res.ok) {
        setToastMessage(`✅ Delivered: ${s.title} — Job executed and sent immediately!`);
      } else {
        setToastMessage(`Fired: ${s.title}`);
      }
      loadSchedules();
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

    const targetId =
      formTargetId ||
      (formTargetType === 'agent' ? agents[0]?.id : groupSessions[0]?.id) ||
      'personal-assistant';

    const newItem: ScheduleItem = {
      id: `routine-${Date.now()}`,
      title: formTitle.trim(),
      jobType: formJobType,
      cron: parsedCron || '0 9 * * 1-5',
      humanSchedule: formSchedule.trim() || 'Custom Routine',
      nextRun: 'in 45m',
      status: 'running',
      prompt: formPrompt.trim() || formTitle.trim(),
      target: `${formTargetType}: ${targetId}`,
      owner: formOwner || 'Personal Assistant',
      ownerType: 'agent',
      deliverTelegram: formDeliverTelegram,
      targetType: formTargetType,
      targetId,
    };

    setSchedules((prev) => [newItem, ...prev]);
    setShowAddModal(false);
    setFormTitle('');
    setFormPrompt('');

    try {
      await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItem.title,
          jobType: formJobType,
          schedule: newItem.cron,
          prompt: newItem.prompt,
          targetType: formTargetType,
          targetId,
          owner: formOwner || 'Personal Assistant',
          ownerType: 'agent',
          deliverTelegram: formDeliverTelegram,
        }),
      });
      loadSchedules();
    } catch (err) {
      console.warn('Routine created locally:', err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-accent/60 flex flex-col">
      {/* Page Header matching scheduler.html */}
      <div className="w-full bg-card border-b border-border px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[20px] font-bold text-foreground font-sans tracking-tight">
            Scheduler &amp; Reminders
          </h1>
          <p className="text-[12px] text-muted-foreground font-['Funnel_Sans',sans-serif]">
            Natural language or cron — "every weekday at 9am" · "in 15 minutes" · 0 1 * * *
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSchedules}
            title="Refresh schedules"
            className="p-2 rounded-[8px] border border-border text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-foreground text-background text-[12px] font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
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
          <div className="w-full bg-info/10 border border-[#BFDBFE] rounded-[8px] p-[18px] flex flex-col gap-2.5">
            <div className="w-full flex items-center gap-2.5">
              <Sparkles size={15} className="text-primary shrink-0" />
              <input
                type="text"
                value={nlInput}
                onChange={(e) => handleParseNL(e.target.value)}
                placeholder="Type in plain English e.g. remind me to stretch every 45 minutes"
                className="w-full bg-transparent border-none text-[12px] font-['Geist_Mono',monospace] text-foreground focus:outline-none placeholder-[#8A8A85]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className="bg-primary text-primary-fg rounded-[4px] px-2.5 py-1 text-[10px] font-['Geist_Mono',monospace]">
                cron: {parsedCron}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormTitle(nlInput);
                  setFormSchedule(parsedCron);
                  setShowAddModal(true);
                }}
                className="bg-card border border-border text-foreground/85 hover:text-foreground rounded-[4px] px-2.5 py-1 text-[10px] font-['Geist_Mono',monospace] transition-colors cursor-pointer"
              >
                Create from this prompt
              </button>
            </div>
          </div>

          {/* Schedule List */}
          {schedules.length === 0 ? (
            <div className="w-full p-8 text-center bg-white dark:bg-card border border-dashed border-border/70 rounded-[8px] flex flex-col items-center justify-center gap-2">
              <AlarmClock size={28} className="text-muted-foreground" />
              <h3 className="text-[13px] font-bold text-black dark:text-white">No Scheduled Tasks</h3>
              <p className="text-[11px] text-muted-foreground max-w-sm">
                Create a recurring background reminder or job using natural language or cron format above.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-[11px] font-bold rounded-[6px]"
              >
                <Plus size={13} />
                <span>New Schedule</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="w-full bg-card shadow-[0px_1px_2px_0px_#0000000a] border border-border rounded-[8px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 transition-all hover:border-border-strong"
                >
                  {/* Left: Icon & Info */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-[38px] h-[38px] shrink-0 flex items-center justify-center bg-warning/10 rounded-[4px]">
                      <AlarmClock size={17} className="text-agentorange" />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col gap-[3px]">
                      {/* Row 1: Title & Status Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-foreground font-sans">
                          {s.title}
                        </span>
                        <div
                          className={`rounded-[4px] px-2 py-[2px] flex items-center ${
                            s.status === 'running' ? 'bg-success/15' : 'bg-[#FEF3C7]'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold font-['Funnel_Sans',sans-serif] ${
                              s.status === 'running' ? 'text-success' : 'text-warning'
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                        {s.jobType === 'task' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-[2px] rounded-[4px] bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            <Sparkles size={10} /> AI Task
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-[2px] rounded-[4px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <BellRing size={10} /> Notification
                          </span>
                        )}
                      </div>

                      {/* Cron string, description & Owner */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] pt-0.5">
                        <span className="text-foreground/85 font-['Geist_Mono',monospace]">
                          {s.cron} · {s.humanSchedule}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-accent dark:bg-[#27272A] text-muted-foreground dark:text-subtle-fg text-[10px] font-['Geist_Mono',monospace]">
                          <Bot size={11} className="text-[#3B82F6]" />
                          Owner: <strong className="text-foreground dark:text-[#F3F4F6]">{s.owner || 'Personal Assistant'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Next run time */}
                  <div className="text-[11px] text-muted-foreground font-['Funnel_Sans',sans-serif] shrink-0 sm:px-3">
                    next {s.nextRun}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      title="Run Now"
                      onClick={() => handleRunNow(s)}
                      className="w-[30px] h-[30px] flex items-center justify-center bg-card border border-border rounded-[4px] text-foreground/85 hover:bg-accent/60 transition-colors"
                    >
                      <Play size={12} className="text-success" />
                    </button>

                    <button
                      type="button"
                      title={s.status === 'running' ? 'Pause' : 'Resume'}
                      onClick={() => handleToggleStatus(s.id, s.status)}
                      className="w-[30px] h-[30px] flex items-center justify-center bg-card border border-border rounded-[4px] text-foreground/85 hover:bg-accent/60 transition-colors"
                    >
                      {s.status === 'running' ? <Pause size={12} /> : <Play size={12} />}
                    </button>

                    <button
                      type="button"
                      title="Delete"
                      onClick={() => handleDelete(s.id)}
                      className="w-[30px] h-[30px] flex items-center justify-center bg-card border border-border rounded-[4px] text-destructive hover:bg-red-50 hover:border-red-200 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column matching scheduler.html (Reminder Toast + Daemon Card) */}
        <div className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4">
          {/* Reminder Triggered Toast */}
          {activeToast && (
            <div className="w-full bg-foreground rounded-[8px] p-4 flex flex-col gap-2 text-background shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing size={15} className="text-agentorange" />
                  <span className="text-[11px] font-bold text-agentorange font-['Funnel_Sans',sans-serif] tracking-wider uppercase">
                    REMINDER TRIGGERED
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveToast(false)}
                  className="text-muted-foreground hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="text-[15px] font-bold text-white font-sans">
                {toastMessage}
              </div>

              <p className="text-[12px] leading-[18px] text-muted-foreground font-['Geist',sans-serif]">
                Fired from "Stretch reminder" · also broadcast to Telegram and any open session.
              </p>

              <div className="w-full flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveToast(false)}
                  className="flex-1 py-1.5 border border-[#3F3F3C] rounded-[4px] text-[11px] text-white font-['Funnel_Sans',sans-serif] hover:bg-white/10 transition-colors text-center cursor-pointer"
                >
                  Snooze 10m
                </button>
                <button
                  type="button"
                  onClick={() => setActiveToast(false)}
                  className="flex-1 py-1.5 bg-primary rounded-[4px] text-[11px] text-white font-bold font-['Funnel_Sans',sans-serif] hover:bg-primary/90 transition-colors text-center cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Scheduler Daemon Status Card */}
          <div className="w-full bg-card border border-border rounded-[8px] p-[18px] flex flex-col gap-2.5">
            <div className="w-full flex items-center justify-between pb-1 border-b border-[#F7F7F5]">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-success" />
                <span className="text-[13px] font-bold text-foreground font-sans">
                  Scheduler daemon
                </span>
              </div>
              <div className="w-[7px] h-[7px] bg-success rounded-full" />
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-muted-foreground font-['Funnel_Sans',sans-serif]">Uptime</span>
              <span className="flex-1 mx-2 border-b border-border" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-foreground">14d 6h</span>
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-muted-foreground font-['Funnel_Sans',sans-serif]">Fired today</span>
              <span className="flex-1 mx-2 border-b border-border" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-foreground">9</span>
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-muted-foreground font-['Funnel_Sans',sans-serif]">Active</span>
              <span className="flex-1 mx-2 border-b border-border" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-foreground">{schedules.filter(s => s.status === 'running').length}</span>
            </div>

            <div className="w-full flex items-center justify-between py-1.5">
              <span className="text-[11px] text-muted-foreground font-['Funnel_Sans',sans-serif]">Paused</span>
              <span className="flex-1 mx-2 border-b border-border" />
              <span className="text-[11px] font-['Geist_Mono',monospace] text-foreground">{schedules.filter(s => s.status === 'paused').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* New Schedule Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card rounded-[10px] border border-border shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-warning/10 flex items-center justify-center text-agentorange">
                  <AlarmClock size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-foreground">Create Scheduled Job</h3>
                  <p className="text-[11px] text-muted-foreground">Natural language recurrence or 5-part cron syntax</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="flex flex-col gap-3.5">
              {/* Job Type Selector: Notification vs Task */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-foreground">Job Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormJobType('notification');
                      setFormDeliverTelegram(true);
                    }}
                    className={`p-2.5 rounded-[8px] text-left border transition-all cursor-pointer flex flex-col gap-1 ${
                      formJobType === 'notification'
                        ? 'bg-blue-50/90 border-primary text-black shadow-xs ring-1 ring-[#007AFF]/20'
                        : 'bg-white border-border text-muted-foreground hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[12px] text-primary">
                      <BellRing size={13} />
                      <span>Notification Job</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Direct notice without AI. Broadcasts directly to chat and Telegram bot.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormJobType('task')}
                    className={`p-2.5 rounded-[8px] text-left border transition-all cursor-pointer flex flex-col gap-1 ${
                      formJobType === 'task'
                        ? 'bg-purple-50/90 border-[#8B5CF6] text-black shadow-xs ring-1 ring-[#8B5CF6]/20'
                        : 'bg-white border-border text-muted-foreground hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[12px] text-[#8B5CF6]">
                      <Sparkles size={13} />
                      <span>Task Job (AI Agent)</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      AI agent execution. Agent uses LLM and workspace tools to perform task.
                    </p>
                  </button>
                </div>
              </div>

              {/* Informational Banner according to Job Type */}
              {formJobType === 'notification' ? (
                <div className="p-2.5 rounded-[6px] bg-blue-50/80 border border-blue-200 text-[11px] text-[#1E40AF] flex items-start gap-2">
                  <BellRing size={14} className="shrink-0 mt-0.5 text-primary" />
                  <div className="leading-snug">
                    <strong>Direct Notification (No AI):</strong> This cron job delivers the notice directly to the chat conversation and Telegram bot at scheduled times without invoking LLM tokens or simulating user chats.
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-[6px] bg-purple-50/80 border border-purple-200 text-[11px] text-[#5B21B6] flex items-start gap-2">
                  <Sparkles size={14} className="shrink-0 mt-0.5 text-[#8B5CF6]" />
                  <div className="leading-snug">
                    <strong>AI Agent Interaction:</strong> At scheduled times, the assigned agent will process this instruction using their LLM model and tools, generating a full response in the target chat.
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-foreground">Task Title / Label</label>
                <input
                  type="text"
                  required
                  placeholder={formJobType === 'notification' ? 'e.g. Daily Standup Alert' : 'e.g. Code Review & QA Routine'}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="border border-border rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-foreground/60"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-foreground">Recurrence / Cron Expression</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. */30 9-17 * * 1-5 or every weekday at 9am"
                  value={formSchedule}
                  onChange={(e) => {
                    setFormSchedule(e.target.value);
                    handleParseNL(e.target.value);
                  }}
                  className="border border-border rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-foreground/60"
                />
                <span className="text-[10px] text-primary font-mono">Parsed cron: {parsedCron}</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-foreground">
                  {formJobType === 'notification' ? 'Notification Message' : 'Agent Instruction / Task Prompt'}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    formJobType === 'notification'
                      ? 'e.g. Standup time! Please post your yesterday accomplishments and today priorities.'
                      : 'e.g. Review the open git branch, run test suites, and write a summary report.'
                  }
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="border border-border rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-foreground/60 resize-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-foreground">
                  {formJobType === 'notification' ? 'Sender Persona / Identity' : 'Executing Worker Agent (AI)'}
                </label>
                <select
                  value={formOwner}
                  onChange={(e) => setFormOwner(e.target.value)}
                  className="border border-border rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-foreground/60 bg-white"
                >
                  <option value="Personal Assistant">Personal Assistant (Default)</option>
                  <option value="User">User (Manual / Self)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name} ({a.role || 'Agent'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-foreground">Automation Target</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('agent');
                      if (agents.length > 0) setFormTargetId(agents[0].id);
                    }}
                    className={`py-1.5 px-3 rounded-[6px] text-[12px] font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      formTargetType === 'agent'
                        ? 'bg-foreground text-background border-[#0F0F0F]'
                        : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    <Bot size={13} />
                    <span>Agent Person</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('group');
                      if (groupSessions.length > 0) setFormTargetId(groupSessions[0].id);
                    }}
                    className={`py-1.5 px-3 rounded-[6px] text-[12px] font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      formTargetType === 'group'
                        ? 'bg-foreground text-background border-[#0F0F0F]'
                        : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    <Users size={13} />
                    <span>Group Chat</span>
                  </button>
                </div>

                {formTargetType === 'agent' ? (
                  <select
                    value={formTargetId}
                    onChange={(e) => {
                      setFormTargetId(e.target.value);
                      const isTg = !!telegramAgents[e.target.value]?.connected;
                      if (isTg) setFormDeliverTelegram(true);
                    }}
                    className="border border-border rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-foreground/60 bg-white"
                  >
                    {agents.map((a) => {
                      const isTg = !!telegramAgents[a.id]?.connected || a.telegramConnected;
                      return (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.role || 'Specialist'}) {isTg ? '⚡ [Telegram Linked]' : ''}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <select
                    value={formTargetId}
                    onChange={(e) => setFormTargetId(e.target.value)}
                    className="border border-border rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-foreground/60 bg-white"
                  >
                    {groupSessions.length === 0 ? (
                      <option value="">No group chats created yet</option>
                    ) : (
                      groupSessions.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title} ({g.participants?.length || 0} agents)
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              {/* Deliver to Telegram Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded bg-blue-50/60 border border-blue-100">
                <input
                  type="checkbox"
                  checked={formDeliverTelegram}
                  onChange={(e) => setFormDeliverTelegram(e.target.checked)}
                  className="rounded text-primary focus:ring-0"
                />
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                  <Send size={12} />
                  <span>Deliver notification to Telegram when executed</span>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-foreground text-background text-[12px] font-bold rounded-[6px] hover:bg-black/90 cursor-pointer"
                >
                  Save Routine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
