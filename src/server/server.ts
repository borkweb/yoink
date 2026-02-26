import type { YoinkEngine } from '../engine';

export function createServer(engine: YoinkEngine, port: number) {
  return Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/api/state' && req.method === 'GET') {
        return Response.json(engine.getState());
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    },
  });
}
