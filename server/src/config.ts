import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '127.0.0.1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: required('JWT_SECRET'),
};
