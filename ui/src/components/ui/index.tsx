import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/* ============================================================================
 * Shared UI kit — forgeADE-style primitives. Every pane and surface consumes
 * these so geometry, spacing, and states stay consistent app-wide.
 * ========================================================================== */

/* ---- Button -------------------------------------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'warning';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  // Contrast CTA recipe: inverted foreground/background.
  primary: 'bg-foreground text-background hover:bg-foreground/85',
  secondary: 'bg-accent text-foreground hover:bg-accent/70 border border-border/60',
  ghost: 'text-foreground/80 hover:bg-foreground/5 hover:text-foreground',
  outline: 'border border-border-strong text-foreground hover:bg-foreground/5',
  destructive: 'bg-destructive text-white hover:bg-destructive/85',
  warning: 'bg-warning text-black hover:bg-warning/85',
};

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-ui-xs gap-1 rounded-md',
  sm: 'h-7 px-2.5 text-ui-sm gap-1.5 rounded-md',
  md: 'h-8 px-3 text-ui-sm gap-1.5 rounded-lg',
  lg: 'h-9 px-4 text-ui-base gap-2 rounded-lg',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: LucideIcon;
  }
> = ({ variant = 'secondary', size = 'sm', loading, icon: Icon, className, children, disabled, ...rest }) => (
  <button
    className={cn(
      'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus/80',
      'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
      buttonVariants[variant],
      buttonSizes[size],
      className
    )}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <Loader2 size={14} className="animate-spin-slow" /> : Icon ? <Icon size={14} /> : null}
    {children}
  </button>
);

/* ---- IconButton ---------------------------------------------------------- */
export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: LucideIcon;
    size?: number;
    active?: boolean;
    destructive?: boolean;
    tooltip?: string;
  }
> = ({ icon: Icon, size = 16, active, destructive, tooltip, className, ...rest }) => (
  <button
    title={tooltip}
    className={cn(
      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
      destructive
        ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
        : active
          ? 'bg-foreground/10 text-foreground'
          : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
      className
    )}
    {...rest}
  >
    <Icon size={size} strokeWidth={2} />
  </button>
);

/* ---- Card ---------------------------------------------------------------- */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }> = ({
  interactive,
  className,
  children,
  ...rest
}) => (
  <div
    className={cn(
      'rounded-xl border border-border bg-card',
      interactive && 'transition-colors hover:border-border-strong hover:bg-accent/40',
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

/* ---- PaneHeader ---------------------------------------------------------- */
export const PaneHeader: React.FC<{
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ icon: Icon, title, description, actions }) => (
  <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border/60 bg-chrome/60 px-4">
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-foreground/80">
      <Icon size={15} strokeWidth={2} />
    </span>
    <div className="min-w-0">
      <h1 className="truncate text-ui-sm font-semibold text-foreground">{title}</h1>
      {description && <p className="truncate text-ui-xs text-muted-foreground">{description}</p>}
    </div>
    <div className="ml-auto flex items-center gap-1.5">{actions}</div>
  </div>
);

/* ---- Inputs -------------------------------------------------------------- */
const inputBase =
  'h-8 w-full rounded-md border border-input bg-inputbg px-2.5 text-ui-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary/60 disabled:opacity-50';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
  <input className={cn(inputBase, className)} {...rest} />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...rest }) => (
  <textarea className={cn(inputBase, 'h-auto min-h-16 resize-y py-2 leading-relaxed', className)} {...rest} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, children, ...rest }) => (
  <select className={cn(inputBase, 'select-chevron cursor-pointer pr-8', className)} {...rest}>
    {children}
  </select>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search…', className }) => (
  <div className={cn('relative', className)}>
    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(inputBase, 'h-7 pl-7 pr-7 text-ui-xs')}
    />
    {value && (
      <button
        onClick={() => onChange('')}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X size={12} />
      </button>
    )}
  </div>
);

/* ---- Toggle -------------------------------------------------------------- */
export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  checked,
  onChange,
  disabled,
}) => (
  <button
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative shrink-0 rounded-full transition-colors disabled:opacity-50',
      checked ? 'bg-primary' : 'bg-border-strong'
    )}
    style={{ height: 18, width: 32 }}
  >
    <span
      className={cn(
        'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-[16px]' : 'translate-x-0.5'
      )}
    />
  </button>
);

