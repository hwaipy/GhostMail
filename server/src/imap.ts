import { ImapFlow, type ListResponse, type FetchMessageObject } from 'imapflow';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import { getEmailConfig, type MailServer } from './settings.js';

let client: ImapFlow | null = null;
let connecting: Promise<ImapFlow> | null = null;

export class NotConfiguredError extends Error {
  constructor() {
    super('email_not_configured');
  }
}

export class MessageNotFoundError extends Error {
  constructor() {
    super('message_not_found');
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

function buildHeader(msg: FetchMessageObject): MessageHeader {
  return {
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
  };
}

export async function listMessages(
  folder: string,
  opts: { limit?: number; beforeUid?: number } = {},
): Promise<MessageHeader[]> {
  const limit = opts.limit ?? 50;
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  try {
    const mailbox = c.mailbox;
    if (!mailbox || typeof mailbox === 'boolean') return [];
    const total = mailbox.exists;
    if (!total) return [];

    const fetchQuery = { uid: true, flags: true, envelope: true, size: true };
    const out: MessageHeader[] = [];

    if (opts.beforeUid && opts.beforeUid > 1) {
      const uids = (await c.search(
        { uid: `1:${opts.beforeUid - 1}` },
        { uid: true },
      )) as number[] | false;
      if (!uids || uids.length === 0) return [];
      const sliced = uids.slice(-limit);
      const range = sliced.join(',');
      for await (const msg of c.fetch(range, fetchQuery, {
        uid: true,
      }) as AsyncIterable<FetchMessageObject>) {
        out.push(buildHeader(msg));
      }
    } else {
      const from = Math.max(1, total - limit + 1);
      const range = `${from}:${total}`;
      for await (const msg of c.fetch(range, fetchQuery) as AsyncIterable<FetchMessageObject>) {
        out.push(buildHeader(msg));
      }
    }

    return out.sort((a, b) => b.uid - a.uid);
  } finally {
    lock.release();
  }
}

export interface Addr {
  name?: string;
  address?: string;
}

export interface AttachmentMeta {
  idx: number;
  filename: string | null;
  contentType: string;
  size: number;
  cid: string | null;
  inline: boolean;
}

export interface MessageDetail {
  uid: number;
  folder: string;
  flags: string[];
  headers: {
    from: Addr[];
    to: Addr[];
    cc: Addr[];
    bcc: Addr[];
    replyTo: Addr[];
    subject: string | null;
    date: string | null;
    messageId: string | null;
    inReplyTo: string | null;
    references: string[];
  };
  html: string | null;
  text: string | null;
  attachments: AttachmentMeta[];
}

function addrList(a: AddressObject | AddressObject[] | undefined): Addr[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: Addr[] = [];
  for (const ao of arr) {
    for (const x of ao.value ?? []) {
      out.push({ name: x.name || undefined, address: x.address || undefined });
    }
  }
  return out;
}

function rewriteCids(html: string, atts: { cid: string | null; idx: number }[], baseUrl: string): string {
  return html.replace(/(src\s*=\s*["'])cid:([^"']+)(["'])/gi, (_m, p1, cid, p3) => {
    const found = atts.find((a) => a.cid && a.cid.replace(/^<|>$/g, '') === cid);
    if (!found) return `${p1}cid:${cid}${p3}`;
    return `${p1}${baseUrl}${found.idx}${p3}`;
  });
}

async function fetchSource(folder: string, uid: number): Promise<Buffer> {
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  try {
    const res = await c.fetchOne(String(uid), { source: true, flags: true, uid: true }, { uid: true });
    if (!res || !res.source) throw new MessageNotFoundError();
    return res.source as Buffer;
  } finally {
    lock.release();
  }
}

async function markSeen(folder: string, uid: number): Promise<string[]> {
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  try {
    try {
      await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } catch {
      /* ignore */
    }
    const res = await c.fetchOne(String(uid), { flags: true, uid: true }, { uid: true });
    if (!res) return [];
    return Array.from(res.flags ?? []);
  } finally {
    lock.release();
  }
}

export async function fetchMessage(
  folder: string,
  uid: number,
  attachmentBaseUrl: string,
): Promise<MessageDetail> {
  const source = await fetchSource(folder, uid);
  const parsed: ParsedMail = await simpleParser(source);

  const atts: AttachmentMeta[] = (parsed.attachments ?? []).map((a, idx) => ({
    idx,
    filename: a.filename ?? null,
    contentType: a.contentType ?? 'application/octet-stream',
    size: a.size ?? 0,
    cid: a.cid ?? null,
    inline: (a.contentDisposition ?? '').toLowerCase() === 'inline' || !!a.cid,
  }));

  let html = parsed.html || null;
  if (html) {
    html = rewriteCids(html, atts, attachmentBaseUrl);
  }

  const flags = await markSeen(folder, uid);

  const refs = parsed.references
    ? Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references]
    : [];

  return {
    uid,
    folder,
    flags,
    headers: {
      from: addrList(parsed.from),
      to: addrList(parsed.to),
      cc: addrList(parsed.cc),
      bcc: addrList(parsed.bcc),
      replyTo: addrList(parsed.replyTo),
      subject: parsed.subject ?? null,
      date: parsed.date?.toISOString() ?? null,
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references: refs,
    },
    html,
    text: parsed.text ?? null,
    attachments: atts,
  };
}

export async function fetchAttachment(
  folder: string,
  uid: number,
  idx: number,
): Promise<{ content: Buffer; contentType: string; filename: string | null }> {
  const source = await fetchSource(folder, uid);
  const parsed = await simpleParser(source);
  const att = (parsed.attachments ?? [])[idx];
  if (!att) throw new MessageNotFoundError();
  return {
    content: att.content,
    contentType: att.contentType ?? 'application/octet-stream',
    filename: att.filename ?? null,
  };
}
