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

describe('POST /api/actions', () => {
  it('dispatches pause action', async () => {
    const { engine, url } = startServer();
    expect(engine.getState().paused).toBe(false);

    const res = await fetch(`${url}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(engine.getState().paused).toBe(true);
  });

  it('dispatches resume action', async () => {
    const { engine, url } = startServer();
    engine.pause();

    const res = await fetch(`${url}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    });
    expect(res.status).toBe(200);
    expect(engine.getState().paused).toBe(false);
  });

  it('dispatches issue actions with identifier', async () => {
    const { url } = startServer();

    const res = await fetch(`${url}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stopIssue', identifier: 'TEST-1' }),
    });
    // No-op on empty state, but should not error
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects unknown actions with 400', async () => {
    const { url } = startServer();

    const res = await fetch(`${url}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dropDatabase' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const { url } = startServer();

    const res = await fetch(`${url}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('WebSocket /ws', () => {
  it('sends full state on connect', async () => {
    const { url } = startServer();
    const wsUrl = url.replace('http', 'ws') + '/ws';

    const received = await new Promise<any>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data as string));
        ws.close();
      };
    });

    expect(received.type).toBe('state:full');
    expect(received.data).toHaveProperty('issues');
    expect(received.data).toHaveProperty('paused');
  });

  it('forwards state:changed events to connected clients', async () => {
    const engine = new YoinkEngine(config);
    const { url } = startServer(engine);
    const wsUrl = url.replace('http', 'ws') + '/ws';

    const messages = await new Promise<any[]>((resolve) => {
      const msgs: any[] = [];
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        msgs.push(JSON.parse(event.data as string));
        if (msgs.length === 1) {
          // After receiving initial state, trigger a change
          engine.pause();
        }
        if (msgs.length === 2) {
          ws.close();
          resolve(msgs);
        }
      };
    });

    expect(messages[0].type).toBe('state:full');
    expect(messages[1].type).toBe('state:changed');
    expect(messages[1].data.paused).toBe(true);
  });

  it('accepts commands from clients', async () => {
    const engine = new YoinkEngine(config);
    const { url } = startServer(engine);
    const wsUrl = url.replace('http', 'ws') + '/ws';

    expect(engine.getState().paused).toBe(false);

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'pause' }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        // Wait for the state:changed showing paused
        if (msg.type === 'state:changed' && msg.data.paused) {
          ws.close();
          resolve();
        }
      };
    });

    expect(engine.getState().paused).toBe(true);
  });
});

describe('unknown routes', () => {
  it('returns 404 for unmatched paths', async () => {
    const { url } = startServer();
    const res = await fetch(`${url}/nope`);
    expect(res.status).toBe(404);
  });
});
