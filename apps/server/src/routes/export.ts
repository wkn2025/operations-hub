import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth/policy';
import { audit } from '../services/audit';
import { stamp } from '../services/backup';
import { exportEntries } from '../services/export';
import { zip } from '../services/zip';

/** Admin "Export" button: the same content as `npm run export`, delivered as one zip download. */
export function exportRoutes(app: FastifyInstance) {
  app.get('/api/admin/export', { preHandler: requireRole('admin') }, async (req, reply) => {
    const entries = exportEntries(app.sqlite, app.config.dataDir);
    audit(app.db, { actorId: req.user!.id, action: 'export.download', entity: 'export', entityId: 'all', summary: `Downloaded a content export (${entries.length} files)` });
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="operations-hub-export-${stamp()}.zip"`)
      .header('Cache-Control', 'no-store')
      .send(zip(entries));
  });
}
