import React, { useState } from 'react';
import { Clock, Plus, ArrowRight, Play, CheckCircle2 } from 'lucide-react';

interface AutomationPreset {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  outputPreview: string[];
}

export const AutomationsView: React.FC = () => {
  const presets: AutomationPreset[] = [
    {
      id: 'morning-briefing',
      name: 'Morning briefing',
      schedule: 'Weekdays at 8:30',
      prompt: "Read my unread email and today's calendar. Tell me what needs a reply first.",
      outputPreview: [
        'Three emails need a reply today',
        'Design review moved to 14:00',
        'One pull request is waiting for approval',
      ],
    },
    {
      id: 'weekly-team-report',
      name: 'Weekly team report',
      schedule: 'Every Friday at 17:00',
      prompt: 'Summarize git commits and completed tasks across all active repositories this week.',
      outputPreview: [
        '14 pull requests merged across 3 repos',
        'Auth refactoring milestone completed',
        'Zero blocker issues open',
      ],
    },
    {
      id: 'competitor-watch',
      name: 'Competitor watch',
      schedule: 'Every Monday at 09:00',
      prompt: 'Check release notes and news for competing AI agent platforms and compile a summary.',
      outputPreview: [
        '2 competitors released MCP updates',
        'Market shift toward local model orchestration',
      ],
    },
    {
      id: 'inbox-triage',
      name: 'Inbox triage',
      schedule: 'Daily at 12:00 and 18:00',
      prompt: 'Categorize urgent notifications and ping on Telegram for high priority items.',
      outputPreview: [
        'Urgent server alert forwarded',
        'Filtered 28 newsletter notifications',
      ],
    },
  ];

  const [selectedPreset, setSelectedPreset] = useState<AutomationPreset>(presets[0]);
  const [activeTab, setActiveTab] = useState<'browse' | 'active'>('browse');

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0a0a0c] px-4 sm:px-8 py-8 select-none">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automations</h1>
          <p className="text-xs text-muted-foreground">
            Schedule recurring tasks and briefings that run in the background.
          </p>
        </div>

        {/* Hero Banner */}
        <div className="text-center space-y-4 pt-4">
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
          <div className="rounded-2xl bg-[#121216] border border-border/60 p-5 space-y-3 min-h-[160px] flex flex-col justify-between">
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
          <div className="rounded-2xl bg-[#141418] border border-border/60 p-5 space-y-3 min-h-[160px] flex flex-col justify-between relative">
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
            onClick={() => alert(`Activated preset: ${selectedPreset.name}`)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs transition-colors shadow-xs"
          >
            Use this example
          </button>
          <button
            onClick={() => alert('Start custom automation')}
            className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground border border-border text-xs font-semibold transition-colors"
          >
            Start from scratch
          </button>
        </div>
      </div>
    </div>
  );
};
