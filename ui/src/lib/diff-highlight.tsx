import React from 'react';

/**
 * Lightweight per-line syntax tinting for diff viewers and tool blocks.
 * Keywords violet, strings orange, numbers sky, comments muted.
 */

const CLIKE_KEYWORDS = new Set(
  (
    'const let var function return if else for while do import from export default class extends new await async ' +
    'interface type enum implements public private protected static readonly package func struct map chan go defer ' +
    'switch case break continue try catch finally throw typeof instanceof in of this super null undefined nil true false ' +
    'string int int64 bool float float64 byte rune error any uintptr select range defer goto fallthrough'
  )
    .split(' ')
    .filter(Boolean)
);

const HASH_KEYWORDS = new Set(
  'def class return if elif else for while import from as with try except finally raise lambda pass break continue and or not in is None True False self echo then fi esac do done function local export'.split(
    ' '
  )
);

const COLOR = {
  comment: 'text-foreground-subtle/70 italic',
  string: 'text-amber-400 dark:text-orange-300',
  number: 'text-sky-500 dark:text-sky-300',
  keyword: 'text-indigo-500 dark:text-violet-400 font-medium',
  prop: 'text-sky-600 dark:text-sky-300/90',
};

function pushText(out: React.ReactNode[], text: string) {
  if (text) out.push(<span key={out.length}>{text}</span>);
}

function pushTok(out: React.ReactNode[], text: string, cls: string) {
  if (text)
    out.push(
      <span key={out.length} className={cls}>
        {text}
      </span>
    );
}

function scan(text: string, re: RegExp): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    pushText(out, text.slice(last, m.index));
    const [full, comment, str, num, kw] = m;
    if (comment) pushTok(out, full, COLOR.comment);
    else if (str) pushTok(out, full, COLOR.string);
    else if (num) pushTok(out, full, COLOR.number);
    else if (kw) pushTok(out, full, COLOR.keyword);
    else pushText(out, full);
    last = m.index + full.length;
    if (full.length === 0) re.lastIndex++;
  }
  pushText(out, text.slice(last));
  return out;
}

export function highlightCodeLine(text: string, filename?: string): React.ReactNode {
  if (!text) return text;
  const ext = filename ? filename.split('.').pop()?.toLowerCase() : '';

  if (ext === 'py' || ext === 'sh' || ext === 'bash' || ext === 'rb' || ext === 'yml' || ext === 'yaml') {
    const kw = Array.from(HASH_KEYWORDS).join('|');
    return (
      <>
        {scan(
          text,
          new RegExp(
            `(#.*$)|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')|\\b(\\d+(?:\\.\\d+)?)\\b|\\b(${kw})\\b`,
            'g'
          )
        )}
      </>
    );
  }

  const kw = Array.from(CLIKE_KEYWORDS).join('|');
  return (
    <>
      {scan(
        text,
        new RegExp(
          `(\\/\\/.*$|#.*$|\\/\\*.*?(?:\\*\\/|$))|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|\\b(\\d+(?:\\.\\d+)?)\\b|\\b(${kw})\\b`,
          'g'
        )
      )}
    </>
  );
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: 'text-black dark:text-zinc-400',
  31: 'text-destructive',
  32: 'text-success',
  33: 'text-warning',
  34: 'text-sky-400',
  35: 'text-purple-400',
  36: 'text-cyan-400',
  37: 'text-zinc-100',
  90: 'text-zinc-500',
  91: 'text-red-400',
  92: 'text-emerald-400',
  93: 'text-yellow-300',
  94: 'text-blue-400',
  95: 'text-purple-300',
  96: 'text-cyan-300',
  97: 'text-white',
};

