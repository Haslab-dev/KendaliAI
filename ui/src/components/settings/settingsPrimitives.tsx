import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Settings design system.
 *
 * Every settings pane must be composed from the primitives in this module —
 * no one-off paddings, radii, or font sizes.
 *
 * Typography scale (smallest → largest):
 *   LABEL    text-3xs uppercase tracking-wider text-muted-foreground  (group labels)
 *   META     text-ui-xs  font-mono text-muted-foreground             (paths, ids, counts)
 *   BODY     text-ui-sm  text-foreground-subtle                      (descriptions)
 *   ITEM     text-ui-sm  font-medium text-foreground                 (row/item titles)
 *   GROUP    text-ui-base font-semibold text-foreground              (card/section titles)
 *   PAGE     SectionTitle (text-2xl)                                 (one per section)
 *
 * Spacing scale:
 *   card padding p-4 · inner stack gap-3 · between groups gap-5/6 · row py-3
 *
 * Radius scale:
 *   rounded-xl cards · rounded-lg controls & insets · rounded-full chips
 *
 * Surfaces:
 *   card = bg-card + border-border · inset = bg-surface-muted + border-border/60
 */

/** Standard card surface (groups related content; may contain a PaneSection header). */
export const sCard = 'rounded-xl border border-border bg-card';
/** Inset well for code, paths, and previews inside a card. */
export const sInset = 'rounded-lg border border-border/60 bg-surface-muted';
/** Uppercase group label (smallest typography). */
export const sLabel = 'text-3xs font-semibold uppercase tracking-wider text-muted-foreground';
/** Monospace meta line (paths, endpoints, counts). */
export const sMeta = 'font-mono text-ui-xs text-muted-foreground';

export const SETTINGS_FRAME_CONTENT_CLASSNAME =
  'mx-auto w-full max-w-4xl px-4 pb-8 pt-0 lg:px-8 lg:pb-10';

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  testId,
  label
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? 'Toggle'}
      data-state={checked ? 'checked' : 'unchecked'}
      data-testid={testId}
      disabled={disabled}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input'
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export function SettingsGroupCard({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card py-0 shadow-none',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  control,
  detail,
  controlLayout = 'default'
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
  detail?: React.ReactNode;
  controlLayout?: 'default' | 'wide';
}) {
  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div
        className={cn(
          'grid items-center gap-3 sm:gap-4',
          controlLayout === 'wide'
            ? 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_280px]'
            : 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_192px]'
        )}
      >
        <div className="min-w-0">
          <div className="text-ui-base font-medium text-foreground">{label}</div>
          {description ? (
            <div className="mt-1 text-ui-sm leading-normal text-foreground-subtle">{description}</div>
          ) : null}
        </div>
        <div className="flex w-full flex-nowrap items-center justify-end gap-2">
          {controlLayout === 'wide' ? detail : null}
          {control}
        </div>
      </div>
      {detail && controlLayout !== 'wide' ? <div className="mt-3">{detail}</div> : null}
    </div>
  );
}

/** Wrapping toolbar row shared by every settings pane: search/filters flow on
    one line on desktop, stack on mobile. Place primary actions last. */
export function PaneToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3', className)}>
      {children}
    </div>
  );
}

/** Left cluster inside a PaneToolbar (search, selects, counters). */
export function PaneToolbarFilters({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

/** Right cluster inside a PaneToolbar (primary actions). */
export function PaneToolbarActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

/** Compact stat counter chip used in pane toolbars. */
export function StatChip({ label, value, tone = 'default' }: { label: string; value: React.ReactNode; tone?: 'default' | 'primary' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-xs font-medium',
        tone === 'primary'
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-surface text-foreground-subtle'
      )}
    >
      <span className="font-semibold text-foreground">{value}</span>
      {label}
    </span>
  );
}

/** Responsive card grid shared by resource panes. */
export function PaneGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3', className)}>
      {children}
    </div>
  );
}

export function SettingsBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-surface px-2.5 py-1 text-ui-base font-medium text-foreground-subtle">
      {children}
    </span>
  );
}

/** Scope badge for resource rows (user / workspace / plugin). */
export function SettingsScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-ui-xs text-foreground-subtle">
      {scope}
    </span>
  );
}

