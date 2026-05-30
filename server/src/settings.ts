import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';

const DATA_DIR = process.env.DATA_DIR ?? 'data';
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export interface MailServer {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

interface SettingsFile {
  webPasswordHash?: string;
  imap?: MailServer;
  smtp?: MailServer;
}

let cache: SettingsFile | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function load(): Promise<SettingsFile> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    cache = JSON.parse(raw) as SettingsFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cache = {};
    } else {
      throw err;
    }
  }
  return cache!;
}

async function persist(next: SettingsFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = CONFIG_PATH + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.rename(tmp, CONFIG_PATH);
  cache = next;
}

async function mutate(fn: (s: SettingsFile) => Promise<void> | void): Promise<void> {
  const run = async () => {
    const cur = await get();
    const next: SettingsFile = JSON.parse(JSON.stringify(cur));
    await fn(next);
    await persist(next);
  };
  writeLock = writeLock.then(run, run);
  return writeLock;
}

export async function get(): Promise<SettingsFile> {
  if (cache) return cache;
  return load();
}

export async function isInitialized(): Promise<boolean> {
  const s = await get();
  return !!s.webPasswordHash;
}

export async function isEmailConfigured(): Promise<boolean> {
  const s = await get();
  return !!(s.imap?.host && s.imap?.user && s.smtp?.host && s.smtp?.user);
}

export async function setInitialPassword(pwd: string): Promise<void> {
  await mutate(async (s) => {
    if (s.webPasswordHash) throw new Error('already_initialized');
    s.webPasswordHash = await bcrypt.hash(pwd, 12);
  });
}

export async function changePassword(current: string, next: string): Promise<void> {
  await mutate(async (s) => {
    if (!s.webPasswordHash) throw new Error('not_initialized');
    if (!(await bcrypt.compare(current, s.webPasswordHash))) throw new Error('wrong_password');
    s.webPasswordHash = await bcrypt.hash(next, 12);
  });
}

export async function verifyPassword(pwd: string): Promise<boolean> {
  const s = await get();
  if (!s.webPasswordHash) return false;
  return bcrypt.compare(pwd, s.webPasswordHash);
}

export async function setEmailConfig(imap: MailServer, smtp: MailServer): Promise<void> {
  await mutate((s) => {
    s.imap = imap;
    s.smtp = smtp;
  });
}

export async function getEmailConfig(): Promise<{ imap: MailServer; smtp: MailServer } | null> {
  const s = await get();
  if (!s.imap || !s.smtp) return null;
  return { imap: s.imap, smtp: s.smtp };
}

export function maskedEmailConfig(): Promise<{
  imap: Omit<MailServer, 'pass'> & { passSet: boolean };
  smtp: Omit<MailServer, 'pass'> & { passSet: boolean };
} | null> {
  return get().then((s) => {
    if (!s.imap || !s.smtp) return null;
    const mask = (m: MailServer) => ({
      host: m.host,
      port: m.port,
      secure: m.secure,
      user: m.user,
      passSet: !!m.pass,
    });
    return { imap: mask(s.imap), smtp: mask(s.smtp) };
  });
}
