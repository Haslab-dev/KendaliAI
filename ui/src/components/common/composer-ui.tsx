import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Composer control primitives for ForgeADE / KendaliAI.
 * These are the chip / menu recipes shared by the composer footer, the model
 * / agent / effort pickers, the workspace selector and the branch selector.
 */

const CHIP_BASE =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium outline-none transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0';

const CHIP_SIZES = {
  sm: 'h-7 gap-1.5 px-2.5 text-ui-base text-muted-foreground hover:text-foreground [&_svg:not([class*="text-"]):not([class*="opacity-"])]:text-muted-foreground [&_svg:not([class*="size-"])]:size-4',
  xs: 'h-7 gap-1 px-1.75 text-ui-xs font-normal text-muted-foreground/80 hover:text-foreground sm:h-6 [&_svg:not([class*="size-"])]:size-3.5',
} as const;

export interface ComposerControlProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: keyof typeof CHIP_SIZES;
  pressed?: boolean;
}

export const ComposerControl = React.forwardRef<HTMLButtonElement, ComposerControlProps>(
  ({ size = 'sm', pressed, className, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        CHIP_BASE,
        CHIP_SIZES[size],
        pressed && 'bg-accent text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
ComposerControl.displayName = 'ComposerControl';

/** The dropdown chevron every picker chip carries. */
export const ComposerChevron: React.FC<{ size?: 'sm' | 'xs'; className?: string }> = ({
  size = 'sm',
  className,
}) => (
  <ChevronDown
    aria-hidden="true"
    strokeWidth={2.25}
    className={cn(
      size === 'sm' ? 'size-3.5 text-muted-foreground' : 'size-3 opacity-60',
      className,
    )}
  />
);

export const composerMenuClass =
  'dropdown-glass z-50 animate-in rounded-xl border border-border bg-popover/98 backdrop-blur-xl p-1 text-ui-sm text-foreground shadow-2xl fade-in zoom-in-95 duration-100';

export const ComposerMenu: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { role?: string; label?: string }
> = ({ role = 'menu', label, className, children, ...props }) => (
  <div role={role} aria-label={label} className={cn(composerMenuClass, className)} {...props}>
    {children}
  </div>
);

export const ComposerMenuItem: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }
> = ({ selected, className, children, type, ...props }) => (
  <button
    type={type ?? 'button'}
    aria-checked={props.role === 'menuitemradio' ? selected : undefined}
    className={cn(
      'flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui-base text-foreground outline-none transition-colors hover:bg-accent',
      selected && 'bg-foreground/[0.08] font-medium',
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export const ComposerMenuLabel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      'px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground',
      className,
    )}
    {...props}
  />
);

export const ComposerMenuCheck: React.FC<{ className?: string }> = ({ className }) => (
  <Check aria-hidden="true" className={cn('size-3.5 shrink-0 text-primary', className)} />
);

export const ComposerKbd: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  className,
  ...props
}) => (
  <kbd
    className={cn(
      'rounded border border-border bg-card px-1 py-0.5 font-mono text-3xs text-muted-foreground',
      className,
    )}
    {...props}
  />
);
