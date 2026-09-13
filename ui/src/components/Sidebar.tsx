import React, { useState, useMemo } from 'react';
import { Plus, Search, X, Pin, Trash2, ChevronRight, MessageSquare } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';

export const Sidebar: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    selectSession,
    createSession,
    deleteSession,
    agents,
  } = useAppStore();

  const [sessionSearch, setSessionSearch] = useState('');

  // Agent lookup map for tags
  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    (agents || []).forEach((a) => map.set(a.id, a.name));
    return map;
  }, [agents]);

  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessions;
    const q = sessionSearch.toLowerCase().trim();
    return sessions.filter(
      (s) => (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [sessions, sessionSearch]);

  const handleSelect = async (sessionId: string) => {
    await selectSession(sessionId);
    navigate('chat');
  };

  return (
    <aside
      data-pencil-name="Sidebar"
      className="box-border w-[250px] shrink-0 h-full flex flex-col gap-[14px] p-[16px_14px] justify-start items-start bg-[#FFFFFF] border-r border-[#E5E7EB] dark:bg-[#141414] dark:border-[#27272A] select-none"
    >
      {/* New Chat Button */}
      <button
        onClick={async () => {
          await createSession();
          navigate('chat');
        }}
        data-pencil-name="New Chat Button"
        className="box-border w-full h-[38px] shrink-0 flex flex-row gap-[8px] justify-center items-center bg-[#0F0F0F] hover:bg-black/85 text-white dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-[8px] transition-colors cursor-pointer shadow-sm"
      >
        <Plus size={15} strokeWidth={2.2} />
        <span className="text-[13px] font-sans font-bold whitespace-nowrap">
          New Chat
        </span>
      </button>

      {/* Search Filter Input */}
      <div
        data-pencil-name="Search"
        className="box-border w-full h-[34px] shrink-0 flex flex-row gap-[8px] px-[10px] justify-start items-center bg-[#F7F7F5] dark:bg-[#1C1C1E] border border-[#E5E7EB] dark:border-[#2C2C2E] rounded-[4px]"
      >
        <Search size={14} className="text-[#8A8A85] shrink-0" />
        <input
          type="text"
          value={sessionSearch}
          onChange={(e) => setSessionSearch(e.target.value)}
          placeholder="Search conversations..."
          className="text-[12px] bg-transparent text-[#000000] dark:text-white placeholder:text-[#8A8A85] font-sans font-normal outline-none w-full"
        />
        {sessionSearch && (
          <button
            onClick={() => setSessionSearch('')}
            className="text-[#8A8A85] hover:text-black dark:hover:text-white"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Sessions Container */}
      <div
        data-pencil-name="Sessions"
        className="box-border w-full flex-1 flex flex-col gap-[4px] justify-start items-start overflow-y-auto custom-scrollbar pr-0.5"
      >
        {filteredSessions.length === 0 ? (
          <div className="w-full text-center py-8 text-[12px] text-[#8A8A85] font-funnel">
            No conversations found
          </div>
        ) : (
          filteredSessions.map((s, idx) => {
            const isActive = s.id === activeSessionId;
            const agentName = s.agentId ? agentMap.get(s.agentId) || 'Hermes' : (idx % 2 === 0 ? 'Coder' : 'Planner');
            const isPinned = s.pinned || idx === 0;

            return (
              <div
                key={s.id}
                onClick={() => handleSelect(s.id)}
                className={`group box-border w-full h-fit shrink-0 flex flex-col gap-[4px] p-[10px] justify-start items-start rounded-[4px] cursor-pointer transition-colors relative ${
                  isActive
                    ? 'bg-[#FFF5EB] dark:bg-[#2C2218] border border-[#F5E3CF] dark:border-[#4A341F]'
                    : 'bg-transparent hover:bg-[#F7F7F5] dark:hover:bg-[#1F1F21] border border-transparent'
                }`}
              >
                <div className="box-border w-full h-fit shrink-0 flex flex-row gap-[6px] justify-start items-center">
                  {isPinned ? (
                    <Pin size={10} className="text-[#D97706] shrink-0 fill-[#D97706]" />
                  ) : (
                    <MessageSquare size={10} className="text-[#8A8A85] shrink-0" />
                  )}
                  <span
                    className={`text-[12px] leading-[16px] flex-1 truncate font-sans text-left ${
                      isActive
                        ? 'text-[#000000] dark:text-white font-medium'
                        : 'text-[#333333] dark:text-[#D4D4D8] font-normal'
                    }`}
                  >
                    {s.title || 'Untitled Conversation'}
                  </span>

                  {/* Quick delete on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[#8A8A85] hover:text-red-500 transition-opacity p-0.5"
                    title="Delete session"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <div className="text-[10px] text-[#8A8A85] font-funnel font-normal text-left whitespace-nowrap">
                  {agentName}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User Card at Bottom */}
      <div
        onClick={() => navigate('settings')}
        data-pencil-name="User Card"
        className="box-border w-full h-fit shrink-0 flex flex-row gap-[10px] p-[10px_12px] justify-start items-center bg-[#FFF5EB] dark:bg-[#251D16] border border-[#F5E3CF] dark:border-[#3D2C20] rounded-[8px] cursor-pointer hover:opacity-95 transition-opacity"
      >
        <div
          data-pencil-name="Avatar"
          className="box-border w-[28px] shrink-0 h-[28px] bg-[#007AFF] text-white font-bold text-[11px] rounded-full flex items-center justify-center"
        >
          LI
        </div>
        <div
          data-pencil-name="User Info"
          className="box-border flex-1 h-fit flex flex-col gap-[1px] justify-start items-start overflow-hidden"
        >
          <div
            data-pencil-name="Name"
            className="text-[12px] text-[#000000] dark:text-white font-sans font-bold text-left truncate w-full"
          >
            Lutfi Ikbal
          </div>
          <div
            data-pencil-name="Plan"
            className="text-[10px] text-[#8A8A85] font-funnel font-normal text-left whitespace-nowrap"
          >
            Pro workspace
          </div>
        </div>
        <ChevronRight size={14} className="text-[#8A8A85] shrink-0" />
      </div>
    </aside>
  );
};
