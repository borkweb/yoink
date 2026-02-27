import { join, basename } from 'path';
import { homedir } from 'os';
import type { Config, TrackedIssue, IssueStatus, ProjectConfig } from '../types';
import { fetchIssues, updateIssueState, addComment } from './linear';
import { createWorktree, removeWorktree, deleteBranch, worktreeDirFor, createReviewWorktree } from '../lib/git';
import { buildPrompt, buildReviewPrompt, spawnClaude, YOINK_ROOT, ensureSuperpowers } from './claude';
import { loadState, saveIssueState, pruneState, saveState } from './state';
import { fetchPRMetadata } from '../lib/pr';
import { splitCommand } from '../lib/shell';

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
  private pluginDirs: string[] = [YOINK_ROOT];

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

  off(listener: (event: ProcessorEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
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

    const projectConfig = this.config.projects[project];

    // Build a map of PR numbers to URLs from siblings that have them
    const prUrlByNumber = new Map<string, string>();
    for (const [, persisted] of Object.entries(projectState.issues)) {
      if (persisted.prUrl) {
        const match = persisted.prUrl.match(/\/pull\/(\d+)/);
        if (match) prUrlByNumber.set(match[1], persisted.prUrl);
      }
    }

    return Object.entries(projectState.issues).map(([identifier, persisted]) => {
      // For PR-* items missing prUrl, try to reconstruct from siblings
      let prUrl = persisted.prUrl ?? undefined;
      if (!prUrl && identifier.startsWith('PR-')) {
        prUrl = prUrlByNumber.get(identifier.slice(3));
      }

      return {
        issue: {
          id: '',
          identifier,
          title: persisted.title ?? persisted.branch,
          description: '',
          url: persisted.issueUrl ?? '',
          priority: 0,
          state: { name: '', type: '' },
        },
        project,
        repoDir: projectConfig?.repoDir,
        status: persisted.status as IssueStatus,
        logs: [],
        prUrl,
        error: persisted.error ?? undefined,
        startedAt: persisted.startedAt,
        completedAt: persisted.completedAt,
        worktreeDir: persisted.worktreeDir,
        sessionId: persisted.sessionId ?? undefined,
        isHistory: true,
      };
    });
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
      repoDir: project.repoDir,
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
            repoDir: project.repoDir,
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
          repoDir: project.repoDir,
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

  async start(): Promise<void> {
    const superpowersDir = await ensureSuperpowers();
    if (superpowersDir) {
      this.pluginDirs = [YOINK_ROOT, superpowersDir];
    }
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

  /** Kill all active Claude processes immediately (used on SIGTERM). */
  killActiveProcesses(): void {
    for (const proc of this.activeProcesses.values()) {
      proc.kill('SIGTERM');
    }
  }

  stopIssue(identifier: string): void {
    const tracked = this.issues.find((i) => i.issue.identifier === identifier);
    if (!tracked) return;

    const activeStatuses = ['running-claude', 'creating-worktree', 'pushing', 'reviewing'];
    if (!activeStatuses.includes(tracked.status)) return;

    // Set stopped before killing so catch blocks preserve this status
    this.updateIssue(tracked, { status: 'stopped', completedAt: Date.now() });

    const proc = this.activeProcesses.get(identifier);
    if (proc) proc.kill();
  }

  retryIssue(identifier: string): void {
    const tracked = this.issues.find((i) => i.issue.identifier === identifier);
    if (!tracked || (tracked.status !== 'failed' && tracked.status !== 'stopped')) return;

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
    if (!tracked || (tracked.status !== 'failed' && tracked.status !== 'stopped')) return;

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
    if (!tracked || (tracked.status !== 'failed' && tracked.status !== 'stopped')) return;

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

  async reviewPR(input: { prNumber: number; repoSlug: string | null; projectName?: string }): Promise<void> {
    // Resolve project
    let projectName: string;
    let project: ProjectConfig;
    let repoSlug = input.repoSlug;

    if (input.repoSlug) {
      const match = this.matchProjectByRepo(input.repoSlug);
      if (!match) throw new Error(`No configured project matches repo: ${input.repoSlug}`);
      projectName = match.name;
      project = match.project;
    } else if (input.projectName) {
      projectName = input.projectName;
      project = this.config.projects[projectName];
      if (!project) throw new Error(`Unknown project: ${projectName}`);
    } else {
      const names = Object.keys(this.config.projects);
      if (names.length !== 1) throw new Error('Multiple projects configured — provide a full PR URL');
      projectName = names[0];
      project = this.config.projects[projectName];
    }

    // Fetch PR metadata
    const meta = await fetchPRMetadata(project.githubCommand, input.prNumber, repoSlug ?? undefined);

    // Create tracked issue entry for the dashboard
    const identifier = `PR-${input.prNumber}`;
    const tracked: TrackedIssue = {
      issue: {
        id: `review-${input.prNumber}-${Date.now()}`,
        identifier,
        title: meta.title,
        description: meta.body,
        url: '',
        priority: 0,
        state: { name: 'Review', type: 'review' },
      },
      project: projectName,
      repoDir: project.repoDir,
      status: 'creating-worktree',
      logs: [],
      prNumber: input.prNumber,
      prUrl: meta.url,
      startedAt: Date.now(),
    };

    this.issues.push(tracked);
    this.emit({ type: 'update', issues: this.getIssues() });

    try {
      // Create worktree on PR branch
      const { worktreeDir } = await createReviewWorktree(
        project.repoDir,
        meta.headRefName,
        input.prNumber
      );
      this.updateIssue(tracked, { worktreeDir, status: 'reviewing' });

      // Build review prompt and spawn Claude
      const prompt = buildReviewPrompt({
        prNumber: input.prNumber,
        title: meta.title,
        body: meta.body,
        baseBranch: meta.baseRefName,
        headBranch: meta.headRefName,
        githubCommand: project.githubCommand,
        repoSlug: repoSlug ?? undefined,
      });

      const { process: proc, result } = spawnClaude({
        prompt,
        worktreeDir,
        maxTurns: this.config.defaults.maxTurns,
        allowedTools: project.allowedTools,
        pluginDirs: this.pluginDirs,
        onLog: (line) => {
          tracked.logs.push(line);
          if (tracked.logs.length > 500) tracked.logs.shift();
          this.emit({ type: 'update', issues: this.getIssues() });
        },
      });

      this.activeProcesses.set(identifier, proc);
      const claudeResult = await result;
      this.activeProcesses.delete(identifier);

      if (claudeResult.sessionId) {
        tracked.sessionId = claudeResult.sessionId;
      }

      if (claudeResult.exitCode !== 0) {
        throw new Error(`Claude exited with code ${claudeResult.exitCode}`);
      }

      this.updateIssue(tracked, { status: 'review-posted', prUrl: meta.url, completedAt: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateIssue(tracked, { status: 'failed', error: message, completedAt: Date.now() });
    } finally {
      // Always clean up the worktree
      if (tracked.worktreeDir) {
        await removeWorktree(project.repoDir, tracked.worktreeDir).catch(() => {});
      }
    }
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
                newIssues.push({ issue, project: name, repoDir: project.repoDir, status: 'queued', logs: [] });
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
              newIssues.push({ issue, project: this.pollContext.project, repoDir: project.repoDir, status: 'queued', logs: [] });
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
      this.updateIssue(next, { status: 'creating-worktree' });
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
      title: tracked.issue.title,
      issueUrl: tracked.issue.url || null,
      worktreeDir: tracked.worktreeDir ?? '',
      sessionId: tracked.sessionId ?? null,
      prUrl: tracked.prUrl ?? null,
      startedAt: tracked.startedAt ?? Date.now(),
      completedAt: tracked.completedAt ?? 0,
      error: tracked.error ?? null,
    });
  }

  private matchProjectByRepo(repoSlug: string): { name: string; project: ProjectConfig } | null {
    const repoName = repoSlug.split('/').pop()!;
    for (const [name, project] of Object.entries(this.config.projects)) {
      const projRepoName = basename(project.repoDir);
      if (projRepoName === repoName) {
        return { name, project };
      }
    }
    return null;
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
        pluginDirs: this.pluginDirs,
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
      if (tracked.status !== 'stopped') {
        const message = err instanceof Error ? err.message : String(err);
        this.updateIssue(tracked, {
          status: 'failed',
          error: message,
          completedAt: Date.now(),
        });
      }
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
        pluginDirs: this.pluginDirs,
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
      if (tracked.status !== 'stopped') {
        const message = err instanceof Error ? err.message : String(err);
        this.updateIssue(tracked, { status: 'failed', error: message, completedAt: Date.now() });
      }
    }
  }

  private async ensureEmojiInPrTitle(prUrl: string, project: ProjectConfig): Promise<void> {
    const match = prUrl.match(/github[^/]*\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (!match) return;

    const [, repo, prNumber] = match;
    const ghParts = splitCommand(project.githubCommand);

    const viewProc = Bun.spawn(
      [...ghParts, 'pr', 'view', prNumber, '--json', 'title', '-R', repo],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    if ((await viewProc.exited) !== 0) return;

    const output = await new Response(viewProc.stdout).text();
    const { title } = JSON.parse(output);

    if (title.startsWith('\u{1F916}')) return;

    const newTitle = `\u{1F916} ${title}`;
    const editProc = Bun.spawn(
      [...ghParts, 'pr', 'edit', prNumber, '--title', newTitle, '-R', repo],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    await editProc.exited;
  }
}
