import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Processor } from './processor';
import type { Config } from '../types';

const config: Config = {
  defaults: { concurrency: 2, maxTurns: 10, pollInterval: 0 },
  linear: { apiKey: 'test-key' },
  projects: {
    test: {
      name: 'test',
      repoDir: '/tmp/test',
      baseBranch: 'main',
      linearTeam: 'TEST',
      linearAssignee: 'tester',
      linearLabel: 'Auto',
      githubCommand: 'gh',
      allowedTools: 'Read',
    },
  },
};

describe('Processor', () => {
  it('initializes with empty issues', () => {
    const proc = new Processor(config, 2);
    expect(proc.getIssues()).toEqual([]);
  });

  it('respects pause/resume', () => {
    const proc = new Processor(config, 2);
    expect(proc.isPaused()).toBe(false);
    proc.pause();
    expect(proc.isPaused()).toBe(true);
    proc.resume();
    expect(proc.isPaused()).toBe(false);
  });

  it('emits update events', () => {
    const proc = new Processor(config, 2);
    const events: any[] = [];
    proc.on((e) => events.push(e));

    (proc as any).issues = [
      { issue: { identifier: 'T-1' }, project: 'test', status: 'queued', logs: [] },
    ];
    (proc as any).emit({ type: 'update', issues: proc.getIssues() });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('update');
    expect(events[0].issues).toHaveLength(1);
  });
});

describe('Processor state persistence', () => {
  let stateDir: string;
  let statePath: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'yoink-proc-test-'));
    statePath = join(stateDir, 'state.json');
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('accepts a statePath in constructor', () => {
    const proc = new Processor(config, 2, 0, statePath);
    expect(proc.getIssues()).toEqual([]);
  });

  it('getHistoryIssues returns empty when no state file', () => {
    const proc = new Processor(config, 2, 0, statePath);
    const history = proc.getHistoryIssues('test');
    expect(history).toEqual([]);
  });
});

describe('Processor error recovery actions', () => {
  let stateDir: string;
  let statePath: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'yoink-action-test-'));
    statePath = join(stateDir, 'state.json');
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('retryIssue resets a failed issue to queued', () => {
    const proc = new Processor(config, 2, 0, statePath);
    proc.pause(); // prevent processQueue from auto-advancing
    (proc as any).issues = [
      {
        issue: { id: '1', identifier: 'TEST-1', title: 'Fail', description: '', url: '', priority: 1, state: { name: 'Todo', type: 'unstarted' } },
        project: 'test',
        status: 'failed',
        logs: ['some log'],
        error: 'boom',
        worktreeDir: '/tmp/fake',
        sessionId: 'sess-1',
        isHistory: false,
      },
    ];

    proc.retryIssue('TEST-1');
    const issue = proc.getIssues().find((i) => i.issue.identifier === 'TEST-1');
    // Shows spinner while cleaning worktree, then transitions to queued
    expect(issue?.status).toBe('creating-worktree');
    expect(issue?.error).toBeUndefined();
    expect(issue?.logs).toEqual([]);
    expect(issue?.sessionId).toBeUndefined();
    expect(issue?.isHistory).toBeFalsy();
  });

  it('continueIssue transitions through running-claude', () => {
    const proc = new Processor(config, 2, 0, statePath);
    const statuses: string[] = [];
    proc.on((e) => {
      if (e.type === 'update') {
        const t = e.issues.find((i) => i.issue.identifier === 'TEST-1');
        if (t) statuses.push(t.status);
      }
    });

    (proc as any).issues = [
      {
        issue: { id: '1', identifier: 'TEST-1', title: 'Fail', description: '', url: '', priority: 1, state: { name: 'Todo', type: 'unstarted' } },
        project: 'test',
        status: 'failed',
        logs: [],
        error: 'boom',
        sessionId: 'sess-1',
        worktreeDir: '/tmp/fake',
      },
    ];

    proc.continueIssue('TEST-1');
    // The first status update should be running-claude (before async Claude spawn fails)
    expect(statuses[0]).toBe('running-claude');
  });

  it('deleteIssue marks issue as abandoned', () => {
    const proc = new Processor(config, 2, 0, statePath);
    (proc as any).issues = [
      {
        issue: { id: '1', identifier: 'TEST-1', title: 'Fail', description: '', url: '', priority: 1, state: { name: 'Todo', type: 'unstarted' } },
        project: 'test',
        status: 'failed',
        logs: [],
        error: 'boom',
        worktreeDir: '/tmp/fake',
      },
    ];

    proc.deleteIssue('TEST-1');
    const issue = proc.getIssues().find((i) => i.issue.identifier === 'TEST-1');
    expect(issue?.status).toBe('abandoned');
  });
});

describe('Processor history merge', () => {
  let stateDir: string;
  let statePath: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'yoink-merge-test-'));
    statePath = join(stateDir, 'state.json');
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('mergeHistory prepends history issues before new issues', () => {
    const proc = new Processor(config, 2, 0, statePath);
    (proc as any).issues = [
      {
        issue: { id: '2', identifier: 'TEST-2', title: 'New', description: '', url: '', priority: 1, state: { name: 'Todo', type: 'unstarted' } },
        project: 'test',
        status: 'queued',
        logs: [],
      },
    ];

    proc.mergeHistory([
      {
        issue: { id: '', identifier: 'TEST-1', title: '', description: '', url: '', priority: 0, state: { name: '', type: '' } },
        project: 'test',
        status: 'failed' as const,
        logs: [],
        isHistory: true,
      },
    ]);
    const all = proc.getIssues();
    expect(all).toHaveLength(2);
    expect(all[0].issue.identifier).toBe('TEST-1');
    expect(all[0].isHistory).toBe(true);
    expect(all[1].issue.identifier).toBe('TEST-2');
  });

  it('mergeHistory skips history issues that duplicate new issues', () => {
    const proc = new Processor(config, 2, 0, statePath);
    (proc as any).issues = [
      {
        issue: { id: '1', identifier: 'TEST-1', title: 'New version', description: '', url: '', priority: 1, state: { name: 'Todo', type: 'unstarted' } },
        project: 'test',
        status: 'queued',
        logs: [],
      },
    ];

    proc.mergeHistory([
      {
        issue: { id: '', identifier: 'TEST-1', title: '', description: '', url: '', priority: 0, state: { name: '', type: '' } },
        project: 'test',
        status: 'pr-created' as const,
        logs: [],
        isHistory: true,
      },
    ]);
    const all = proc.getIssues();
    expect(all).toHaveLength(1);
    expect(all[0].issue.title).toBe('New version');
  });
});
