import { EventEmitter } from 'events';
import { join, dirname } from 'path';
import type { Config } from '../types';
import { Processor, type ProcessorEvent } from '../services/processor';
import { getConfigPath } from '../config';
import type { YoinkEngineOptions, YoinkState, YoinkEngineEvents } from './types';

const pkg = await Bun.file(join(dirname(dirname(import.meta.dir)), 'package.json')).json();
const VERSION: string = pkg.version;

/**
 * YoinkEngine owns all orchestration — Linear polling, worktree management,
 * Claude spawning, state. It's an EventEmitter that can run headless.
 *
 * Events:
 *   'state:changed' (state: YoinkState) — emitted on every state mutation
 */
export class YoinkEngine extends EventEmitter {
  private processor: Processor;
  private processorListener: (event: ProcessorEvent) => void;
  private config: Config;
  private options: YoinkEngineOptions;
  private _title = '';
  private _done = false;
  private _nextPollAt: number | null = null;

  constructor(config: Config, options: YoinkEngineOptions = {}) {
    super();
    this.config = config;
    this.options = options;

    const concurrency = options.concurrency ?? config.defaults.concurrency;
    const pollMs =
      options.singleIssue || options.dryRun ? 0 : config.defaults.pollInterval * 1000;
    this.processor = new Processor(config, concurrency, pollMs);

    this.processorListener = (event: ProcessorEvent) => {
      if (event.type === 'update') {
        this.emitStateChanged();
      } else if (event.type === 'done') {
        this._done = true;
        this.emitStateChanged();
      } else if (event.type === 'polling') {
        this._nextPollAt = event.nextPollAt;
        this.emitStateChanged();
      }
    };
    this.processor.on(this.processorListener);
  }

  /**
   * Load issues, merge history, and start processing.
   *
   * Emits 'state:changed' events during initialization (e.g. as issues load
   * and history merges). Subscribers registered after start() resolves should
   * call getState() for the current snapshot rather than relying on events
   * emitted during startup.
   */
  async start(): Promise<void> {
    const { projectName, singleIssue, all } = this.options;

    if (all) {
      this._title = 'all projects';
      await this.processor.loadAllProjects();
      for (const name of Object.keys(this.config.projects)) {
        const history = this.processor.getHistoryIssues(name);
        if (history.length > 0) this.processor.mergeHistory(history);
      }
    } else if (projectName) {
      const project = this.config.projects[projectName];
      if (!project) throw new Error(`Unknown project: ${projectName}`);
      this._title = `${projectName} \u2014 ${project.repoDir}`;
      await this.processor.loadIssues(projectName, singleIssue);
      const history = this.processor.getHistoryIssues(projectName);
      if (history.length > 0) this.processor.mergeHistory(history);
    } else {
      const names = Object.keys(this.config.projects);
      if (names.length === 1) {
        this._title = `${names[0]} \u2014 ${this.config.projects[names[0]].repoDir}`;
        await this.processor.loadIssues(names[0], singleIssue);
        const history = this.processor.getHistoryIssues(names[0]);
        if (history.length > 0) this.processor.mergeHistory(history);
      } else {
        this._title = 'all projects';
        await this.processor.loadAllProjects();
        for (const name of names) {
          const history = this.processor.getHistoryIssues(name);
          if (history.length > 0) this.processor.mergeHistory(history);
        }
      }
    }

    if (!this.options.dryRun) {
      await this.processor.start();
    }
  }

  /**
   * Return a snapshot of the full engine state.
   *
   * Note: the issues array is a shallow copy — the TrackedIssue objects inside
   * are live references that the Processor may mutate. Callers needing stable
   * snapshots (e.g. for JSON serialization or diffing) should deep-clone.
   */
  getState(): YoinkState {
    return {
      issues: this.processor.getIssues(),
      paused: this.processor.isPaused(),
      polling: this.processor.isPolling(),
      done: this._done,
      dryRun: this.options.dryRun ?? false,
      title: this._title,
      nextPollAt: this._nextPollAt,
      projects: Object.entries(this.config.projects).map(([name, p]) => ({
        name,
        repoDir: p.repoDir,
      })),
      configPath: getConfigPath(),
      version: VERSION,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  pause(): void {
    this.processor.pause();
    this._nextPollAt = null;
    this.emitStateChanged();
  }

  resume(): void {
    this.processor.resume();
    this.emitStateChanged();
  }

  async shutdown(): Promise<void> {
    await this.processor.gracefulShutdown();
  }

  killActiveProcesses(): void {
    this.processor.killActiveProcesses();
  }

  /** Remove the processor event listener. Call when discarding the engine. */
  destroy(): void {
    this.processor.off(this.processorListener);
    this.removeAllListeners();
  }

  // ── Issue actions ──────────────────────────────────────────

  stopIssue(identifier: string, startedAt?: number): void {
    this.processor.stopIssue(identifier, startedAt);
  }

  retryIssue(identifier: string, startedAt?: number): void {
    this.processor.retryIssue(identifier, startedAt);
  }

  continueIssue(identifier: string, startedAt?: number): void {
    this.processor.continueIssue(identifier, startedAt);
  }

  deleteIssue(identifier: string, startedAt?: number): void {
    this.processor.deleteIssue(identifier, startedAt);
  }

  async reviewPR(input: {
    prNumber: number;
    repoSlug: string | null;
    projectName?: string;
  }): Promise<void> {
    return this.processor.reviewPR(input);
  }

  // ── Typed EventEmitter overrides ───────────────────────────

  override on<K extends keyof YoinkEngineEvents>(
    event: K,
    listener: (...args: YoinkEngineEvents[K]) => void,
  ): this;
  override on(event: string, listener: (...args: any[]) => void): this;
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  override off<K extends keyof YoinkEngineEvents>(
    event: K,
    listener: (...args: YoinkEngineEvents[K]) => void,
  ): this;
  override off(event: string, listener: (...args: any[]) => void): this;
  override off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof YoinkEngineEvents>(
    event: K,
    ...args: YoinkEngineEvents[K]
  ): boolean;
  override emit(event: string, ...args: any[]): boolean;
  override emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  // ── Internal ───────────────────────────────────────────────

  private emitStateChanged(): void {
    this.emit('state:changed', this.getState());
  }
}
