import { describe, it, expect } from 'bun:test';
import { buildPrompt, extractSessionId, buildResumeArgs, buildFreshArgs, parsePluginSpecifier, resolvePluginDir, buildReviewPrompt } from './claude';
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

describe('parsePluginSpecifier', () => {
  it('parses name@marketplace', () => {
    expect(parsePluginSpecifier('superpowers@claude-plugins-official'))
      .toEqual({ name: 'superpowers', marketplace: 'claude-plugins-official' });
  });
  it('returns null for missing @', () => {
    expect(parsePluginSpecifier('superpowers')).toBeNull();
  });
  it('returns null for leading @', () => {
    expect(parsePluginSpecifier('@marketplace')).toBeNull();
  });
  it('returns null for trailing @', () => {
    expect(parsePluginSpecifier('name@')).toBeNull();
  });
});

describe('resolvePluginDir', () => {
  it('returns string or null for valid specifier', () => {
    const result = resolvePluginDir('superpowers@claude-plugins-official');
    expect(result === null || typeof result === 'string').toBe(true);
  });
  it('returns null for invalid specifier', () => {
    expect(resolvePluginDir('no-at-sign')).toBeNull();
  });
});

describe('buildReviewPrompt', () => {
  it('includes PR metadata and review skill reference', () => {
    const prompt = buildReviewPrompt({
      prNumber: 42,
      title: 'Fix login bug',
      body: 'Fixes the auth flow',
      baseBranch: 'main',
      headBranch: 'fix/login',
      githubCommand: 'gh',
      repoSlug: 'acme/repo',
    });

    expect(prompt).toContain('PR #42');
    expect(prompt).toContain('Fix login bug');
    expect(prompt).toContain('Fixes the auth flow');
    expect(prompt).toContain('main');
    expect(prompt).toContain('review');
    expect(prompt).toContain('gh');
    expect(prompt).toContain('acme/repo');
  });
});
