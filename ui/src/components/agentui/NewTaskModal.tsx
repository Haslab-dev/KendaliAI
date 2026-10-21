import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Check, Sparkles, Terminal } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAgentStore } from '../../store/useAgentStore';
import { cn } from '../../lib/cn';
import { Badge, Button, Input, Modal } from '../ui';
import { AgentIcon } from '../shell/AgentIcon';

/* NewTaskModal — 2-step task creation (forgeADE parity): pick an agent
 * (Forge personas + external ACP roster), pick the workspace, start. */

interface AgentChoice {
  kind: 'native' | 'acp';
  id: string;
  name: string;
  description?: string;
  available: boolean;
  model?: string;
}

export const NewTaskModal: React.FC = () => {
  const open = useAgentStore((s) => s.newTaskOpen);
  const setOpen = useAgentStore((s) => s.setNewTaskOpen);
  const prefill = useAgentStore((s) => s.newTaskPrefill);
  const startTask = useAgentStore((s) => s.startTask);
  const agents = useAppStore((s) => s.agents);
  const acpAgents = useAgentStore((s) => s.acpAgents);
  const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);
  const workspacePresets = useAppStore((s) => s.workspacePresets);

  const [step, setStep] = useState<0 | 1>(0);
  const [choice, setChoice] = useState<AgentChoice | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStep(0);
      setError('');
      const p = prefill
        ? acpAgents.find((a) => a.id === prefill.agentId) || null
        : null;
      setChoice(
        p
          ? { kind: 'acp', id: p.id, name: p.name, description: p.description, available: p.available, model: p.defaultModel }
          : null
      );
      if (p) setStep(1);
      setWorkspace(activeWorkspacePath || workspacePresets[0]?.path || '');
    }
  }, [open, prefill, acpAgents, activeWorkspacePath, workspacePresets]);

  const choices = useMemo<AgentChoice[]>(() => {
    const native: AgentChoice[] = agents.map((a) => ({
      kind: 'native',
      id: a.id,
      name: a.name || a.id,
      description: a.description || a.role,
      available: true,
      model: a.model,
    }));
    const acp: AgentChoice[] = acpAgents.map((a) => ({
      kind: 'acp',
      id: a.id,
      name: a.name,
      description: a.description,
      available: a.available,
      model: a.defaultModel,
    }));
    return [...acp, ...native];
  }, [agents, acpAgents]);

  const start = async () => {
    if (!choice) return;
    setStarting(true);
    setError('');
    try {
      await startTask({
        kind: choice.kind,
        agentId: choice.id,
        cwd: workspace || undefined,
        model: choice.model,
      });
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to start the task.');
    } finally {
      setStarting(false);
    }
  };

  const wsName = workspace ? workspace.split('/').filter(Boolean).pop() : '';

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={step === 0 ? 'New task' : 'Choose workspace'}
      description={step === 0 ? 'Run it on a Forge agent or an external ACP agent.' : undefined}
      width={520}
    >
      {step === 0 ? (
        <div className="space-y-1">
          {choices.map((a) => (
            <button
              key={`${a.kind}:${a.id}`}
              disabled={!a.available}
              onClick={() => {
                setChoice(a);
                setStep(1);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors',
                a.available ? 'hover:border-border hover:bg-foreground/5' : 'cursor-not-allowed opacity-45'
              )}
            >
              <AgentIcon id={a.id} name={a.name} isACP={a.kind === 'acp'} size={16} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-ui-sm font-medium text-foreground">{a.name}</span>
                  {a.kind === 'acp' && (
                    <Badge variant="primary" className="px-1 py-0 text-3xs uppercase">
                      ACP
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-ui-xs text-muted-foreground">
                  {a.available ? a.description || (a.kind === 'acp' ? 'External ACP agent' : 'Forge persona') : 'Command not found in PATH'}
                </span>
              </span>
              {a.kind === 'acp' ? <Terminal size={14} className="shrink-0 text-subtle-fg" /> : <Bot size={14} className="shrink-0 text-subtle-fg" />}
            </button>
          ))}
          {choices.length === 0 && (
            <p className="px-2 py-6 text-center text-ui-sm text-muted-foreground">
              No agents configured yet — add personas under Agent Persons or ACP agents in config.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => setStep(0)}
            className="flex items-center gap-1.5 text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={13} />
            Back to {choice?.name}
          </button>

          <div>
            <p className="pb-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle-fg">Workspace</p>
            <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="/absolute/path/to/project" />
            {workspacePresets.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {workspacePresets.map((p) => (
                  <button
                    key={p.path}
                    onClick={() => setWorkspace(p.path)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-ui-xs transition-colors',
                      workspace === p.path
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground/80 hover:bg-foreground/5'
                    )}
                  >
                    {p.label || p.path.split('/').filter(Boolean).pop()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {choice && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-accent/40 px-3 py-2.5">
              <AgentIcon id={choice.id} name={choice.name} isACP={choice.kind === 'acp'} size={15} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-ui-sm font-medium text-foreground">
                  {choice.name}
                  {choice.kind === 'acp' && (
                    <Badge variant="primary" className="px-1 py-0 text-3xs uppercase">
                      ACP
                    </Badge>
                  )}
                </p>
                <p className="truncate font-mono text-3xs text-muted-foreground">
                  {wsName ? `${wsName} · ` : ''}
                  {choice.model || 'default model'}
                </p>
              </div>
              <Check size={15} className="ml-auto shrink-0 text-success" />
            </div>
          )}

          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-ui-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={starting} icon={Sparkles} onClick={start}>
              Start task
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
