import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8' };
export const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + requested + (requested.endsWith('/') ? 'index.html' : ''));
    if (!filename.startsWith(root + path.sep)) throw new Error('invalid path');
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('not a file');
    const bytes = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end('Страница не найдена');
  }
});
server.listen(port, '127.0.0.1', () => console.log('Свой путь: http://localhost:' + port));
