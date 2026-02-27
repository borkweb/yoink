import { dirname, join } from 'path';
import { homedir } from 'os';
import { globSync } from 'fs';
import type { ProjectConfig } from '../types';

/** Absolute path to the yoink project root (used as --plugin-dir) */
export const YOINK_ROOT = dirname(dirname(import.meta.dir));

const PLUGIN_CACHE_BASE = join(homedir(), '.claude', 'plugins', 'cache');

/** Parse a plugin specifier like "name@marketplace" into its parts. */
export function parsePluginSpecifier(specifier: string): { name: string; marketplace: string } | null {
  const atIndex = specifier.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === specifier.length - 1) return null;
  return { name: specifier.slice(0, atIndex), marketplace: specifier.slice(atIndex + 1) };
}

/** Resolve the installed path for a plugin specifier, or null if not installed. */
export function resolvePluginDir(specifier: string): string | null {
  const parsed = parsePluginSpecifier(specifier);
  if (!parsed) return null;
  const pluginPath = join(PLUGIN_CACHE_BASE, parsed.marketplace, parsed.name);
  try {
    const matches = globSync('*/', { cwd: pluginPath });
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return join(pluginPath, matches[0]);
  } catch {
    return null;
  }
}

/** Install a plugin via Claude CLI. Returns true on success. */
export async function installPlugin(specifier: string): Promise<boolean> {
  const proc = Bun.spawn(['claude', 'plugin', 'install', specifier], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return (await proc.exited) === 0;
}

/** Resolve plugin paths for all specifiers, auto-installing if needed. */
export async function ensurePlugins(specifiers: string[]): Promise<string[]> {
  const dirs: string[] = [];
  for (const specifier of specifiers) {
    let dir = resolvePluginDir(specifier);
    if (!dir) {
      await installPlugin(specifier);
      dir = resolvePluginDir(specifier);
    }
    if (dir) dirs.push(dir);
  }
  return dirs;
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

export function buildReviewPrompt(opts: {
  prNumber: number;
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  githubCommand: string;
  repoSlug?: string;
}): string {
  const repoFlag = opts.repoSlug ? ` -R ${opts.repoSlug}` : '';
  return `You are reviewing PR #${opts.prNumber}.

**PR title:** ${opts.title}

**PR description:**
${opts.body}

## Configuration

- GitHub CLI command: \`${opts.githubCommand}\` (use this for ALL GitHub operations)
- Repository: ${opts.repoSlug ?? '(local)'}
- Base branch: \`${opts.baseBranch}\`
- Head branch: \`${opts.headBranch}\`
- Post comment command: \`${opts.githubCommand} pr comment ${opts.prNumber}${repoFlag}\`

## What To Do

Follow the \`review\` skill to review this PR and post the result as a comment.
Do NOT create commits, branches, or new PRs — this is a read-only review.`;
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
