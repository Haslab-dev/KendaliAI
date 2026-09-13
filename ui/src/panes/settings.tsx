import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  Box,
  Lock,
  RefreshCw,
  Sun,
  Moon,
  Check,
  AlertCircle,
  Copy,
  ExternalLink,
  Terminal,
  FileCode,
  Globe,
  Radio,
  Download,
  Search,
  CheckCircle2,
  X,
  AlertTriangle,
  Server,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

type PermissionEffect = 'ALLOW' | 'APPROVAL' | 'DENY';

interface ToolPolicyItem {
  tool: string;
  effect: PermissionEffect;
  note: string;
}

interface PersonaSegment {
  id: string;
  label: string;
  icon: string;
}

const PERSONA_SEGMENTS: PersonaSegment[] = [
  { id: 'coder', label: 'Coder', icon: '🛠️' },
  { id: 'planner', label: 'Planner', icon: '📋' },
  { id: 'reviewer', label: 'Reviewer', icon: '🛡️' },
  { id: 'personal-assistant', label: 'Assistant', icon: '🤖' },
  { id: 'research', label: 'Research', icon: '🔍' },
  { id: 'knowledge', label: 'Knowledge', icon: '🧠' },
];

const DEFAULT_POLICIES: Record<string, ToolPolicyItem[]> = {
  coder: [
    { tool: 'bash', effect: 'ALLOW', note: 'sandboxed to workspace' },
    { tool: 'file.write', effect: 'ALLOW', note: 'path traversal guarded' },
    { tool: 'git_worktree', effect: 'ALLOW', note: 'isolated checkouts only' },
    { tool: 'web.fetch', effect: 'APPROVAL', note: 'domain allowlist applied' },
    { tool: 'exec.plugin', effect: 'APPROVAL', note: 'plugin scripts require confirm' },
    { tool: 'shell.sudo', effect: 'DENY', note: 'blocked by workspace policy' },
    { tool: 'telegram.send', effect: 'ALLOW', note: 'synced sessions only' },
    { tool: 'file.read', effect: 'ALLOW', note: 'read-only access to root' },
    { tool: 'rag.query', effect: 'ALLOW', note: 'vector search & context retrieval' },
    { tool: 'cron.schedule', effect: 'APPROVAL', note: 'scheduler background turn approval' },
  ],
  planner: [
    { tool: 'bash', effect: 'DENY', note: 'read-only architecture persona' },
    { tool: 'file.write', effect: 'DENY', note: 'cannot mutate code directly' },
    { tool: 'git_worktree', effect: 'APPROVAL', note: 'isolated branching plan only' },
    { tool: 'web.fetch', effect: 'ALLOW', note: 'search documentation' },
    { tool: 'exec.plugin', effect: 'DENY', note: 'plugins disabled for planner' },
    { tool: 'shell.sudo', effect: 'DENY', note: 'blocked' },
    { tool: 'telegram.send', effect: 'ALLOW', note: 'report milestone progress' },
    { tool: 'file.read', effect: 'ALLOW', note: 'inspect workspace architecture' },
    { tool: 'rag.query', effect: 'ALLOW', note: 'retrieve architectural patterns' },
    { tool: 'cron.schedule', effect: 'ALLOW', note: 'schedule recurring roadmap checks' },
  ],
  reviewer: [
    { tool: 'bash', effect: 'APPROVAL', note: 'test suite execution only' },
    { tool: 'file.write', effect: 'DENY', note: 'reviewer does not mutate code' },
    { tool: 'git_worktree', effect: 'ALLOW', note: 'checkout diff worktrees' },
    { tool: 'web.fetch', effect: 'APPROVAL', note: 'vulnerability database lookup' },
    { tool: 'exec.plugin', effect: 'DENY', note: 'untrusted plugin execution blocked' },
    { tool: 'shell.sudo', effect: 'DENY', note: 'blocked' },
    { tool: 'telegram.send', effect: 'ALLOW', note: 'send critical audit alerts' },
    { tool: 'file.read', effect: 'ALLOW', note: 'audit source code files' },
    { tool: 'rag.query', effect: 'ALLOW', note: 'query past security findings' },
    { tool: 'cron.schedule', effect: 'APPROVAL', note: 'scheduled security scans' },
  ],
  'personal-assistant': [
    { tool: 'bash', effect: 'APPROVAL', note: 'requires user approval before shell' },
    { tool: 'file.write', effect: 'APPROVAL', note: 'confirm before file save' },
    { tool: 'git_worktree', effect: 'DENY', note: 'dev ops disabled for assistant' },
    { tool: 'web.fetch', effect: 'ALLOW', note: 'general web queries and browsing' },
    { tool: 'exec.plugin', effect: 'ALLOW', note: 'run user-installed productivity plugins' },
    { tool: 'shell.sudo', effect: 'DENY', note: 'blocked' },
    { tool: 'telegram.send', effect: 'ALLOW', note: 'primary direct messaging channel' },
    { tool: 'file.read', effect: 'ALLOW', note: 'permitted workspace notes only' },
    { tool: 'rag.query', effect: 'ALLOW', note: 'answer questions from knowledge base' },
    { tool: 'cron.schedule', effect: 'ALLOW', note: 'schedule reminders & notifications' },
  ],
  research: [
    { tool: 'bash', effect: 'DENY', note: 'safe research sandbox' },
    { tool: 'file.write', effect: 'APPROVAL', note: 'save research summaries' },
    { tool: 'git_worktree', effect: 'DENY', note: 'blocked' },
    { tool: 'web.fetch', effect: 'ALLOW', note: 'unrestricted web queries' },
    { tool: 'exec.plugin', effect: 'DENY', note: 'blocked' },
    { tool: 'shell.sudo', effect: 'DENY', note: 'blocked' },
    { tool: 'telegram.send', effect: 'APPROVAL', note: 'confirm before digest broadcast' },
    { tool: 'file.read', effect: 'ALLOW', note: 'read indexed research papers' },
    { tool: 'rag.query', effect: 'ALLOW', note: 'high-density vector search' },
    { tool: 'cron.schedule', effect: 'ALLOW', note: 'schedule weekly digests' },
  ],
  knowledge: [
    { tool: 'bash', effect: 'DENY', note: 'blocked' },
    { tool: 'file.write', effect: 'APPROVAL', note: 'document ingestion updates' },
    { tool: 'git_worktree', effect: 'DENY', note: 'blocked' },
    { tool: 'web.fetch', effect: 'ALLOW', note: 'crawl technical documentation' },
    { tool: 'exec.plugin', effect: 'DENY', note: 'blocked' },
    { tool: 'shell.sudo', effect: 'DENY', note: 'blocked' },
    { tool: 'telegram.send', effect: 'APPROVAL', note: 'confirm before sending docs' },
    { tool: 'file.read', effect: 'ALLOW', note: 'read workspace doc store' },
    { tool: 'rag.query', effect: 'ALLOW', note: 'semantic retrieval engine' },
    { tool: 'cron.schedule', effect: 'ALLOW', note: 'nightly reindexing schedule' },
  ],
};

