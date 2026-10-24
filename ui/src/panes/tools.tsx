import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Filter,
  Users,
  CheckCircle2,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  PaneToolbar,
  PaneToolbarFilters,
  PaneToolbarActions,
  StatChip,
  SettingsSearchInput,
  ToolTag,
  Chip,
  sCard,
} from '../components/settings/settingsPrimitives';
import { ToolDefinition } from '../types';
import { cn } from '../lib/utils';

export const ToolsPane: React.FC = () => {
  const { agents } = useAppStore();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('personal-assistant');
  const [policies, setPolicies] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTools(data);
      })
      .catch(() => setTools([]));
  }, []);

  const fetchPolicies = async () => {
    try {
      const res = await fetch(`/api/policies?agentId=${encodeURIComponent(selectedAgent)}`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        if (Array.isArray(data)) {
          data.forEach((p: any) => {
            if (p.toolName) map[p.toolName] = p.effect;
          });
        }
        setPolicies(map);
      }
    } catch {
      setPolicies({});
    }
  };

  useEffect(() => {
    if (selectedAgent) {
      fetchPolicies();
    }
  }, [selectedAgent]);

  const handlePolicyChange = async (toolName: string, effect: string) => {
    setIsUpdating(toolName);
    try {
      await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent, toolName, effect }),
      });
      setPolicies((prev) => ({ ...prev, [toolName]: effect }));
    } finally {
      setIsUpdating(null);
    }
  };

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    tools.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [tools]);

  // Filtered tools
  const filteredTools = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tools.filter((t) => {
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.signature && t.signature.toLowerCase().includes(q));
      const matchesCategory =
        selectedCategory === 'all' || t.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [tools, search, selectedCategory]);

  // Counts by policy
  const policyStats = useMemo(() => {
    let allow = 0;
    let approval = 0;
    let deny = 0;
    tools.forEach((t) => {
      const p = policies[t.name] || 'ALLOW';
      if (p === 'DENY') deny++;
      else if (p === 'APPROVAL') approval++;
      else allow++;
    });
    return { allow, approval, deny };
  }, [tools, policies]);

  const activeAgentObj = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="w-full space-y-5 text-foreground select-none">
      {/* Policy overview stat chips */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold">Total Tools</span>
          <span className="text-xl font-bold text-foreground tabular-nums">{tools.length}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-2xs">
          <span className="text-3xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Allowed
          </span>
          <span className="text-xl font-bold text-emerald-400 tabular-nums">{policyStats.allow}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
          <span className="text-3xs uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1">
            <AlertTriangle className="size-3" /> Needs Approval
          </span>
          <span className="text-xl font-bold text-amber-400 tabular-nums">{policyStats.approval}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-destructive/20 bg-destructive/5 p-3 shadow-2xs">
          <span className="text-3xs uppercase tracking-wider text-destructive font-semibold flex items-center gap-1">
            <Ban className="size-3" /> Denied
          </span>
          <span className="text-xl font-bold text-destructive tabular-nums">{policyStats.deny}</span>
        </div>
      </div>

      {/* Toolbar: Role Selector + Search + Category Filter */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        {/* Role selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-primary">
            <Users className="size-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">Enforcing Role</span>
            <select
              className="mt-0.5 rounded-lg border border-border bg-background px-2.5 py-1 text-ui-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer max-w-[200px] truncate"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search & Category filter */}
        <div className="flex flex-1 flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center sm:justify-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Filter by name, signature..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-ui-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-ui-xs font-medium text-foreground outline-none transition-colors hover:border-input-border-hover focus:border-primary cursor-pointer shrink-0"
          >
            <option value="all">All Categories ({tools.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredTools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center flex flex-col items-center justify-center gap-2">
          <Wrench className="size-8 text-muted-foreground" />
          <h4 className="text-ui-sm font-semibold text-foreground">No tools matched</h4>
          <p className="text-ui-xs text-muted-foreground">
            Try adjusting your search query or switching categories.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table (md:block) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
            <table className="w-full text-left text-ui-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-muted-foreground uppercase text-3xs font-semibold tracking-wider">
                  <th className="py-3 px-4">Tool Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Signature / Command</th>
                  <th className="py-3 px-4 text-right">Policy Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredTools.map((t) => {
                  const current = policies[t.name] || 'ALLOW';
                  const isBusy = isUpdating === t.name;

                  return (
                    <tr key={t.name} className="hover:bg-accent/40 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <ToolTag>{t.name}</ToolTag>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        {t.category ? (
                          <Chip tone="neutral" className="text-3xs">
                            {t.category}
                          </Chip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-ui-xs text-muted-foreground truncate max-w-md block" title={t.signature}>
                          {t.signature || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <select
                          disabled={isBusy}
                          value={current}
                          onChange={(e) => handlePolicyChange(t.name, e.target.value)}
                          className={cn(
                            'rounded-lg px-2.5 py-1 text-ui-xs font-semibold outline-none transition-all cursor-pointer border',
                            current === 'DENY'
                              ? 'border-destructive/30 bg-destructive/10 text-destructive'
                              : current === 'APPROVAL'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          )}
                        >
                          <option value="ALLOW">ALLOW</option>
                          <option value="APPROVAL">APPROVAL</option>
                          <option value="DENY">DENY</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack (< md) — never overflows */}
          <div className="md:hidden flex flex-col gap-2.5">
            {filteredTools.map((t) => {
              const current = policies[t.name] || 'ALLOW';
              const isBusy = isUpdating === t.name;

              return (
                <div
                  key={t.name}
                  className="rounded-xl border border-border bg-card p-3.5 space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <ToolTag>{t.name}</ToolTag>
                    <select
                      disabled={isBusy}
                      value={current}
                      onChange={(e) => handlePolicyChange(t.name, e.target.value)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-ui-xs font-semibold outline-none transition-all cursor-pointer border',
                        current === 'DENY'
                          ? 'border-destructive/30 bg-destructive/10 text-destructive'
                          : current === 'APPROVAL'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      )}
                    >
                      <option value="ALLOW">ALLOW</option>
                      <option value="APPROVAL">APPROVAL</option>
                      <option value="DENY">DENY</option>
                    </select>
                  </div>

                  {t.signature && (
                    <div className="rounded-lg bg-surface-muted border border-border/50 p-2 font-mono text-3xs text-muted-foreground break-all">
                      {t.signature}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-3xs text-muted-foreground">
                    <span>Category:</span>
                    <span className="font-medium text-foreground">{t.category || 'General'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
