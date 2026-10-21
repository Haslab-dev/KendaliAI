import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * Register the custom ui-* / dense font-size scale with tailwind-merge.
 * Without this, `text-ui-sm` is mis-classified as a text COLOR group and
 * silently drops real text color classes like `text-background` or
 * `text-destructive` that appear earlier in the string (forge-ade parity).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['ui-xs', 'ui-sm', 'ui-base', 'ui-lg', 'ui-xl', '2xs', '3xs', '4xs'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