/* ---- Badge --------------------------------------------------------------- */
type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline' | 'mono';
const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-accent text-foreground/80 border-border/60',
  primary: 'border-primary/30 bg-primary/15 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
  outline: 'border-border text-muted-foreground',
  mono: 'border-border/60 bg-accent/60 font-mono text-foreground/70',
};

export const Badge: React.FC<{
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}> = ({ variant = 'default', className, children }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-2xs font-medium leading-4',
      badgeVariants[variant],
      className
    )}
  >
    {children}
  </span>
);

/* ---- StatusDot ----------------------------------------------------------- */
export const StatusDot: React.FC<{ color: string; pulse?: 'ping' | 'pulse' | false; className?: string }> = ({
  color,
  pulse = false,
  className,
}) => (
  <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
    {pulse === 'ping' && (
      <span className="animate-status-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
    )}
    <span
      className={cn('relative inline-flex h-2 w-2 rounded-full', pulse === 'pulse' && 'animate-status-pulse')}
      style={{ background: color }}
    />
  </span>
);

/* ---- SectionLabel / Kbd --------------------------------------------------- */
export const SectionLabel: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('text-2xs font-semibold uppercase tracking-wider text-subtle-fg', className)}>{children}</div>
);

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded border border-border bg-accent px-1 font-mono text-3xs text-muted-foreground">{children}</kbd>
);

/* ---- Row / ListItem ------------------------------------------------------ */
export const ListRow: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { active?: boolean; clickable?: boolean }
> = ({ active, clickable = true, className, children, ...rest }) => (
  <div
    className={cn(
      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
      clickable && 'cursor-pointer',
      active ? 'bg-foreground/10' : 'hover:bg-foreground/5',
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

/* ---- Tabs ---------------------------------------------------------------- */
export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export const Tabs: React.FC<{
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ items, active, onChange, className }) => (
  <div className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-accent/60 p-0.5', className)}>
    {items.map((t) => {
      const Icon = t.icon;
      const isActive = t.id === active;
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'inline-flex h-6.5 items-center gap-1.5 rounded-md px-2.5 text-ui-xs font-medium transition-colors',
            isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
          style={{ height: 26 }}
        >
          {Icon && <Icon size={13} />}
          {t.label}
        </button>
      );
    })}
  </div>
);

/* ---- EmptyState ----------------------------------------------------------- */
export const EmptyState: React.FC<{
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, actions, className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
    <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-muted-foreground">
      <Icon size={20} strokeWidth={1.8} />
    </span>
    <div className="text-ui-sm font-semibold text-foreground">{title}</div>
    {description && <p className="max-w-sm text-ui-xs leading-relaxed text-muted-foreground">{description}</p>}
    {actions && <div className="mt-2 flex items-center gap-2">{actions}</div>}
  </div>
);

/* ---- Modal ----------------------------------------------------------------- */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  width?: number | string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, onClose, title, description, width = 460, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className="dialog-glass animate-in fade-in zoom-in-95 max-h-[85vh] w-full overflow-hidden rounded-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              {title && <h2 className="text-ui-base font-semibold text-foreground">{title}</h2>}
              {description && <p className="mt-0.5 text-ui-xs text-muted-foreground">{description}</p>}
            </div>
            <IconButton icon={X} size={14} onClick={onClose} tooltip="Close" />
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
};

/* ---- DropdownMenu ---------------------------------------------------------- */
export const DropdownMenu: React.FC<{
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
  /** Open upward (drop-up) for bottom-anchored composers. Default: down. */
  side?: 'top' | 'bottom';
  className?: string;
}> = ({ trigger, children, align = 'left', width = 220, side = 'bottom', className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'dropdown-glass animate-in fade-in zoom-in-95 absolute z-50 max-h-[320px] overflow-y-auto rounded-xl p-1 text-ui-sm shadow-2xl',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

export const MenuItem: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; destructive?: boolean; selected?: boolean }
> = ({ icon: Icon, destructive, selected, className, children, ...rest }) => (
  <button
    className={cn(
      'flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui-sm transition-colors',
      destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground/90 hover:bg-foreground/5',
      selected && 'bg-foreground/[0.08]',
      className
    )}
    {...rest}
  >
    {Icon && <Icon size={14} className="shrink-0 text-muted-foreground" />}
    <span className="truncate">{children}</span>
  </button>
);

export const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle-fg">{children}</div>
);

export const MenuSeparator = () => <div className="mx-1 my-1 border-t border-border/60" />;
