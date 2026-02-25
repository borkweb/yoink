import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { removeWorktree, deleteBranch } from './git';

describe('git worktree management', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'yoink-git-test-'));
    const run = async (args: string[]) => {
      const proc = Bun.spawn(['git', '-C', repoDir, ...args], {
        stdout: 'pipe', stderr: 'pipe',
      });
      await proc.exited;
    };
    await run(['init', '-b', 'main']);
    await run(['commit', '--allow-empty', '-m', 'init']);
  });

  afterEach(() => {
    Bun.spawnSync(['git', '-C', repoDir, 'worktree', 'prune'], { stdout: 'pipe', stderr: 'pipe' });
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('removeWorktree removes the directory and git worktree entry', async () => {
    const worktreeDir = `${repoDir}-test-1`;
    const addProc = Bun.spawn(
      ['git', '-C', repoDir, 'worktree', 'add', '-b', 'test-branch', worktreeDir, 'main'],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    await addProc.exited;
    expect(existsSync(worktreeDir)).toBe(true);

    await removeWorktree(repoDir, worktreeDir);
    expect(existsSync(worktreeDir)).toBe(false);
  });

  it('deleteBranch removes a local branch', async () => {
    const proc = Bun.spawn(['git', '-C', repoDir, 'branch', 'to-delete'], {
      stdout: 'pipe', stderr: 'pipe',
    });
    await proc.exited;

    await deleteBranch(repoDir, 'to-delete');

    const check = Bun.spawnSync(['git', '-C', repoDir, 'branch', '--list', 'to-delete'], { stdout: 'pipe' });
    const output = new TextDecoder().decode(check.stdout).trim();
    expect(output).toBe('');
  });

  it('removeWorktree does not throw if directory already gone', async () => {
    await expect(removeWorktree(repoDir, '/tmp/nonexistent-worktree-xyz')).resolves.toBeUndefined();
  });
});
