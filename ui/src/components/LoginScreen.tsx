import React, { useState } from 'react';
import { Feather, Lock } from 'lucide-react';

// Monochrome login gate shown when a password is configured (GOALS.md P7).
export const LoginScreen: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-app text-hi font-sans">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm mx-4 rounded-2xl border border-line bg-panel p-8"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-raised border border-line flex items-center justify-center text-hi mb-3">
            <Feather size={24} strokeWidth={1.5} />
          </div>
          <h1 className="text-lg font-bold">KendaliAI</h1>
          <p className="text-xs text-mid mt-1">Enter your password to continue</p>
        </div>

        <label className="text-[11px] font-semibold text-mid uppercase tracking-wider">Password</label>
        <div className="relative mt-1.5 mb-4">
          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-lo" />
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full pl-9 pr-3 py-2.5 bg-inputbg border border-line rounded-xl text-sm text-hi placeholder:text-lo outline-none focus:border-mid transition-colors"
          />
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/60 bg-red-500/15 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full py-2.5 rounded-xl bg-hi text-app text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};
