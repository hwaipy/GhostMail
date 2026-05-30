export interface Folder {
  path: string;
  name: string;
  delimiter: string;
  flags: string[];
  specialUse: string | null;
  subscribed: boolean;
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

export interface MailServerInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface MaskedMailServer {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passSet: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message: string | undefined;
    try {
      const j = await res.json();
      code = j.error ?? code;
      message = j.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export const api = {
  setupStatus() {
    return request<{ initialized: boolean; emailConfigured: boolean }>('/api/setup/status');
  },
  setupInit(password: string) {
    return request<{ ok: true }>('/api/setup/init', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },
  login(password: string) {
    return request<{ ok: true }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },
  logout() {
    return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  },
  me() {
    return request<{ authenticated: boolean }>('/api/auth/me');
  },
  getEmailSettings() {
    return request<{
      configured: boolean;
      email: { imap: MaskedMailServer; smtp: MaskedMailServer } | null;
    }>('/api/settings/email');
  },
  saveEmailSettings(imap: MailServerInput, smtp: MailServerInput) {
    return request<{ ok: true }>('/api/settings/email', {
      method: 'POST',
      body: JSON.stringify({ imap, smtp }),
    });
  },
  testEmailSettings(imap: MailServerInput, smtp: MailServerInput) {
    return request<{ imap: string; smtp: string }>('/api/settings/email/test', {
      method: 'POST',
      body: JSON.stringify({ imap, smtp }),
    });
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request<{ ok: true }>('/api/settings/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
  folders() {
    return request<Folder[]>('/api/folders');
  },
  messages(folder: string, limit = 50, beforeUid?: number) {
    const q = new URLSearchParams({ folder, limit: String(limit) });
    if (beforeUid != null) q.set('beforeUid', String(beforeUid));
    return request<{ folder: string; messages: MessageHeader[] }>(`/api/messages?${q}`);
  },
  message(folder: string, uid: number) {
    const q = new URLSearchParams({ folder });
    return request<MessageDetail>(`/api/messages/${uid}?${q}`);
  },
  attachmentUrl(folder: string, uid: number, idx: number) {
    const q = new URLSearchParams({ folder, idx: String(idx) });
    return `/api/messages/${uid}/attachments?${q}`;
  },
};
