import React, { useState, useEffect, useMemo } from 'react';
import {
  Check,
  X,
  Sparkles,
  Copy,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Columns,
  Maximize2,
} from 'lucide-react';
import { highlightCodeLine } from '../../lib/diff-highlight';

export interface FileDiffItem {
  id: string;
  filePath: string;
  fileName?: string;
  originalContent?: string;
  modifiedContent?: string;
  additions?: number;
  deletions?: number;
  kind?: 'git' | 'agent';
}

interface DiffViewerProps {
  diff: FileDiffItem;
  onClose?: () => void;
  isInline?: boolean;
}

export interface ParsedDiffLine {
  type: 'header' | 'add' | 'del' | 'normal' | 'file-header';
  text: string;
  origLine?: number;
  modLine?: number;
}

export interface SplitDiffRow {
  type: 'row' | 'header' | 'file-header';
  headerText?: string;
  left?: {
    lineNum?: number;
    text: string;
    type: 'normal' | 'del';
  };
  right?: {
    lineNum?: number;
    text: string;
    type: 'normal' | 'add';
  };
}

export function parseUnifiedDiff(rawText: string): { lines: ParsedDiffLine[]; splitRows: SplitDiffRow[] } {
  if (!rawText) return { lines: [], splitRows: [] };

  const rawLines = rawText.split('\n');
  const lines: ParsedDiffLine[] = [];
  const splitRows: SplitDiffRow[] = [];

  let origLineCount = 1;
  let modLineCount = 1;

  let pendingDels: Array<{ lineNum: number; text: string }> = [];
  let pendingAdds: Array<{ lineNum: number; text: string }> = [];

  const flushPending = () => {
    const maxLen = Math.max(pendingDels.length, pendingAdds.length);
    for (let i = 0; i < maxLen; i++) {
      const del = pendingDels[i];
      const add = pendingAdds[i];
      splitRows.push({
        type: 'row',
        left: del ? { lineNum: del.lineNum, text: del.text, type: 'del' } : undefined,
        right: add ? { lineNum: add.lineNum, text: add.text, type: 'add' } : undefined,
      });
    }
    pendingDels = [];
    pendingAdds = [];
  };

  for (const l of rawLines) {
    if (
      l.startsWith('diff --git') ||
      l.startsWith('index ') ||
      l.startsWith('---') ||
      l.startsWith('+++') ||
      l.startsWith('new file') ||
      l.startsWith('deleted file') ||
      l.startsWith('similarity index') ||
      l.startsWith('rename from') ||
      l.startsWith('rename to') ||
      l.startsWith('Binary files') ||
      l.startsWith('\\ No newline')
    ) {
      flushPending();
      lines.push({ type: 'file-header', text: l });
      splitRows.push({ type: 'file-header', headerText: l });
    } else if (l.startsWith('@@')) {
      flushPending();
      const match = l.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        origLineCount = parseInt(match[1], 10);
        modLineCount = parseInt(match[2], 10);
      }
      lines.push({ type: 'header', text: l });
      splitRows.push({ type: 'header', headerText: l });
    } else if (l.startsWith('+')) {
      const lineNum = modLineCount++;
      const text = l.substring(1);
      lines.push({ type: 'add', text, modLine: lineNum });
      pendingAdds.push({ lineNum, text });
    } else if (l.startsWith('-')) {
      const lineNum = origLineCount++;
      const text = l.substring(1);
      lines.push({ type: 'del', text, origLine: lineNum });
      pendingDels.push({ lineNum, text });
    } else {
      flushPending();
      const text = l.startsWith(' ') ? l.substring(1) : l;
      const oNum = origLineCount++;
      const mNum = modLineCount++;
      lines.push({ type: 'normal', text, origLine: oNum, modLine: mNum });
      splitRows.push({
        type: 'row',
        left: { lineNum: oNum, text, type: 'normal' },
        right: { lineNum: mNum, text, type: 'normal' },
      });
    }
  }

  flushPending();
  return { lines, splitRows };
}

export interface FileDiffSection {
  filePath: string;
  lines: ParsedDiffLine[];
  splitRows: SplitDiffRow[];
  additions: number;
  deletions: number;
  rawText?: string;
}

