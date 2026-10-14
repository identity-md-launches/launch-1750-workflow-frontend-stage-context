import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { root, dist } from './integrity.mjs';

// Dev and production consume the same generated deployment/ABI files.
execFileSync('npm', ['run', 'build'], { cwd: resolve(root, 'web'), stdio: 'inherit' });
const server = await createServer({
  plugins: [{ name: 'loom-dev-deployment', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!/^\/(imd-deployment\.json|abi\/(LaunchToken|LoomCollection|LoomFactory)\.json)$/.test(path)) return next();
      try { res.setHeader('Content-Type', 'application/json'); res.end(await readFile(resolve(dist, '.' + path))); }
      catch { res.statusCode = 503; res.end('Deployment export unavailable. Rebuild the frontend.'); }
    });
  } }],
});
await server.listen(); server.printUrls();
