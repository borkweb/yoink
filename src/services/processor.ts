import { join } from 'path';
import { homedir } from 'os';
import type { Config, TrackedIssue, IssueStatus, ProjectConfig } from '../types';
import { fetchIssues, updateIssueState, addComment } from './linear';
import { createWorktree, removeWorktree, deleteBranch, worktreeDirFor } from '../lib/git';
import { buildPrompt, spawnClaude } from './claude';
import { loadState, saveIssueState, pruneState, saveState } from './state';

export type ProcessorEvent =
  | { type: 'update'; issues: TrackedIssue[] }
  | { type: 'done' }
  | { type: 'polling'; nextPollAt: number };

export class Processor {
  private issues: TrackedIssue[] = [];
  private activeCount = 0;
  private paused = false;
  private shuttingDown = false;
  private listeners: ((event: ProcessorEvent) => void)[] = [];
  private activeProcesses = new Map<string, ReturnType<typeof Bun.spawn>>();
  private seenIssueIds = new Set<string>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollContext:
    | { type: 'project'; project: string }
    | { type: 'all' }
    | null = null;
  private statePath: string;

  constructor(
    private config: Config,
    private concurrency: number,
    private pollInterval: number = 0,
    statePath?: string
  ) {
    this.statePath = statePath ?? join(homedir(), '.config', 'yoink', 'state.json');
  }

  on(listener: (event: ProcessorEvent) => void) {
    this.listeners.push(listener);
  }

  private emit(event: ProcessorEvent) {
    for (const listener of this.listeners) listener(event);
  }

  getIssues(): TrackedIssue[] {
    return [...this.issues];
  }

  isPaused(): boolean {
    return this.paused;
  }

  isPolling(): boolean {
    return this.pollInterval > 0 && this.pollContext !== null;
  }

  getHistoryIssues(project: string): TrackedIssue[] {
    const state = pruneState(loadState(this.statePath), 24 * 60 * 60 * 1000);
    saveState(this.statePath, state);

    const projectState = state.sessions[project];
    if (!projectState) return [];

    return Object.entries(projectState.issues).map(([identifier, persisted]) => ({
      issue: {
        id: '',
        identifier,
        title: persisted.branch,
        description: '',
        url: '',
        priority: 0,
        state: { name: '', type: '' },
      },
      project,
      status: persisted.status as IssueStatus,
      logs: [],
      prUrl: persisted.prUrl ?? undefined,
      error: persisted.error ?? undefined,
      startedAt: persisted.startedAt,
      completedAt: persisted.completedAt,
      worktreeDir: persisted.worktreeDir,
      sessionId: persisted.sessionId ?? undefined,
      isHistory: true,
    }));
  }

  mergeHistory(historyIssues: TrackedIssue[]): void {
    const existingIds = new Set(this.issues.map((i) => i.issue.identifier));
    const unique = historyIssues.filter((h) => !existingIds.has(h.issue.identifier));
    this.issues = [...unique, ...this.issues];
    this.emit({ type: 'update', issues: this.getIssues() });
  }

  async loadIssues(projectName: string, singleIssue?: string): Promise<void> {
    const project = this.config.projects[projectName];
    if (!project) throw new Error(`Unknown project: ${projectName}`);

    const apiKey = project.linearApiKey ?? this.config.linear.apiKey;
    const linearIssues = await fetchIssues(apiKey, project, singleIssue);

    this.issues = linearIssues.map((issue) => ({
      issue,
      project: projectName,
      status: 'queued' as IssueStatus,
      logs: [],
    }));

    for (const issue of linearIssues) {
      this.seenIssueIds.add(issue.id);
    }

    // Only poll in batch mode, not single-issue
    if (!singleIssue) {
      this.pollContext = { type: 'project', project: projectName };
    }

    this.emit({ type: 'update', issues: this.getIssues() });
  }

