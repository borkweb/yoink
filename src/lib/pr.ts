export interface ParsedPR {
  prNumber: number;
  repoSlug: string | null;
}

export function parsePRInput(input: string): ParsedPR | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Full GitHub URL: https://github.com/org/repo/pull/123
  const urlMatch = trimmed.match(/https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (urlMatch) {
    return { prNumber: parseInt(urlMatch[2], 10), repoSlug: urlMatch[1] };
  }

  // Bare number
  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    return { prNumber: parseInt(numMatch[1], 10), repoSlug: null };
  }

  return null;
}

export interface PRMetadata {
  title: string;
  body: string;
  headRefName: string;
  baseRefName: string;
}

export async function fetchPRMetadata(
  ghCommand: string,
  prNumber: number,
  repoSlug?: string
): Promise<PRMetadata> {
  const args = [ghCommand, 'pr', 'view', String(prNumber), '--json', 'title,body,headRefName,baseRefName'];
  if (repoSlug) args.push('-R', repoSlug);

  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`Failed to fetch PR #${prNumber}: ${err.trim()}`);
  }

  const output = await new Response(proc.stdout).text();
  return JSON.parse(output) as PRMetadata;
}
