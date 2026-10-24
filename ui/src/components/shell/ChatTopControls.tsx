import React, { useState, useRef, useEffect } from 'react';
import { Ellipsis, Menu, Pencil, Plus, SquareTerminal, Trash2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ThemePicker } from '../common/ThemePicker';
import { useSessionStore } from '../../store/useSessionStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useUIStore } from '../../store/useUIStore';
import { isMainSession } from '../../store/useSessionStore';

/**
 * Mobile drawer trigger icon (matches Muse AI mobile view: circular menu button with stepped lines and active dot).
 */
export const MobileDrawerTrigger: React.FC<{ scrolled?: boolean }> = ({ scrolled }) => {
  const { toggleMobileDrawer } = useUIStore();

  const handleTrigger = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMobileDrawer();
  };

  return (
    <button
      type="button"
      onClick={handleTrigger}
      onTouchEnd={handleTrigger}
      aria-label="Open agent roster"
      title="Agents & Groups"
      className={cn(
        'absolute top-3.5 left-4 z-40 flex size-10 items-center justify-center rounded-full border border-border/80 bg-card/95 backdrop-blur-xl text-foreground shadow-md transition-all md:hidden cursor-pointer hover:bg-surface active:scale-90 touch-manipulation pointer-events-auto',
        scrolled && 'bg-background/95 shadow-md ring-1 ring-border/50'
      )}
    >
      <div className="relative flex items-center justify-center">
        {/* Muse AI stepped hamburger: medium top line, full middle line, short bottom line */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="text-foreground"
        >
          <line x1="4" y1="6" x2="16" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="11" y2="18" />
        </svg>
        {/* Active notification indicator dot */}
        <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full bg-primary ring-2 ring-background shadow-xs pointer-events-none" />
      </div>
    </button>
  );
};

interface ChatTopControlsProps {
  /** Show the "..." session actions menu (rename / terminal / delete). */
  showSessionMenu?: boolean;
  /** True when chat content has scrolled beneath the floating controls. */
  scrolled?: boolean;
  /** Extra controls rendered before the theme picker & hamburger. */
  children?: React.ReactNode;
}

/**
 * Floating top-right controls — replaces the old header bar. No bar, no
 * border line: just the session menu, theme picker and the session-history
 * hamburger hovering over the chat surface. When content scrolls beneath,
 * the cluster gains a dark blurred chip so icons stay readable.
 */
export const ChatTopControls: React.FC<ChatTopControlsProps> = ({
  showSessionMenu,
  scrolled,
  children,
}) => {
  const { activeSession, renameSession, deleteSession } = useSessionStore();
  const { terminalOpen, setTerminalOpen } = useAgentStore();
  const { rightPanel, toggleSessionsPanel } = useUIStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const showMenu = showSessionMenu && Boolean(activeSession);
  const protectedSession = isMainSession(activeSession);

  const handleRename = () => {
    if (!activeSession) return;
    setMenuOpen(false);
    const current = activeSession.title || '';
    const next = prompt('Rename task:', current);
    if (next && next.trim() && next.trim() !== current) {
      renameSession(activeSession.id, next.trim());
    }
  };

  const handleDelete = () => {
    if (!activeSession || protectedSession) return;
    setMenuOpen(false);
    deleteSession(activeSession.id);
  };

  return (
    <div
      className={cn(
        'absolute top-3 right-4 z-30 flex items-center gap-1.5 rounded-xl p-1 transition-all duration-300 select-none',
        scrolled && 'bg-background/70 shadow-sm ring-1 ring-border/40 backdrop-blur-md'
      )}
    >
      {children}

      {/* Mobile: Muse AI style "+ New" pill button */}
      <button
        type="button"
        onClick={() => {
          useSessionStore.getState().selectSession(null);
        }}
        className="flex md:hidden items-center gap-1 px-2.5 py-1 rounded-full bg-surface/90 border border-border/60 text-ui-xs font-semibold text-foreground shadow-xs hover:bg-surface active:scale-95 transition-all cursor-pointer"
        title="Start new task"
      >
        <Plus className="size-3.5 text-primary" />
        <span>New</span>
      </button>

      {showMenu && (
        <div className="relative flex items-center" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            title="More actions"
          >
            <Ellipsis className="size-4" />
          </button>

          {menuOpen && (
            <div className="dropdown-glass absolute right-0 top-full z-50 mt-1 w-48 rounded-xl p-1 shadow-xl">
              <button
                type="button"
                onClick={handleRename}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-foreground hover:bg-accent cursor-pointer"
              >
                <Pencil className="size-3.5 text-muted-foreground" />
                <span>Rename task</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setTerminalOpen(!terminalOpen);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-foreground hover:bg-accent cursor-pointer"
              >
                <SquareTerminal className="size-3.5 text-muted-foreground" />
                <span>Toggle terminal</span>
              </button>
              {!protectedSession && (
                <>
                  <div className="my-1 h-px bg-border/60" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Delete task</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Theme & Palette Picker */}
      <ThemePicker compact />

      {/* Session history hamburger */}
      <button
        type="button"
        onClick={toggleSessionsPanel}
        aria-label="Toggle session history"
        title="Session history"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer',
          rightPanel === 'sessions'
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Menu className="size-4" />
      </button>
    </div>
  );
};

export default ChatTopControls;