  async loadAllProjects(): Promise<void> {
    const allIssues: TrackedIssue[] = [];

    for (const [name, project] of Object.entries(this.config.projects)) {
      const apiKey = project.linearApiKey ?? this.config.linear.apiKey;
      try {
        const linearIssues = await fetchIssues(apiKey, project);
        for (const issue of linearIssues) {
          this.seenIssueIds.add(issue.id);
          allIssues.push({
            issue,
            project: name,
            status: 'queued',
            logs: [],
          });
        }
      } catch (err) {
        allIssues.push({
          issue: {
            id: '',
            identifier: `${project.linearTeam}-ERR`,
            title: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
            description: '',
            url: '',
            priority: 0,
            state: { name: 'Error', type: 'error' },
          },
          project: name,
          status: 'failed',
          logs: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.issues = allIssues;
    this.pollContext = { type: 'all' };
    this.emit({ type: 'update', issues: this.getIssues() });
  }

  start(): void {
    this.processQueue();
    this.schedulePoll();
  }

  pause(): void {
    this.paused = true;
    this.clearPollTimer();
  }

  resume(): void {
    this.paused = false;
    this.processQueue();
    this.schedulePoll();
  }

  async gracefulShutdown(): Promise<void> {
    this.shuttingDown = true;
    this.paused = true;
    this.clearPollTimer();

    const promises = Array.from(this.activeProcesses.values()).map((p) => p.exited);
    await Promise.all(promises);
  }

  retryIssue(identifier: string): void {
    const tracked = this.issues.find((i) => i.issue.identifier === identifier);
    if (!tracked || tracked.status !== 'failed') return;

    const project = this.config.projects[tracked.project];
    const wtDir = tracked.worktreeDir || worktreeDirFor(project.repoDir, identifier);
    const branch = `linear/${identifier.toLowerCase()}`;

    this.updateIssue(tracked, {
      status: 'creating-worktree',
      error: undefined,
      logs: [],
      sessionId: undefined,
      worktreeDir: undefined,
      startedAt: undefined,
      completedAt: undefined,
      prUrl: undefined,
      isHistory: false,
    });

    const cleanup = removeWorktree(project.repoDir, wtDir)
      .then(() => deleteBranch(project.repoDir, branch))
      .catch(() => {});

    cleanup.then(() => {
      this.updateIssue(tracked, { status: 'queued' });
      this.processQueue();
    });
  }

  continueIssue(identifier: string): void {
    const tracked = this.issues.find((i) => i.issue.identifier === identifier);
    if (!tracked || tracked.status !== 'failed') return;

    this.updateIssue(tracked, {
      status: 'running-claude',
      error: undefined,
      isHistory: false,
    });

    this.activeCount++;

    this.resumeIssue(tracked).finally(() => {
      this.activeCount--;
      this.processQueue();
    });
  }

  deleteIssue(identifier: string): void {
    const tracked = this.issues.find((i) => i.issue.identifier === identifier);
    if (!tracked || tracked.status !== 'failed') return;

    const project = this.config.projects[tracked.project];
    const wtDir = tracked.worktreeDir || worktreeDirFor(project.repoDir, identifier);
    const branch = `linear/${identifier.toLowerCase()}`;

    this.updateIssue(tracked, {
      status: 'abandoned',
      isHistory: false,
    });

    removeWorktree(project.repoDir, wtDir)
      .then(() => deleteBranch(project.repoDir, branch))
      .catch(() => {});
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll(): void {
    if (this.pollTimer) return;
    if (this.pollInterval <= 0) return;
    if (!this.pollContext) return;
    if (this.shuttingDown || this.paused) return;

    const nextPollAt = Date.now() + this.pollInterval;
    this.emit({ type: 'polling', nextPollAt });
    this.pollTimer = setTimeout(() => this.pollForNewIssues(), this.pollInterval);
  }

  private async pollForNewIssues(): Promise<void> {
    this.pollTimer = null;
    if (this.shuttingDown || this.paused) return;

    try {
      const newIssues: TrackedIssue[] = [];

      if (this.pollContext?.type === 'all') {
        for (const [name, project] of Object.entries(this.config.projects)) {
          const apiKey = project.linearApiKey ?? this.config.linear.apiKey;
          try {
            const linearIssues = await fetchIssues(apiKey, project);
            for (const issue of linearIssues) {
              if (!this.seenIssueIds.has(issue.id)) {
                this.seenIssueIds.add(issue.id);
                newIssues.push({ issue, project: name, status: 'queued', logs: [] });
              }
            }
          } catch {}
        }
      } else if (this.pollContext?.type === 'project') {
        const project = this.config.projects[this.pollContext.project];
        const apiKey = project.linearApiKey ?? this.config.linear.apiKey;
        try {
          const linearIssues = await fetchIssues(apiKey, project);
          for (const issue of linearIssues) {
            if (!this.seenIssueIds.has(issue.id)) {
              this.seenIssueIds.add(issue.id);
              newIssues.push({ issue, project: this.pollContext.project, status: 'queued', logs: [] });
            }
          }
        } catch {}
      }

      if (newIssues.length > 0) {
        this.issues.push(...newIssues);
        this.emit({ type: 'update', issues: this.getIssues() });
        this.processQueue();
      }
    } catch {}

    // Always schedule next poll
    this.schedulePoll();
  }

  private processQueue(): void {
    while (this.activeCount < this.concurrency && !this.paused && !this.shuttingDown) {
      const next = this.issues.find((i) => i.status === 'queued');
      if (!next) break;

      this.activeCount++;
      next.status = 'creating-worktree';
      this.processIssue(next).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }

    // Only emit done when not polling
    if (
      this.activeCount === 0 &&
      !this.issues.some((i) => i.status === 'queued') &&
      !this.isPolling()
    ) {
      this.emit({ type: 'done' });
    }
  }

  private updateIssue(tracked: TrackedIssue, updates: Partial<TrackedIssue>): void {
    Object.assign(tracked, updates);
    this.emit({ type: 'update', issues: this.getIssues() });
    this.persistIssue(tracked);
  }

  private persistIssue(tracked: TrackedIssue): void {
    if (!tracked.issue.identifier || tracked.status === 'queued') return;

    saveIssueState(this.statePath, tracked.project, tracked.issue.identifier, {
      status: tracked.status,
      branch: `linear/${tracked.issue.identifier.toLowerCase()}`,
      worktreeDir: tracked.worktreeDir ?? '',
      sessionId: tracked.sessionId ?? null,
      prUrl: tracked.prUrl ?? null,
      startedAt: tracked.startedAt ?? Date.now(),
      completedAt: tracked.completedAt ?? 0,
      error: tracked.error ?? null,
    });
  }

  private async processIssue(tracked: TrackedIssue): Promise<void> {
    const { issue } = tracked;
    const project = this.config.projects[tracked.project];
    const apiKey = project.linearApiKey ?? this.config.linear.apiKey;

    try {
      this.updateIssue(tracked, { status: 'creating-worktree', startedAt: Date.now() });

      const { worktreeDir } = await createWorktree(
        project.repoDir,
        project.baseBranch,
        issue.identifier
      );

      this.updateIssue(tracked, { worktreeDir });

      await updateIssueState(apiKey, project.linearTeam, issue.id, 'In Progress').catch(() => {});

      this.updateIssue(tracked, { status: 'running-claude' });

      const prompt = buildPrompt(
        issue.identifier,
        issue.title,
        issue.description,
        issue.url,
        project
      );

      const { process: proc, result } = spawnClaude({
        prompt,
        worktreeDir,
        maxTurns: this.config.defaults.maxTurns,
        allowedTools: project.allowedTools,
        onLog: (line) => {
          tracked.logs.push(line);
          if (tracked.logs.length > 500) tracked.logs.shift();
          this.emit({ type: 'update', issues: this.getIssues() });
        },
      });

      this.activeProcesses.set(issue.identifier, proc);
      const claudeResult = await result;
      this.activeProcesses.delete(issue.identifier);

      if (claudeResult.sessionId) {
        tracked.sessionId = claudeResult.sessionId;
      }

      if (claudeResult.exitCode !== 0) {
        throw new Error(`Claude exited with code ${claudeResult.exitCode}`);
      }

      const completedAt = Date.now();

      if (claudeResult.prUrl) {
        await this.ensureEmojiInPrTitle(claudeResult.prUrl, project).catch(() => {});
        this.updateIssue(tracked, {
          status: 'pr-created',
          prUrl: claudeResult.prUrl,
          completedAt,
        });
        await addComment(
          apiKey,
          issue.id,
          `Claude Code automation created a PR: ${claudeResult.prUrl}`
        ).catch(() => {});
        await updateIssueState(apiKey, project.linearTeam, issue.id, 'In Review').catch(() => {});
        // Clean up worktree after successful PR
        if (tracked.worktreeDir) {
          await removeWorktree(project.repoDir, tracked.worktreeDir).catch(() => {});
        }
      } else {
        this.updateIssue(tracked, {
          status: 'failed',
          error: 'Claude completed but no PR URL was detected',
          completedAt,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateIssue(tracked, {
        status: 'failed',
        error: message,
        completedAt: Date.now(),
      });
    }
  }

  private async resumeIssue(tracked: TrackedIssue): Promise<void> {
    const { issue } = tracked;
    const project = this.config.projects[tracked.project];
    const apiKey = project.linearApiKey ?? this.config.linear.apiKey;

    try {
      const { process: proc, result } = spawnClaude({
        sessionId: tracked.sessionId ?? undefined,
        prompt: tracked.sessionId
          ? undefined
          : buildPrompt(issue.identifier, issue.title, issue.description, issue.url, project) +
            `\n\nNOTE: A previous attempt on this issue failed with: ${tracked.error ?? 'unknown error'}. The worktree may contain partial work. Review what exists and continue from where it left off.`,
        worktreeDir: tracked.worktreeDir!,
        maxTurns: this.config.defaults.maxTurns,
        allowedTools: project.allowedTools,
        onLog: (line) => {
          tracked.logs.push(line);
          if (tracked.logs.length > 500) tracked.logs.shift();
          this.emit({ type: 'update', issues: this.getIssues() });
        },
      });

      this.activeProcesses.set(issue.identifier, proc);
      const claudeResult = await result;
      this.activeProcesses.delete(issue.identifier);

      if (claudeResult.sessionId) {
        tracked.sessionId = claudeResult.sessionId;
      }

      if (claudeResult.exitCode !== 0) {
        throw new Error(`Claude exited with code ${claudeResult.exitCode}`);
      }

      const completedAt = Date.now();

      if (claudeResult.prUrl) {
        await this.ensureEmojiInPrTitle(claudeResult.prUrl, project).catch(() => {});
        this.updateIssue(tracked, { status: 'pr-created', prUrl: claudeResult.prUrl, completedAt });
        await addComment(apiKey, issue.id, `Claude Code automation created a PR: ${claudeResult.prUrl}`).catch(() => {});
        await updateIssueState(apiKey, project.linearTeam, issue.id, 'In Review').catch(() => {});
        // Clean up worktree after successful PR
        if (tracked.worktreeDir) {
          await removeWorktree(project.repoDir, tracked.worktreeDir).catch(() => {});
        }
      } else {
        this.updateIssue(tracked, { status: 'failed', error: 'Claude completed but no PR URL was detected', completedAt });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateIssue(tracked, { status: 'failed', error: message, completedAt: Date.now() });
    }
  }

  private async ensureEmojiInPrTitle(prUrl: string, project: ProjectConfig): Promise<void> {
    const match = prUrl.match(/github[^/]*\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (!match) return;

    const [, repo, prNumber] = match;
    const ghCmd = project.githubCommand;

    const viewProc = Bun.spawn(
      [ghCmd, 'pr', 'view', prNumber, '--json', 'title', '-R', repo],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    if ((await viewProc.exited) !== 0) return;

    const output = await new Response(viewProc.stdout).text();
    const { title } = JSON.parse(output);

    if (title.startsWith('\u{1F916}')) return;

    const newTitle = `\u{1F916} ${title}`;
    const editProc = Bun.spawn(
      [ghCmd, 'pr', 'edit', prNumber, '--title', newTitle, '-R', repo],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    await editProc.exited;
  }
}