export function parseUnifiedDiffByFiles(rawText: string, fallbackPath?: string): FileDiffSection[] {
  if (!rawText || !rawText.trim()) return [];

  const rawLines = rawText.split('\n');
  const sections: FileDiffSection[] = [];

  let currentPath = '';
  let currentRawLines: string[] = [];

  const flush = () => {
    if (currentRawLines.length > 0) {
      const isHeaderPreamble = !currentPath && !currentRawLines.some((l) => l.startsWith('@@') || l.startsWith('diff --git'));
      if (!isHeaderPreamble) {
        const chunk = currentRawLines.join('\n');
        const { lines, splitRows } = parseUnifiedDiff(chunk);
        const additions = lines.filter((l) => l.type === 'add').length;
        const deletions = lines.filter((l) => l.type === 'del').length;
        sections.push({
          filePath: currentPath || fallbackPath || 'Diff',
          lines,
          splitRows,
          additions,
          deletions,
          rawText: chunk,
        });
      }
    }
    currentRawLines = [];
  };

  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    if (l.startsWith('diff --git')) {
      flush();
      const match = l.match(/diff --git a\/(.+?)\s+b\/(.+)$/);
      if (match) {
        currentPath = match[2];
      } else {
        const altMatch = l.match(/\sb\/(.+)$/);
        currentPath = altMatch ? altMatch[1] : fallbackPath || '';
      }
      currentRawLines.push(l);
    } else {
      if (!currentPath && l.startsWith('+++ b/')) {
        currentPath = l.substring(6).trim();
      } else if (!currentPath && l.startsWith('--- a/')) {
        currentPath = l.substring(6).trim();
      }
      currentRawLines.push(l);
    }
  }

  flush();

  if (sections.length === 0 && rawLines.length > 0) {
    const { lines, splitRows } = parseUnifiedDiff(rawText);
    sections.push({
      filePath: fallbackPath || 'Diff',
      lines,
      splitRows,
      additions: lines.filter((l) => l.type === 'add').length,
      deletions: lines.filter((l) => l.type === 'del').length,
      rawText,
    });
  }

  return sections;
}

