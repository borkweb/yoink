import type { ServerWebSocket } from 'bun';
import type { YoinkEngine, YoinkState } from '../engine';

interface WSData {
  handler: (state: YoinkState) => void;
}

const ALLOWED_ACTIONS = new Set([
  'pause',
  'resume',
  'shutdown',
  'stopIssue',
  'retryIssue',
  'continueIssue',
  'deleteIssue',
  'reviewPR',
]);

async function dispatchAction(
  engine: YoinkEngine,
  body: Record<string, unknown>,
): Promise<boolean> {
  const { action } = body;
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    return false;
  }

  switch (action) {
    case 'pause':
      engine.pause();
      break;
    case 'resume':
      engine.resume();
      break;
    case 'shutdown':
      await engine.shutdown();
      break;
    case 'stopIssue':
      engine.stopIssue(body.identifier as string);
      break;
    case 'retryIssue':
      engine.retryIssue(body.identifier as string);
      break;
    case 'continueIssue':
      engine.continueIssue(body.identifier as string);
      break;
    case 'deleteIssue':
      engine.deleteIssue(body.identifier as string);
      break;
    case 'reviewPR':
      await engine.reviewPR({
        prNumber: body.prNumber as number,
        repoSlug: (body.repoSlug as string) ?? null,
        projectName: body.projectName as string | undefined,
      });
      break;
  }

  return true;
}

export function createServer(engine: YoinkEngine, port: number) {
  return Bun.serve<WSData>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: { handler: () => {} },
        });
        if (upgraded) return undefined as unknown as Response;
        return Response.json({ error: 'WebSocket upgrade failed' }, { status: 400 });
      }

      if (url.pathname === '/api/state' && req.method === 'GET') {
        return Response.json(engine.getState());
      }

      if (url.pathname === '/api/actions' && req.method === 'POST') {
        let body: Record<string, unknown>;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const valid = await dispatchAction(engine, body);
        if (!valid) {
          return Response.json({ error: 'Unknown action' }, { status: 400 });
        }

        return Response.json({ ok: true });
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    },
    websocket: {
      open(ws: ServerWebSocket<WSData>) {
        // Send full state snapshot on connect
        ws.send(JSON.stringify({ type: 'state:full', data: engine.getState() }));

        // Create handler that forwards state changes to this client
        const handler = (state: YoinkState) => {
          ws.send(JSON.stringify({ type: 'state:changed', data: state }));
        };
        ws.data.handler = handler;
        engine.on('state:changed', handler);
      },
      async message(ws: ServerWebSocket<WSData>, msg: string | Buffer) {
        try {
          const body = JSON.parse(typeof msg === 'string' ? msg : msg.toString());
          await dispatchAction(engine, body);
        } catch {
          // Ignore malformed messages
        }
      },
      close(ws: ServerWebSocket<WSData>) {
        engine.off('state:changed', ws.data.handler);
      },
    },
  });
}
