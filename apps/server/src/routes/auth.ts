import type { FastifyInstance } from 'fastify';
import type { SessionApi, SessionProvider } from '../auth/session';

export function authRoutes(app: FastifyInstance, provider: SessionProvider, session: SessionApi) {
  app.get('/api/me', async (req) => ({
    user: req.user,
    authMode: provider.mode,
    demo: provider.mode === 'dev', // UI shows the DEMO banner
  }));
  app.post('/api/auth/logout', async (_req, reply) => {
    session.logout(reply);
    return { ok: true };
  });
  provider.registerRoutes(app, session);
}
