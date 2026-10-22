import React, { useState } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import {
  AlertTriangle,
  Lightbulb,
  Plus,
  ArrowUp,
  ChevronDown,
  Bot,
  Sparkles,
} from 'lucide-react';

export const ChatHome: React.FC = () => {
  const { agents, activeAgent, selectAgent, setActiveNavTab } = useProfileStore();
  const { createSessionForAgent, sendMessage } = useSessionStore();
  const { providers, availableModels, defaultModel } = useAppStore();

  const [input, setInput] = useState('');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Hi, good morning!';
    if (hour < 18) return 'Hi, good afternoon!';
    return 'Hi, good evening!';
  };

  const hasConfiguredProvider = providers.some((p) => p.enabled && p.apiKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeAgent) return;

    const text = input.trim();
    setInput('');
    const newSessionId = await createSessionForAgent(activeAgent.id, text.slice(0, 32));
    await sendMessage(text, { agentId: activeAgent.id });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const activeModel = activeAgent?.model || defaultModel || 'Auto';

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center px-4 relative overflow-y-auto">
      <div className="w-full max-w-2xl flex flex-col items-center text-center space-y-6 -mt-12">
        {/* Greeting Header */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {getGreeting()}
          </h1>

          {/* Select Agent Dropdown */}
          <div className="relative inline-block text-left">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Select agent</span>
              <button
                type="button"
                onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/60 hover:bg-muted border border-border text-foreground font-medium text-xs transition-colors shadow-xs"
              >
                <span className="text-sm">{activeAgent?.avatar?.slice(0, 2) || '🤖'}</span>
                <span>{activeAgent?.name || 'Default Bot'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Dropdown Menu */}
            {agentDropdownOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl bg-popover border border-border shadow-2xl py-1.5 z-50 animate-in fade-in-50"
                onClick={() => setAgentDropdownOpen(false)}
              >
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => selectAgent(agent.id)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-muted transition-colors ${
                      activeAgent?.id === agent.id ? 'bg-muted/80 font-semibold text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="text-base">{agent.avatar?.slice(0, 2) || '🤖'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{agent.name}</p>
                      {agent.role && <p className="text-[10px] text-muted-foreground">{agent.role}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Warning Banner if No Provider */}
        {!hasConfiguredProvider && (
          <div className="w-full rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-left flex items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-500">
                  One more step to start chatting
                </p>
                <p className="text-xs text-muted-foreground">
                  Connect an AI service so Kendali can respond to your messages.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveNavTab('settings')}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs shrink-0 transition-colors shadow-xs"
            >
              Set up AI
            </button>
          </div>
        )}

        {/* Tip Banner */}
        <div className="w-full rounded-xl bg-muted/20 border border-border/50 px-4 py-2.5 flex items-center gap-2.5 text-xs text-muted-foreground text-left">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Use the Super Kendali profile to create your own agents and custom tools.</span>
        </div>

        {/* Floating Composer */}
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-2xl bg-[#141418] border border-border/60 hover:border-border focus-within:border-primary/60 transition-colors shadow-xl p-3 flex flex-col gap-2 text-left"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Do anything..."
            rows={2}
            className="w-full bg-transparent border-0 resize-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none p-1"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                title="Add attachment"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Status/Model Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    hasConfiguredProvider ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{hasConfiguredProvider ? activeModel : 'Offline'}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!input.trim()}
              className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-white flex items-center justify-center transition-all shadow-md shadow-primary/20"
              title="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
