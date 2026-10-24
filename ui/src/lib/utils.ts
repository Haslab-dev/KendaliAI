import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const APP_VERSION = '0.6.1';
export const APP_BUILD = 56;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDisplayTitle(title: string | undefined | null): string {
  if (!title) return '';
  let clean = title.trim().replace(/^['"]|['"]$/g, '');
  if (clean.includes('/var/folders/') || clean.includes('/TemporaryItems/') || clean.includes('/tmp/')) {
    const parts = clean.split('/');
    const last = parts[parts.length - 1];
    if (last) {
      clean = last.replace(/\.[a-zA-Z0-9]+$/, '');
    }
  }
  return clean;
}
