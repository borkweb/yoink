import type { TrackedIssue } from '../types';

export interface YoinkEngineOptions {
  projectName?: string;
  singleIssue?: string;
  all?: boolean;
  dryRun?: boolean;
  concurrency?: number;
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
}

export interface YoinkEngineEvents {
  'state:changed': [state: YoinkState];
}