export function parseTwoFilesDiff(origText: string, modText: string): { lines: ParsedDiffLine[]; splitRows: SplitDiffRow[] } {
  const origLines = origText ? origText.split('\n') : [];
  const modLines = modText ? modText.split('\n') : [];

  const m = origLines.length;
  const n = modLines.length;

  if (m === 0 && n === 0) return { lines: [], splitRows: [] };
  if (m === 0) {
    const lines: ParsedDiffLine[] = modLines.map((text, idx) => ({ type: 'add', text, modLine: idx + 1 }));
    const splitRows: SplitDiffRow[] = modLines.map((text, idx) => ({
      type: 'row',
      right: { lineNum: idx + 1, text, type: 'add' },
    }));
    return { lines, splitRows };
  }
  if (n === 0) {
    const lines: ParsedDiffLine[] = origLines.map((text, idx) => ({ type: 'del', text, origLine: idx + 1 }));
    const splitRows: SplitDiffRow[] = origLines.map((text, idx) => ({
      type: 'row',
      left: { lineNum: idx + 1, text, type: 'del' },
    }));
    return { lines, splitRows };
  }

  if (origText === modText) {
    const lines: ParsedDiffLine[] = origLines.map((text, idx) => ({ type: 'normal', text, origLine: idx + 1, modLine: idx + 1 }));
    const splitRows: SplitDiffRow[] = origLines.map((text, idx) => ({
      type: 'row',
      left: { lineNum: idx + 1, text, type: 'normal' },
      right: { lineNum: idx + 1, text, type: 'normal' },
    }));
    return { lines, splitRows };
  }

  const maxLines = Math.max(m, n);
  if (maxLines > 2000) {
    const lines: ParsedDiffLine[] = [];
    const splitRows: SplitDiffRow[] = [];
    for (let idx = 0; idx < maxLines; idx++) {
      const origLine = origLines[idx];
      const modLine = modLines[idx];
      if (origLine === modLine) {
        lines.push({ type: 'normal', text: origLine, origLine: idx + 1, modLine: idx + 1 });
        splitRows.push({
          type: 'row',
          left: { lineNum: idx + 1, text: origLine, type: 'normal' },
          right: { lineNum: idx + 1, text: modLine, type: 'normal' },
        });
      } else {
        if (origLine !== undefined) lines.push({ type: 'del', text: origLine, origLine: idx + 1 });
        if (modLine !== undefined) lines.push({ type: 'add', text: modLine, modLine: idx + 1 });
        splitRows.push({
          type: 'row',
          left: origLine !== undefined ? { lineNum: idx + 1, text: origLine, type: 'del' } : undefined,
          right: modLine !== undefined ? { lineNum: idx + 1, text: modLine, type: 'add' } : undefined,
        });
      }
    }
    return { lines, splitRows };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const diffOps: Array<{ type: 'del' | 'add' | 'normal'; text: string; origLine?: number; modLine?: number }> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      diffOps.unshift({ type: 'normal', text: origLines[i - 1], origLine: i, modLine: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffOps.unshift({ type: 'add', text: modLines[j - 1], modLine: j });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffOps.unshift({ type: 'del', text: origLines[i - 1], origLine: i });
      i--;
    }
  }

  const lines: ParsedDiffLine[] = [];
  const splitRows: SplitDiffRow[] = [];
  let pendingDels: Array<{ lineNum?: number; text: string }> = [];
  let pendingAdds: Array<{ lineNum?: number; text: string }> = [];

  const flush = () => {
    const maxLen = Math.max(pendingDels.length, pendingAdds.length);
    for (let k = 0; k < maxLen; k++) {
      const del = pendingDels[k];
      const add = pendingAdds[k];
      splitRows.push({
        type: 'row',
        left: del ? { lineNum: del.lineNum, text: del.text, type: 'del' } : undefined,
        right: add ? { lineNum: add.lineNum, text: add.text, type: 'add' } : undefined,
      });
    }
    pendingDels = [];
    pendingAdds = [];
  };

  for (const op of diffOps) {
    if (op.type === 'normal') {
      flush();
      lines.push({ type: 'normal', text: op.text, origLine: op.origLine, modLine: op.modLine });
      splitRows.push({
        type: 'row',
        left: { lineNum: op.origLine, text: op.text, type: 'normal' },
        right: { lineNum: op.modLine, text: op.text, type: 'normal' },
      });
    } else if (op.type === 'del') {
      lines.push({ type: 'del', text: op.text, origLine: op.origLine });
      pendingDels.push({ lineNum: op.origLine, text: op.text });
    } else if (op.type === 'add') {
      lines.push({ type: 'add', text: op.text, modLine: op.modLine });
      pendingAdds.push({ lineNum: op.modLine, text: op.text });
    }
  }
  flush();

  return { lines, splitRows };
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, onClose, isInline = false }) => {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>(isInline ? 'unified' : 'split');
  const [copied, setCopied] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const isUnifiedDiff = useMemo(() => {
    if (diff.kind === 'git') return true;
    const mod = diff.modifiedContent || '';
    if (!diff.originalContent && mod) return true;
    if (mod.startsWith('diff --git') || mod.startsWith('@@ ') || mod.startsWith('--- ') || mod.includes('\n@@ -')) {
      return true;
    }
    return false;
  }, [diff.kind, diff.originalContent, diff.modifiedContent]);

  const fileSections: FileDiffSection[] = useMemo(() => {
    if (isUnifiedDiff) {
      const text = diff.modifiedContent || '';
      const fallback = diff.filePath || diff.fileName || 'Diff';
      return parseUnifiedDiffByFiles(text, fallback);
    }
    const { lines, splitRows } = parseTwoFilesDiff(diff.originalContent || '', diff.modifiedContent || '');
    const additions = lines.filter((l) => l.type === 'add').length;
    const deletions = lines.filter((l) => l.type === 'del').length;
    return [
      {
        filePath: diff.filePath || diff.fileName || 'Proposed Changes',
        lines,
        splitRows,
        additions,
        deletions,
      },
    ];
  }, [isUnifiedDiff, diff.originalContent, diff.modifiedContent, diff.filePath, diff.fileName]);

  const totalAdditions = useMemo(() => fileSections.reduce((acc, s) => acc + s.additions, 0), [fileSections]);
  const totalDeletions = useMemo(() => fileSections.reduce((acc, s) => acc + s.deletions, 0), [fileSections]);

  const toggleFile = (path: string) => {
    setCollapsedFiles((p) => ({ ...p, [path]: !p[path] }));
  };

  const copyDiff = () => {
    const text = diff.modifiedContent || diff.originalContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background font-mono text-ui-xs">
      {/* Diff Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-chrome px-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-foreground-subtle" />
          <span className="truncate font-sans font-medium text-foreground">{diff.filePath || 'Diff Viewer'}</span>
          <div className="flex items-center gap-1.5 font-mono text-2xs">
            {totalAdditions > 0 && <span className="text-emerald-500 font-semibold">+{totalAdditions}</span>}
            {totalDeletions > 0 && <span className="text-rose-500 font-semibold">-{totalDeletions}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-sans">
          <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-2xs">
            <button
              onClick={() => setViewMode('unified')}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                viewMode === 'unified' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unified
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                viewMode === 'split' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Split
            </button>
          </div>

          <button
            onClick={copyDiff}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-2xs text-muted-foreground hover:text-foreground"
            title="Copy diff to clipboard"
          >
            {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto bg-background p-2 select-text">
        {fileSections.map((sec) => {
          const isCollapsed = !!collapsedFiles[sec.filePath];
          return (
            <div key={sec.filePath} className="mb-3 overflow-hidden rounded-lg border border-border bg-card">
              <div
                onClick={() => toggleFile(sec.filePath)}
                className="flex cursor-pointer select-none items-center justify-between border-b border-border bg-chrome px-3 py-1.5 font-sans text-ui-xs"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                  <span className="font-semibold text-foreground">{sec.filePath}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-2xs">
                  {sec.additions > 0 && <span className="text-emerald-500 font-semibold">+{sec.additions}</span>}
                  {sec.deletions > 0 && <span className="text-rose-500 font-semibold">-{sec.deletions}</span>}
                </div>
              </div>

              {!isCollapsed && (
                <div className="overflow-x-auto text-2xs leading-relaxed">
                  {viewMode === 'unified' ? (
                    <div className="divide-y divide-border/20 font-mono">
                      {sec.lines.map((l, idx) => {
                        if (l.type === 'file-header') return null;
                        if (l.type === 'header') {
                          return (
                            <div key={idx} className="bg-sky-500/10 px-3 py-0.5 text-sky-400 font-semibold">
                              {l.text}
                            </div>
                          );
                        }
                        const isAdd = l.type === 'add';
                        const isDel = l.type === 'del';
                        return (
                          <div
                            key={idx}
                            className={`flex items-baseline px-2 py-0.5 hover:bg-surface-hover/50 ${
                              isAdd
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : isDel
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'text-foreground/90'
                            }`}
                          >
                            <span className="w-9 shrink-0 select-none text-right font-mono text-muted-foreground/60 pr-2">
                              {l.origLine ?? ''}
                            </span>
                            <span className="w-9 shrink-0 select-none text-right font-mono text-muted-foreground/60 pr-2">
                              {l.modLine ?? ''}
                            </span>
                            <span className="w-4 shrink-0 select-none font-bold">
                              {isAdd ? '+' : isDel ? '-' : ' '}
                            </span>
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                              {highlightCodeLine(l.text, sec.filePath)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Split mode */
                    <div className="divide-y divide-border/20 font-mono">
                      {sec.splitRows.map((row, idx) => {
                        if (row.type === 'file-header') return null;
                        if (row.type === 'header') {
                          return (
                            <div key={idx} className="bg-sky-500/10 px-3 py-0.5 text-sky-400 font-semibold">
                              {row.headerText}
                            </div>
                          );
                        }
                        const left = row.left;
                        const right = row.right;
                        return (
                          <div key={idx} className="grid grid-cols-2 divide-x divide-border/40 hover:bg-surface-hover/50">
                            {/* Left column (Original) */}
                            <div
                              className={`flex items-baseline px-2 py-0.5 ${
                                left?.type === 'del' ? 'bg-rose-500/10 text-rose-400' : 'text-foreground/80'
                              }`}
                            >
                              <span className="w-8 shrink-0 select-none text-right text-muted-foreground/60 pr-2">
                                {left?.lineNum ?? ''}
                              </span>
                              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                                {left ? highlightCodeLine(left.text, sec.filePath) : ''}
                              </span>
                            </div>

                            {/* Right column (Modified) */}
                            <div
                              className={`flex items-baseline px-2 py-0.5 ${
                                right?.type === 'add' ? 'bg-emerald-500/10 text-emerald-400' : 'text-foreground/80'
                              }`}
                            >
                              <span className="w-8 shrink-0 select-none text-right text-muted-foreground/60 pr-2">
                                {right?.lineNum ?? ''}
                              </span>
                              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                                {right ? highlightCodeLine(right.text, sec.filePath) : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
