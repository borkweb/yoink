import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { fetchIssues, updateIssueState, addComment } from './linear';
import type { ProjectConfig } from '../types';

const mockProject: ProjectConfig = {
  name: 'test',
  repoDir: '/tmp/test',
  baseBranch: 'main',
  linearTeam: 'TEST',
  linearAssignee: 'tester',
  linearLabel: 'Auto',
  githubCommand: 'gh',
  allowedTools: 'Read',
};

describe('fetchIssues', () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: 'abc-123',
                    identifier: 'TEST-1',
                    title: 'Fix bug',
                    description: 'A bug to fix',
                    url: 'https://linear.app/test/issue/TEST-1',
                    priority: 2,
                    state: { name: 'Todo', type: 'unstarted' },
                  },
                ],
              },
            },
          })
        )
      )
    ) as any;
  });

  it('fetches and parses issues', async () => {
    const issues = await fetchIssues('key', mockProject);

    expect(issues).toHaveLength(1);
    expect(issues[0].identifier).toBe('TEST-1');
    expect(issues[0].title).toBe('Fix bug');
  });

  it('fetches single issue by identifier', async () => {
    await fetchIssues('key', mockProject, 'TEST-1');

    const call = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.query).toContain('number: { eq: 1 }');
  });

  it('throws on API error', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ errors: [{ message: 'Unauthorized' }] })
        )
      )
    ) as any;

    expect(fetchIssues('bad', mockProject)).rejects.toThrow('Unauthorized');
  });
});
