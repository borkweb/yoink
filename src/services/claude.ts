import { dirname, join } from 'path';
import { homedir } from 'os';
import { globSync } from 'fs';
import type { ProjectConfig } from '../types';

/** Absolute path to the yoink project root (used as --plugin-dir) */
export const YOINK_ROOT = dirname(dirname(import.meta.dir));

const SUPERPOWERS_CACHE = join(homedir(), '.claude', 'plugins', 'cache', 'superpowers-dev', 'superpowers');

/** Resolve the installed superpowers plugin path, or null if not installed. */
export function resolveSuperpowersDir(): string | null {
  const matches = globSync('*/', { cwd: SUPERPOWERS_CACHE });
  if (matches.length === 0) return null;
  // Sort descending to pick the latest version
  matches.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return join(SUPERPOWERS_CACHE, matches[0]);
}

/** Install the superpowers plugin via Claude CLI. Returns true on success. */
export async function installSuperpowers(): Promise<boolean> {
  const proc = Bun.spawn(['claude', 'plugin', 'install', 'superpowers@superpowers-dev'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return (await proc.exited) === 0;
}

/** Resolve superpowers path, auto-installing if needed. */
export async function ensureSuperpowers(): Promise<string | null> {
  let dir = resolveSuperpowersDir();
  if (dir) return dir;
  await installSuperpowers();
  return resolveSuperpowersDir();
}

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
  pluginDirs?: string[];
}): string[] {
  const args = [
    'claude',
    '-p', opts.prompt,
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--allowedTools', opts.allowedTools,
  ];
  for (const dir of opts.pluginDirs ?? []) {
    args.push('--plugin-dir', dir);
  }
  return args;
}

export function buildResumeArgs(opts: {
  sessionId: string;
  maxTurns: number;
  allowedTools: string;
  pluginDirs?: string[];
}): string[] {
  const args = [
    'claude',
    '--resume', opts.sessionId,
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--allowedTools', opts.allowedTools,
  ];
  for (const dir of opts.pluginDirs ?? []) {
    args.push('--plugin-dir', dir);
  }
  return args;
}

export function spawnClaude(opts: {
  prompt?: string;
  sessionId?: string;
  worktreeDir: string;
  maxTurns: number;
  allowedTools: string;
  pluginDirs?: string[];
  onLog: (line: string) => void;
}): { process: ReturnType<typeof Bun.spawn>; result: Promise<ClaudeResult> } {
  const args = opts.sessionId
    ? buildResumeArgs({ sessionId: opts.sessionId, maxTurns: opts.maxTurns, allowedTools: opts.allowedTools, pluginDirs: opts.pluginDirs })
    : buildFreshArgs({ prompt: opts.prompt!, maxTurns: opts.maxTurns, allowedTools: opts.allowedTools, pluginDirs: opts.pluginDirs });

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
