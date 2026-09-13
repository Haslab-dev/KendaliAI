import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Copy, Check } from 'lucide-react';

interface MarkdownViewProps {
  content: string;
  isStreaming?: boolean;
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

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, isStreaming = false }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // If streaming and text has an unclosed code block, temporarily close it for rendering
  const processedText = useMemo(() => {
    let txt = sanitizeMarkdown(content);
    if (isStreaming) {
      const codeFences = (txt.match(/```/g) || []).length;
      if (codeFences % 2 !== 0) {
        txt = txt + '\n```';
      }
    }
    return txt;
  }, [content, isStreaming]);

  // Parse markdown into HTML string
  const htmlContent = useMemo(() => {
    try {
      const parsed = marked.parse(processedText, markedOptions);
      return typeof parsed === 'string' ? parsed : '';
    } catch (err) {
      console.warn('Markdown parse error, falling back to plain text:', err);
      return processedText;
    }
  }, [processedText]);

  // Handle click to copy code block buttons attached to <pre> containers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Enhance all <pre><code> blocks with copy buttons and language banners if not already added
    const preBlocks = el.querySelectorAll('pre');
    preBlocks.forEach((pre, index) => {
      if (pre.getAttribute('data-has-header')) return;
      pre.setAttribute('data-has-header', 'true');

      const codeEl = pre.querySelector('code');
      const className = codeEl?.getAttribute('class') || '';
      const matchLang = className.match(/language-(\w+)/);
      const language = matchLang ? matchLang[1] : '';

      const wrapper = document.createElement('div');
      wrapper.className = 'rounded-lg border border-line bg-[#0D1117] text-[#E6EDF3] overflow-hidden my-3 text-xs shadow-sm';

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
      pre.className = 'p-3 font-mono text-[#F0F6FC] overflow-x-auto text-[12px] leading-relaxed m-0 bg-transparent';
      wrapper.appendChild(pre);
    });

    // Make external links open in a new tab safely
    const links = el.querySelectorAll('a');
    links.forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.className = 'text-blue-500 hover:text-blue-400 underline underline-offset-2 font-medium';
    });
  }, [htmlContent]);

  return (
    <div
      ref={containerRef}
      className="markdown-content text-[13px]/[22px] font-sans text-hi break-words select-text"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};
