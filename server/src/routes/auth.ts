import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { config } from '../config.js';

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { password?: string } }>('/api/auth/login', async (req, reply) => {
    const password = req.body?.password ?? '';
    const ok = await bcrypt.compare(password, config.webPasswordHash);
    if (!ok) {
      return reply.code(401).send({ error: 'invalid_password' });
    }
    const token = await reply.jwtSign({ sub: 'user' }, { expiresIn: '30d' });
    reply.setCookie('gm_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('gm_token', { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    try {
      await req.jwtVerify();
      return { authenticated: true };
    } catch {
      return { authenticated: false };
    }
  });
}
