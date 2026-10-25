import React, { useMemo, useState } from 'react';
import {
  Pencil,
  SquareTerminal,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Wrench,
  Code2,
  Sparkles,
  Copy,
  Check,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { highlightCodeLine, highlightTerminalLine, highlightTerminalCommand } from '../../lib/diff-highlight';
import { useViewerStore } from '../../store/useViewerStore';
import { parseTwoFilesDiff } from '../diff/DiffViewer';
import { WorkLogRow, WorkLogDetails, WorkLogStatusGlyph, type WorkLogStatus } from './WorkLog';
import { cn } from '../../lib/cn';

export interface ToolExecution {
  id: string;
  toolName: string;
  command?: string;
  output?: string;
  status?: 'running' | 'completed' | 'success' | 'failed' | 'error' | 'denied';
  durationMs?: number;
  diff?: {
    filePath?: string;
    additions?: number;
    deletions?: number;
    originalContent?: string;
    modifiedContent?: string;
  };
}

export function cleanArgPath(val: string): string {
  if (!val) return '';
  return val.replace(/^[\s{"'`\\]+/, '').replace(/[\s}"'`\\]+$/, '').trim();
}

export interface ParsedToolArgs {
  path: string;
  cmd: string;
  content: string;
  oldString?: string;
  newString?: string;
}

export function parseToolArgs(raw: string | Record<string, any>, toolName: string): ParsedToolArgs {
  let path = '';
  let cmd = '';
  let content = '';
  let oldString: string | undefined;
  let newString: string | undefined;

  if (typeof raw === 'object' && raw !== null) {
    path = raw.Path || raw.path || raw.filepath || raw.filePath || raw.file_path || raw.file || raw.target_file || raw.targetFile || raw.TargetFile || '';
    cmd = raw.command || raw.cmd || raw.script || raw.CommandLine || raw.command_line || '';
    if (!cmd && (raw.query || raw.prompt || raw.pattern || raw.search_term)) {
      cmd = raw.query || raw.prompt || raw.pattern || raw.search_term;
    }
    content = raw.content || raw.text || raw.code || raw.body || raw.file_content || raw.CodeContent || raw.Content || '';
    oldString = raw.old_string || raw.old || raw.target || raw.Target || '';
    newString = raw.new_string || raw.new || raw.replacement || raw.Replacement || '';
  } else {
    const str = (raw || '').trim();
    if (str.startsWith('{')) {
      try {
        const p = JSON.parse(str);
        path = p.Path || p.path || p.filepath || p.filePath || p.file_path || p.file || p.filename || p.target_file || p.targetFile || p.TargetFile || '';
        cmd = p.command || p.cmd || p.script || p.CommandLine || p.command_line || '';
        if (!cmd && (p.query || p.prompt || p.pattern || p.search_term)) {
          cmd = p.query || p.prompt || p.pattern || p.search_term;
        }
        content = p.content || p.text || p.code || p.body || p.file_content || p.CodeContent || p.Content || '';
        oldString = p.old_string || p.old || p.target || p.Target || '';
        newString = p.new_string || p.new || p.replacement || p.Replacement || '';
      } catch {
        const pm = str.match(/"(?:Path|path|filepath|filePath|file_path|file|filename|target_file|targetFile|TargetFile)":\s*"([^"]+)"/i);
        if (pm) path = pm[1];
        const cm = str.match(/"(?:command|cmd|script|CommandLine|command_line|query|prompt)":\s*"([^"]+)"/i);
        if (cm) cmd = cm[1];
        const ctm = str.match(/"(?:content|text|code|body|file_content|CodeContent|Content)":\s*"([\s\S]+?)"(?:\s*,\s*"|\s*})/i);
        if (ctm) content = ctm[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        const oldM = str.match(/"(?:old_string|old|target|Target)":\s*"([\s\S]+?)"(?:\s*,\s*"|\s*})/i);
        if (oldM) oldString = oldM[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        const newM = str.match(/"(?:new_string|new|replacement|Replacement)":\s*"([\s\S]+?)"(?:\s*,\s*"|\s*})/i);
        if (newM) newString = newM[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
    } else {
      cmd = str;
    }
  }

  path = cleanArgPath(path);
  const nameLower = (toolName || '').toLowerCase();
  if (!path && (nameLower.includes('write') || nameLower.includes('create') || nameLower.includes('edit') || nameLower.includes('read') || nameLower.includes('view'))) {
    let candidate = cleanArgPath(typeof raw === 'string' ? raw : '');
    candidate = candidate.replace(/^(?:read_file|read|cat|write|create|edit)\s+/i, '');
    if (!candidate.includes('\n') && candidate.length < 250 && candidate !== '{}') {
      path = cleanArgPath(candidate);
    }
  }

  return { path, cmd, content, oldString, newString };
}

export function parseReadOutput(output: string): { filePath?: string; totalLines?: number; content: string } {
  if (!output) return { content: '' };
  const headerMatch = output.match(/^Contents of ([^\n(]+)(?:\s*\((\d+)\s+total lines\))?:\n([\s\S]*)$/);
  if (headerMatch) {
    return {
      filePath: headerMatch[1].trim(),
      totalLines: headerMatch[2] ? parseInt(headerMatch[2], 10) : undefined,
      content: headerMatch[3]
    };
  }
  return { content: output };
}

export function ToolErrorBlock({ errorText }: { errorText: string }) {
  let cleanError = errorText || 'Tool execution failed';
  const match = cleanError.match(/<tool_use_error>([\s\S]*?)<\/tool_use_error>/i);
  if (match) cleanError = match[1].trim();

  return (
    <div className="mt-1.5 ml-6 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 font-mono text-ui-xs text-destructive select-text scrollbar-thin">
      {cleanError}
    </div>
  );
}

export interface InlineDiffLine {
  type: 'add' | 'del' | 'normal';
  lineNum: number;
  text: string;
}

export function parseInlineDiffLines(diffText: string, oldStr?: string, newStr?: string): InlineDiffLine[] {
  const result: InlineDiffLine[] = [];
  if (diffText && diffText.includes('@@')) {
    const lines = diffText.split('\n');
    let displayLine = 1;
    for (const line of lines) {
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        if (m) displayLine = parseInt(m[1], 10);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        result.push({
          type: 'add',
          lineNum: displayLine++,
          text: line.slice(1)
        });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        result.push({
          type: 'del',
          lineNum: displayLine,
          text: line.slice(1)
        });
      } else if (line.startsWith(' ')) {
        result.push({
          type: 'normal',
          lineNum: displayLine++,
          text: line.slice(1)
        });
      } else if (line.trim().length > 0 && !line.startsWith('---') && !line.startsWith('+++')) {
        result.push({
          type: 'normal',
          lineNum: displayLine++,
          text: line
        });
      }
    }
  }

  if (result.length === 0 && (oldStr || newStr)) {
    let lineIdx = 1;
    if (oldStr) {
      for (const l of oldStr.split('\n')) {
        result.push({ type: 'del', lineNum: lineIdx++, text: l });
      }
    }
    if (newStr) {
      for (const l of newStr.split('\n')) {
        result.push({ type: 'add', lineNum: lineIdx++, text: l });
      }
    }
  }

  return result;
}

export function ToolInlineDiffBlock({
  diff,
  rawDiffText,
  oldStr,
  newStr,
  ext
}: {
  diff?: { filePath?: string; originalContent?: string; modifiedContent?: string };
  rawDiffText?: string;
  oldStr?: string;
  newStr?: string;
  ext?: string;
}) {
  const lines: InlineDiffLine[] = useMemo(() => {
    if (diff?.originalContent !== undefined && diff?.modifiedContent !== undefined) {
      const parsed = parseTwoFilesDiff(diff.originalContent, diff.modifiedContent);
      let lineCounter = 1;
      const res: InlineDiffLine[] = [];
      for (const pl of parsed.lines) {
        if (pl.type === 'file-header' || pl.type === 'header') continue;
        res.push({
          type: pl.type === 'add' ? 'add' : pl.type === 'del' ? 'del' : 'normal',
          lineNum: lineCounter++,
          text: pl.text
        });
      }
      if (res.length > 0) return res;
    }
    const text = rawDiffText || diff?.originalContent || '';
    return parseInlineDiffLines(text, oldStr, newStr);
  }, [diff, rawDiffText, oldStr, newStr]);

  if (lines.length === 0) {
    return (
      <div className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] rounded-xl border border-border/50 bg-card p-3 font-mono text-ui-xs text-muted-foreground">
        No visual line changes to display
      </div>
    );
  }

  return (
    <div className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] max-w-full rounded-xl border border-border/50 bg-card/90 overflow-hidden text-ui-xs shadow-xs font-mono select-text">
      <div className="max-h-72 overflow-y-auto overflow-x-auto p-1.5 scrollbar-thin">
        {lines.map((l, idx) => {
          const isAdd = l.type === 'add';
          const isDel = l.type === 'del';
          return (
            <div
              key={idx}
              className={cn(
                "flex items-start px-2 py-0.5 leading-relaxed transition-colors",
                isAdd && "bg-emerald-500/15 text-emerald-500 border-l-[3px] border-l-emerald-500",
                isDel && "bg-destructive/15 text-destructive border-l-[3px] border-l-destructive",
                !isAdd && !isDel && "text-muted-foreground border-l-[3px] border-l-transparent"
              )}
            >
              <span
                className={cn(
                  "w-8 text-right pr-3 select-none shrink-0 font-mono text-ui-xs",
                  isAdd && "text-emerald-500 font-semibold",
                  isDel && "text-destructive font-semibold",
                  !isAdd && !isDel && "text-muted-foreground/50"
                )}
              >
                {l.lineNum}
              </span>
              <span className="flex-1 whitespace-pre overflow-x-auto">
                {highlightCodeLine(l.text, ext) || ' '}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ToolWriteBlock({ content, ext }: { content: string; ext?: string }) {
  const lines = useMemo(() => (content || '').split('\n'), [content]);

  return (
    <div className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] max-w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 border-l-[3px] border-l-emerald-500 overflow-hidden text-ui-xs shadow-xs font-mono select-text">
      <div className="max-h-72 overflow-y-auto overflow-x-auto p-2 scrollbar-thin">
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-start px-2 py-0.5">
            <span className="w-8 text-right pr-3 text-emerald-500 select-none shrink-0 font-mono text-ui-xs font-semibold">
              {idx + 1}
            </span>
            <span className="flex-1 whitespace-pre overflow-x-auto text-foreground/90">
              {highlightCodeLine(line, ext) || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolReadBlock({ content, ext }: { content: string; ext?: string }) {
  const [showAll, setShowAll] = useState(false);
  const lines = useMemo(() => (content || '').split('\n'), [content]);
  const isLong = lines.length > 30;
  const visible = isLong && !showAll ? lines.slice(0, 25) : lines;

  return (
    <div className="mt-1.5 ml-6 overflow-hidden rounded-xl border border-border/50 bg-card/80 text-ui-xs font-mono select-text">
      <div className="max-h-72 overflow-y-auto p-2 scrollbar-thin">
        {visible.map((line, idx) => (
          <div key={idx} className="flex items-start px-2 py-0.5">
            <span className="w-8 select-none pr-3 text-right text-muted-foreground/50 text-2xs">{idx + 1}</span>
            <span className="flex-1 whitespace-pre overflow-x-auto text-foreground/90">{highlightCodeLine(line, ext) || ' '}</span>
          </div>
        ))}
        {isLong && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-surface/80 py-1 text-2xs text-muted-foreground hover:bg-surface hover:text-foreground cursor-pointer"
          >
            <span>{showAll ? 'Collapse lines' : `+${lines.length - 25} lines (expand)`}</span>
            <ChevronDown className={`size-3 transition-transform ${showAll ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ToolTerminalBlock({ command, output }: { command: string; output: string }) {
  const [showAll, setShowAll] = useState(false);
  const openFromUrl = useViewerStore((s) => s.openFromUrl);
  const lines = useMemo(() => (output || '').split('\n'), [output]);
  const isLong = lines.length > 30;
  const visible = isLong && !showAll ? lines.slice(0, 20) : lines;

  // Generated files referenced by the tool output become previewable cards
  // instead of raw JSON/markdown text.
  const generatedUrl = useMemo(() => {
    const shot = output?.match(/\/api\/(?:computer|browser)\/shots\/[^\s)"'<>\\]+/);
    if (shot) return shot[0];
    const file = output?.match(/\/api\/workspace\/(?:preview|download)\?path=[^\s)"'<>\\]+/);
    return file ? file[0] : '';
  }, [output]);
  const isImageFile = /\.(png|jpe?g|gif|webp|svg|bmp)(&|$|\?)/i.test(generatedUrl) || /\/shots\//.test(generatedUrl);

  return (
    <div className="mt-1.5 ml-6 max-h-80 overflow-y-auto rounded-xl border border-border/50 bg-card/90 p-3 font-mono text-ui-xs select-text scrollbar-thin">
      {generatedUrl && (
        <div className="mb-2 border-b border-border/40 pb-2">
          {isImageFile ? (
            <button
              type="button"
              onClick={() => openFromUrl(generatedUrl)}
              className="block overflow-hidden rounded-lg border border-border/60 bg-black/5"
              title="Open preview"
            >
              <img src={generatedUrl} alt="Generated file" loading="lazy" className="max-h-56 max-w-full object-contain" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openFromUrl(generatedUrl)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1 text-2xs font-sans font-medium text-foreground hover:bg-accent"
            >
              <ExternalLink className="size-3" /> Open generated file
            </button>
          )}
        </div>
      )}
      {command && command !== '{}' && (
        <div className="pb-1.5 font-semibold text-foreground whitespace-pre-wrap break-all">
          {highlightTerminalCommand(command)}
        </div>
      )}
      <div className="space-y-0.5">
        {visible.length === 0 || (visible.length === 1 && !visible[0]) ? (
          <span className="italic text-muted-foreground/60">(no output)</span>
        ) : (
          visible.map((line, idx) => (
            <div key={idx} className="min-h-[1.125rem] whitespace-pre-wrap break-words">
              {highlightTerminalLine(line) || ' '}
            </div>
          ))
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-surface/80 py-1 text-2xs text-muted-foreground hover:bg-surface hover:text-foreground cursor-pointer"
        >
          <span>{showAll ? 'Collapse output' : `+${lines.length - 20} lines (expand)`}</span>
          <ChevronDown className={`size-3 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

export function parseSkillToolData(tool: ToolExecution): { name: string; description: string; path: string; body: string } {
  let name = '';
  let description = '';
  let path = '';
  let body = '';

  if (tool.command) {
    const raw = tool.command.trim();
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        name = parsed.skill || parsed.name || '';
      } catch {}
    } else {
      name = raw.replace(/^(?:load_skill|skill)\s+/i, '').trim();
    }
  }

  const output = tool.output || '';
  if (output.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(output.trim());
      if (!name) name = parsed.name || parsed.skill || '';
      if (!description) description = parsed.description || '';
      if (!path) path = parsed.path || parsed.base_dir || '';
      if (!body) body = parsed.body || '';
    } catch {}
  }

  if (!body && output) {
    const instrMatch = output.match(/Instructions \(SKILL\.md\):\s*\n([\s\S]*)/i);
    if (instrMatch) body = instrMatch[1].trim();
    const nameMatch = output.match(/Skill\s+["']([^"']+)["']\s+loaded/i) || output.match(/Skill\s+([^\s]+)\s+loaded/i);
    if (nameMatch && !name) name = nameMatch[1];
    const descMatch = output.match(/Description:\s*([^\n]+)/i);
    if (descMatch && !description) description = descMatch[1].trim();
    if (!body && !instrMatch) body = output;
  }

  return { name: name || 'skill', description, path, body };
}

export function ToolSkillBlock({
  tool,
  isOpen = true,
  onToggle,
  workspacePath
}: {
  tool: ToolExecution;
  isOpen?: boolean;
  onToggle?: () => void;
  workspacePath?: string;
}) {
  const { name, description, path, body } = useMemo(() => parseSkillToolData(tool), [tool]);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lines = useMemo(() => (body || '').split('\n'), [body]);
  const displayPath = path ? (path.split('/').filter(Boolean).slice(-2).join('/') || 'SKILL.md') : 'SKILL.md';

  return (
    <div className="w-full max-w-full rounded-lg bg-card/60 border border-border/50 overflow-hidden select-text text-left my-1">
      <div
        onClick={onToggle}
        className={cn(
          "flex items-center justify-between px-3 py-2 select-none transition-colors",
          onToggle && "cursor-pointer hover:bg-accent/50",
          isOpen ? "border-b border-border/40" : "rounded-lg"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="text-ui-sm font-medium text-foreground truncate">
            {name}
          </span>
          <span className="truncate font-mono text-2xs text-muted-foreground shrink-0">
            {displayPath}
          </span>
          <span className="text-2xs text-muted-foreground/70 font-mono shrink-0 hidden sm:inline">
            ({lines.length} lines)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-ui-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-surface-hover cursor-pointer"
            title="Copy SKILL.md content"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-success" />
                <span className="text-success font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
          {onToggle && (
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                !isOpen && "-rotate-90"
              )}
            />
          )}
        </div>
      </div>

      {isOpen && (
        <>
          {description && (
            <div className="px-3.5 pt-2 text-ui-xs text-muted-foreground leading-normal">
              {description}
            </div>
          )}
          <div className="p-2.5">
            <pre className="m-0 max-h-72 overflow-y-auto overflow-x-auto rounded-md bg-chrome p-3 font-mono text-ui-xs text-foreground select-text">
              <code>{body || '(No instructions body in SKILL.md)'}</code>
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

export function ToolExecutionCard({
  tool,
  isOpen,
  onToggle,
  workspacePath
}: {
  tool: ToolExecution;
  isOpen: boolean;
  onToggle: () => void;
  workspacePath?: string;
}) {
  const nameLower = (tool.toolName || '').toLowerCase();
  const isFailed = tool.status === 'failed' || tool.status === 'error' || (tool.output || '').includes('<tool_use_error>');
  const isRunning = tool.status === 'running';

  const isBash = nameLower.includes('bash') || nameLower.includes('shell') || nameLower.includes('exec') || nameLower.includes('command') || nameLower.includes('terminal');
  const isEdit = nameLower.includes('edit');
  const isWrite = nameLower.includes('write') || nameLower.includes('create');
  const isRead = nameLower.includes('read') || nameLower.includes('view') || nameLower.includes('cat');
  const isPython = nameLower.includes('python');
  const isSkill = nameLower.includes('skill');

  const parsedArgs = useMemo(() => parseToolArgs(tool.command || '', tool.toolName || ''), [tool.command, tool.toolName]);

  let fullPath = parsedArgs.path || tool.diff?.filePath || '';
  if (workspacePath && fullPath.startsWith(workspacePath)) {
    fullPath = fullPath.slice(workspacePath.length).replace(/^\/+/, '');
  }
  fullPath = cleanArgPath(fullPath);
  const targetFile = fullPath ? (fullPath.split('/').filter(Boolean).pop() || fullPath) : '';

  let kind = 'Ran';
  let Icon = SquareTerminal;

  if (isSkill) {
    kind = 'Skill';
    Icon = Sparkles;
  } else if (isEdit) {
    kind = 'Edit';
    Icon = Pencil;
  } else if (isWrite) {
    kind = 'Write';
    Icon = Pencil;
  } else if (isRead) {
    kind = 'Read';
    Icon = Search;
  } else if (isPython) {
    kind = 'Python';
    Icon = Code2;
  } else if (isBash) {
    kind = 'Terminal';
    Icon = SquareTerminal;
  } else {
    kind = (tool.toolName || 'Tool').replace(/_/g, ' ');
    Icon = Wrench;
  }

  const diffStats = useMemo(() => {
    if (tool.diff && (tool.diff.additions || tool.diff.deletions)) {
      return { additions: tool.diff.additions || 0, deletions: tool.diff.deletions || 0 };
    }
    if (isWrite && parsedArgs.content) {
      return { additions: parsedArgs.content.split('\n').length, deletions: 0 };
    }
    if (isEdit && tool.output && tool.output.includes('@@')) {
      let add = 0;
      let del = 0;
      for (const l of tool.output.split('\n')) {
        if (l.startsWith('+') && !l.startsWith('+++')) add++;
        else if (l.startsWith('-') && !l.startsWith('---')) del++;
      }
      if (add > 0 || del > 0) return { additions: add, deletions: del };
    }
    return null;
  }, [tool.diff, isWrite, isEdit, parsedArgs.content, tool.output]);

  const readLinesCount = useMemo(() => {
    if (!isRead || !tool.output) return null;
    const parsed = parseReadOutput(tool.output);
    if (parsed.totalLines) return parsed.totalLines;
    if (parsed.content) return parsed.content.split('\n').length;
    return null;
  }, [isRead, tool.output]);

  const hasOutput = Boolean(isRunning || tool.output || tool.diff || parsedArgs.content || parsedArgs.cmd || tool.command);

  if (isSkill) {
    return (
      <div className="w-full max-w-full min-w-0">
        <ToolSkillBlock
          tool={tool}
          isOpen={isOpen}
          onToggle={hasOutput ? onToggle : undefined}
          workspacePath={workspacePath}
        />
      </div>
    );
  }

  const statusMapped: WorkLogStatus =
    tool.status === 'failed' || isFailed
      ? 'failed'
      : isRunning
        ? 'running'
        : 'completed';

  const labelNode = (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1.5 truncate', isRunning && 'font-medium text-primary live-tool-shine')}>
      <span className="shrink-0">{kind}</span>
      {targetFile ? (
        <span className="inline-flex min-w-0 max-w-[340px] items-center gap-1 truncate">
          <FileText className="size-3 shrink-0 opacity-70" />
          <span className="truncate font-mono text-ui-xs" title={fullPath}>
            {targetFile}
          </span>
        </span>
      ) : isBash ? (
        <span className="truncate font-mono text-ui-xs text-foreground/80">
          {(parsedArgs.cmd || tool.command || '').replace(/^bash\s+-c\s+/, '')}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-ui-xs" title={tool.command}>
          {parsedArgs.cmd || tool.command}
        </span>
      )}
    </div>
  );

  const trailingNode = (
    <div className="flex items-center gap-2 shrink-0">
      {readLinesCount !== null && (
        <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
          {readLinesCount} lines
        </span>
      )}
      {diffStats && (
        <span className="shrink-0 flex items-center gap-1 font-mono text-3xs tabular-nums leading-none">
          <span className="text-emerald-500">+{diffStats.additions}</span>
          <span className="text-destructive">-{diffStats.deletions}</span>
        </span>
      )}
      <WorkLogStatusGlyph status={statusMapped} durationMs={tool.durationMs} />
    </div>
  );

  return (
    <div className="w-full max-w-full min-w-0 my-0.5">
      <WorkLogRow
        icon={<Icon className="size-4 stroke-2" />}
        label={labelNode}
        trailing={trailingNode}
        defaultExpanded={isOpen}
      >
        {hasOutput && (
          <WorkLogDetails kind="panel">
            <ToolExecutionContent tool={tool} />
          </WorkLogDetails>
        )}
      </WorkLogRow>
    </div>
  );
}

export function ToolExecutionContent({ tool }: { tool: ToolExecution }) {
  const nameLower = (tool.toolName || '').toLowerCase();
  const isFailed = tool.status === 'failed' || tool.status === 'error' || (tool.output || '').includes('<tool_use_error>');
  const parsedArgs = useMemo(() => parseToolArgs(tool.command || '', tool.toolName || ''), [tool.command, tool.toolName]);

  const isRead = nameLower.includes('read') || nameLower.includes('view') || nameLower.includes('cat');
  const readInfo = useMemo(() => isRead && tool.output ? parseReadOutput(tool.output) : null, [isRead, tool.output]);
  const fullPath = parsedArgs.path || tool.diff?.filePath || readInfo?.filePath || '';
  let ext = fullPath ? (fullPath.split('.').pop() || '').toLowerCase() : '';

  if (isFailed) {
    return <ToolErrorBlock errorText={tool.output || 'Tool execution failed'} />;
  }

  const isEdit = nameLower.includes('edit');
  const hasUnifiedDiffText = (tool.output || '').includes('@@ -') && ((tool.output || '').includes('+++') || (tool.output || '').includes('---'));

  if (isEdit || (tool.diff && !nameLower.includes('write')) || hasUnifiedDiffText) {
    return (
      <ToolInlineDiffBlock
        diff={tool.diff}
        rawDiffText={hasUnifiedDiffText ? tool.output : undefined}
        oldStr={parsedArgs.oldString}
        newStr={parsedArgs.newString}
        ext={ext}
      />
    );
  }

  const isWrite = nameLower.includes('write') || nameLower.includes('create');
  if (isWrite) {
    const codeContent = parsedArgs.content || tool.diff?.modifiedContent || tool.output || '';
    return <ToolWriteBlock content={codeContent} ext={ext} />;
  }

  if (isRead && tool.output) {
    return <ToolReadBlock content={readInfo ? readInfo.content : tool.output} ext={ext} />;
  }

  const cmd = parsedArgs.cmd || tool.command || '';
  return <ToolTerminalBlock command={cmd} output={tool.output || ''} />;
}
