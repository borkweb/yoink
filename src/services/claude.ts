import { dirname } from 'path';
import type { ProjectConfig } from '../types';

/** Absolute path to the yoink project root (used as --plugin-dir) */
export const YOINK_ROOT = dirname(dirname(import.meta.dir));

export function buildPrompt(
  identifier: string,
  title: string,
  description: string,
  url: string,
  project: ProjectConfig
): string {
  return `You are working on Linear issue ${identifier}.

**Issue title:** ${title}

**Issue description:**
${description}

**Linear URL:** ${url}

## Project Configuration

- GitHub CLI command: \`${project.githubCommand}\` (use this for ALL GitHub operations, not \`gh\`)
- Base branch: \`${project.baseBranch}\`
- Issue identifier for commits: ${identifier}

## What To Do

Follow the \`yoink-workflow\` skill to complete this issue end-to-end.
Do NOT add \`Co-Authored-By: Claude\` to commit messages.
You MUST create a pull request — pushing code without a PR is not sufficient.`;
}

export interface ClaudeResult {
  prUrl: string | null;
  sessionId: string | null;
  output: string;
  exitCode: number;
}

export function extractSessionId(output: string): string | null {
  try {
    const json = JSON.parse(output);
    return json.session_id ?? null;
  } catch {
    return null;
  }
}

export function buildFreshArgs(opts: {
  prompt: string;
  maxTurns: number;
  allowedTools: string;
  pluginDir?: string;
}): string[] {
  const args = [
    'claude',
    '-p', opts.prompt,
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--allowedTools', opts.allowedTools,
  ];
  if (opts.pluginDir) args.push('--plugin-dir', opts.pluginDir);
  return args;
}

export function buildResumeArgs(opts: {
  sessionId: string;
  maxTurns: number;
  allowedTools: string;
  pluginDir?: string;
}): string[] {
  const args = [
    'claude',
    '--resume', opts.sessionId,
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--allowedTools', opts.allowedTools,
  ];
  if (opts.pluginDir) args.push('--plugin-dir', opts.pluginDir);
  return args;
}

export function spawnClaude(opts: {
  prompt?: string;
  sessionId?: string;
  worktreeDir: string;
  maxTurns: number;
  allowedTools: string;
  pluginDir?: string;
  onLog: (line: string) => void;
}): { process: ReturnType<typeof Bun.spawn>; result: Promise<ClaudeResult> } {
  const args = opts.sessionId
    ? buildResumeArgs({ sessionId: opts.sessionId, maxTurns: opts.maxTurns, allowedTools: opts.allowedTools, pluginDir: opts.pluginDir })
    : buildFreshArgs({ prompt: opts.prompt!, maxTurns: opts.maxTurns, allowedTools: opts.allowedTools, pluginDir: opts.pluginDir });

  const proc = Bun.spawn(args, {
    cwd: opts.worktreeDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Stream stderr line-by-line for live log output
  const stderrDone = (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) opts.onLog(line.trim());
      }
    }

    if (buffer.trim()) opts.onLog(buffer.trim());
  })();

  const result = (async (): Promise<ClaudeResult> => {
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    await stderrDone;

    let prUrl: string | null = null;
    const sessionId = extractSessionId(stdout);

    try {
      const json = JSON.parse(stdout);
      const text = json.result ?? stdout;
      const match = text.match(/https:\/\/github[^\s"]+\/pull\/\d+/);
      prUrl = match?.[0] ?? null;
    } catch {
      const match = stdout.match(/https:\/\/github[^\s"]+\/pull\/\d+/);
      prUrl = match?.[0] ?? null;
    }

    return { prUrl, sessionId, output: stdout, exitCode };
  })();

  return { process: proc, result };
}
