import type { FastifyInstance } from 'fastify';
import {
  changePassword,
  isEmailConfigured,
  maskedEmailConfig,
  setEmailConfig,
  type MailServer,
} from '../settings.js';
import { resetClient, testImap } from '../imap.js';
import { testSmtp } from '../smtp.js';

interface EmailConfigInput {
  imap: MailServer;
  smtp: MailServer;
}

function validateMailServer(m: any, label: string): MailServer {
  if (!m || typeof m !== 'object') throw new Error(`${label}: invalid`);
  const host = String(m.host ?? '').trim();
  const user = String(m.user ?? '').trim();
  const pass = String(m.pass ?? '');
  const port = Number(m.port);
  if (!host) throw new Error(`${label}.host required`);
  if (!user) throw new Error(`${label}.user required`);
  if (!pass) throw new Error(`${label}.pass required`);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(`${label}.port invalid`);
  return { host, port, secure: !!m.secure, user, pass };
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/api/settings/email', async () => {
    const masked = await maskedEmailConfig();
    return { configured: await isEmailConfigured(), email: masked };
  });

  app.post<{ Body: EmailConfigInput }>('/api/settings/email', async (req, reply) => {
    try {
      const imap = validateMailServer(req.body?.imap, 'imap');
      const smtp = validateMailServer(req.body?.smtp, 'smtp');
      await setEmailConfig(imap, smtp);
      await resetClient();
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: 'invalid', message: String(err) });
    }
  });

  app.post<{ Body: EmailConfigInput }>('/api/settings/email/test', async (req, reply) => {
    try {
      const imap = validateMailServer(req.body?.imap, 'imap');
      const smtp = validateMailServer(req.body?.smtp, 'smtp');
      const result = { imap: 'ok', smtp: 'ok' } as { imap: string; smtp: string };
      try {
        await testImap(imap);
      } catch (e) {
        result.imap = String((e as Error)?.message ?? e);
      }
      try {
        await testSmtp(smtp);
      } catch (e) {
        result.smtp = String((e as Error)?.message ?? e);
      }
      return result;
    } catch (err) {
      return reply.code(400).send({ error: 'invalid', message: String(err) });
    }
  });

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
    '/api/settings/password',
    async (req, reply) => {
      const current = String(req.body?.currentPassword ?? '');
      const next = String(req.body?.newPassword ?? '');
      if (next.length < 6) {
        return reply.code(400).send({ error: 'password_too_short' });
      }
      try {
        await changePassword(current, next);
        return { ok: true };
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === 'wrong_password') return reply.code(401).send({ error: 'wrong_password' });
        return reply.code(400).send({ error: 'failed', message: msg });
      }
    },
  );
}
