import React from 'react';
import { Download, FileText } from 'lucide-react';
import { Attachment } from '../../types';
import { useViewerStore, classifyFile } from '../../store/useViewerStore';
import { cn } from '../../lib/cn';

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(0)} KB`;
  return `${n} B`;
}

interface AttachmentListProps {
  attachments?: Attachment[];
  align?: 'start' | 'end';
  className?: string;
}

// Renders the files/images attached to a message. Images open in the shared
// file viewer; other files expose a download link.
export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, align = 'end', className }) => {
  const openFile = useViewerStore((s) => s.openFile);
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === 'image' || classifyFile(a.name, a.mime) === 'image');
  const files = attachments.filter((a) => !images.includes(a));

  const openAttachment = (att: Attachment) => {
    const kind = classifyFile(att.name, att.mime);
    openFile({
      name: att.name,
      mime: att.mime,
      kind,
      previewUrl: att.url,
      downloadUrl: att.url,
    });
  };

  return (
    <div className={cn('flex w-full flex-col gap-1.5', align === 'end' ? 'items-end' : 'items-start', className)}>
      {images.length > 0 && (
        <div className={cn('flex max-w-[85%] flex-wrap gap-1.5 sm:max-w-[75%]', align === 'end' ? 'justify-end' : 'justify-start')}>
          {images.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => openAttachment(att)}
              className="group/att relative overflow-hidden rounded-xl border border-white/20 bg-black/10 shadow-sm transition-transform hover:scale-[1.015]"
              title={`${att.name} · ${formatBytes(att.size)}`}
            >
              <img
                src={att.url}
                alt={att.name}
                loading="lazy"
                className="h-24 w-24 object-cover sm:h-28 sm:w-28"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-3xs text-white opacity-0 transition-opacity group-hover/att:opacity-100">
                {att.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className={cn('flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]', align === 'end' ? 'items-end' : 'items-start')}>
          {files.map((att) => (
            <div
              key={att.id}
              className="flex max-w-full items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5 text-ui-xs text-foreground"
            >
              <button
                type="button"
                onClick={() => openAttachment(att)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                title={att.name}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{att.name}</span>
                <span className="shrink-0 font-mono text-3xs text-muted-foreground">{formatBytes(att.size)}</span>
              </button>
              <a
                href={att.url}
                download
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Download"
              >
                <Download className="size-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
