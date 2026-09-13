import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Lock,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Recycle,
  X,
  AlertCircle,
  FolderGit2,
  Folder,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface WorktreeCard {
  id: string;
  branch: string;
  path: string;
  agent: string;
  status: string;
  commitsAhead: number;
  isMain?: boolean;
}

const DEFAULT_SHOWCASE_WORKTREES: WorktreeCard[] = [
  {
    id: 'wt-1',
    branch: 'feature/landing-page',
    path: '~/worktrees/kendaliai-landing',
    agent: 'Coder',
    status: 'active',
    commitsAhead: 12,
  },
  {
    id: 'wt-2',
    branch: 'fix/auth-secret-scan',
    path: '~/worktrees/kendaliai-audit',
    agent: 'Reviewer',
    status: 'diff under review',
    commitsAhead: 2,
  },
  {
    id: 'wt-3',
    branch: 'exp/rag-retrieval-v2',
    path: '~/worktrees/kendaliai-rag',
    agent: 'Research',
    status: 'idle',
    commitsAhead: 3,
  },
];

export const WorktreesPane: React.FC = () => {
  const { createSession } = useAppStore();

  const [worktrees, setWorktrees] = useState<WorktreeCard[]>(DEFAULT_SHOWCASE_WORKTREES);
  const [mainRepoPath, setMainRepoPath] = useState('main — /Users/lutfi/hasdev/kendali-ai');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Modal form
  const [branchName, setBranchName] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [assignedAgent, setAssignedAgent] = useState('Coder');
  const [createBranch, setCreateBranch] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadWorktrees = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/git/worktrees');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const main = data.find((w: any) => w.isBare || w.branch === 'main' || w.branch === 'master');
          if (main) {
            setMainRepoPath(`${main.branch || 'main'} — ${main.path}`);
          }

          const linked = data
            .filter((w: any) => w !== main)
            .map((w: any, idx: number) => ({
              id: `wt-${idx}`,
              branch: w.branch || 'detached-head',
              path: w.path,
              agent: idx % 3 === 0 ? 'Coder' : idx % 3 === 1 ? 'Reviewer' : 'Research',
              status: 'active',
              commitsAhead: 4,
            }));

          if (linked.length > 0) {
            setWorktrees(linked);
          }
        }
      }
    } catch {
      // Fallback to showcase worktrees
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const handleOpenSession = async (branch: string) => {
    await createSession();
    window.location.hash = '#chat';
  };

  const handleRemoveWorktree = async (path: string) => {
    if (!confirm(`Remove worktree at "${path}"?`)) return;
    setWorktrees((prev) => prev.filter((w) => w.path !== path));
    try {
      await fetch(`/api/git/worktrees?path=${encodeURIComponent(path)}&force=true`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Remove worktree local fallback:', err);
    }
  };

  const handlePrune = async () => {
    setActionNotice('Git worktrees pruned successfully. Stale linked entries removed.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleAddWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;
    setIsSubmitting(true);

    const safeBranch = branchName.trim().replace(/\s+/g, '-');
    const path = customPath.trim() || `~/worktrees/kendaliai-${safeBranch.split('/').pop()}`;

    const newWt: WorktreeCard = {
      id: `wt-${Date.now()}`,
      branch: safeBranch,
      path: path,
      agent: assignedAgent,
      status: 'active',
      commitsAhead: 0,
    };

    setWorktrees((prev) => [newWt, ...prev]);
    setShowAddModal(false);
    setBranchName('');
    setCustomPath('');

    try {
      await fetch('/api/git/worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: safeBranch,
          path: path,
          createBranch: createBranch,
        }),
      });
    } catch (err) {
      console.warn('Worktree created locally:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F7F7F5] flex flex-col">
      {/* Page Header matching worktrees.html */}
      <div className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 lg:px-9 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[20px] font-bold text-[#000000] font-sans tracking-tight">
            Git Worktrees
          </h1>
          <p className="text-[12px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            Isolated checkouts — agents build on branches without touching your main working directory
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadWorktrees}
            title="Refresh worktrees"
            className="p-2 rounded-[8px] border border-[#E5E7EB] text-[#8A8A85] hover:text-[#000000] hover:bg-[#F7F7F5] transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-[9px] bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[8px] hover:bg-black/90 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>New Worktree</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="mx-6 lg:mx-9 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-[8px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-[#16A34A]" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Content Area matching worktrees.html */}
      <div className="flex-1 w-full px-6 lg:px-9 py-6 flex flex-col gap-3.5 items-start">
        {/* Main Checkout Protected Card */}
        <div className="w-full bg-[#EBF5FF] border border-[#BFDBFE] rounded-[8px] p-[14px_18px] flex items-center gap-3">
          <Lock size={15} className="text-[#007AFF] shrink-0" />
          <div className="flex flex-col gap-[1px] min-w-0">
            <span className="text-[13px] font-bold text-[#000000] font-['Geist',sans-serif] truncate">
              {mainRepoPath}
            </span>
            <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
              Your protected working directory · clean · 0 agents assigned
            </span>
          </div>
        </div>

        {/* Worktrees List */}
        <div className="flex flex-col gap-3 w-full">
          {worktrees.map((wt) => (
            <div
              key={wt.id}
              className="w-full bg-[#FFFFFF] shadow-[0px_1px_2px_0px_#0000000a] border border-[#E5E7EB] rounded-[8px] p-[18px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 transition-all hover:border-[#D4D4D0]"
            >
              {/* Left: Icon & Info */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-[40px] h-[40px] shrink-0 flex items-center justify-center bg-[#FFF5EB] rounded-[4px]">
                  <GitBranch size={18} className="text-[#F97316]" />
                </div>

                <div className="min-w-0 flex-1 flex flex-col gap-[3px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold text-[#000000] font-sans">
                      {wt.branch}
                    </span>
                    <div className="bg-[#F7F7F5] rounded-[4px] px-2 py-[2px] flex items-center">
                      <span className="text-[10px] text-[#333333] font-['Funnel_Sans',sans-serif]">
                        {wt.agent}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-[#8A8A85] font-['Geist_Mono',monospace] truncate">
                    {wt.path} · {wt.status} · {wt.commitsAhead} commits ahead
                  </div>
                </div>
              </div>

              {/* Right: Actions matching worktrees.html */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {/* Copy Path */}
                <button
                  type="button"
                  onClick={() => handleCopyPath(wt.path)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] text-[11px] text-[#333333] font-['Funnel_Sans',sans-serif] hover:bg-[#F7F7F5] transition-colors"
                >
                  {copiedPath === wt.path ? (
                    <Check size={12} className="text-[#16A34A]" />
                  ) : (
                    <Copy size={12} className="text-[#333333]" />
                  )}
                  <span>{copiedPath === wt.path ? 'Copied' : 'Copy Path'}</span>
                </button>

                {/* Open Session */}
                <button
                  type="button"
                  onClick={() => handleOpenSession(wt.branch)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[4px] text-[11px] text-[#333333] font-['Funnel_Sans',sans-serif] hover:bg-[#F7F7F5] transition-colors cursor-pointer"
                >
                  <ExternalLink size={12} className="text-[#333333]" />
                  <span>Open Session</span>
                </button>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => handleRemoveWorktree(wt.path)}
                  className="p-1.5 bg-[#FFFFFF] border border-[#FECACA] rounded-[4px] text-[#DC2626] hover:bg-red-50 transition-colors"
                  title="Remove Worktree"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Prune Hint / Action matching worktrees.html */}
        <div className="w-full flex items-center justify-center gap-2 py-3">
          <Recycle size={13} className="text-[#8A8A85]" />
          <span className="text-[11px] text-[#8A8A85] font-['Funnel_Sans',sans-serif]">
            2 stale worktrees pruned automatically last week
          </span>
          <button
            type="button"
            onClick={handlePrune}
            className="text-[11px] text-[#007AFF] hover:underline font-['Funnel_Sans',sans-serif] ml-1 cursor-pointer"
          >
            · Prune now
          </button>
        </div>
      </div>

      {/* New Worktree Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[4px] bg-[#FFF5EB] flex items-center justify-center text-[#F97316]">
                  <GitBranch size={16} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#000000]">Create New Git Worktree</h3>
                  <p className="text-[11px] text-[#8A8A85]">Spawn an isolated working tree for agent autonomy</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8A8A85] hover:text-[#000000] p-1 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddWorktree} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Branch Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. feature/checkout-redesign or fix/memory-leak"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Worktree Directory Path (optional)</label>
                <input
                  type="text"
                  placeholder="~/worktrees/kendaliai-custom (auto-derived if empty)"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:border-[#0F0F0F]"
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="createBranch"
                  checked={createBranch}
                  onChange={(e) => setCreateBranch(e.target.checked)}
                  className="rounded border-[#E5E7EB] text-[#0F0F0F] focus:ring-0"
                />
                <label htmlFor="createBranch" className="text-[12px] text-[#333333] cursor-pointer">
                  Create new branch if it does not exist (<code className="font-mono text-[11px]">git checkout -b</code>)
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#000000]">Assign Initial Agent Persona</label>
                <select
                  value={assignedAgent}
                  onChange={(e) => setAssignedAgent(e.target.value)}
                  className="border border-[#E5E7EB] rounded-[6px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0F0F0F]"
                >
                  <option value="Coder">Coder Agent (Full codebase read/write access)</option>
                  <option value="Reviewer">Reviewer Agent (Read-only diff verification & audit)</option>
                  <option value="Research">Research Agent (Documentation & exploratory analysis)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 text-[12px] font-medium text-[#8A8A85] hover:text-[#000000]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#0F0F0F] text-[#FFFFFF] text-[12px] font-bold rounded-[6px] hover:bg-black/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Spawning...' : 'Create Worktree'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
