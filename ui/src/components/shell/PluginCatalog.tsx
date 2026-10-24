import React, { useEffect, useState } from 'react';
import { Check, Cloud, HardDrive, ExternalLink } from 'lucide-react';
import { CatalogPlugin } from '../../types';
import { cn } from '../../lib/cn';

export interface PluginCatalogData {
  plugins: CatalogPlugin[];
  google: { keyConfigured: boolean; connected: boolean };
}

/** Fetches the default capability plugin catalog + Google connection status. */
export function usePluginCatalog(): PluginCatalogData | null {
  const [data, setData] = useState<PluginCatalogData | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/plugins/catalog')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setData({ plugins: d.plugins || [], google: d.google || { keyConfigured: false, connected: false } });
      })
      .catch(() => {
        if (alive) setData({ plugins: [], google: { keyConfigured: false, connected: false } });
      });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

const CATEGORY_LABELS: Record<string, string> = {
  documents: 'Documents',
  visual: 'Visual',
  motion: 'Motion',
  cloud: 'Cloud',
};

const ENGINE_STYLES: Record<string, string> = {
  local: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  composio: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

interface PluginCheckboxGridProps {
  catalog: PluginCatalogData;
  /** Effective enabled plugin ids for the agent. */
  enabled: string[];
  onToggle: (pluginId: string) => void;
  /** Open the Connections settings (for the Google Workspace plugin). */
  onOpenConnections?: () => void;
}

/** Checkbox grid over the default capability plugin catalog. */
export const PluginCheckboxGrid: React.FC<PluginCheckboxGridProps> = ({
  catalog,
  enabled,
  onToggle,
  onOpenConnections,
}) => {
  const enabledSet = new Set(enabled);
  const byCategory = new Map<string, CatalogPlugin[]>();
  for (const p of catalog.plugins) {
    const list = byCategory.get(p.category) || [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return (
    <div className="space-y-6">
      <p className="text-ui-sm text-foreground-subtle leading-relaxed max-w-2xl">
        Default capability plugins extend what this agent can produce. Local plugins run
        fully offline with native tools; Composio plugins write into your connected
        accounts. Changes apply to the next agent turn.
      </p>

      {[...byCategory.entries()].map(([category, plugins]) => (
        <div key={category} className="space-y-2">
          <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            {CATEGORY_LABELS[category] || category}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {plugins.map((plugin) => {
              const checked = enabledSet.has(plugin.id);
              const googlePending =
                plugin.engine === 'composio' && plugin.toolkit === 'googledocs' &&
                !(catalog.google.keyConfigured && catalog.google.connected);
              return (
                <label
                  key={plugin.id}
                  className={cn(
                    'group flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all select-none',
                    checked
                      ? 'border-primary/50 bg-primary/[0.06] shadow-xs'
                      : 'border-border/60 bg-card hover:bg-surface'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(plugin.id)}
                    className="mt-0.5 size-4 shrink-0 rounded border-border accent-[var(--primary)] cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ui-sm text-foreground truncate">
                        {plugin.name}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          ENGINE_STYLES[plugin.engine]
                        )}
                      >
                        {plugin.engine === 'local' ? (
                          <HardDrive className="size-2.5" />
                        ) : (
                          <Cloud className="size-2.5" />
                        )}
                        {plugin.engine}
                      </span>
                    </div>
                    <p className="mt-1 text-ui-xs text-muted-foreground leading-relaxed">
                      {plugin.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {plugin.tools.map((t) => (
                        <span
                          key={t}
                          className="rounded-md border border-border/50 bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground-subtle"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {googlePending && (
                      <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                        <span className="flex-1 text-2xs text-amber-500 font-medium">
                          Needs a Composio API key + connected Google account.
                        </span>
                        {onOpenConnections && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onOpenConnections();
                            }}
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1 text-2xs font-semibold text-amber-500 hover:bg-amber-500/30 transition-colors cursor-pointer"
                          >
                            Connect
                            <ExternalLink className="size-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {checked && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
