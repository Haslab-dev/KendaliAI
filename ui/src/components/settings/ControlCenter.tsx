import React, { useState } from 'react';
import {
  FolderGit2,
  Cpu,
  Wrench,
  Brain,
  Plug,
  Puzzle,
  FileText,
  BarChart2,
  Bell,
  Settings,
  ChevronRight,
  ArrowLeft,
  Activity,
  Terminal,
} from 'lucide-react';
import { SettingsScreen } from './SettingsScreen';
import { SettingsSection } from '../../router';

export const ControlCenter: React.FC = () => {
  const [selectedSubSection, setSelectedSubSection] = useState<SettingsSection | null>(null);

  if (selectedSubSection) {
    return (
      <div className="flex-1 h-full flex flex-col bg-[#0a0a0c]">
        <div className="h-12 px-6 border-b border-border/40 flex items-center gap-3 bg-[#101014]/40">
          <button
            onClick={() => setSelectedSubSection(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Control center</span>
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SettingsScreen section={selectedSubSection} />
        </div>
      </div>
    );
  }

  const sections = [
    {
      group: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Organization & Overview', desc: 'System status, health, and workspaces', icon: <FolderGit2 className="w-4 h-4" /> },
        { id: 'worktrees', label: 'Browse Files & Worktrees', desc: 'Manage local git repositories and context', icon: <FileText className="w-4 h-4" /> },
        { id: 'logs', label: 'Usage & Telemetry', desc: 'Real-time telemetry and execution logs', icon: <BarChart2 className="w-4 h-4" /> },
        { id: 'general', label: 'Settings & Appearance', desc: 'Theme packs, colors, and security passwords', icon: <Settings className="w-4 h-4" /> },
      ],
    },
    {
      group: 'Agent tools',
      items: [
        { id: 'providers', label: 'AI Providers & Models', desc: 'Configure DeepSeek, Anthropic, Ollama, OpenAI', icon: <Cpu className="w-4 h-4 text-primary" /> },
        { id: 'tools', label: 'Tools & Permissions', desc: 'Manage tool policies and execution privileges', icon: <Wrench className="w-4 h-4 text-amber-400" /> },
        { id: 'skills', label: 'Skills Library', desc: 'Reusable prompt skills and capabilities', icon: <Brain className="w-4 h-4 text-indigo-400" /> },
        { id: 'mcps', label: 'MCP Servers', desc: 'Model Context Protocol dynamic servers', icon: <Plug className="w-4 h-4 text-emerald-400" /> },
        { id: 'plugins', label: 'Plugins', desc: 'Extend Kendali with external modules', icon: <Puzzle className="w-4 h-4 text-violet-400" /> },
      ],
    },
    {
      group: 'Integrations',
      items: [
        { id: 'telegram', label: 'Telegram Bot Gateway', desc: 'Connect Telegram channels to your agents', icon: <Activity className="w-4 h-4 text-sky-400" /> },
      ],
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0a0a0c] px-4 sm:px-8 py-8 select-none">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Control center</h1>
          <p className="text-xs text-muted-foreground">
            Manage organization settings, AI models, custom tools, and system integrations.
          </p>
        </div>

        {/* Section Groups */}
        <div className="space-y-6 pt-2">
          {sections.map((sec) => (
            <div key={sec.group} className="space-y-2">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                {sec.group}
              </h3>

              <div className="rounded-2xl bg-[#121216] border border-border/60 divide-y divide-border/40 overflow-hidden shadow-xs">
                {sec.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedSubSection(item.id as SettingsSection)}
                    className="p-3.5 hover:bg-[#16161c] flex items-center justify-between cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-foreground shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
