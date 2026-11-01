import { devLoginBody } from '@ops/shared';
import type { SessionProvider } from './session';

/** Demo-only provider: pick any email, get a session. Config refuses to run this in production. */
export const DEMO_USERS = [
  { email: 'admin@demo.test', name: 'Demo Admin' },
  { email: 'editor@demo.test', name: 'Demo Editor' },
  { email: 'viewer@demo.test', name: 'Demo Viewer' },
];

export const devProvider: SessionProvider = {
  mode: 'dev',
  registerRoutes(app, session) {
    app.get('/api/auth/dev/users', async () => ({ users: DEMO_USERS }));
    app.post('/api/auth/dev/login', async (req, reply) => {
      const body = devLoginBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid email' });
      return { user: session.login(reply, body.data) };
    });
  },
};
