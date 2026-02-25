import { existsSync, rmSync } from 'fs';
import { basename } from 'path';

export async function createWorktree(
  repoDir: string,
  baseBranch: string,
  identifier: string
): Promise<{ worktreeDir: string; branchName: string }> {
  const idLower = identifier.toLowerCase();
  const branchName = `linear/${idLower}`;
  const worktreeDir = worktreeDirFor(repoDir, identifier);

  if (existsSync(worktreeDir)) {
    throw new Error(`Worktree already exists at ${worktreeDir}`);
  }

  const fetchProc = Bun.spawn(['git', '-C', repoDir, 'fetch', 'origin', baseBranch], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if ((await fetchProc.exited) !== 0) {
    const err = await new Response(fetchProc.stderr).text();
    throw new Error(`git fetch failed: ${err}`);
  }

  const addProc = Bun.spawn(
    ['git', '-C', repoDir, 'worktree', 'add', '-b', branchName, worktreeDir, `origin/${baseBranch}`],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  if ((await addProc.exited) !== 0) {
    const err = await new Response(addProc.stderr).text();
    throw new Error(`git worktree add failed: ${err}`);
  }

  return { worktreeDir, branchName };
}

export function worktreeDirFor(repoDir: string, identifier: string): string {
  const idLower = identifier.toLowerCase();
  const repoName = basename(repoDir);
  return `${repoDir}/../${repoName}-${idLower}`;
}

export function reviewWorktreeDirFor(repoDir: string, prNumber: number): string {
  const repoName = basename(repoDir);
  return `${repoDir}/../${repoName}-pr-${prNumber}`;
}

export async function createReviewWorktree(
  repoDir: string,
  headRefName: string,
  prNumber: number
): Promise<{ worktreeDir: string }> {
  const worktreeDir = reviewWorktreeDirFor(repoDir, prNumber);

  if (existsSync(worktreeDir)) {
    throw new Error(`Worktree already exists at ${worktreeDir}`);
  }

  const fetchProc = Bun.spawn(['git', '-C', repoDir, 'fetch', 'origin', headRefName], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if ((await fetchProc.exited) !== 0) {
    const err = await new Response(fetchProc.stderr).text();
    throw new Error(`git fetch failed: ${err}`);
  }

  const addProc = Bun.spawn(
    ['git', '-C', repoDir, 'worktree', 'add', worktreeDir, `origin/${headRefName}`],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  if ((await addProc.exited) !== 0) {
    const err = await new Response(addProc.stderr).text();
    throw new Error(`git worktree add failed: ${err}`);
  }

  return { worktreeDir };
}

export async function removeWorktree(
  repoDir: string,
  worktreeDir: string
): Promise<void> {
  // Try git worktree remove first
  const proc = Bun.spawn(
    ['git', '-C', repoDir, 'worktree', 'remove', '--force', worktreeDir],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  await proc.exited;

  // If directory still exists (orphaned/stale worktree), force remove it
  if (existsSync(worktreeDir)) {
    rmSync(worktreeDir, { recursive: true, force: true });
  }

  // Prune stale worktree entries
  const prune = Bun.spawn(['git', '-C', repoDir, 'worktree', 'prune'], {
    stdout: 'pipe', stderr: 'pipe',
  });
  await prune.exited;
}

export async function deleteBranch(
  repoDir: string,
  branchName: string
): Promise<void> {
  const proc = Bun.spawn(
    ['git', '-C', repoDir, 'branch', '-D', branchName],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    if (!err.includes('not found')) {
      throw new Error(`git branch delete failed: ${err}`);
    }
  }
}