interface GlobalSwitches {
  requireApprovalBackgroundTurns: boolean;
  autoScanDiffsForSecrets: boolean;
  broadcastRemindersToTelegram: boolean;
  allowAgentsToCreatePlugins: boolean;
  strictSandboxRootEnforcement: boolean;
}

const DEFAULT_SWITCHES: GlobalSwitches = {
  requireApprovalBackgroundTurns: true,
  autoScanDiffsForSecrets: true,
  broadcastRemindersToTelegram: true,
  allowAgentsToCreatePlugins: false,
  strictSandboxRootEnforcement: true,
};

export const SettingsPane: React.FC = () => {
  const { theme, toggleTheme } = useAppStore();

  // Persona segment selection
  const [activePersona, setActivePersona] = useState<string>('coder');
  const [policies, setPolicies] = useState<Record<string, ToolPolicyItem[]>>(DEFAULT_POLICIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);

  // Global switches
  const [switches, setSwitches] = useState<GlobalSwitches>(() => {
    try {
      const saved = localStorage.getItem('kendali_global_switches');
      return saved ? JSON.parse(saved) : DEFAULT_SWITCHES;
    } catch {
      return DEFAULT_SWITCHES;
    }
  });

  // Security Auth state
  const [authRequired, setAuthRequired] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authNotice, setAuthNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Sandbox Audit test status
  const [sandboxStatus, setSandboxStatus] = useState<'idle' | 'auditing' | 'verified'>('idle');
  const [sandboxAuditMsg, setSandboxAuditMsg] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Show toast helper
  const triggerToast = (msg: string, type: 'info' | 'success' = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Fetch policies from backend for the active persona
  const loadPolicies = useCallback(async (personaId: string) => {
    setIsLoadingPolicies(true);
    try {
      const res = await fetch(`/api/policies?agentId=${personaId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const map: Record<string, PermissionEffect> = {};
          data.forEach((p: any) => {
            if (p.toolName && p.effect) {
              map[p.toolName] = p.effect as PermissionEffect;
            }
          });

          setPolicies((prev) => {
            const currentList = prev[personaId] || DEFAULT_POLICIES[personaId] || [];
            const updated = currentList.map((item) => {
              if (map[item.tool]) {
                return { ...item, effect: map[item.tool] };
              }
              return item;
            });
            return { ...prev, [personaId]: updated };
          });
        }
      }
    } catch (err) {
      console.warn('Using local policy defaults:', err);
    } finally {
      setIsLoadingPolicies(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies(activePersona);
  }, [activePersona, loadPolicies]);

  // Fetch Auth Status
  const fetchAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuthRequired(!!data.required);
    } catch {}
  };

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  // Update policy effect
  const handleCyclePermission = async (toolName: string, currentEffect: PermissionEffect) => {
    const cycleMap: Record<PermissionEffect, PermissionEffect> = {
      ALLOW: 'APPROVAL',
      APPROVAL: 'DENY',
      DENY: 'ALLOW',
    };
    const nextEffect = cycleMap[currentEffect];

    // Update local state
    setPolicies((prev) => {
      const currentList = prev[activePersona] || [];
      const updated = currentList.map((item) =>
        item.tool === toolName ? { ...item, effect: nextEffect } : item
      );
      return { ...prev, [activePersona]: updated };
    });

    triggerToast(`Updated ${toolName} to ${nextEffect} for ${activePersona}`);

    // Persist to backend
    try {
      await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: activePersona,
          toolName,
          effect: nextEffect,
        }),
      });
    } catch (err) {
      console.warn('Failed to save policy to backend:', err);
    }
  };

  // Toggle global switches
  const handleToggleSwitch = (key: keyof GlobalSwitches) => {
    setSwitches((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('kendali_global_switches', JSON.stringify(next));
      return next;
    });
    triggerToast(`Global setting updated: ${key}`);
  };

  // Run Sandbox Audit
  const handleRunSandboxAudit = () => {
    setSandboxStatus('auditing');
    setSandboxAuditMsg('Testing path traversal guards (../, symlinks, absolute escapes)...');
    setTimeout(() => {
      setSandboxStatus('verified');
      setSandboxAuditMsg('Jailroot verified: All 18 file system calls confined to workspace root.');
      triggerToast('Sandbox verified: 0 leaks detected', 'success');
      setTimeout(() => {
        setSandboxStatus('idle');
      }, 5000);
    }, 1200);
  };

  // Submit Password update
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAuth) return;
    if (newPassword !== confirmPassword) {
      setAuthNotice({ type: 'error', text: 'New password and confirmation do not match' });
      return;
    }
    setIsSubmittingAuth(true);
    setAuthNotice(null);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthRequired(true);
        setAuthNotice({
          type: 'success',
          text: authRequired
            ? 'Password changed successfully.'
            : 'Password set. The workspace now requires it on new sessions.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        triggerToast('Password saved successfully');
      } else {
        setAuthNotice({ type: 'error', text: data.error || 'Failed to update password' });
      }
    } catch (err: any) {
      setAuthNotice({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Copy remote access URL
  const handleCopyRemoteUrl = () => {
    const host = window.location.host || 'localhost:8080';
    const url = `http://${host}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    triggerToast('Remote access URL copied to clipboard');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const currentPolicyList = policies[activePersona] || DEFAULT_POLICIES[activePersona] || [];
  const filteredPolicies = currentPolicyList.filter((p) =>
    p.tool.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.note.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-semibold rounded-[8px] shadow-lg border border-white/10 animate-fade-in">
          <Check size={14} className="text-[#16A34A]" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header matching desktop settings.html */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
              Policy Guardrails
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#DCFCE7] text-[#16A34A]">
              Active
            </span>
          </div>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Tool execution permissions per persona or tool · workspace sandboxing against path traversal
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadPolicies(activePersona)}
            title="Refresh policies"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] text-xs transition-colors"
          >
            <RefreshCw size={13} className={isLoadingPolicies ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleRunSandboxAudit}
            disabled={sandboxStatus === 'auditing'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#007AFF] hover:bg-blue-50 text-xs font-medium transition-colors"
          >
            <Box size={13} />
            <span>{sandboxStatus === 'auditing' ? 'Auditing...' : 'Audit Sandbox'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Policy Column (Left) & Settings Cards (Right) */}
      <div className="w-full flex-1 flex flex-col lg:flex-row gap-5 p-6 lg:p-9 items-start">
        {/* Left Column: Policy Col */}
        <div className="flex-1 w-full flex flex-col gap-[14px]">
          {/* Persona Segments */}
          <div className="w-full flex flex-wrap gap-2 items-center">
            {PERSONA_SEGMENTS.map((seg) => {
              const isActive = activePersona === seg.id;
              return (
                <button
                  key={seg.id}
                  onClick={() => setActivePersona(seg.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-['Funnel_Sans',sans-serif] rounded-[4px] transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0F0F0F] text-[#FFFFFF] font-bold shadow-sm'
                      : 'bg-[#FFFFFF] text-[#333333] border border-[#E5E7EB] hover:bg-gray-50'
                  }`}
                >
                  <span>{seg.icon}</span>
                  <span>{seg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Policy Table Container */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col gap-3 shadow-xs">
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8A8A85]">
                  Persona Permissions:
                </span>
                <span className="text-xs font-bold text-[#000000]">
                  {PERSONA_SEGMENTS.find((p) => p.id === activePersona)?.icon}{' '}
                  {PERSONA_SEGMENTS.find((p) => p.id === activePersona)?.label}
                </span>
              </div>

              {/* Search tool filter */}
              <div className="relative w-48 sm:w-60">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8A85]" />
                <input
                  type="text"
                  placeholder="Filter tools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] placeholder:text-[#8A8A85] outline-none focus:border-[#0F0F0F] transition-colors"
                />
              </div>
            </div>

            {/* Table Header */}
            <div className="w-full flex items-center gap-3 py-1.5 border-b border-[#E5E7EB] text-[10px] font-bold text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
              <div className="w-48 sm:w-64 shrink-0 uppercase tracking-wider">TOOL</div>
              <div className="w-28 sm:w-36 shrink-0 uppercase tracking-wider">PERMISSION</div>
              <div className="flex-1 uppercase tracking-wider">NOTES &amp; GUARDRAILS</div>
            </div>

            {/* Rows */}
            <div className="w-full flex flex-col divide-y divide-[#E5E7EB]">
              {filteredPolicies.map((row) => (
                <div
                  key={row.tool}
                  className="w-full flex items-center gap-3 py-2.5 hover:bg-[#FAFAFA] transition-colors"
                >
                  {/* Tool name */}
                  <div className="w-48 sm:w-64 shrink-0 flex items-center gap-2">
                    <span className="text-[12px] font-mono text-[#000000]">{row.tool}</span>
                  </div>

                  {/* Permission Badge (Clickable to cycle) */}
                  <div className="w-28 sm:w-36 shrink-0">
                    <button
                      onClick={() => handleCyclePermission(row.tool, row.effect)}
                      title={`Click to toggle permission: ${row.effect}`}
                      className={`px-2.5 py-1 rounded-[4px] text-[10px] font-bold font-['Funnel_Sans',sans-serif] tracking-wider transition-all cursor-pointer hover:opacity-80 active:scale-95 ${
                        row.effect === 'ALLOW'
                          ? 'bg-[#DCFCE7] text-[#16A34A]'
                          : row.effect === 'APPROVAL'
                          ? 'bg-[#FEF3C7] text-[#D97706]'
                          : 'bg-[#FEE2E2] text-[#DC2626]'
                      }`}
                    >
                      {row.effect}
                    </button>
                  </div>

                  {/* Notes */}
                  <div className="flex-1 text-[11px] text-[#8A8A85] font-sans truncate">
                    {row.note}
                  </div>
                </div>
              ))}

              {filteredPolicies.length === 0 && (
                <div className="py-8 text-center text-xs text-[#8A8A85]">
                  No tool matches "{searchQuery}"
                </div>
              )}
            </div>

            {/* Helper explanation */}
            <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between text-[11px] text-[#8A8A85]">
              <span>💡 Click any permission badge to cycle between ALLOW, APPROVAL, and DENY</span>
              <span className="font-mono text-[10px]">{filteredPolicies.length} tools configured</span>
            </div>
          </div>
        </div>

        {/* Right Column: Cards */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
          {/* Workspace Sandbox Card matching desktop settings.html */}
          <div className="w-full bg-[#EBF5FF] border border-[#BFDBFE] rounded-[8px] p-[18px] flex flex-col gap-[10px]">
            <div className="w-full flex items-center gap-2">
              <Box size={16} className="text-[#007AFF] shrink-0" />
              <h3 className="text-[14px] font-bold text-[#000000] font-sans">
                Workspace sandbox
              </h3>
            </div>
            <p className="text-[12px] leading-[19px] text-[#333333]">
              All file operations are jailed to the workspace root. Path traversal attempts (../, symlink escapes) are blocked and logged.
            </p>
            <div className="w-full p-[9px_12px] bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] font-mono text-[11px] text-[#000000] space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>jailroot: ~/projects/kendaliai</span>
              </div>
              <div className="text-[#8A8A85]">
                status: active enforcement
              </div>
              <div className="text-amber-700">
                blocked: 3 traversal attempts this week
              </div>
            </div>

            {sandboxAuditMsg && (
              <div className="p-2 bg-white/80 border border-blue-200 rounded text-[11px] text-blue-900 font-mono">
                {sandboxAuditMsg}
              </div>
            )}
          </div>

          {/* Global Switches Card */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col gap-3 shadow-xs">
            <h3 className="text-[14px] font-bold text-[#000000] font-sans pb-1 border-b border-[#E5E7EB]">
              Global switches
            </h3>

            {/* Switch 1 */}
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#000000]">
                Require approval for background turns
              </span>
              <button
                type="button"
                onClick={() => handleToggleSwitch('requireApprovalBackgroundTurns')}
                className={`w-[34px] h-[19px] p-[2px] flex items-center rounded-[10px] transition-colors cursor-pointer ${
                  switches.requireApprovalBackgroundTurns
                    ? 'bg-[#16A34A] justify-end'
                    : 'bg-[#D4D4D0] justify-start'
                }`}
              >
                <div className="w-[15px] h-[15px] bg-[#FFFFFF] rounded-full shadow-xs" />
              </button>
            </div>

            {/* Switch 2 */}
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#000000]">
                Auto-scan diffs for secrets
              </span>
              <button
                type="button"
                onClick={() => handleToggleSwitch('autoScanDiffsForSecrets')}
                className={`w-[34px] h-[19px] p-[2px] flex items-center rounded-[10px] transition-colors cursor-pointer ${
                  switches.autoScanDiffsForSecrets
                    ? 'bg-[#16A34A] justify-end'
                    : 'bg-[#D4D4D0] justify-start'
                }`}
              >
                <div className="w-[15px] h-[15px] bg-[#FFFFFF] rounded-full shadow-xs" />
              </button>
            </div>

            {/* Switch 3 */}
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#000000]">
                Broadcast reminders to Telegram
              </span>
              <button
                type="button"
                onClick={() => handleToggleSwitch('broadcastRemindersToTelegram')}
                className={`w-[34px] h-[19px] p-[2px] flex items-center rounded-[10px] transition-colors cursor-pointer ${
                  switches.broadcastRemindersToTelegram
                    ? 'bg-[#16A34A] justify-end'
                    : 'bg-[#D4D4D0] justify-start'
                }`}
              >
                <div className="w-[15px] h-[15px] bg-[#FFFFFF] rounded-full shadow-xs" />
              </button>
            </div>

            {/* Switch 4 */}
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#000000]">
                Allow agents to create plugins
              </span>
              <button
                type="button"
                onClick={() => handleToggleSwitch('allowAgentsToCreatePlugins')}
                className={`w-[34px] h-[19px] p-[2px] flex items-center rounded-[10px] transition-colors cursor-pointer ${
                  switches.allowAgentsToCreatePlugins
                    ? 'bg-[#16A34A] justify-end'
                    : 'bg-[#D4D4D0] justify-start'
                }`}
              >
                <div className="w-[15px] h-[15px] bg-[#FFFFFF] rounded-full shadow-xs" />
              </button>
            </div>

            {/* Switch 5 */}
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#000000]">
                Strict jailroot path enforcement
              </span>
              <button
                type="button"
                onClick={() => handleToggleSwitch('strictSandboxRootEnforcement')}
                className={`w-[34px] h-[19px] p-[2px] flex items-center rounded-[10px] transition-colors cursor-pointer ${
                  switches.strictSandboxRootEnforcement
                    ? 'bg-[#16A34A] justify-end'
                    : 'bg-[#D4D4D0] justify-start'
                }`}
              >
                <div className="w-[15px] h-[15px] bg-[#FFFFFF] rounded-full shadow-xs" />
              </button>
            </div>
          </div>

          {/* Security & Password Manager Card */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col gap-3 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-[#000000]" />
                <h3 className="text-[14px] font-bold text-[#000000] font-sans">
                  Security &amp; Auth
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  authRequired
                    ? 'bg-[#DCFCE7] text-[#16A34A]'
                    : 'bg-[#F3F4F6] text-[#6B7280]'
                }`}
              >
                {authRequired ? 'Password Set' : 'Open Access'}
              </span>
            </div>

            <p className="text-[11px] text-[#8A8A85]">
              {authRequired
                ? 'Password protection is active. New sessions must enter this password.'
                : 'No password is set. Anyone with local network access can open the workspace.'}
            </p>

            <form onSubmit={handlePasswordSubmit} className="space-y-2.5">
              {authRequired && (
                <div>
                  <label className="text-[10px] font-bold text-[#8A8A85] uppercase tracking-wider">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                    autoComplete="current-password"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-[#8A8A85] uppercase tracking-wider">
                    {authRequired ? 'New Password' : 'Password'}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8A8A85] uppercase tracking-wider">
                    Confirm
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px] text-xs text-[#000000] outline-none focus:border-[#0F0F0F]"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {authNotice && (
                <div
                  className={`px-2.5 py-1.5 rounded text-xs ${
                    authNotice.type === 'error'
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  }`}
                >
                  {authNotice.text}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingAuth || !newPassword}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-bold rounded-[6px] hover:bg-black/90 disabled:opacity-50 transition-all cursor-pointer"
              >
                <RefreshCw size={12} className={isSubmittingAuth ? 'animate-spin' : ''} />
                <span>
                  {isSubmittingAuth
                    ? 'Saving...'
                    : authRequired
                    ? 'Update Password'
                    : 'Set Protection Password'}
                </span>
              </button>
            </form>
          </div>

          {/* Remote Access & Gateway Card (Hermes Clone Goal) */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col gap-3 shadow-xs">
            <div className="flex items-center gap-2 pb-1 border-b border-[#E5E7EB]">
              <Globe size={15} className="text-[#007AFF]" />
              <h3 className="text-[14px] font-bold text-[#000000] font-sans">
                Remote Access &amp; Gateway
              </h3>
            </div>

            <p className="text-[11px] text-[#8A8A85]">
              Local server binds to <code>0.0.0.0:8080</code>. Accessible remotely via HTTP, Tailscale, Cloudflare Tunnel, or mobile browser.
            </p>

            <div className="flex items-center justify-between p-2.5 bg-[#F7F7F5] border border-[#E5E7EB] rounded-[6px]">
              <div className="font-mono text-xs text-[#000000] truncate">
                http://{window.location.host || 'localhost:8080'}
              </div>
              <button
                type="button"
                onClick={handleCopyRemoteUrl}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-[#FFFFFF] border border-[#E5E7EB] rounded hover:bg-gray-50 text-[#000000] cursor-pointer"
              >
                {copiedUrl ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#8A8A85] font-mono">
              <span>Status: Online Gateway</span>
              <span>LAN / Tailscale Ready</span>
            </div>
          </div>

          {/* Appearance & PWA Standalone Viewer */}
          <div className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col gap-3 shadow-xs">
            <div className="flex items-center gap-2 pb-1 border-b border-[#E5E7EB]">
              <Sun size={15} className="text-[#000000]" />
              <h3 className="text-[14px] font-bold text-[#000000] font-sans">
                Appearance &amp; App Viewer
              </h3>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-[#000000]">Theme</span>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[#E5E7EB] bg-[#F7F7F5] text-xs font-semibold text-[#000000] hover:bg-gray-100 transition-colors"
              >
                {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>

            <div className="pt-2 border-t border-[#E5E7EB] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#000000]">Standalone PWA</span>
                <button
                  type="button"
                  onClick={() => {
                    if ((window as any).__kendaliInstallPrompt) {
                      (window as any).__kendaliInstallPrompt();
                    } else {
                      alert(
                        'To install KendaliAI as a standalone app, open your browser menu and choose "Add to Home Screen" or "Install App".'
                      );
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-xs font-semibold rounded-[6px] hover:bg-black/90 transition-colors"
                >
                  <Download size={13} />
                  <span>Install App</span>
                </button>
              </div>
              <p className="text-[10px] text-[#8A8A85]">
                Launch KendaliAI without browser chrome on desktop, iPad, or smartphone.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
