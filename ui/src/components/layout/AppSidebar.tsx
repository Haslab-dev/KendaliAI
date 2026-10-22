import React, { useState } from 'react';
import { useProfileStore } from '../../store/useProfileStore';
import { useSessionStore } from '../../store/useSessionStore';
import {
  Plus,
  User,
  Users,
  Cloud,
  Clock,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  Pin,
  Trash2,
  Edit2,
  MoreVertical,
  MessageSquare,
} from 'lucide-react';

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  collapsed,
  onToggleCollapse,
}) => {
  const {
    activeAgent,
    selectedAgentId,
    activeNavTab,
    setActiveNavTab,
    activeGroup,
    selectedGroupId,
  } = useProfileStore();

  const {
    activeSessionId,
    selectSession,
    createSessionForAgent,
    createSessionForGroup,
    deleteSession,
    renameSession,
    pinSession,
    getAgentSessions,
    getGroupSessions,
    searchQuery,
    setSearchQuery,
  } = useSessionStore();

  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Scoped sessions
  const sessions =
    activeNavTab === 'groups'
      ? getGroupSessions(selectedGroupId || undefined)
      : selectedAgentId
      ? getAgentSessions(selectedAgentId)
      : [];

  const handleNewChat = async () => {
    if (activeNavTab === 'groups' && selectedGroupId) {
      await createSessionForGroup(selectedGroupId);
    } else if (selectedAgentId) {
      await createSessionForAgent(selectedAgentId);
    }
    setActiveNavTab('chat');
  };

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
    setActiveMenuSessionId(null);
  };

  const handleSaveRename = async (id: string) => {
    if (editingTitle.trim()) {
      await renameSession(id, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 h-full bg-[#101014] border-r border-border/40 flex flex-col items-center py-3 select-none">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 h-full bg-[#101014] border-r border-border/40 flex flex-col select-none">
      {/* Workspace Header */}
      <div className="h-14 px-3.5 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-semibold">
            {activeAgent?.avatar?.slice(0, 2) || '🤖'}
          </div>
          <span className="font-semibold text-sm truncate text-foreground">
            {activeNavTab === 'groups'
              ? activeGroup?.name || 'Groups'
              : activeAgent?.name || 'Kendali'}
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          title="Collapse sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Top Items */}
      <div className="p-2 space-y-1">
        {/* + New chat button */}
        <button
          onClick={handleNewChat}
          className="w-full h-9 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 flex items-center gap-2.5 px-3 text-xs font-medium transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>New chat</span>
        </button>

        {/* 5 Main Nav Items */}
        <div className="pt-1.5 space-y-0.5">
          <button
            onClick={() => setActiveNavTab('agent')}
            className={`w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-xs transition-colors ${
              activeNavTab === 'agent'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Agent</span>
          </button>

          <button
            onClick={() => setActiveNavTab('groups')}
            className={`w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-xs transition-colors ${
              activeNavTab === 'groups'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Groups</span>
          </button>

          <button
            onClick={() => setActiveNavTab('connections')}
            className={`w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-xs transition-colors ${
              activeNavTab === 'connections'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span>Connections</span>
          </button>

          <button
            onClick={() => setActiveNavTab('automations')}
            className={`w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-xs transition-colors ${
              activeNavTab === 'automations'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Automations</span>
          </button>

          <button
            onClick={() => setActiveNavTab('settings')}
            className={`w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-xs transition-colors ${
              activeNavTab === 'settings'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Recents Section */}
      <div className="flex-1 min-h-0 flex flex-col pt-2 border-t border-border/30">
        <div className="px-3 pb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <span>Recents</span>
        </div>

        {/* Search Input */}
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-2.5 bg-muted/30 hover:bg-muted/50 focus:bg-muted/60 border border-border/40 rounded-lg text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 text-foreground transition-colors"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-border">
          {sessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground/60">
              No recent chats
            </div>
          ) : (
            sessions.map((sess) => {
              const isSelected = activeSessionId === sess.id && activeNavTab === 'chat';
              const isMenuOpen = activeMenuSessionId === sess.id;
              const isEditing = editingSessionId === sess.id;

              return (
                <div
                  key={sess.id}
                  className={`group relative w-full h-8 rounded-lg flex items-center justify-between px-2.5 text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                  onClick={() => {
                    if (!isEditing) {
                      selectSession(sess.id);
                      setActiveNavTab('chat');
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                    {sess.pinned ? (
                      <Pin className="w-3 h-3 text-amber-500 shrink-0" />
                    ) : (
                      <MessageSquare className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-70" />
                    )}

                    {isEditing ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleSaveRename(sess.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(sess.id)}
                        autoFocus
                        className="w-full bg-background border border-primary/50 rounded px-1 text-xs text-foreground focus:outline-none"
                      />
                    ) : (
                      <span className="truncate">{sess.title || 'Untitled'}</span>
                    )}
                  </div>

                  {/* Context menu button */}
                  {!isEditing && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuSessionId(isMenuOpen ? null : sess.id);
                        }}
                        className={`w-5 h-5 rounded hover:bg-background/80 flex items-center justify-center transition-opacity ${
                          isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-6 w-32 py-1 bg-popover border border-border rounded-lg shadow-xl text-xs z-50 select-none animate-in fade-in-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              pinSession(sess.id, !sess.pinned);
                              setActiveMenuSessionId(null);
                            }}
                            className="w-full px-2.5 py-1 text-left hover:bg-muted flex items-center gap-2"
                          >
                            <Pin className="w-3 h-3" />
                            <span>{sess.pinned ? 'Unpin' : 'Pin'}</span>
                          </button>
                          <button
                            onClick={() => handleStartRename(sess.id, sess.title)}
                            className="w-full px-2.5 py-1 text-left hover:bg-muted flex items-center gap-2"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Rename</span>
                          </button>
                          <button
                            onClick={() => {
                              deleteSession(sess.id);
                              setActiveMenuSessionId(null);
                            }}
                            className="w-full px-2.5 py-1 text-left hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};
