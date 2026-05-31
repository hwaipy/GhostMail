import { ImapFlow, type ListResponse, type FetchMessageObject } from 'imapflow';
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
  part: string;
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

interface BodyPartRef {
  part: string;
  charset?: string;
}

interface WalkResult {
  html?: BodyPartRef;
  text?: BodyPartRef;
  attachments: AttachmentMeta[];
}

// Walk the BODYSTRUCTURE tree. First text/html and first text/plain leaf
// found in scan order become the message body; everything else is treated
// as an attachment (with `inline` set when a Content-ID is present or
// disposition is "inline").
function walkStructure(node: any, out: WalkResult): void {
  if (!node) return;
  const type = String(node.type || '').toLowerCase();

  if (type.startsWith('multipart/') && Array.isArray(node.childNodes)) {
    for (const child of node.childNodes) walkStructure(child, out);
    return;
  }

  const part: string = node.part ?? '1';
  const disposition = String(node.disposition || '').toLowerCase();
  const filename: string | null =
    node.dispositionParameters?.filename ?? node.parameters?.name ?? null;
  const cidRaw: string | null = node.id ?? null;
  const cid = cidRaw ? cidRaw.replace(/^<|>$/g, '') : null;
  const charset: string | undefined = node.parameters?.charset;
  const size: number = node.size ?? 0;

  const looksAttachment = disposition === 'attachment' || !!filename;

  if (!looksAttachment) {
    if (type === 'text/html' && !out.html) {
      out.html = { part, charset };
      return;
    }
    if (type === 'text/plain' && !out.text) {
      out.text = { part, charset };
      return;
    }
  }

  out.attachments.push({
    part,
    filename,
    contentType: type || 'application/octet-stream',
    size,
    cid,
    inline: !!cid || disposition === 'inline',
  });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

function decodeText(buf: Buffer, charset?: string): string {
  const cs = (charset || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(cs, { fatal: false }).decode(buf);
  } catch {
    return buf.toString('utf-8');
  }
}

// Tiny header-block parser: unfold folded continuations and split on the
// first colon. We only need this for headers the IMAP ENVELOPE doesn't
// expose (notably `References`).
function parseHeadersBuffer(buf: Buffer | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!buf) return out;
  const unfolded = buf.toString('utf-8').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}

function extractMessageIds(value: string | undefined): string[] {
  if (!value) return [];
  const ids = value.match(/<[^>]+>/g);
  return ids ? ids : [];
}

function envelopeAddrs(
  list:
    | { name?: string | null; address?: string | null }[]
    | null
    | undefined,
): Addr[] {
  if (!list) return [];
  return list.map((a) => ({
    name: a.name ?? undefined,
    address: a.address ?? undefined,
  }));
}

function rewriteCids(
  html: string,
  atts: AttachmentMeta[],
  baseUrl: string,
): string {
  return html.replace(/(src\s*=\s*["'])cid:([^"']+)(["'])/gi, (_m, p1, cid, p3) => {
    const found = atts.find((a) => a.cid === cid);
    if (!found) return `${p1}cid:${cid}${p3}`;
    return `${p1}${baseUrl}${encodeURIComponent(found.part)}${p3}`;
  });
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
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  let meta: FetchMessageObject;
  let walk: WalkResult;
  try {
    const res = await c.fetchOne(
      String(uid),
      {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        headers: ['references'],
      },
      { uid: true },
    );
    if (!res) throw new MessageNotFoundError();
    meta = res;
    walk = { attachments: [] };
    walkStructure(res.bodyStructure, walk);
  } finally {
    lock.release();
  }

  // Download only the text body parts. Attachments stay on the server
  // until the user (or the iframe via cid:) asks for them.
  const [htmlBuf, textBuf] = await Promise.all([
    walk.html ? downloadPart(folder, uid, walk.html.part) : Promise.resolve(null),
    walk.text ? downloadPart(folder, uid, walk.text.part) : Promise.resolve(null),
  ]);

  let html: string | null = null;
  let text: string | null = null;
  if (htmlBuf && walk.html) {
    html = decodeText(htmlBuf, walk.html.charset);
    html = rewriteCids(html, walk.attachments, attachmentBaseUrl);
  }
  if (textBuf && walk.text) {
    text = decodeText(textBuf, walk.text.charset);
  }

  const flags = await markSeen(folder, uid);

  const env = meta.envelope ?? {};
  const headers = parseHeadersBuffer(
    (meta as unknown as { headers?: Buffer }).headers,
  );
  const references = extractMessageIds(headers.get('references'));

  return {
    uid,
    folder,
    flags,
    headers: {
      from: envelopeAddrs(env.from),
      to: envelopeAddrs(env.to),
      cc: envelopeAddrs(env.cc),
      bcc: envelopeAddrs(env.bcc),
      replyTo: envelopeAddrs(env.replyTo),
      subject: env.subject ?? null,
      date: env.date ? new Date(env.date).toISOString() : null,
      messageId: env.messageId ?? null,
      inReplyTo: env.inReplyTo ?? null,
      references,
    },
    html,
    text,
    attachments: walk.attachments,
  };
}

async function downloadPart(folder: string, uid: number, part: string): Promise<Buffer> {
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  try {
    const res = (await c.download(String(uid), part, { uid: true })) as
      | { content: NodeJS.ReadableStream }
      | false;
    if (!res || !res.content) throw new MessageNotFoundError();
    return await streamToBuffer(res.content);
  } finally {
    lock.release();
  }
}

export async function fetchAttachment(
  folder: string,
  uid: number,
  part: string,
): Promise<{ content: Buffer; contentType: string; filename: string | null }> {
  const c = await getClient();
  const lock = await c.getMailboxLock(folder);
  try {
    const dl = (await c.download(String(uid), part, { uid: true })) as
      | {
          content: NodeJS.ReadableStream;
          meta?: { contentType?: string; filename?: string };
        }
      | false;
    if (!dl || !dl.content) throw new MessageNotFoundError();
    const content = await streamToBuffer(dl.content);
    return {
      content,
      contentType: dl.meta?.contentType || 'application/octet-stream',
      filename: dl.meta?.filename ?? null,
    };
  } finally {
    lock.release();
  }
}
