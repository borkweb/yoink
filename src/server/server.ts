import type { ServerWebSocket } from 'bun';
import type { YoinkEngine, YoinkState } from '../engine';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

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
  'openTerminal',
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
      engine.stopIssue(body.identifier as string, body.startedAt as number | undefined);
      break;
    case 'retryIssue':
      engine.retryIssue(body.identifier as string, body.startedAt as number | undefined);
      break;
    case 'continueIssue':
      engine.continueIssue(body.identifier as string, body.startedAt as number | undefined);
      break;
    case 'deleteIssue':
      engine.deleteIssue(body.identifier as string, body.startedAt as number | undefined);
      break;
    case 'reviewPR':
      await engine.reviewPR({
        prNumber: body.prNumber as number,
        repoSlug: (body.repoSlug as string) ?? null,
        projectName: body.projectName as string | undefined,
      });
      break;
    case 'openTerminal': {
      const cmd = body.command as string;
      if (typeof cmd === 'string' && cmd.length > 0) {
        if (process.platform === 'darwin') {
          // Prefer iTerm2 > Terminal.app (both support new-tab)
          if (existsSync('/Applications/iTerm.app')) {
            const escaped = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            Bun.spawn(['osascript', '-e', [
              'tell application "iTerm2"',
              '  activate',
              '  if (count of windows) = 0 then',
              '    create window with default profile',
              '  else',
              '    tell current window to create tab with default profile',
              '  end if',
              '  tell current session of current window',
              `    write text "${escaped}"`,
              '  end tell',
              'end tell',
            ].join('\n')], {
              stdout: 'ignore',
              stderr: 'ignore',
            });
          } else {
            const escaped = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            Bun.spawn(['osascript', '-e', [
              'tell application "Terminal"',
              '  activate',
              '  if (count of windows) > 0 then',
              '    tell application "System Events" to keystroke "t" using command down',
              '    delay 0.3',
              `    do script "${escaped}" in front window`,
              '  else',
              `    do script "${escaped}"`,
              '  end if',
              'end tell',
            ].join('\n')], {
              stdout: 'ignore',
              stderr: 'ignore',
            });
          }
        } else {
          // Linux: try common terminal emulators, prefer tabs where supported
          const terminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
          for (const term of terminals) {
            try {
              if (term === 'gnome-terminal') {
                Bun.spawn([term, '--tab', '--', 'bash', '-c', `${cmd}; exec bash`], { stdout: 'ignore', stderr: 'ignore' });
              } else if (term === 'konsole') {
                Bun.spawn([term, '--new-tab', '-e', `bash -c '${cmd.replace(/'/g, "'\\''")}; exec bash'`], { stdout: 'ignore', stderr: 'ignore' });
              } else if (term === 'xfce4-terminal') {
                Bun.spawn([term, '--tab', '-e', `bash -c '${cmd.replace(/'/g, "'\\''")}; exec bash'`], { stdout: 'ignore', stderr: 'ignore' });
              } else {
                Bun.spawn([term, '-e', `bash -c '${cmd.replace(/'/g, "'\\''")}; exec bash'`], { stdout: 'ignore', stderr: 'ignore' });
              }
              break;
            } catch { continue; }
          }
        }
      }
      break;
    }
  }

  return true;
}

// Resolve web/dist relative to project root (this file is in src/server/)
const WEB_DIST = join(dirname(dirname(import.meta.dir)), 'web', 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMimeType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.'));
  return MIME_TYPES[ext] ?? 'application/octet-stream';
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

      // Serve static files from web/dist
      const filePath = join(WEB_DIST, url.pathname === '/' ? 'index.html' : url.pathname);
      if (existsSync(filePath)) {
        return new Response(Bun.file(filePath), {
          headers: { 'Content-Type': getMimeType(filePath) },
        });
      }

      // SPA fallback — serve index.html for unmatched routes
      const indexPath = join(WEB_DIST, 'index.html');
      if (existsSync(indexPath)) {
        return new Response(Bun.file(indexPath), {
          headers: { 'Content-Type': 'text/html' },
        });
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'error', message }));
        }
      },
      close(ws: ServerWebSocket<WSData>) {
        engine.off('state:changed', ws.data.handler);
      },
    },
  });
}
