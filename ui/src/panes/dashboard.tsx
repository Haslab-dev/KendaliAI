import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Plus,
  Shield,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import {
  MetricRow,
  PaneSection,
  PaneToolbar,
  PaneToolbarActions,
  PaneToolbarFilters,
  ProgressBar,
  StatCard,
  StatChip,
} from '../components/settings/settingsPrimitives';
import { cn } from '../lib/utils';

interface SystemMetrics {
  storage: {
    percent: number;
    usedGB: number;
    totalGB: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  memory: {
    percent: number;
    usedMB: number;
    totalMB: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  cpu: {
    percent: number;
    cores: number;
  };
}

/** Local telemetry tile inside the Server Resources section. */
const ResourceTile: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  percent: number;
  detail: string;
  tone: 'primary' | 'success' | 'warn';
}> = ({ icon: Icon, label, percent, detail, tone }) => (
  <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-muted p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-ui-sm font-medium text-foreground">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </span>
      <span className="font-mono text-ui-sm font-semibold tabular-nums text-foreground">{percent}%</span>
    </div>
    <ProgressBar percent={percent} tone={tone} />
    <span className="font-mono text-ui-xs text-muted-foreground">{detail}</span>
  </div>
);

export const DashboardPane: React.FC = () => {
  const { agents, tasks, createSession, selectSession } = useAppStore();

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [schedulesCount, setSchedulesCount] = useState<number>(0);
  const [policiesCount, setPoliciesCount] = useState<number>(0);
  const [telegramBotUser, setTelegramBotUser] = useState<string>('Not configured');
  const [sandboxRoot, setSandboxRoot] = useState<string>('~/');

  const activeRunningTasks = tasks?.filter((t) => t.status === 'running') || [];
  const activeTasksCount = activeRunningTasks.length;
  const activeAgentsCount = agents?.length || 0;

  const loadData = useCallback(async () => {
    try {
      const mRes = await fetch('/api/system/metrics');
      if (mRes.ok) setMetrics(await mRes.json());

      const sRes = await fetch('/api/schedules');
      if (sRes.ok) {
        const sData = await sRes.json();
        if (Array.isArray(sData)) setSchedulesCount(sData.length);
      }

      const pRes = await fetch('/api/policies');
      if (pRes.ok) {
        const pData = await pRes.json();
        if (Array.isArray(pData)) setPoliciesCount(pData.length);
      }

      const tbRes = await fetch('/api/telegram/bots');
      if (tbRes.ok) {
        const tbData = await tbRes.json();
        if (Array.isArray(tbData) && tbData.length > 0) {
          const active = tbData.find((b: any) => b.enabled) || tbData[0];
          if (active && active.username) {
            setTelegramBotUser(`@${active.username.replace('@', '')}`);
          }
        }
      }

      const rRes = await fetch('/api/workspace/root');
      if (rRes.ok) {
        const rData = await rRes.json();
        if (rData.current) setSandboxRoot(rData.current);
      }
    } catch (err) {
      console.error('Error fetching dashboard live telemetry:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="w-full space-y-5 text-foreground">
      {/* Toolbar: live counters + primary action (title lives in the Settings frame) */}
      <PaneToolbar>
        <PaneToolbarFilters>
          <StatChip label="agents registered" value={activeAgentsCount} />
          <StatChip label="active tasks" value={activeTasksCount} tone="primary" />
          <span className="inline-flex items-center gap-1.5 text-ui-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Live telemetry · refreshes every 10s
          </span>
        </PaneToolbarFilters>
        <PaneToolbarActions>
          <button
            onClick={async () => {
              const sid = await createSession();
              await selectSession(sid);
              navigate('chat');
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-ui-sm font-semibold text-foreground-inverse transition-colors hover:bg-brand/80 cursor-pointer"
          >
            <Plus size={14} />
            <span>New Task</span>
          </button>
        </PaneToolbarActions>
      </PaneToolbar>

      {/* Server resources */}
      <PaneSection icon={Activity} title="Server Resources" description="Live system telemetry">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ResourceTile
            icon={HardDrive}
            label="Storage"
            percent={metrics ? metrics.storage.percent : 0}
            detail={metrics ? `${metrics.storage.usedFormatted} / ${metrics.storage.totalFormatted}` : '—'}
            tone="primary"
          />
          <ResourceTile
            icon={MemoryStick}
            label="Memory"
            percent={metrics ? metrics.memory.percent : 0}
            detail={metrics ? `${metrics.memory.usedFormatted} / ${metrics.memory.totalFormatted}` : '—'}
            tone="success"
          />
          <ResourceTile
            icon={Cpu}
            label="CPU"
            percent={metrics ? metrics.cpu.percent : 0}
            detail={metrics ? `${metrics.cpu.cores} cores available` : '—'}
            tone="warn"
          />
        </div>
      </PaneSection>

      {/* Usage counters */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Bot} label="Agents" value={activeAgentsCount} hint={activeAgentsCount > 0 ? 'Registered in workspace' : 'None configured'} />
        <StatCard icon={Activity} label="Active Tasks" value={activeTasksCount} hint={activeTasksCount > 0 ? 'Currently running' : 'No tasks running'} tone="primary" />
        <StatCard icon={ClockIcon} label="Schedules" value={schedulesCount} hint={schedulesCount > 0 ? `${schedulesCount} scheduled jobs` : 'No active jobs'} />
        <StatCard icon={Shield} label="Policy Guard" value={policiesCount} hint="Sandbox enforced" />
      </div>

      {/* Tasks + gateway health */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <PaneSection
          icon={Terminal}
          title="Background Tasks"
          actions={
            <button
              onClick={() => navigate('scheduler')}
              className="inline-flex items-center gap-1 text-ui-xs font-medium text-muted-foreground transition-colors hover:text-primary cursor-pointer"
            >
              View all <ArrowRight className="size-3" />
            </button>
          }
          bodyClassName="p-3"
        >
          {tasks && tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface-muted px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {t.status === 'running' ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    )}
                    <span className="min-w-0 truncate text-ui-sm font-medium text-foreground">
                      {t.title || t.id}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-ui-xs font-medium',
                      t.status === 'running'
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    )}
                  >
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <CheckCircle2 className="size-5 text-muted-foreground" />
              <p className="text-ui-sm text-foreground-subtle">No background tasks</p>
              <p className="text-ui-xs text-muted-foreground">
                Running agents and scheduled jobs appear here.
              </p>
            </div>
          )}
        </PaneSection>

        <PaneSection icon={Cpu} title="Gateway Health" bodyClassName="px-4 py-2">
          <MetricRow label="Local Server" value={<span className="font-mono text-ui-xs">http://localhost:8080</span>} />
          <MetricRow label="WebSocket Event Bus" value={<span className="font-semibold text-emerald-500">Connected</span>} />
          <MetricRow label="Telegram Bot" value={telegramBotUser} />
          <MetricRow label="Workspace Root" value={<span className="font-mono text-ui-xs" title={sandboxRoot}>{sandboxRoot}</span>} />
        </PaneSection>
      </div>
    </div>
  );
};

// Local icon aliases for clarity in JSX above.
const ClockIcon = Clock;

export default DashboardPane;
