import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Archive,
  AlertOctagon,
  Folder as FolderIcon,
  X,
  LogOut,
  Settings as SettingsIcon,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type Folder } from '../api/client';

function iconFor(f: Folder) {
  const su = f.specialUse?.replace('\\', '').toLowerCase();
  if (f.path.toUpperCase() === 'INBOX' || su === 'inbox') return Inbox;
  if (su === 'sent') return Send;
  if (su === 'drafts') return FileText;
  if (su === 'trash') return Trash2;
  if (su === 'junk') return AlertOctagon;
  if (su === 'archive') return Archive;
  return FolderIcon;
}

const SPECIAL_ORDER = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'];

function sortFolders(folders: Folder[]): Folder[] {
  const score = (f: Folder) => {
    if (f.path.toUpperCase() === 'INBOX') return 0;
    const su = f.specialUse?.replace('\\', '').toLowerCase();
    const idx = su ? SPECIAL_ORDER.indexOf(su) : -1;
    return idx >= 0 ? idx : 99;
  };
  return [...folders].sort((a, b) => {
    const sa = score(a),
      sb = score(b);
    if (sa !== sb) return sa - sb;
    return a.path.localeCompare(b.path);
  });
}

export default function Sidebar({
  currentFolder,
  onSelect,
  onClose,
}: {
  currentFolder: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: () => api.folders(),
    retry: false,
  });

  const notConfigured =
    error instanceof ApiError && error.code === 'email_not_configured';

  async function logout() {
    await api.logout();
    await qc.invalidateQueries({ queryKey: ['me'] });
    nav('/login', { replace: true });
  }

  async function forceRefresh() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString());
    window.location.replace(url.toString());
  }

  const folders = data ? sortFolders(data) : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4 md:pt-5">
        <span className="text-sm font-semibold tracking-tight">GhostMail</span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink-500 hover:bg-ink-200 md:hidden"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pt-2">
        {isLoading && (
          <div className="grid place-items-center py-6">
            <Loader2 size={16} className="animate-spin text-ink-400" />
          </div>
        )}
        {notConfigured && (
          <div className="px-3 py-2 text-xs text-ink-500">
            No mailbox configured.
            <button
              onClick={() => nav('/settings')}
              className="ml-1 text-accent hover:underline"
            >
              Set it up →
            </button>
          </div>
        )}
        {folders.map((f) => {
          const Icon = iconFor(f);
          const active = f.path === currentFolder;
          return (
            <button
              key={f.path}
              onClick={() => onSelect(f.path)}
              className={[
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                active
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-700 hover:bg-ink-200/60',
              ].join(' ')}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{f.path === 'INBOX' ? 'Inbox' : f.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-ink-200 p-2">
        <button
          onClick={() => nav('/settings')}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-200/60"
        >
          <SettingsIcon size={16} />
          <span>Settings</span>
        </button>
        <button
          onClick={forceRefresh}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-200/60"
        >
          <RotateCcw size={16} />
          <span>Force refresh</span>
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-500 hover:bg-ink-200/60"
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
