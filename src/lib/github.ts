import { splitCommand } from './shell';

export async function createPullRequest(opts: {
  worktreeDir: string;
  branchName: string;
  baseBranch: string;
  title: string;
  body: string;
  githubCommand: string;
}): Promise<string | null> {
  // Push
  const push = Bun.spawn(['git', '-C', opts.worktreeDir, 'push', '-u', 'origin', opts.branchName], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if ((await push.exited) !== 0) {
    const err = await new Response(push.stderr).text();
    throw new Error(`git push failed: ${err}`);
  }

  // Create PR
  const cmdParts = splitCommand(opts.githubCommand);
  const proc = Bun.spawn(
    [...cmdParts, 'pr', 'create', '--title', opts.title, '--body', opts.body, '--base', opts.baseBranch],
    { cwd: opts.worktreeDir, stdout: 'pipe', stderr: 'pipe' }
  );

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`PR creation failed: ${stderr}`);
  }

  const match = output.match(/https:\/\/github[^\s]+\/pull\/\d+/);
  return match?.[0] ?? null;
}
