export type IssueStatus =
  | 'queued'
  | 'creating-worktree'
  | 'running-claude'
  | 'pushing'
  | 'pr-created'
  | 'failed'
  | 'stopped'
  | 'abandoned';

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  priority: number;
  state: { name: string; type: string };
}

export interface TrackedIssue {
  issue: LinearIssue;
  project: string;
  repoDir?: string;
  status: IssueStatus;
  logs: string[];
  sessionId?: string;
  isHistory?: boolean;
  prUrl?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  worktreeDir?: string;
}

export interface ProjectConfig {
  name: string;
  repoDir: string;
  baseBranch: string;
  linearTeam: string;
  linearAssignee: string;
  linearLabel: string;
  githubCommand: string;
  allowedTools: string;
  linearApiKey?: string;
}

export interface Config {
  defaults: {
    concurrency: number;
    maxTurns: number;
    pollInterval: number;
  };
  linear: {
    apiKey: string;
  };
  projects: Record<string, ProjectConfig>;
}
