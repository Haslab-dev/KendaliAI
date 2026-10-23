import React, { useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';

interface MarkdownViewProps {
  content: string;
  isStreaming?: boolean;
  muted?: boolean;
  className?: string;
}

// Cleans raw internal model tags (e.g. DSML, <tool_call>, thinking leaks)
export function sanitizeMarkdown(raw: string): string {
  if (!raw) return '';
  let cleaned = raw;

  // Strip DSML reasoning blocks if leaked
  cleaned = cleaned.replace(/<｜(?:begin|end) of sentence｜>/g, '');
  cleaned = cleaned.replace(/<｜thought｜>[\s\S]*?<\/｜thought｜>/g, '');
  cleaned = cleaned.replace(/<｜thought｜>[\s\S]*/g, '');
  cleaned = cleaned.replace(/<｜DSML.*?｜>/g, '');

  // Strip DSML tool call blocks (double-bar: full-width ｜｜ or ASCII ||)
  cleaned = cleaned.replace(/<(?:\|\||｜｜)DSML(?:\|\||｜｜)\s*calls>[\s\S]*?<\/(?:\|\||｜｜)DSML(?:\|\||｜｜)\s*calls>/gi, '');
  cleaned = cleaned.replace(/<(?:\|\||｜｜)DSML(?:\|\||｜｜)[\s\S]*?<\/(?:\|\||｜｜)DSML(?:\|\||｜｜)[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?(?:\|\||｜｜)DSML(?:\|\||｜｜)[^>]*>/gi, '');

  // Strip raw tool_call XML tags if present
  cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
  cleaned = cleaned.replace(/<\/?tool_call>/g, '');

  return cleaned.trim();
}

// Configure marked with GFM (GitHub Flavored Markdown)
const markedOptions = {
  gfm: true,
  breaks: true,
};

function parseMarkdown(txt: string): string {
  try {
    const parsed = marked.parse(txt, markedOptions);
    return typeof parsed === 'string' ? parsed : '';
  } catch (err) {
    console.warn('Markdown parse error, falling back to plain text:', err);
    return txt;
  }
}

const FENCE_RE = /^\s{0,3}(```|~~~)/;

function isFenceLine(line: string): boolean {
  return FENCE_RE.test(line);
}

// Split text into blocks at boundaries that can never move as more text
// streams in: a blank line that is not inside a code fence. Everything before
// the final block is therefore stable, so it can be parsed and mounted once
// and left alone — only the tail block is re-parsed on each streaming update.
// This turns per-update work from O(whole message) into O(tail block).
function splitStableBlocks(text: string): string[] {
  if (!text) return [];
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;

  for (const line of text.split('\n')) {
    if (isFenceLine(line)) {
      inFence = !inFence;
    }
    cur.push(line);
    if (!inFence && line.trim() === '') {
      blocks.push(cur.join('\n'));
      cur = [];
    }
  }
  if (cur.length > 0) {
    blocks.push(cur.join('\n'));
  }
  return blocks.filter((b) => b.trim() !== '');
}

// Attach copy buttons + language banners to code blocks and harden links.
// Extracted so each block instance maintains only its own DOM.
function enhanceMarkdownContainer(el: HTMLDivElement | null) {
  if (!el) return;

  const preBlocks = el.querySelectorAll('pre');
  preBlocks.forEach((pre) => {
    if (pre.getAttribute('data-has-header')) return;
    pre.setAttribute('data-has-header', 'true');

    const codeEl = pre.querySelector('code');
    const className = codeEl?.getAttribute('class') || '';
    const matchLang = className.match(/language-(\w+)/);
    const language = matchLang ? matchLang[1] : '';

    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-lg border border-border bg-[#0D1117] text-[#E6EDF3] overflow-hidden my-3 shadow-sm';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between px-3.5 py-1.5 bg-[#161B22] border-b border-[#30363D] text-[#8B949E] font-mono text-[11px] select-none';

    const langSpan = document.createElement('span');
    langSpan.innerText = language || 'code';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'flex items-center gap-1 hover:text-[#FFFFFF] transition-colors cursor-pointer text-[11px] font-sans text-[#8B949E]';
    copyBtn.innerHTML = '<span>Copy</span>';

    copyBtn.onclick = () => {
      const textToCopy = codeEl ? codeEl.innerText : pre.innerText;
      navigator.clipboard.writeText(textToCopy);
      copyBtn.innerHTML = '<span class="text-emerald-400 font-semibold">Copied!</span>';
      setTimeout(() => {
        copyBtn.innerHTML = '<span>Copy</span>';
      }, 2000);
    };

    header.appendChild(langSpan);
    header.appendChild(copyBtn);

    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    pre.className = 'p-3 font-mono text-[#F0F6FC] overflow-x-auto leading-relaxed m-0 bg-transparent text-[length:var(--font-size-code,13px)]';
    pre.style.fontSize = 'var(--font-size-code, 13px)';
    if (codeEl) codeEl.style.fontSize = 'var(--font-size-code, 13px)';
    wrapper.appendChild(pre);
  });

  const links = el.querySelectorAll('a');
  links.forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.className = 'text-blue-500 hover:text-blue-400 underline underline-offset-2 font-medium';
  });
}

// One stable markdown block. Memoized on its source text: once a block's text
// stops changing (which is guaranteed for non-tail blocks), neither the parse
// nor the DOM is touched again.
const MarkdownBlock = React.memo<{ md: string }>(({ md }) => {
  const html = useMemo(() => parseMarkdown(md), [md]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    enhanceMarkdownContainer(ref.current);
  }, [html]);

  return (
    <div
      ref={ref}
      className="font-sans text-hi break-words select-text text-[length:var(--font-size-interface,15px)] leading-relaxed"
      style={{ fontSize: 'var(--font-size-interface, 15px)' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
MarkdownBlock.displayName = 'MarkdownBlock';

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, isStreaming = false, muted = false, className = '' }) => {
  const blocks = useMemo(() => splitStableBlocks(sanitizeMarkdown(content)), [content]);

  return (
    <div className={`markdown-content break-words select-text ${muted ? 'text-muted-foreground/90' : ''} ${className}`}>
      {blocks.map((block, i) => {
        const isTail = i === blocks.length - 1;
        let md = block;
        // While streaming, temporarily close an unclosed code fence in the
        // tail so partial code renders as a code block instead of text.
        if (isStreaming && isTail) {
          let fences = 0;
          for (const line of md.split('\n')) {
            if (isFenceLine(line)) fences++;
          }
          if (fences % 2 !== 0) {
            md = md + '\n```';
          }
        }
        return <MarkdownBlock key={i} md={md} />;
      })}
    </div>
  );
};
