import { describe, it, expect, afterEach } from 'bun:test';
import { createServer } from './server';
import { YoinkEngine } from '../engine';
import type { Config } from '../types';

const config: Config = {
  defaults: { concurrency: 1, maxTurns: 10, pollInterval: 0, webPort: 0 },
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

let server: ReturnType<typeof createServer> | null = null;

afterEach(() => {
  if (server) {
    server.stop();
    server = null;
  }
});

function startServer(engine?: YoinkEngine) {
  const e = engine ?? new YoinkEngine(config);
  // Port 0 lets the OS assign a free port
  server = createServer(e, 0);
  return { engine: e, url: `http://localhost:${server.port}` };
}

describe('GET /api/state', () => {
  it('returns the engine state as JSON', async () => {
    const { url } = startServer();
    const res = await fetch(`${url}/api/state`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('issues');
    expect(data).toHaveProperty('paused');
    expect(data).toHaveProperty('done');
    expect(data).toHaveProperty('dryRun');
    expect(data).toHaveProperty('title');
    expect(data.issues).toEqual([]);
    expect(data.paused).toBe(false);
  });
});
