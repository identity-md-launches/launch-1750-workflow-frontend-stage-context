import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { dist } from './integrity.mjs';

export function serve(port = 4173) {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/preview/')) { res.writeHead(302, { Location: '/preview/' }); res.end(); return; }
      const path = resolve(dist, '.' + decodeURIComponent(url.pathname.slice('/preview'.length)), url.pathname.endsWith('/') ? 'index.html' : '');
      if (!path.startsWith(dist + '/')) throw new Error('Invalid path');
      const bytes = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise(resolve => server.listen(port, '0.0.0.0', () => resolve(server)));
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) { const server = await serve(Number(process.env.PORT || 4173)); console.log(`Loom preview: http://127.0.0.1:${server.address().port}/preview/`); }
