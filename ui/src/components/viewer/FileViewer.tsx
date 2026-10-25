import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileQuestion,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useViewerStore } from '../../store/useViewerStore';
import { MarkdownView } from '../MarkdownView';
import { cn } from '../../lib/cn';

export const FileViewer: React.FC = () => {
  const { open, file, queue, close, next, prev } = useViewerStore();
  const [zoom, setZoom] = useState(1);
  const [text, setText] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState('');

  const isImage = file?.kind === 'image';
  const isHtml = file?.kind === 'html';
  const isPdf = file?.kind === 'pdf';
  const isText = file?.kind === 'text';

  useEffect(() => {
    setZoom(1);
    setText(null);
    setTextError('');
    if (!open || !file || file.kind !== 'text') return;
    let cancelled = false;
    setLoadingText(true);
    const url = file.path
      ? `/api/workspace/file?path=${encodeURIComponent(file.path)}`
      : file.previewUrl;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          return String(data.content ?? '');
        }
        return await res.text();
      })
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((err) => {
        if (!cancelled) setTextError(err.message || 'Failed to load file');
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, file]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, next, prev]);

  const queueIndex = useMemo(() => {
    if (!file) return -1;
    return queue.findIndex((f) => f.previewUrl === file.previewUrl);
  }, [file, queue]);

  if (!open || !file) return null;

  const hasNeighbours = queue.length > 1;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {isImage ? (
              <Maximize2 className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-ui-sm font-medium text-foreground" title={file.name}>
              {file.name}
            </span>
            {isHtml && (
              <span className="hidden shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-3xs font-medium text-amber-600 sm:inline-flex dark:text-amber-400">
                <ShieldCheck className="size-3" /> sandboxed
              </span>
            )}
            {hasNeighbours && queueIndex >= 0 && (
              <span className="shrink-0 font-mono text-3xs text-muted-foreground">
                {queueIndex + 1}/{queue.length}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isImage && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Zoom out"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-10 text-center font-mono text-3xs text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Zoom in"
                >
                  <Plus className="size-4" />
                </button>
              </>
            )}
            <a
              href={file.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Open in new tab"
            >
              <ExternalLink className="size-4" />
            </a>
            <a
              href={file.downloadUrl}
              download
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Download"
            >
              <Download className="size-4" />
            </a>
            <button
              type="button"
              onClick={close}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Close (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--app-bg,transparent)]">
          {hasNeighbours && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:bg-accent"
                title="Previous"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md transition-colors hover:bg-accent"
                title="Next"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}

          {isImage && (
            <div className="flex min-h-full items-center justify-center p-4">
              <img
                src={file.previewUrl}
                alt={file.name}
                className="max-h-full max-w-full rounded-lg shadow-lg"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                draggable={false}
              />
            </div>
          )}

          {isHtml && (
            <iframe
              title={file.name}
              src={file.previewUrl}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="h-full w-full border-0 bg-white"
            />
          )}

          {isPdf && (
            <iframe
              title={file.name}
              src={file.previewUrl}
              className="h-full w-full border-0 bg-white"
            />
          )}

          {isText && (
            <div className="p-5">
              {loadingText && (
                <div className="flex items-center gap-2 text-ui-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              )}
              {textError && <div className="text-ui-sm text-destructive">{textError}</div>}
              {!loadingText && !textError && text !== null && (
                file.name.toLowerCase().endsWith('.md') ? (
                  <MarkdownView content={text} />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[length:var(--font-size-code,12px)] leading-relaxed text-foreground select-text">
                    {text}
                  </pre>
                )
              )}
            </div>
          )}

          {!isImage && !isHtml && !isPdf && !isText && (
            <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileQuestion className="size-12 text-muted-foreground/50" />
              <div className="text-ui-sm font-medium text-foreground">{file.name}</div>
              <div className="text-ui-xs text-muted-foreground">
                No inline preview for this file type.
              </div>
              <a
                href={file.downloadUrl}
                download
                className={cn(
                  'mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-ui-xs font-medium text-primary-foreground',
                  'transition-colors hover:bg-primary/90'
                )}
              >
                <Download className="size-3.5" /> Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
