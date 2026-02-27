import type { TrackedIssue } from '../types';

export interface YoinkEngineOptions {
  projectName?: string;
  singleIssue?: string;
  all?: boolean;
  dryRun?: boolean;
  concurrency?: number;
}

export interface YoinkProject {
  name: string;
  repoDir: string;
}

export interface YoinkState {
  issues: TrackedIssue[];
  paused: boolean;
  /** Whether the engine is polling for new issues. Used by Phase 2 web UI status display. */
  polling: boolean;
  done: boolean;
  dryRun: boolean;
  title: string;
  nextPollAt: number | null;
  projects: YoinkProject[];
  configPath: string;
  version: string;
}

export interface YoinkEngineEvents {
  'state:changed': [state: YoinkState];
}
