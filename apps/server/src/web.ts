import type { FastifyInstance } from 'fastify';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/**
 * CSP for the app shell. Scripts only from this origin (Vite emits no inline scripts). 'unsafe-inline' styles because
 * Radix/Motion/Tiptap set style attributes. Images only from this origin, data: and blob: - external image URLs in
 * article content are therefore blocked (Ruling: content images must be uploads).
 */
export const APP_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

/** Security headers on every response; routes that set their own CSP (file downloads: default-src 'none') keep it. */
export function securityHeaders(app: FastifyInstance) {
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    if (!reply.hasHeader('Content-Security-Policy')) reply.header('Content-Security-Policy', APP_CSP);
  });
}

/**
 * Serves the built web app from `dist`: the file list is read once at startup and only those exact paths are served
 * (no filesystem lookups per request, so no traversal). Unknown GET/HEAD paths outside /api get index.html (SPA routing).
 * ponytail: files are held in memory (the Vite build is a few MB); switch to @fastify/static if dist grows large.
 */
export function serveWeb(app: FastifyInstance, dist: string) {
  const files = new Map<string, { body: Buffer; type: string; immutable: boolean }>();
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else {
        const url = '/' + relative(dist, p).split('\\').join('/');
        files.set(url, { body: readFileSync(p), type: MIME[extname(p).toLowerCase()] ?? 'application/octet-stream', immutable: url.startsWith('/assets/') });
      }
    }
  };
  walk(dist);
  const index = files.get('/index.html');
  if (!index) throw new Error(`WEB_DIST has no index.html: ${dist}`);

  const send = (reply: import('fastify').FastifyReply, f: { body: Buffer; type: string; immutable: boolean }) =>
    reply.header('Content-Type', f.type).header('Cache-Control', f.immutable ? 'public, max-age=31536000, immutable' : 'no-cache').send(f.body);

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/api' || path.startsWith('/api/') || (req.method !== 'GET' && req.method !== 'HEAD'))
      return reply.code(404).send({ error: 'not_found' });
    const f = files.get(path);
    if (f) return send(reply, f);
    if (path.startsWith('/assets/') || extname(path)) return reply.code(404).send({ error: 'not_found' }); // missing asset: never HTML
    return send(reply, index);
  });
}
