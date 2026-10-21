/**
 * Git client service for Kendali-AI.
 * Connects to the backend via `/api/terminal/exec` and `/api/git/branches`.
 */

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote?: boolean;
}

export interface GitFileStatus {
  path: string;
  status: string; // 'M', 'A', 'D', 'R', '??', etc.
  staged: boolean;
  unstaged: boolean;
  additions?: number;
  deletions?: number;
}

export interface GitStatusResult {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  clean: boolean;
}

export interface GitCommitNode {
  hash: string;
  shortHash: string;
  authorName: string;
  timestamp: string;
  message: string;
}

async function execGit(command: string, cwd?: string): Promise<{ output: string; exitCode: number }> {
  try {
    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: cwd || '' }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { output: errText || `HTTP ${res.status}`, exitCode: res.status };
    }
    const data = await res.json();
    return {
      output: (data.output || '').trim(),
      exitCode: typeof data.exitCode === 'number' ? data.exitCode : 0,
    };
  } catch (err: any) {
    return { output: err.message || 'Execution failed', exitCode: 1 };
  }
}

export class GitService {
  public static async getStatus(cwd?: string): Promise<GitStatusResult> {
    const { output } = await execGit('git status --porcelain=v1 -b', cwd);
    const lines = output.split('\n').filter(Boolean);

    let branch = 'main';
    let ahead = 0;
    let behind = 0;

    const staged: GitFileStatus[] = [];
    const unstaged: GitFileStatus[] = [];

    if (lines.length > 0 && lines[0].startsWith('##')) {
      const header = lines[0].slice(2).trim();
      const match = header.match(/^([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(?:ahead\s+(\d+))?(?:,\s*)?(?:behind\s+(\d+))?\])?/);
      if (match) {
        branch = match[1];
        if (match[3]) ahead = parseInt(match[3], 10);
        if (match[4]) behind = parseInt(match[4], 10);
      } else {
        branch = header.split('...')[0] || 'main';
      }
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 3) continue;
      const indexStatus = line[0];
      const worktreeStatus = line[1];
      const filePath = line.slice(3).trim().replace(/^"|"$/g, '');

      // Untracked
      if (indexStatus === '?' && worktreeStatus === '?') {
        unstaged.push({
          path: filePath,
          status: '??',
          staged: false,
          unstaged: true,
        });
        continue;
      }

      // Staged
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({
          path: filePath,
          status: indexStatus,
          staged: true,
          unstaged: false,
        });
      }

      // Unstaged
      if (worktreeStatus !== ' ' && worktreeStatus !== '?') {
        unstaged.push({
          path: filePath,
          status: worktreeStatus,
          staged: false,
          unstaged: true,
        });
      }
    }

    return {
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      clean: staged.length === 0 && unstaged.length === 0,
    };
  }

  public static async getBranches(cwd?: string): Promise<{ branches: GitBranchInfo[]; current: string }> {
    try {
      const res = await fetch('/api/git/branches');
      if (res.ok) {
        const data = await res.json();
        const rawBranches: string[] = data.branches || [];
        const current = data.current || '';
        const list: GitBranchInfo[] = rawBranches.map((b) => ({
          name: b,
          isCurrent: b === current,
        }));
        if (list.length > 0) return { branches: list, current };
      }
    } catch {}

    const { output } = await execGit('git branch -a --no-color', cwd);
    const lines = output.split('\n').filter(Boolean);
    let current = 'main';
    const branches: GitBranchInfo[] = [];

    for (const raw of lines) {
      const isCurrent = raw.startsWith('*');
      const name = raw.replace(/^[* ]\s*/, '').trim();
      if (!name || name.includes('->')) continue;
      if (isCurrent) current = name;
      branches.push({
        name,
        isCurrent,
        isRemote: name.startsWith('remotes/'),
      });
    }

    return { branches, current };
  }

  public static async getLog(cwd?: string, limit = 25): Promise<GitCommitNode[]> {
    const { output } = await execGit(`git log --pretty=format:'%H|%h|%an|%ad|%s' --date=iso -n ${limit}`, cwd);
    if (!output) return [];

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, authorName, timestamp, ...msgParts] = line.split('|');
        return {
          hash: hash || '',
          shortHash: shortHash || '',
          authorName: authorName || 'Unknown',
          timestamp: timestamp || '',
          message: msgParts.join('|') || '',
        };
      });
  }

  public static async getFileDiff(filePath: string, staged = false, cwd?: string): Promise<string> {
    const cmd = staged ? `git diff --cached -- "${filePath}"` : `git diff -- "${filePath}"`;
    const { output } = await execGit(cmd, cwd);
    if (output) return output;

    // If untracked file, show whole content as addition
    if (!staged) {
      const showCmd = `cat "${filePath}" 2>/dev/null || true`;
      const { output: catOut } = await execGit(showCmd, cwd);
      if (catOut) {
        const lines = catOut.split('\n');
        return [
          `--- /dev/null`,
          `+++ b/${filePath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((l) => `+${l}`),
        ].join('\n');
      }
    }
    return '';
  }

  public static async getCommitDiff(hash: string, cwd?: string): Promise<string> {
    const { output } = await execGit(`git show --patch "${hash}"`, cwd);
    return output;
  }

  public static async stageFiles(files: string[], cwd?: string): Promise<boolean> {
    const escaped = files.map((f) => `"${f}"`).join(' ');
    const { exitCode } = await execGit(`git add -- ${escaped}`, cwd);
    return exitCode === 0;
  }

  public static async unstageFiles(files: string[], cwd?: string): Promise<boolean> {
    const escaped = files.map((f) => `"${f}"`).join(' ');
    const { exitCode } = await execGit(`git reset HEAD -- ${escaped}`, cwd);
    return exitCode === 0;
  }

  public static async discardFiles(files: string[], cwd?: string): Promise<boolean> {
    const escaped = files.map((f) => `"${f}"`).join(' ');
    await execGit(`git checkout -- ${escaped}`, cwd);
    await execGit(`git clean -fd -- ${escaped}`, cwd);
    return true;
  }

  public static async commit(message: string, cwd?: string): Promise<{ success: boolean; output: string }> {
    const safeMsg = message.replace(/"/g, '\\"');
    const { output, exitCode } = await execGit(`git commit -m "${safeMsg}"`, cwd);
    return { success: exitCode === 0, output };
  }

  public static async checkout(branch: string, cwd?: string): Promise<boolean> {
    const { exitCode } = await execGit(`git checkout "${branch}"`, cwd);
    return exitCode === 0;
  }

  public static async createBranch(branch: string, cwd?: string): Promise<boolean> {
    const { exitCode } = await execGit(`git checkout -b "${branch}"`, cwd);
    return exitCode === 0;
  }

  public static async push(cwd?: string): Promise<{ success: boolean; output: string }> {
    const { output, exitCode } = await execGit('git push', cwd);
    return { success: exitCode === 0, output };
  }

  public static async pull(cwd?: string): Promise<{ success: boolean; output: string }> {
    const { output, exitCode } = await execGit('git pull', cwd);
    return { success: exitCode === 0, output };
  }

  public static async fetch(cwd?: string): Promise<{ success: boolean; output: string }> {
    const { output, exitCode } = await execGit('git fetch', cwd);
    return { success: exitCode === 0, output };
  }
}
