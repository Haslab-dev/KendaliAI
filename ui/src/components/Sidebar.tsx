import React, { useState, useMemo } from 'react';
import { Plus, ChevronDown, MessageSquare, Trash2, Search, Smartphone } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';

export const Sidebar: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    selectSession,
    createSession,
    deleteSession,
    activeAgent,
    agents,
    setActiveAgent,
  } = useAppStore();

  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');

  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessions;
    const q = sessionSearch.toLowerCase().trim();
    return sessions.filter((s) => (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }, [sessions, sessionSearch]);

  const pinnedSessions = filteredSessions.filter((s) => s.pinned);
  const otherSessions = filteredSessions.filter((s) => !s.pinned);

  return (
    <aside className="w-[260px] bg-[#171717] dark:bg-[#171717] light:bg-[#f7f7f8] border-r border-[#262626] flex flex-col p-3 select-none flex-shrink-0">
      {/* Agent Selector Dropdown */}
      <div className="relative mb-2">
        <div
          onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
          className="flex items-center justify-between px-3 py-2 bg-[#212121] hover:bg-[#2a2a2a] border border-[#262626] rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-base">{activeAgent?.avatar || '🤖'}</span>
            <span className="text-sm font-medium text-neutral-200 truncate">
              {activeAgent?.name || 'Personal Assistant'}
            </span>
          </div>
          <ChevronDown size={14} className="text-neutral-400 flex-shrink-0" />
        </div>

        {isAgentMenuOpen && (
          <div className="absolute top-12 left-0 w-full bg-[#212121] border border-[#333333] rounded-xl shadow-2xl py-1 z-50 animate-in fade-in duration-100">
            {agents.map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  setActiveAgent(a);
                  setIsAgentMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-[#2a2a2a] transition-colors ${
                  activeAgent?.id === a.id ? 'text-blue-400 font-semibold bg-[#262626]/50' : 'text-neutral-300'
                }`}
              >
                <span>{a.avatar || '🤖'}</span>
                <div className="truncate flex-1">{a.name}</div>
                {a.model && <span className="text-[10px] text-neutral-500 font-mono">{a.model}</span>}
              </div>
            ))}
            <div
              onClick={() => {
                setIsAgentMenuOpen(false);
                navigate('agents');
              }}
              className="border-t border-[#333333] px-3 py-2 text-xs text-blue-400 hover:bg-[#2a2a2a] cursor-pointer font-sans"
            >
              ⚙️ Manage Agent Personas...
            </div>
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <button
        onClick={() => createSession()}
        className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#212121] hover:bg-[#2a2a2a] border border-[#262626] hover:border-neutral-500 text-neutral-200 text-sm font-medium rounded-xl transition-all mb-2 shadow-sm"
      >
        <Plus size={16} />
        <span>New chat</span>
      </button>

      {/* Search Filter for Chat History */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#1b1b1b] border border-[#262626] rounded-lg mb-2 text-xs">
        <Search size={12} className="text-neutral-500 flex-shrink-0" />
        <input
          type="text"
          value={sessionSearch}
          onChange={(e) => setSessionSearch(e.target.value)}
          placeholder="Filter history..."
          className="bg-transparent text-neutral-200 placeholder-neutral-500 outline-none w-full text-xs"
        />
        {sessionSearch && (
          <button onClick={() => setSessionSearch('')} className="text-neutral-500 hover:text-neutral-300 text-[10px]">
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Chat List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {/* Chats Section Header */}
        <div className="flex items-center justify-between text-neutral-400 text-[11px] font-semibold tracking-wider uppercase px-2 py-1">
          <span>Conversations ({filteredSessions.length})</span>
          <button
            onClick={() => createSession()}
            className="text-neutral-400 hover:text-white"
            title="Create chat"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Pinned Group */}
        {pinnedSessions.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-neutral-500 uppercase px-2 py-1">
              Pinned
            </div>
            {pinnedSessions.map((s) => (
              <ChatItem
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onSelect={() => selectSession(s.id)}
                onDelete={() => deleteSession(s.id)}
              />
            ))}
          </div>
        )}

        {/* Recent Chats */}
        <div>
          {pinnedSessions.length > 0 && otherSessions.length > 0 && (
            <div className="text-[10px] font-semibold text-neutral-500 uppercase px-2 py-1 mt-1">
              Recent
            </div>
          )}
          {otherSessions.map((s) => (
            <ChatItem
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              onSelect={() => selectSession(s.id)}
              onDelete={() => deleteSession(s.id)}
            />
          ))}
          {filteredSessions.length === 0 && (
            <div className="px-2 py-6 text-xs text-neutral-500 text-center">
              {sessionSearch ? `No matches for "${sessionSearch}"` : 'No conversations yet'}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

interface ChatItemProps {
  session: any;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const ChatItem: React.FC<ChatItemProps> = ({ session, isActive, onSelect, onDelete }) => {
  const isTelegram = session.channelId === 'telegram' || session.id?.startsWith('tg-');

  // Extract bot name or topic badge
  let botBadge = 'Telegram';
  if (session.metadata) {
    try {
      const meta = JSON.parse(session.metadata);
      if (meta.topicName) botBadge = `#${meta.topicName}`;
      else if (meta.botName) botBadge = `@${meta.botName}`;
    } catch {}
  } else if (session.id?.includes('-topic-')) {
    botBadge = 'Topic';
  } else if (session.id?.startsWith('tg-')) {
    const parts = session.id.replace('tg-', '').split('-');
    if (parts[0]) botBadge = `@${parts[0]}`;
  }

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
        isActive
          ? 'bg-[#252525] text-white font-semibold shadow-sm border border-[#333333]'
          : 'text-neutral-400 hover:bg-[#212121]/80 hover:text-neutral-200 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 truncate flex-1 min-w-0">
        <span className="flex-shrink-0">
          {isTelegram ? (
            <Smartphone size={13} className="text-sky-400" />
          ) : (
            <MessageSquare size={13} className="text-neutral-500" />
          )}
        </span>
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          <span className="truncate">{session.title || 'Untitled Session'}</span>
          {isTelegram && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-800/60 rounded-md font-mono">
              {botBadge}
            </span>
          )}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity ml-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-neutral-500 hover:text-red-400 p-1 rounded transition-colors"
          title="Delete chat"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};
