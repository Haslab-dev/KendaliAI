import React, { useMemo } from 'react';
import {
  Zap,
  Bot,
  CalendarClock,
  Shield,
  Plus,
  ArrowRight,
  CheckCircle2,
  Loader2,
  FolderGit2,
  BookOpen,
  Cpu,
  Terminal,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';

export const DashboardPane: React.FC = () => {
  const {
    agents,
    sessions,
    providers,
    tasks,
    createSession,
    selectSession,
    setActiveAgent,
  } = useAppStore();

  const activeTasksCount = tasks?.filter((t) => t.status === 'running').length || 2;
  const activeAgentsCount = agents?.length || 7;
  const activeProvidersCount = providers?.filter((p) => p.enabled || p.isDefault).length || providers?.length || 4;

  const quickPrompts = [
    {
      title: 'Code with Hermes Agent',
      desc: 'Build full-stack Go + React features or refactor code in isolated worktrees',
      tag: '🛠️ Coder',
      action: async () => {
        const coder = agents.find((a) => a.name.toLowerCase().includes('coder')) || agents[0];
        if (coder) setActiveAgent(coder);
        const sid = await createSession(coder?.id);
        await selectSession(sid);
        navigate('chat');
      },
    },
    {
      title: 'Create Natural Language Schedule',
      desc: 'Schedule reminders or background worker jobs using plain English or cron',
      tag: '⏰ Scheduler',
      action: () => navigate('scheduler'),
    },
    {
      title: 'Ingest Documents into RAG',
      desc: 'Upload PDFs, codebases or docs for vector chunking and semantic /doc retrieval',
      tag: '🧠 Vector RAG',
      action: () => navigate('docs'),
    },
    {
      title: 'Manage Agent Worktrees',
      desc: 'Spin up isolated git worktree checkouts so agents code safely without touching main',
      tag: '🌿 Worktrees',
      action: () => navigate('worktrees'),
    },
  ];

  return (
    <div
      data-pencil-name="Desktop — Dashboard"
      className="flex-1 h-full flex flex-col gap-[20px] p-[20px_24px] md:p-[28px_36px] overflow-y-auto custom-scrollbar bg-[#F7F7F5] dark:bg-[#0E0E0E]"
    >
      {/* Top Greeting Row */}
      <div
        data-pencil-name="Top Row"
        className="box-border w-full h-fit shrink-0 flex flex-col md:flex-row gap-[14px] md:gap-[12px] justify-between items-start md:items-center"
      >
        <div data-pencil-name="Titles" className="flex flex-col gap-[2px]">
          <h1
            data-pencil-name="Greeting"
            className="text-[22px] md:text-[24px] font-sans font-bold text-[#000000] dark:text-white"
          >
            Good evening, Lutfi
          </h1>
          <p
            data-pencil-name="Sub"
            className="text-[12px] text-[#8A8A85] font-funnel font-normal"
          >
            {activeAgentsCount} agents active · {activeTasksCount} background tasks · all providers healthy
          </p>
        </div>

        <button
          onClick={async () => {
            const sid = await createSession();
            await selectSession(sid);
            navigate('chat');
          }}
          data-pencil-name="New Task Btn"
          className="box-border w-fit shrink-0 h-fit flex flex-row gap-[8px] px-4 py-2 justify-start items-center bg-[#0F0F0F] hover:bg-black/80 text-white dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-[8px] shadow-sm transition-all cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.2} />
          <span className="text-[12px] font-sans font-bold whitespace-nowrap">New Task</span>
        </button>
      </div>

      {/* Stats Row (4 Cards matching design references) */}
      <div
        data-pencil-name="Stats Row"
        className="box-border w-full grid grid-cols-2 lg:grid-cols-4 gap-[12px] md:gap-[16px]"
      >
        {/* Active Tasks */}
        <div
          onClick={() => navigate('scheduler')}
          data-pencil-name="Stat Active Tasks"
          className="box-border h-[110px] flex flex-col justify-between p-[16px] md:p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a] cursor-pointer hover:border-[#007AFF]/40 transition-colors"
        >
          <div className="flex items-center gap-[8px]">
            <Zap size={15} className="text-[#007AFF]" />
            <span className="text-[12px] text-[#8A8A85] font-funnel">Active Tasks</span>
          </div>
          <div className="text-[24px] md:text-[26px] font-sans font-bold text-black dark:text-white leading-none">
            {activeTasksCount}
          </div>
          <div className="text-[11px] text-[#8A8A85] font-funnel">
            2 running in background
          </div>
        </div>

        {/* Agents */}
        <div
          onClick={() => navigate('agents')}
          data-pencil-name="Stat Agents"
          className="box-border h-[110px] flex flex-col justify-between p-[16px] md:p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a] cursor-pointer hover:border-[#F97316]/40 transition-colors"
        >
          <div className="flex items-center gap-[8px]">
            <Bot size={15} className="text-[#F97316]" />
            <span className="text-[12px] text-[#8A8A85] font-funnel">Agents</span>
          </div>
          <div className="text-[24px] md:text-[26px] font-sans font-bold text-black dark:text-white leading-none">
            {activeAgentsCount}
          </div>
          <div className="text-[11px] text-[#8A8A85] font-funnel truncate">
            Coder, Planner +{Math.max(1, activeAgentsCount - 2)} more
          </div>
        </div>

        {/* Schedules */}
        <div
          onClick={() => navigate('scheduler')}
          data-pencil-name="Stat Schedules"
          className="box-border h-[110px] flex flex-col justify-between p-[16px] md:p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a] cursor-pointer hover:border-[#16A34A]/40 transition-colors"
        >
          <div className="flex items-center gap-[8px]">
            <Clock size={15} className="text-[#16A34A]" />
            <span className="text-[12px] text-[#8A8A85] font-funnel">Schedules</span>
          </div>
          <div className="text-[24px] md:text-[26px] font-sans font-bold text-black dark:text-white leading-none">
            12
          </div>
          <div className="text-[11px] text-[#8A8A85] font-funnel">
            Next in 25 min
          </div>
        </div>

        {/* Policy Guardrails */}
        <div
          onClick={() => navigate('settings')}
          data-pencil-name="Stat Flags This Week"
          className="box-border h-[110px] flex flex-col justify-between p-[16px] md:p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a] cursor-pointer hover:border-red-400 transition-colors"
        >
          <div className="flex items-center gap-[8px]">
            <Shield size={15} className="text-[#DC2626]" />
            <span className="text-[12px] text-[#8A8A85] font-funnel">Policy Guard</span>
          </div>
          <div className="text-[24px] md:text-[26px] font-sans font-bold text-black dark:text-white leading-none">
            0
          </div>
          <div className="text-[11px] text-[#16A34A] font-funnel font-medium">
            Sandbox 100% secure
          </div>
        </div>
      </div>

      {/* Bento Grid layout matching design references */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[16px] w-full items-start">
        {/* Col 1 & 2: Background Tasks & Quick Actions */}
        <div className="lg:col-span-2 flex flex-col gap-[16px]">
          {/* Background Tasks Panel */}
          <div className="w-full flex flex-col gap-[12px] p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={15} className="text-[#007AFF]" />
                <h2 className="text-[14px] font-sans font-bold text-black dark:text-white">
                  Active Background Agents &amp; Tasks
                </h2>
              </div>
              <button
                onClick={() => navigate('scheduler')}
                className="text-[11px] text-[#8A8A85] hover:text-[#007AFF] font-funnel flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>

            {/* Tasks list */}
            <div className="space-y-2">
              <div className="p-3 bg-[#F7F7F5] dark:bg-[#1C1C1E] rounded-[6px] border border-[#E5E7EB]/70 dark:border-[#2C2C2E] flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 size={13} className="text-[#007AFF] animate-spin shrink-0" />
                    <span className="text-[12px] font-medium font-sans text-black dark:text-white truncate">
                      Hermes Agent background task executor
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-[#EBF5FF] text-[#007AFF] text-[10px] font-funnel font-medium rounded">
                    running 04:12
                  </span>
                </div>
                <div className="text-[10px] text-[#8A8A85] font-funnel">
                  Persona: Coder · branch: <span className="font-mono text-black dark:text-white">main</span> · local daemon PID 40912
                </div>
              </div>

              <div className="p-3 bg-[#F7F7F5] dark:bg-[#1C1C1E] rounded-[6px] border border-[#E5E7EB]/70 dark:border-[#2C2C2E] flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-[#16A34A] shrink-0" />
                    <span className="text-[12px] font-medium font-sans text-black dark:text-white truncate">
                      Weekly codebase &amp; doc index sync
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] text-[10px] font-funnel font-medium rounded">
                    completed
                  </span>
                </div>
                <div className="text-[10px] text-[#8A8A85] font-funnel">
                  Persona: Research · vector store reindexed (24 docs, 88 chunks)
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions / Prompt Templates */}
          <div className="w-full flex flex-col gap-[12px] p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a]">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[#D97706]" />
              <h2 className="text-[14px] font-sans font-bold text-black dark:text-white">
                Quick Start Agent Workflows
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {quickPrompts.map((q) => (
                <div
                  key={q.title}
                  onClick={q.action}
                  className="p-3 bg-[#F7F7F5] hover:bg-[#FFF5EB] dark:bg-[#1C1C1E] dark:hover:bg-[#2A2016] border border-[#E5E7EB] hover:border-[#F5E3CF] dark:border-[#2C2C2E] dark:hover:border-[#4B3724] rounded-[6px] cursor-pointer transition-all flex flex-col justify-between gap-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#D97706] font-funnel">
                      {q.tag}
                    </span>
                    <ArrowRight size={13} className="text-[#8A8A85] group-hover:text-[#D97706] group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-bold font-sans text-black dark:text-white">
                      {q.title}
                    </h3>
                    <p className="text-[10px] text-[#8A8A85] font-funnel mt-0.5 leading-relaxed">
                      {q.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 3: Personas & Infrastructure Health */}
        <div className="flex flex-col gap-[16px]">
          {/* Agent Personas Panel matching refs */}
          <div className="w-full flex flex-col gap-[12px] p-[18px] bg-[#FFF5EB] dark:bg-[#1D1711] border border-[#F5E3CF] dark:border-[#38281A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot size={15} className="text-[#D97706]" />
                <h2 className="text-[14px] font-sans font-bold text-black dark:text-white">
                  Agent Personas
                </h2>
              </div>
              <button
                onClick={() => navigate('agents')}
                className="text-[11px] text-[#D97706] font-funnel flex items-center gap-1 hover:underline"
              >
                Manage <ArrowRight size={11} />
              </button>
            </div>

            {/* Personas grid */}
            <div className="grid grid-cols-2 gap-2">
              {['🛠️ Coder', '📋 Planner', '🛡️ Reviewer', '🤖 Assistant', '🔍 Research', '🧠 Knowledge'].map((persona) => (
                <div
                  key={persona}
                  onClick={async () => {
                    const match = agents.find((a) => persona.toLowerCase().includes(a.name.toLowerCase()));
                    if (match) setActiveAgent(match);
                    const sid = await createSession(match?.id);
                    await selectSession(sid);
                    navigate('chat');
                  }}
                  className="p-2.5 bg-white dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[6px] text-left cursor-pointer hover:border-[#D97706]/40 transition-colors"
                >
                  <div className="text-[11px] font-sans font-bold text-black dark:text-white truncate">
                    {persona}
                  </div>
                  <div className="text-[9px] text-[#8A8A85] font-funnel truncate mt-0.5">
                    Click to launch
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System & Daemon Health Snapshot */}
          <div className="w-full flex flex-col gap-[12px] p-[18px] bg-[#FFFFFF] dark:bg-[#161616] border border-[#E5E7EB] dark:border-[#27272A] rounded-[8px] shadow-[0px_1px_2px_0px_#0000000a]">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-[#16A34A]" />
              <h2 className="text-[14px] font-sans font-bold text-black dark:text-white">
                Local Gateway Health
              </h2>
            </div>

            <div className="space-y-2 text-[11px] font-funnel">
              <div className="flex items-center justify-between py-1 border-b border-[#E5E7EB] dark:border-[#27272A]">
                <span className="text-[#8A8A85]">Local Server</span>
                <span className="font-mono font-medium text-black dark:text-white">http://localhost:8080</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#E5E7EB] dark:border-[#27272A]">
                <span className="text-[#8A8A85]">WebSocket Event Bus</span>
                <span className="text-[#16A34A] font-bold">CONNECTED</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#E5E7EB] dark:border-[#27272A]">
                <span className="text-[#8A8A85]">Telegram Bot</span>
                <span className="text-[#007AFF] font-bold">@kendaliai_bot</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[#8A8A85]">Sandbox Root</span>
                <span className="font-mono text-[10px] text-black dark:text-white truncate max-w-[140px]">
                  kendali-ai/
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
