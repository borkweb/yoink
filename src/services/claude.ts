import type { ProjectConfig } from '../types';

export function buildPrompt(
  identifier: string,
  title: string,
  description: string,
  url: string,
  project: ProjectConfig
): string {
  return `You are working on a fix for Linear issue ${identifier}.

**Issue title:** ${title}

**Issue description:**
${description}

**Linear URL:** ${url}

## Instructions

1. Read the issue carefully and understand what needs to be fixed or implemented.
2. Explore the codebase to understand the relevant code. Consult CLAUDE.md for project conventions.
3. Implement the fix or feature as described in the issue.
4. Run relevant tests and linting to verify your changes.
5. Perform a thorough code review on the work and fix any problems.
6. Create a git commit with a conventional commit message referencing the issue:
   - Example: \`fix(scope): description | ${identifier}\`
7. Push the branch to origin:
   - \`git push -u origin HEAD\`
8. Create a pull request (THIS IS REQUIRED — do not skip):
   - Run: \`${project.githubCommand} pr create --base ${project.baseBranch} --title "🤖 ${identifier}: <short description>" --body "<body>"\`
   - The PR body should include: a summary of changes, the Linear issue link (${url}), and a test plan
   - Verify the PR was created by checking the command output for the PR URL
9. Output the PR URL as your final message. The URL must match the pattern: https://github.../pull/NUMBER

IMPORTANT:
- Use \`${project.githubCommand}\` for ALL GitHub CLI operations (not \`gh\`)
- The base branch is \`${project.baseBranch}\`, not \`main\`
- Follow existing code conventions in CLAUDE.md
- Do NOT add \`Co-Authored-By: Claude\` to commit messages
- You MUST create the pull request. Pushing code without a PR is not sufficient.`;
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
}): string[] {
  return [
    'claude',
    '-p', opts.prompt,
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--allowedTools', opts.allowedTools,
  ];
}

export function buildResumeArgs(opts: {
  sessionId: string;
  maxTurns: number;
  allowedTools: string;
}): string[] {
  return [
    'claude',
    '--resume', opts.sessionId,
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--allowedTools', opts.allowedTools,
  ];
}

export function spawnClaude(opts: {
  prompt?: string;
  sessionId?: string;
  worktreeDir: string;
  maxTurns: number;
  allowedTools: string;
  onLog: (line: string) => void;
}): { process: ReturnType<typeof Bun.spawn>; result: Promise<ClaudeResult> } {
  const args = opts.sessionId
    ? buildResumeArgs({ sessionId: opts.sessionId, maxTurns: opts.maxTurns, allowedTools: opts.allowedTools })
    : buildFreshArgs({ prompt: opts.prompt!, maxTurns: opts.maxTurns, allowedTools: opts.allowedTools });

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
