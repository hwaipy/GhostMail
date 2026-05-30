import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { mailRoutes } from './routes/mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: { level: config.nodeEnv === 'production' ? 'info' : 'debug' } });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'gm_token', signed: false },
  });

  await app.register(authRoutes);
  await app.register(mailRoutes);

  app.get('/api/health', async () => ({ ok: true }));

  if (config.nodeEnv === 'production') {
    const webDist = path.resolve(__dirname, '../../web/dist');
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`GhostMail server on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
