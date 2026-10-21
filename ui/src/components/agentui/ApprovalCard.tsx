import React from 'react';
import { ShieldAlert, Wrench } from 'lucide-react';
import { useAgentStore } from '../../store/useAgentStore';
import { ACPPermissionOption } from '../../types';
import { Button } from '../ui';
import { cn } from '../../lib/cn';

/* ApprovalCard — ACP session/request_permission rendered above the composer
 * (forgeADE PendingApprovalCard parity): mono tool block + deny/allow. */

const optionStyle = (kind: string) => {
  if (kind.startsWith('allow')) return 'warning' as const;
  return 'ghost' as const;
};

export const ApprovalCard: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const permissions = useAgentStore((s) => s.permissions);
  const respondPermission = useAgentStore((s) => s.respondPermission);
  const list = permissions[sessionId] || [];
  if (list.length === 0) return null;

  return (
    <div className="mx-auto w-full space-y-2 px-4 sm:px-6" style={{ maxWidth: 'var(--chat-content-max-width)' }}>
      {list.map((perm) => (
        <div
          key={perm.requestId}
          className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-warning/40 bg-warning/5 p-3"
        >
          <div className="flex items-center gap-2 pb-2">
            <ShieldAlert size={15} className="text-warning" />
            <span className="text-ui-sm font-semibold text-foreground">Permission requested</span>
            <span className="ml-auto font-mono text-3xs text-subtle-fg">{perm.kind || 'tool'}</span>
          </div>
          <pre className="mb-2.5 overflow-x-auto rounded-lg border border-border/50 bg-card/80 p-2 font-mono text-3xs leading-relaxed text-foreground/85">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Wrench size={10} /> {perm.title || perm.toolCallId || 'tool call'}
            </span>
          </pre>
          <div className="flex flex-wrap items-center gap-1.5">
            {perm.options.map((opt: ACPPermissionOption) => {
              const isAllow = opt.kind.startsWith('allow');
              return (
                <Button
                  key={opt.optionId}
                  variant={isAllow ? optionStyle(opt.kind) : 'ghost'}
                  size="sm"
                  onClick={() => respondPermission(sessionId, perm.requestId, opt.optionId)}
                  className={cn(!isAllow && 'text-destructive hover:bg-destructive/10')}
                >
                  {opt.name || opt.kind}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
