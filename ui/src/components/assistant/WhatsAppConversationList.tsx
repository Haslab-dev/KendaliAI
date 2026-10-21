import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Plus,
  Search,
  Users,
  Check,
  CheckCheck,
  Circle,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Session, isAgentTaskSession } from '../../types';
import { relativeTime } from '../../lib/time';
import { navigateSettings } from '../../router';
import { GrokAvatar } from '../GrokAvatar';
import { TelegramIcon } from './AssistantIcons';

interface WhatsAppConversationListProps {
  onOpenTelegramModal: () => void;
}

type FilterTab = 'all' | 'direct' | 'telegram' | 'groups';

export const WhatsAppConversationList: React.FC<WhatsAppConversationListProps> = ({ onOpenTelegramModal }) => {
  const {
    sessions,
    agents,
    activeSessionId,
    selectSession,
    createGeneralChat,
    telegramAgents,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Filter only assistant chats (exclude agent tasks)
  const chatSessions = useMemo(() => {
    return sessions
      .filter((s) => !isAgentTaskSession(s) && !s.id.startsWith('subtask_'))
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return chatSessions.filter((s) => {
      if (searchQuery.trim() && !s.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      const isTg = s.channelId?.includes('telegram') || s.type === 'direct' && s.id.includes('tg_');
      if (filterTab === 'telegram' && !isTg) return false;
      if (filterTab === 'groups' && s.type !== 'group') return false;
      if (filterTab === 'direct' && s.type === 'group') return false;
      return true;
    });
  }, [chatSessions, searchQuery, filterTab]);

  const handleNewChat = async () => {
    await createGeneralChat('New Conversation');
  };

  const isAnyTgConnected = Object.values(telegramAgents || {}).some((a) => a.connected);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-sidebar/70 backdrop-blur-md">
      {/* WhatsApp Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-chrome px-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
            <MessageSquare className="size-4.5" />
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          <div>
            <h1 className="text-ui-base font-bold text-foreground">Chats</h1>
            <span className="text-2xs text-muted-foreground">{chatSessions.length} conversations</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Telegram Connect Pill */}
          <button
            onClick={onOpenTelegramModal}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors ${
              isAnyTgConnected
                ? 'bg-sky-500/15 text-sky-500 hover:bg-sky-500/25'
                : 'border border-border/70 text-muted-foreground hover:bg-surface-hover hover:text-foreground'
            }`}
            title="Configure Telegram Bot"
          >
            <TelegramIcon size={14} className="shrink-0" />
            <span>Telegram</span>
            <span
              className={`size-1.5 rounded-full ${isAnyTgConnected ? 'bg-sky-400 animate-pulse' : 'bg-muted-foreground/40'}`}
            />
          </button>

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="flex size-8 items-center justify-center rounded-full text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            title="New Conversation"
          >
            <Plus className="size-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => navigateSettings('general')}
            className="flex size-8 items-center justify-center rounded-full text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            title="Settings (⌘,)"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </div>

      {/* WhatsApp Search Bar */}
      <div className="p-2.5 border-b border-border/50 bg-background/50">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="h-8 w-full rounded-lg border border-border/60 bg-card pl-8 pr-3 text-ui-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
        </div>

        {/* Filter Pills */}
        <div className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {(['all', 'direct', 'telegram', 'groups'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`rounded-full px-2.5 py-0.5 text-2xs font-medium capitalize transition-colors ${
                filterTab === tab
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {tab === 'all' ? 'All' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Chat List Items (WhatsApp Style) */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/20 select-none">
        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center text-ui-xs text-muted-foreground">
            No chats found
          </div>
        ) : (
          filteredSessions.map((sess) => {
            const isSelected = sess.id === activeSessionId;
            const isTelegram = sess.channelId?.includes('telegram') || sess.id.includes('tg_');
            const isGroup = sess.type === 'group';

            return (
              <div
                key={sess.id}
                onClick={() => selectSession(sess.id)}
                className={`group flex cursor-pointer items-center gap-3 px-3.5 py-3 transition-colors ${
                  isSelected ? 'bg-primary/10' : 'hover:bg-surface-hover'
                }`}
              >
                {/* Round Avatar */}
                <div className="relative shrink-0">
                  {isGroup ? (
                    <div className="flex size-11 items-center justify-center rounded-full bg-purple-500/15 text-purple-500 text-ui-sm font-semibold">
                      <Users className="size-5" />
                    </div>
                  ) : (
                    <div className="flex size-11 items-center justify-center">
                      <GrokAvatar
                        id={
                          agents.find((a) => a.id === sess.agentId)?.avatar ||
                          agents.find((a) => sess.title.toLowerCase().includes(a.name.toLowerCase()))?.avatar ||
                          sess.agentId ||
                          'purple-pebble'
                        }
                        size={40}
                      />
                    </div>
                  )}
                  {/* Status Indicator */}
                  <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500" />
                  {isTelegram && (
                    <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-sky-500 text-white shadow-xs">
                      <TelegramIcon size={10} />
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3
                      className={`truncate text-ui-sm ${
                        isSelected ? 'font-bold text-foreground' : 'font-medium text-foreground'
                      }`}
                    >
                      {sess.title || 'Untitled Conversation'}
                    </h3>
                    <span className="text-2xs text-muted-foreground/80 shrink-0 ml-1">
                      {relativeTime(sess.updatedAt || sess.createdAt)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-1 text-ui-xs text-muted-foreground">
                    <div className="flex items-center gap-1 truncate">
                      <CheckCheck className="size-3.5 shrink-0 text-sky-400" />
                      <span className="truncate">
                        {sess.summary || sess.lastMessage?.content || 'Tap to chat with assistant...'}
                      </span>
                    </div>

                    {isTelegram && (
                      <span className="rounded bg-sky-500/15 px-1 py-0.2 text-3xs font-semibold text-sky-500">
                        TG
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
