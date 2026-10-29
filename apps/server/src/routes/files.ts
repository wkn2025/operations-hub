import type { FastifyInstance } from 'fastify';
import type { User } from '@ops/shared';
import { requireRole } from '../auth/policy';
import { ApiError } from '../services/articles';
import { adminFiles, articleFileList, attach, deleteFile, openFile, saveUpload } from '../services/files';

export function fileRoutes(app: FastifyInstance) {
  const reader = requireRole('admin', 'editor', 'viewer');
  const writer = requireRole('admin', 'editor');
  const U = (req: { user: User | null }) => req.user as User;

  app.post('/api/files', { preHandler: writer }, async (req, reply) => {
    const part = await req.file();
    if (!part) throw new ApiError(400, { error: 'invalid', message: 'file required' });
    const data = await part.toBuffer(); // throws 413 past the 15 MB limit
    return reply.code(201).send(await saveUpload(app, U(req), part.filename, data));
  });

  app.get<{ Params: { id: string } }>('/api/files/:id', { preHandler: reader }, async (req, reply) => {
    const { f, data, inline } = await openFile(app, U(req), req.params.id);
    const fname = encodeURIComponent(f.name);
    return reply
      .header('Content-Type', f.mime)
      .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${fname}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', 'private, max-age=3600')
      .send(data);
  });

  app.get<{ Params: { id: string } }>('/api/articles/:id/files', { preHandler: reader }, async (req) => ({ files: articleFileList(app, U(req), req.params.id) }));
  for (const [method, on] of [['POST', true], ['DELETE', false]] as const) {
    app.route<{ Params: { id: string; fileId: string } }>({
      method, url: '/api/articles/:id/files/:fileId', preHandler: writer,
      handler: async (req) => { attach(app, U(req), req.params.id, req.params.fileId, on); return { ok: true }; },
    });
  }

  app.get('/api/admin/files', { preHandler: requireRole('admin') }, async () => ({ files: adminFiles(app) }));
  app.delete<{ Params: { id: string } }>('/api/admin/files/:id', { preHandler: requireRole('admin') }, async (req) => {
    await deleteFile(app, U(req), req.params.id);
    return { ok: true };
  });
}
