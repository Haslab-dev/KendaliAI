import React, { useEffect, useRef } from 'react';
import { FileText, Folder } from 'lucide-react';

export interface AtMentionItem {
  path: string;
  isDir: boolean;
}

export const AtMentionMenu: React.FC<{
  items: AtMentionItem[];
  index: number;
  onSelect: (item: AtMentionItem) => void;
}> = ({ items, index, onSelect }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-3 right-3 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl z-40"
    >
      {items.map((it, i) => (
        <button
          key={it.path}
          type="button"
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
            i === index ? 'bg-primary/10 dark:bg-card/60' : 'hover:bg-surface-hover'
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(it);
          }}
        >
          {it.isDir ? (
            <Folder className="size-3.5 shrink-0 text-sky-500" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-emerald-500" />
          )}
          <span className="min-w-0 truncate font-mono text-foreground">{it.path}</span>
          <span className="ml-auto shrink-0 text-ui-xs uppercase text-muted-foreground">
            {it.isDir ? 'folder' : 'file'}
          </span>
        </button>
      ))}
    </div>
  );
};

export function extractAtQuery(textBeforeCaret: string): string | null {
  const match = /(?:^|\s)@([^\s]*)$/.exec(textBeforeCaret);
  return match ? match[1] : null;
}
