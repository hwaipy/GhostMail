import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type MessageHeader } from '../api/client';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function senderLabel(m: MessageHeader): string {
  const f = m.envelope.from[0];
  if (!f) return '(unknown)';
  return f.name?.trim() || f.address || '(unknown)';
}

function isUnread(m: MessageHeader): boolean {
  return !m.flags.includes('\\Seen');
}

export default function MessageList({
  folder,
  selectedUid,
  onPick,
  onOpenFolders,
}: {
  folder: string;
  selectedUid: number | null;
  onPick: (uid: number) => void;
  onOpenFolders: () => void;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['messages', folder],
    queryFn: () => api.messages(folder, 80),
    retry: false,
  });

  const notConfigured =
    error instanceof ApiError && error.code === 'email_not_configured';

  function refresh() {
    qc.invalidateQueries({ queryKey: ['messages', folder] });
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-ink-200 px-3 py-3 md:px-4">
        <button
          onClick={onOpenFolders}
          className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden"
          aria-label="Folders"
        >
          <Menu size={18} />
        </button>
        <h2 className="flex-1 truncate text-sm font-semibold tracking-tight">
          {folder === 'INBOX' ? 'Inbox' : folder}
        </h2>
        <button
          onClick={refresh}
          className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {isLoading && <div className="px-4 py-3 text-xs text-ink-400">Loading…</div>}
        {notConfigured && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <SettingsIcon size={28} className="text-ink-400" />
            <div className="text-sm text-ink-700">No mailbox configured yet.</div>
            <button
              onClick={() => nav('/settings')}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Open Settings
            </button>
          </div>
        )}
        {error && !notConfigured && (
          <div className="px-4 py-3 text-xs text-red-600">Failed to load messages.</div>
        )}
        {data?.messages.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-ink-400">No messages.</div>
        )}
        <ul>
          {data?.messages.map((m) => {
            const active = m.uid === selectedUid;
            const unread = isUnread(m);
            return (
              <li key={m.uid}>
                <button
                  onClick={() => onPick(m.uid)}
                  className={[
                    'touch-tap flex w-full gap-3 border-b border-ink-100 px-4 py-3 text-left transition',
                    active ? 'bg-accent-soft' : 'hover:bg-ink-50',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className={[
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      unread ? 'bg-accent' : 'bg-transparent',
                    ].join(' ')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={[
                          'truncate text-sm',
                          unread ? 'font-semibold text-ink-900' : 'text-ink-700',
                        ].join(' ')}
                      >
                        {senderLabel(m)}
                      </span>
                      <span className="ml-auto shrink-0 text-2xs text-ink-400">
                        {formatDate(m.envelope.date)}
                      </span>
                    </div>
                    <div
                      className={[
                        'truncate text-sm',
                        unread ? 'text-ink-900' : 'text-ink-500',
                      ].join(' ')}
                    >
                      {m.envelope.subject || '(no subject)'}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
