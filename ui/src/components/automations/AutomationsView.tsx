import React, { useState } from 'react';
import { Clock, Sparkles, Plus, ArrowRight, Play, CheckCircle2, Zap } from 'lucide-react';
import { SchedulerPane } from '../../panes/scheduler';
import { useAppStore } from '../../store/useAppStore';

interface AutomationPreset {
  id: string;
  name: string;
  schedule: string;
  cron: string;
  prompt: string;
  outputPreview: string[];
}

export const AutomationsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'presets'>('active');
  const agents = useAppStore((s) => s.agents);

  const presets: AutomationPreset[] = [
    {
      id: 'morning-briefing',
      name: 'Morning Briefing',
      schedule: 'Weekdays at 8:30 AM',
      cron: '30 8 * * 1-5',
      prompt: "Read my unread email and today's calendar. Tell me what needs a reply first.",
      outputPreview: [
        'Three emails need a reply today',
        'Design review moved to 14:00',
        'One pull request is waiting for approval',
      ],
    },
    {
      id: 'weekly-team-report',
      name: 'Weekly Team Report',
      schedule: 'Every Friday at 5:00 PM',
      cron: '0 17 * * 5',
      prompt: 'Summarize git commits and completed tasks across all active repositories this week.',
      outputPreview: [
        '14 pull requests merged across 3 repos',
        'Auth refactoring milestone completed',
        'Zero blocker issues open',
      ],
    },
    {
      id: 'competitor-watch',
      name: 'Competitor Watch',
      schedule: 'Every Monday at 9:00 AM',
      cron: '0 9 * * 1',
      prompt: 'Check release notes and news for competing AI agent platforms and compile a summary.',
      outputPreview: [
        '2 competitors released MCP updates',
        'Market shift toward local model orchestration',
      ],
    },
    {
      id: 'inbox-triage',
      name: 'Daily Inbox Triage',
      schedule: 'Daily at 12:00 PM & 6:00 PM',
      cron: '0 12,18 * * *',
      prompt: 'Categorize urgent notifications and ping on Telegram for high priority items.',
      outputPreview: [
        'Urgent server alert forwarded',
        'Filtered 28 newsletter notifications',
      ],
    },
  ];

  const [selectedPreset, setSelectedPreset] = useState<AutomationPreset>(presets[0]);
  const [isActivating, setIsActivating] = useState(false);

  const handleActivatePreset = async () => {
    setIsActivating(true);
    try {
      const defaultAgentId = agents[0]?.id || 'personal-assistant';
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedPreset.name,
          jobType: 'task',
          cron: selectedPreset.cron,
          humanSchedule: selectedPreset.schedule,
          prompt: selectedPreset.prompt,
          targetType: 'agent',
          targetId: defaultAgentId,
          deliverTelegram: false,
        }),
      });
      setActiveTab('active');
    } catch (err) {
      console.error('Failed to activate preset:', err);
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background px-4 sm:px-8 py-8 select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Automations</h1>
            <p className="text-xs text-muted-foreground">
              Schedule recurring tasks, briefings, and automated agent loops running in the background.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/40 border border-border/50 rounded-xl text-xs self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'active'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Active Routines</span>
            </button>
            <button
              onClick={() => setActiveTab('presets')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'presets'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Presets & Ideas</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Live Real Scheduler Pane */}
        {activeTab === 'active' && (
          <div className="pt-2">
            <SchedulerPane />
          </div>
        )}

        {/* Tab 2: Presets & Templates */}
        {activeTab === 'presets' && (
          <div className="space-y-8 pt-4">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-foreground">
                What could your agent do for you?
              </h2>

              {/* Preset Pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {presets.map((preset) => {
                  const isSelected = selectedPreset.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-foreground text-background font-semibold shadow-sm'
                          : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Comparison Cards: YOU SET ➔ YOU GET */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* YOU SET */}
              <div className="rounded-2xl bg-card border border-border p-5 space-y-3 min-h-[160px] flex flex-col justify-between shadow-2xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      YOU SET
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {selectedPreset.schedule}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground">{selectedPreset.name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedPreset.prompt}</p>
                </div>
              </div>

              {/* YOU GET */}
              <div className="rounded-2xl bg-card border border-border p-5 space-y-3 min-h-[160px] flex flex-col justify-between relative shadow-2xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                      YOU GET
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {selectedPreset.schedule.split(' at ')[1] || 'Scheduled'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground">Actionable Summary</h3>
                  <ul className="space-y-1.5 pt-1 text-xs text-muted-foreground">
                    {selectedPreset.outputPreview.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleActivatePreset}
                disabled={isActivating}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs transition-colors shadow-xs disabled:opacity-50"
              >
                {isActivating ? 'Activating...' : `Activate ${selectedPreset.name}`}
              </button>
              <button
                onClick={() => setActiveTab('active')}
                className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground border border-border text-xs font-semibold transition-colors"
              >
                Create custom from scratch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