function renderAnsiLine(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const currentClasses = new Set<string>();

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      const cls = Array.from(currentClasses).join(' ');
      parts.push(
        cls ? (
          <span key={parts.length} className={cls}>
            {chunk}
          </span>
        ) : (
          <span key={parts.length}>{chunk}</span>
        )
      );
    }

    const codeStr = match[1] || '0';
    const codes = codeStr.split(';').map((c) => parseInt(c, 10) || 0);

    for (const code of codes) {
      if (code === 0) {
        currentClasses.clear();
      } else if (code === 1) {
        currentClasses.add('font-bold');
      } else if (code === 2) {
        currentClasses.add('opacity-70');
      } else if (code === 3) {
        currentClasses.add('italic');
      } else if (code === 4) {
        currentClasses.add('underline');
      } else if (ANSI_COLOR_MAP[code]) {
        for (const c of Array.from(currentClasses)) {
          if (c.startsWith('text-')) currentClasses.delete(c);
        }
        currentClasses.add(ANSI_COLOR_MAP[code]);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    const cls = Array.from(currentClasses).join(' ');
    parts.push(
      cls ? (
        <span key={parts.length} className={cls}>
          {chunk}
        </span>
      ) : (
        <span key={parts.length}>{chunk}</span>
      )
    );
  }

  return parts;
}

export function highlightTerminalLine(text: string): React.ReactNode {
  if (!text) return text;

  if (/\x1b\[[0-9;]*m/.test(text)) {
    return <>{renderAnsiLine(text)}</>;
  }

  const re =
    /(https?:\/\/[^\s]+|(?:\/[\w.-]+)+\b|(?:\.\.?\/[\w.-]+)+(?::\d+(?::\d+)?)?)|(\b(?:ERROR|FATAL|FAIL|FAILED|FAILURE|Exception|Err!|error)\b)|(\b(?:WARN|WARNING|WARN!|warning|caution)\b)|(\b(?:SUCCESS|PASSED|PASS|Done|done|compiled)\b|[✓✔])|(--?[a-zA-Z0-9_-]+(?:=[^\s]+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?(?:ms|s|m|h|b|kb|mb|gb|%)?\b)/g;

  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<span key={out.length}>{text.slice(last, m.index)}</span>);
    }
    const [full, urlOrPath, err, warn, succ, flag, str, num] = m;
    if (err) {
      pushTok(out, full, 'text-destructive font-semibold');
    } else if (warn) {
      pushTok(out, full, 'text-warning font-semibold');
    } else if (succ) {
      pushTok(out, full, 'text-success font-semibold');
    } else if (urlOrPath) {
      pushTok(out, full, 'text-sky-400 underline underline-offset-2 decoration-sky-400/40');
    } else if (flag) {
      pushTok(out, full, 'text-violet-400 font-medium');
    } else if (str) {
      pushTok(out, full, COLOR.string);
    } else if (num) {
      pushTok(out, full, COLOR.number);
    } else {
      pushText(out, full);
    }
    last = m.index + full.length;
  }

  if (last < text.length) {
    out.push(<span key={out.length}>{text.slice(last)}</span>);
  }

  return out.length > 0 ? <>{out}</> : text;
}

export function highlightTerminalCommand(cmd: string): React.ReactNode {
  if (!cmd) return '';
  const trimmed = cmd.trim();
  const cleanCmd = trimmed.startsWith('$ ') ? trimmed.slice(2) : trimmed;

  const parts = cleanCmd.split(/(\s+)/);
  let isFirstToken = true;

  return (
    <>
      <span className="mr-1.5 select-none font-bold text-foreground-subtle">$</span>
      {parts.map((p, idx) => {
        if (!p) return null;
        if (/^\s+$/.test(p)) return <span key={idx}>{p}</span>;

        if (isFirstToken) {
          isFirstToken = false;
          return (
            <span key={idx} className="font-semibold text-foreground">
              {p}
            </span>
          );
        }

        if (p.startsWith('-')) {
          return (
            <span key={idx} className="font-medium text-violet-400">
              {p}
            </span>
          );
        }

        if (p.startsWith('"') || p.startsWith("'")) {
          return (
            <span key={idx} className="text-orange-400 dark:text-orange-300">
              {p}
            </span>
          );
        }

        if (p.includes('/') || p.includes('.')) {
          return (
            <span key={idx} className="text-sky-400">
              {p}
            </span>
          );
        }

        return (
          <span key={idx} className="text-muted-foreground">
            {p}
          </span>
        );
      })}
    </>
  );
}
