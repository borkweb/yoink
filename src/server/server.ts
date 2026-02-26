import type { YoinkEngine } from '../engine';

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

export function createServer(engine: YoinkEngine, port: number) {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

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

        const { action } = body;
        if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
          return Response.json({ error: 'Unknown action' }, { status: 400 });
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

        return Response.json({ ok: true });
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    },
  });
}
