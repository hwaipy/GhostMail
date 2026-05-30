import type { FastifyInstance } from 'fastify';
import { listFolders, listMessages, NotConfiguredError } from '../imap.js';
import { isEmailConfigured } from '../settings.js';

export async function mailRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    if (!(await isEmailConfigured())) {
      reply.code(412).send({ error: 'email_not_configured' });
    }
  });

  app.get('/api/folders', async (_req, reply) => {
    try {
      const folders = await listFolders();
      return folders.map((f) => ({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        flags: Array.from(f.flags ?? []),
        specialUse: f.specialUse ?? null,
        subscribed: f.subscribed ?? false,
      }));
    } catch (err) {
      if (err instanceof NotConfiguredError) {
        return reply.code(412).send({ error: 'email_not_configured' });
      }
      throw err;
    }
  });

  app.get<{ Querystring: { folder?: string; limit?: string } }>(
    '/api/messages',
    async (req, reply) => {
      const folder = req.query.folder ?? 'INBOX';
      const limit = req.query.limit ? Math.min(200, Number(req.query.limit)) : 50;
      try {
        const msgs = await listMessages(folder, { limit });
        return { folder, messages: msgs };
      } catch (err) {
        if (err instanceof NotConfiguredError) {
          return reply.code(412).send({ error: 'email_not_configured' });
        }
        req.log.error({ err }, 'list messages failed');
        return reply.code(500).send({ error: 'imap_failed', message: String(err) });
      }
    },
  );
}