/** Shared search input (SettingsSearchInput). */
export function SettingsSearchInput({
  value,
  onChange,
  placeholder,
  testId,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
}) {
  const canClear = value.length > 0;
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-ui-sm text-foreground outline-none transition-colors placeholder:text-foreground-subtlest hover:border-input-border-hover focus:border-input-border-focused [&::-webkit-search-cancel-button]:appearance-none"
      />
      {canClear ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          onClick={() => onChange('')}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Resource list container: surface card with hairline separators. */
export function SettingsResourceList({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl bg-surface">{children}</div>;
}

export function SettingsResourceSeparator() {
  return <div className="h-px bg-border/50" role="separator" />;
}

/** Empty state for resource lists. */
export function SettingsEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-foreground-subtle">
      {children}
    </div>
  );
}

/** Section title heading used at the top of each settings section. The one
    and only page-level heading — panes must not render their own headers. */
export function SectionTitle({
  title,
  badge,
  subtitle,
  children
}: {
  title: string;
  badge?: string;
  /** Secondary line under the page title. */
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
          {badge ? <BetaBadge label={badge} /> : null}
        </div>
        {subtitle ? <p className="mt-1 text-ui-sm text-foreground-subtle">{subtitle}</p> : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export function BetaBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-sky-500 px-2 text-ui-xs font-semibold text-sky-500">
      {label}
    </span>
  );
}

/** Generic select styled like the reference SelectTrigger. */
export function SettingsSelect({
  value,
  onChange,
  options,
  className,
  testId,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  testId?: string;
  label?: string;
}) {
  return (
    <select
      data-testid={testId}
      aria-label={label ?? 'Select an option'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-9 rounded-xl border border-border bg-background px-3 pr-8 text-ui-sm text-foreground outline-none transition-colors hover:border-input-border-hover focus:border-input-border-focused',
        className
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Standard button styles used across settings forms. */
export const settingsButtonClasses = {
  primary:
    'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-4 text-ui-sm font-medium text-foreground-inverse transition-colors hover:bg-brand/80 disabled:opacity-60',
  outline:
    'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-60',
  ghost:
    'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-ui-sm font-medium text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-60',
  input:
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-ui-sm text-foreground outline-none transition-colors placeholder:text-foreground-subtlest focus:border-input-border-focused'
};

/** Error boundary around one settings section: a broken section must not
    blank the whole settings page. */
export class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; section: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[settings] section "${this.props.section}" crashed:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="text-ui-base font-medium text-destructive">
            This section failed to render.
          </div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2 font-mono text-ui-xs text-foreground-subtle">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className={cn('mt-3', 'flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer')}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


/** Two-step destructive action button. window.confirm is a silent no-op in
    Wails WKWebView (native dialogs are never wired), so destructive actions
    arm in place: first click arms, second click within 3s confirms. */
export function ConfirmActionButton({
  label,
  confirmLabel,
  className,
  children,
  onConfirm
}: {
  label: string;
  confirmLabel?: string;
  className?: string;
  children?: React.ReactNode;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onBlur={() => setArmed(false)}
      className={cn(
        className,
        armed && 'border-destructive/50 bg-destructive/10 text-destructive'
      )}
    >
      {armed ? confirmLabel || `Confirm: ${label}` : label}
      {children}
    </button>
  );
}

// ============================================================================
// Reusable composition components — build panes from these, not from raw divs.
// ============================================================================

/** Chip: small pill for statuses and tags. */
export function Chip({
  tone = 'neutral',
  children,
  className
}: {
  tone?: 'neutral' | 'primary' | 'success' | 'warn' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-border bg-surface text-foreground-subtle',
    primary: 'border-primary/40 bg-primary/10 text-primary',
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
    danger: 'border-destructive/40 bg-destructive/10 text-destructive',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-500',
  };
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-ui-xs font-medium whitespace-nowrap',
      tones[tone],
      className
    )}>
      {children}
    </span>
  );
}

/** ToolTag: monospace tag for tool / skill identifiers. */
export function ToolTag({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-md border border-border/50 px-1.5 py-0.5 font-mono text-ui-xs text-foreground-subtle', 'bg-surface-muted')}>
      {children}
    </span>
  );
}

/** PaneSection: titled card used inside a pane. One card = one concern.
    Header (icon + title + optional actions) is separated by a hairline; the
    body holds fields, rows, or lists. */
export function PaneSection({
  icon: Icon,
  title,
  description,
  actions,
  children,
  className,
  bodyClassName
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn(sCard, 'overflow-hidden', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
          <div className="min-w-0">
            <h3 className="truncate text-ui-base font-semibold text-foreground">{title}</h3>
            {description ? (
              <p className="mt-0.5 text-ui-sm text-foreground-subtle">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** StatCard: icon + label + big value (+ hint). Grid-friendly. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default'
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'primary';
}) {
  return (
    <div className={cn(sCard, 'flex flex-col justify-between gap-2 p-4')}>
      <div className="flex items-center justify-between gap-2">
        <span className={sLabel}>{label}</span>
        {Icon ? <Icon className={cn('size-4', tone === 'primary' ? 'text-primary' : 'text-muted-foreground')} /> : null}
      </div>
      <div className="text-2xl font-semibold leading-none text-foreground tabular-nums">{value}</div>
      {hint ? <div className="text-ui-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** ProgressBar: thin status bar with tone. */
export function ProgressBar({ percent, tone = 'primary' }: { percent: number; tone?: 'primary' | 'success' | 'warn' | 'danger' }) {
  const tones: Record<string, string> = {
    primary: 'bg-primary',
    success: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-destructive',
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <div
        className={cn('h-full rounded-full transition-all duration-500', tones[tone])}
        style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/** MetricRow: label … value line used in health/status snapshots. */
export function MetricRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
      <span className="min-w-0 shrink-0 text-ui-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-ui-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Field: labeled form control with optional hint. */
export function Field({
  label,
  hint,
  children,
  className
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className={sLabel}>{label}</span>
      {children}
      {hint ? <span className="text-ui-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/** ToggleRow: label + description on the left, Switch on the right. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-ui-sm font-medium text-foreground">{label}</div>
        {description ? (
          <div className="mt-0.5 text-ui-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} label={typeof label === 'string' ? label : 'Toggle'} />
    </div>
  );
}
