import React, { useState } from 'react';
import { Renderer } from '@openuidev/react-lang';
import type { OpenUIError } from '@openuidev/react-lang';
import { AlertTriangle } from 'lucide-react';
import { opuiLibrary, handleOpenUIAction } from './opuiLibrary';
import { sendSocketMessage } from '../../hooks/useAgentSocket';
import { useAgentStore } from '../../store/useAgentStore';
import { fillComposer } from '../../lib/composerEvents';

interface OpenUIBlockProps {
  code: string;
  streaming?: boolean;
}

/** Renders one ```opui fenced block with the OpenUI Lang runtime. Falls back
 * to a plain code block when the finished program has unrecoverable parse
 * errors, so a bad generation never hides the model's output. */
export const OpenUIBlock: React.FC<OpenUIBlockProps> = ({ code, streaming = false }) => {
  const [failed, setFailed] = useState<OpenUIError[] | null>(null);

  if (failed && failed.length > 0 && !streaming) {
    return (
      <div className="my-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wide text-amber-500">
          <AlertTriangle className="size-3" />
          <span>OpenUI block could not be rendered</span>
        </div>
        <pre className="overflow-x-auto font-mono text-3xs text-muted-foreground">{code}</pre>
      </div>
    );
  }

  const sendPrompt = (text: string) => {
    const agent = useAgentStore.getState();
    if (agent.activeAgentSessionId) {
      void agent.sendPrompt(text);
    } else {
      void sendSocketMessage(text);
    }
  };

  return (
    // Always a white surface (both light and dark mode) so generated UI reads
    // clearly; the token overrides live in index.css `.opui-surface`.
    <div className="opui-surface my-2 select-text">
      <Renderer
        response={code}
        library={opuiLibrary}
        isStreaming={streaming}
        onAction={(event) => handleOpenUIAction(event, sendPrompt, fillComposer)}
        onError={(errors) => setFailed(errors)}
      />
    </div>
  );
};

export default OpenUIBlock;
