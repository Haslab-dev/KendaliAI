import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  muted?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '', muted = false }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopyCode = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  // Convert markdown to HTML via marked safely
  const html = React.useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content, { breaks: true, gfm: true }) as string;
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className={`prose dark:prose-invert max-w-none text-ui-sm leading-relaxed ${
        muted ? 'text-muted-foreground/90' : 'text-foreground'
      } ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
