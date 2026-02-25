import { describe, it, expect } from 'bun:test';
import { buildPrompt, extractSessionId, buildResumeArgs, buildFreshArgs, resolveSuperpowersDir } from './claude';
import type { ProjectConfig } from '../types';

const project: ProjectConfig = {
  name: 'test',
  repoDir: '/tmp/test',
  baseBranch: 'trunk',
  linearTeam: 'TEST',
  linearAssignee: 'tester',
  linearLabel: 'Auto',
  githubCommand: 'gh',
  allowedTools: 'Read,Write',
};

describe('buildPrompt', () => {
  it('interpolates issue and project details', () => {
    const prompt = buildPrompt('TEST-1', 'Fix bug', 'Desc here', 'https://linear.app/1', project);

    expect(prompt).toContain('TEST-1');
    expect(prompt).toContain('Fix bug');
    expect(prompt).toContain('Desc here');
    expect(prompt).toContain('https://linear.app/1');
    expect(prompt).toContain('gh');
    expect(prompt).toContain('trunk');
  });
});

describe('extractSessionId', () => {
  it('extracts session ID from Claude JSON output', () => {
    const output = JSON.stringify({ session_id: 'sess-abc-123', result: 'done' });
    expect(extractSessionId(output)).toBe('sess-abc-123');
  });

  it('returns null if no session ID in output', () => {
    expect(extractSessionId('just some text')).toBeNull();
    expect(extractSessionId('{}')).toBeNull();
  });
});

describe('buildResumeArgs', () => {
  it('builds args with --resume flag', () => {
    const args = buildResumeArgs({ sessionId: 'sess-123', maxTurns: 50, allowedTools: 'Read,Write' });
    expect(args).toContain('--resume');
    expect(args).toContain('sess-123');
    expect(args).not.toContain('-p');
  });
});

describe('buildFreshArgs', () => {
  it('builds args with prompt', () => {
    const args = buildFreshArgs({ prompt: 'do stuff', maxTurns: 50, allowedTools: 'Read,Write' });
    expect(args).toContain('-p');
    expect(args).toContain('do stuff');
    expect(args).not.toContain('--resume');
  });

  it('includes multiple --plugin-dir flags', () => {
    const args = buildFreshArgs({
      prompt: 'do stuff',
      maxTurns: 50,
      allowedTools: 'Read,Write',
      pluginDirs: ['/path/to/yoink', '/path/to/superpowers'],
    });
    const pluginDirIndices = args
      .map((a, i) => (a === '--plugin-dir' ? i : -1))
      .filter((i) => i !== -1);
    expect(pluginDirIndices).toHaveLength(2);
    expect(args[pluginDirIndices[0] + 1]).toBe('/path/to/yoink');
    expect(args[pluginDirIndices[1] + 1]).toBe('/path/to/superpowers');
  });
});

describe('resolveSuperpowersDir', () => {
  it('returns a string or null', () => {
    const result = resolveSuperpowersDir();
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
