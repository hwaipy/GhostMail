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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
  }
}

export const api = {
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
  folders() {
    return request<Folder[]>('/api/folders');
  },
  messages(folder: string, limit = 50) {
    const q = new URLSearchParams({ folder, limit: String(limit) });
    return request<{ folder: string; messages: MessageHeader[] }>(`/api/messages?${q}`);
  },
};
