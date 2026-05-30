import { ImapFlow, type ListResponse, type FetchMessageObject } from 'imapflow';
import { getEmailConfig, type MailServer } from './settings.js';

let client: ImapFlow | null = null;
let connecting: Promise<ImapFlow> | null = null;

export class NotConfiguredError extends Error {
  constructor() {
    super('email_not_configured');
  }
}

async function buildClient(imap: MailServer): Promise<ImapFlow> {
  const c = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });
  await c.connect();
  c.on('close', () => {
    if (client === c) client = null;
  });
  c.on('error', () => {
    if (client === c) client = null;
  });
  return c;
}

async function connect(): Promise<ImapFlow> {
  const cfg = await getEmailConfig();
  if (!cfg) throw new NotConfiguredError();
  return buildClient(cfg.imap);
}

export async function getClient(): Promise<ImapFlow> {
  if (client && client.usable) return client;
  if (!connecting) {
    connecting = connect()
      .then((c) => {
        client = c;
        return c;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

export async function resetClient(): Promise<void> {
  const c = client;
  client = null;
  connecting = null;
  if (c) {
    try {
      await c.logout();
    } catch {
      /* ignore */
    }
  }
}

export async function testImap(imap: MailServer): Promise<void> {
  const c = await buildClient(imap);
  try {
    await c.list();
  } finally {
    try {
      await c.logout();
    } catch {
      /* ignore */
    }
  }
}

export async function listFolders(): Promise<ListResponse[]> {
  const c = await getClient();
  return await c.list();
}

export interface MessageHeader {
  uid: number;
  seq: number;
  flags: string[];
  envelope: {
    date: string | null;
    subject: string | null;
    from: { name?: string; address?: string }[];
    to: { name?: string; address?: string }[];
    messageId: string | null;
  };
  size: number;
}

export async function listMessages(
  folder: string,
  opts: { limit?: number } = {},
): Promise<MessageHeader[]> {
  const limit = opts.limit ?? 50;
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  try {
    const mailbox = c.mailbox;
    if (!mailbox || typeof mailbox === 'boolean') return [];
    const total = mailbox.exists;
    if (!total) return [];
    const from = Math.max(1, total - limit + 1);
    const range = `${from}:${total}`;
    const out: MessageHeader[] = [];
    for await (const msg of c.fetch(range, {
      uid: true,
      flags: true,
      envelope: true,
      size: true,
    }) as AsyncIterable<FetchMessageObject>) {
      out.push({
        uid: msg.uid,
        seq: msg.seq,
        flags: Array.from(msg.flags ?? []),
        envelope: {
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          subject: msg.envelope?.subject ?? null,
          from: (msg.envelope?.from ?? []).map((a) => ({ name: a.name, address: a.address })),
          to: (msg.envelope?.to ?? []).map((a) => ({ name: a.name, address: a.address })),
          messageId: msg.envelope?.messageId ?? null,
        },
        size: msg.size ?? 0,
      });
    }
    return out.sort((a, b) => b.uid - a.uid);
  } finally {
    lock.release();
  }
}
