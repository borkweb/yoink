import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export interface PersistedIssue {
  status: string;
  branch: string;
  title: string | null;
  issueUrl: string | null;
  worktreeDir: string;
  sessionId: string | null;
  prUrl: string | null;
  startedAt: number;
  completedAt: number;
  error: string | null;
}

export interface ProjectState {
  lastUpdated: number;
  issues: Record<string, PersistedIssue>;
}

export interface AppState {
  sessions: Record<string, ProjectState>;
}

export function loadState(statePath: string): AppState {
  if (!existsSync(statePath)) {
    return { sessions: {} };
  }
  try {
    const raw = readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as AppState;
  } catch {
    return { sessions: {} };
  }
}

export function saveState(statePath: string, state: AppState): void {
  const dir = dirname(statePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function saveIssueState(
  statePath: string,
  project: string,
  identifier: string,
  issue: PersistedIssue
): void {
  const state = loadState(statePath);
  if (!state.sessions[project]) {
    state.sessions[project] = { lastUpdated: Date.now(), issues: {} };
  }
  state.sessions[project].issues[identifier] = issue;
  state.sessions[project].lastUpdated = Date.now();
  saveState(statePath, state);
}

export function pruneState(state: AppState, maxAgeMs: number): AppState {
  const cutoff = Date.now() - maxAgeMs;
  for (const [_project, projectState] of Object.entries(state.sessions)) {
    for (const [id, issue] of Object.entries(projectState.issues)) {
      if (issue.completedAt < cutoff) {
        delete projectState.issues[id];
      }
    }
    if (Object.keys(projectState.issues).length === 0) {
      delete state.sessions[_project];
    }
  }
  return state;
}

export function removeIssueState(
  statePath: string,
  project: string,
  identifier: string
): void {
  const state = loadState(statePath);
  if (state.sessions[project]) {
    delete state.sessions[project].issues[identifier];
    if (Object.keys(state.sessions[project].issues).length === 0) {
      delete state.sessions[project];
    }
    saveState(statePath, state);
  }
}
