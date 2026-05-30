import type { FastifyInstance } from 'fastify';
import { isEmailConfigured, isInitialized, setInitialPassword } from '../settings.js';

export async function setupRoutes(app: FastifyInstance) {
  app.get('/api/setup/status', async () => {
    return {
      initialized: await isInitialized(),
      emailConfigured: await isEmailConfigured(),
    };
  });

  app.post<{ Body: { password?: string } }>('/api/setup/init', async (req, reply) => {
    if (await isInitialized()) {
      return reply.code(409).send({ error: 'already_initialized' });
    }
    const password = (req.body?.password ?? '').toString();
    if (password.length < 6) {
      return reply.code(400).send({ error: 'password_too_short' });
    }
    await setInitialPassword(password);
    return { ok: true };
  });
}
