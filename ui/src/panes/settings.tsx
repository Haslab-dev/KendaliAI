import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, Sun, Moon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

// Settings pane: security (password) and appearance (GOALS.md Track C).
export const SettingsPane: React.FC = () => {
  const { theme, toggleTheme } = useAppStore();
  const [authRequired, setAuthRequired] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuthRequired(!!data.required);
    } catch {}
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (newPassword !== confirmPassword) {
      setNotice({ type: 'error', text: 'New password and confirmation do not match' });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthRequired(true);
        setNotice({
          type: 'success',
          text: authRequired ? 'Password changed successfully.' : 'Password set. The workspace now requires it on new sessions.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to update password' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Security */}
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={15} className="text-hi" />
          <h3 className="text-sm font-semibold text-hi">Security</h3>
        </div>
        <p className="text-[11px] text-mid mb-4">
          {authRequired
            ? 'Password protection is active. The workspace asks for it on every new session.'
            : 'No password is set. Set one to require it before anyone can open the workspace.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {authRequired && (
            <div>
              <label className="text-[11px] font-semibold text-mid uppercase tracking-wider">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-mid transition-colors"
                autoComplete="current-password"
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-mid uppercase tracking-wider">
                {authRequired ? 'New password' : 'Password'}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-mid transition-colors"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-mid uppercase tracking-wider">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-inputbg border border-line rounded-lg text-xs text-hi outline-none focus:border-mid transition-colors"
                autoComplete="new-password"
              />
            </div>
          </div>

          {notice && (
            <div
              className={`px-3 py-2 rounded-lg text-xs ${
                notice.type === 'error'
                  ? 'bg-red-500/15 border border-red-500/60 text-red-200'
                  : 'bg-raised border border-line text-hi'
              }`}
            >
              {notice.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !newPassword}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-hi text-app text-xs font-semibold disabled:opacity-50"
          >
            <RefreshCw size={12} className={submitting ? 'animate-spin' : ''} />
            {submitting ? 'Saving...' : authRequired ? 'Change password' : 'Set password'}
          </button>
        </form>
      </div>

      {/* Appearance */}
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2 mb-1">
          {theme === 'dark' ? <Moon size={15} className="text-hi" /> : <Sun size={15} className="text-hi" />}
          <h3 className="text-sm font-semibold text-hi">Appearance</h3>
        </div>
        <p className="text-[11px] text-mid mb-4">Switch between the dark and light themes.</p>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-line bg-raised text-xs font-medium text-hi hover:bg-hoverbg transition-colors"
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          Switch to {theme === 'dark' ? 'light' : 'dark'} mode
        </button>
      </div>

      {/* Standalone PWA App Viewer */}
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">📱</span>
          <h3 className="text-sm font-semibold text-hi">Standalone App Viewer (PWA)</h3>
        </div>
        <p className="text-[11px] text-mid mb-3">
          Install KendaliAI as a standalone native app viewer window on your smartphone, tablet, or desktop.
          Live gateway connection, zero caching, always fresh.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if ((window as any).__kendaliInstallPrompt) {
                (window as any).__kendaliInstallPrompt();
              } else {
                alert('To install KendaliAI as a standalone app, open your browser menu and choose "Add to Home Screen" or "Install App".');
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-hi text-app text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <span>📥</span>
            Install Standalone App
          </button>
          <span className="text-[11px] text-lo font-mono">Status: Live Network Gateway (No Offline Cache)</span>
        </div>
      </div>
    </div>
  );
};
