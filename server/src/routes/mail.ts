import type { FastifyInstance } from 'fastify';
import {
  fetchAttachment,
  fetchMessage,
  listFolders,
  listMessages,
  MessageNotFoundError,
  NotConfiguredError,
} from '../imap.js';
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

  app.get<{ Params: { uid: string }; Querystring: { folder?: string } }>(
    '/api/messages/:uid',
    async (req, reply) => {
      const uid = Number(req.params.uid);
      if (!Number.isInteger(uid) || uid <= 0) {
        return reply.code(400).send({ error: 'invalid_uid' });
      }
      const folder = req.query.folder ?? 'INBOX';
      const baseUrl = `/api/messages/${uid}/attachments?folder=${encodeURIComponent(folder)}&idx=`;
      try {
        return await fetchMessage(folder, uid, baseUrl);
      } catch (err) {
        if (err instanceof NotConfiguredError) {
          return reply.code(412).send({ error: 'email_not_configured' });
        }
        if (err instanceof MessageNotFoundError) {
          return reply.code(404).send({ error: 'message_not_found' });
        }
        req.log.error({ err }, 'fetch message failed');
        return reply.code(500).send({ error: 'imap_failed', message: String(err) });
      }
    },
  );

  app.get<{
    Params: { uid: string };
    Querystring: { folder?: string; idx?: string };
  }>('/api/messages/:uid/attachments', async (req, reply) => {
    const uid = Number(req.params.uid);
    const idx = Number(req.query.idx);
    if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(idx) || idx < 0) {
      return reply.code(400).send({ error: 'invalid_params' });
    }
    const folder = req.query.folder ?? 'INBOX';
    try {
      const { content, contentType, filename } = await fetchAttachment(folder, uid, idx);
      reply.header('Content-Type', contentType);
      if (filename) {
        const safe = filename.replace(/[\r\n"]/g, '_');
        reply.header(
          'Content-Disposition',
          `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );
      }
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(content);
    } catch (err) {
      if (err instanceof MessageNotFoundError) {
        return reply.code(404).send({ error: 'not_found' });
      }
      req.log.error({ err }, 'fetch attachment failed');
      return reply.code(500).send({ error: 'imap_failed', message: String(err) });
    }
  });
}
