import { describe, it, expect } from 'bun:test';
import { YoinkEngine } from './YoinkEngine';
import type { Config } from '../types';
import type { YoinkState } from './types';

const config: Config = {
  defaults: { concurrency: 2, maxTurns: 10, pollInterval: 0, webPort: 7890, claudePlugins: [] },
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

describe('YoinkEngine', () => {
  it('initializes with correct default state', () => {
    const engine = new YoinkEngine(config);
    const state = engine.getState();

    expect(state.issues).toEqual([]);
    expect(state.paused).toBe(false);
    expect(state.done).toBe(false);
    expect(state.dryRun).toBe(false);
    expect(state.title).toBe('');
    expect(state.nextPollAt).toBeNull();
  });

  it('includes dryRun in state when set', () => {
    const engine = new YoinkEngine(config, { dryRun: true });
    expect(engine.getState().dryRun).toBe(true);
  });

  it('pause/resume updates state and emits events', () => {
    const engine = new YoinkEngine(config);
    const states: YoinkState[] = [];
    engine.on('state:changed', (s: YoinkState) => states.push(s));

    engine.pause();
    expect(engine.getState().paused).toBe(true);
    expect(states.length).toBeGreaterThanOrEqual(1);
    expect(states[states.length - 1].paused).toBe(true);

    engine.resume();
    expect(engine.getState().paused).toBe(false);
    expect(states[states.length - 1].paused).toBe(false);
  });

  it('emits state:changed events', () => {
    const engine = new YoinkEngine(config);
    const events: YoinkState[] = [];
    engine.on('state:changed', (state: YoinkState) => events.push(state));

    // Trigger a state change via pause
    engine.pause();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].paused).toBe(true);
  });

  it('getState returns a snapshot (not a reference)', () => {
    const engine = new YoinkEngine(config);
    const s1 = engine.getState();
    engine.pause();
    const s2 = engine.getState();

    expect(s1.paused).toBe(false);
    expect(s2.paused).toBe(true);
  });

  it('exposes action methods', () => {
    const engine = new YoinkEngine(config);

    // These should not throw — they're no-ops on empty state
    engine.stopIssue('NONEXISTENT');
    engine.retryIssue('NONEXISTENT');
    engine.continueIssue('NONEXISTENT');
    engine.deleteIssue('NONEXISTENT');
  });

  it('destroy() stops forwarding events', () => {
    const engine = new YoinkEngine(config);
    const events: YoinkState[] = [];
    engine.on('state:changed', (s: YoinkState) => events.push(s));

    engine.pause();
    expect(events.length).toBeGreaterThan(0);

    const countBefore = events.length;
    engine.destroy();

    // After destroy, engine events should not fire
    engine.resume();
    expect(events.length).toBe(countBefore);
  });
});

describe('YoinkEngine with multiple projects', () => {
  const multiConfig: Config = {
    ...config,
    projects: {
      alpha: { ...config.projects.test, name: 'alpha' },
      beta: { ...config.projects.test, name: 'beta' },
    },
  };

  it('loads all projects when no project specified', async () => {
    const engine = new YoinkEngine(multiConfig);
    await engine.start();
    expect(engine.getState().title).toBe('all projects');
  });
});
