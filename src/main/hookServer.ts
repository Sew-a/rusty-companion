import http from 'node:http';
import type { HookEvent } from '../shared/events';

const MAX_BODY = 2_000_000;

/** Local-only HTTP server that receives Claude Code `http` hook POSTs.
 *  It always answers immediately with an empty JSON object so it never delays or steers Claude. */
export function startHookServer(port: number, onEvent: (evt: HookEvent) => void): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/event')) {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      try {
        const evt = JSON.parse(Buffer.concat(chunks).toString('utf8')) as HookEvent;
        if (evt && typeof evt === 'object') onEvent(evt);
      } catch {
        // Ignore malformed bodies; the companion should never crash on input.
      }
    });
  });

  server.on('error', (err) => console.error('[hook-server]', err.message));
  server.listen(port, '127.0.0.1', () => console.log(`[hook-server] listening on http://127.0.0.1:${port}/event`));
  return server;
}
