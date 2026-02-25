import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IssueStatus, TrackedIssue } from '../types';
import { loadState, saveIssueState, pruneState } from './state';

describe('types', () => {
  it('IssueStatus includes abandoned', () => {
    const status: IssueStatus = 'abandoned';
    expect(status).toBe('abandoned');
  });

  it('TrackedIssue accepts sessionId and isHistory', () => {
    const tracked: TrackedIssue = {
      issue: {
        id: '1',
        identifier: 'TEST-1',
        title: 'Test',
        description: '',
        url: '',
        priority: 1,
        state: { name: 'Todo', type: 'unstarted' },
      },
      project: 'test',
      status: 'queued',
      logs: [],
      sessionId: 'sess-123',
      isHistory: true,
    };
    expect(tracked.sessionId).toBe('sess-123');
    expect(tracked.isHistory).toBe(true);
  });
});

describe('state service', () => {
  let stateDir: string;
  let statePath: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'yoink-test-'));
    statePath = join(stateDir, 'state.json');
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('returns empty state when file does not exist', () => {
    const state = loadState(statePath);
    expect(state).toEqual({ sessions: {} });
  });

  it('saves and loads issue state', () => {
    saveIssueState(statePath, 'myproject', 'TEAM-525', {
      status: 'pr-created',
      branch: 'linear/team-525',
      worktreeDir: '/tmp/myproject-team-525',
      sessionId: 'sess-1',
      prUrl: 'https://github.com/pull/1',
      startedAt: 1000,
      completedAt: 2000,
      error: null,
    });
    const state = loadState(statePath);
    expect(state.sessions.myproject.issues['TEAM-525'].status).toBe('pr-created');
    expect(state.sessions.myproject.issues['TEAM-525'].sessionId).toBe('sess-1');
  });

  it('prunes entries older than maxAge', () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    saveIssueState(statePath, 'myproject', 'OLD-1', {
      status: 'pr-created', branch: 'linear/old-1', worktreeDir: '/tmp/old',
      sessionId: null, prUrl: null, startedAt: old - 1000, completedAt: old, error: null,
    });
    saveIssueState(statePath, 'myproject', 'NEW-1', {
      status: 'failed', branch: 'linear/new-1', worktreeDir: '/tmp/new',
      sessionId: 'sess-2', prUrl: null, startedAt: Date.now() - 1000, completedAt: Date.now(), error: 'boom',
    });
    const pruned = pruneState(loadState(statePath), 24 * 60 * 60 * 1000);
    expect(pruned.sessions.myproject.issues['OLD-1']).toBeUndefined();
    expect(pruned.sessions.myproject.issues['NEW-1']).toBeDefined();
  });

  it('full cycle: save, prune, load', () => {
    saveIssueState(statePath, 'proj', 'A-1', {
      status: 'pr-created', branch: 'linear/a-1', worktreeDir: '/tmp/a',
      sessionId: 's1', prUrl: 'https://github.com/pull/1',
      startedAt: Date.now() - 3600000, completedAt: Date.now() - 3500000, error: null,
    });
    saveIssueState(statePath, 'proj', 'A-2', {
      status: 'failed', branch: 'linear/a-2', worktreeDir: '/tmp/b',
      sessionId: 's2', prUrl: null,
      startedAt: Date.now() - 1800000, completedAt: Date.now() - 1700000, error: 'timeout',
    });
    const state = pruneState(loadState(statePath), 24 * 60 * 60 * 1000);
    expect(Object.keys(state.sessions.proj.issues)).toHaveLength(2);
    expect(state.sessions.proj.issues['A-2'].error).toBe('timeout');
    expect(state.sessions.proj.issues['A-2'].sessionId).toBe('s2');
  });
});
