import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Paperclip, Download } from 'lucide-react';
import DOMPurify from 'dompurify';
import { api, type Addr, type AttachmentMeta } from '../api/client';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function addrLabel(a: Addr): string {
  return a.name ? `${a.name} <${a.address ?? ''}>` : a.address ?? '';
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const APP_BASE_STYLE = `
  html, body { margin: 0; padding: 16px 20px; background: #fff; color: #1a1a1a; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.55; word-wrap: break-word; }
  a { color: #2f74ff; }
  img, video { max-width: 100%; height: auto; }
  pre, code { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  blockquote { border-left: 3px solid #e5e5e5; margin: 0 0 8px; padding: 4px 12px; color: #525252; }
`;

function buildIframeDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${APP_BASE_STYLE}</style></head><body>${html}</body></html>`;
}

// iframes ignore viewport meta, and CSS `zoom` is flaky inside iframes. Reliable approach:
// wrap all body children in a div, measure its natural width, scale it with CSS transform,
// and set body height to the scaled height (transform doesn't shrink the layout box).
function fitIframe(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;
  const body = doc.body as HTMLElement;

  let wrap = doc.getElementById('__gm_fit__') as HTMLElement | null;
  if (!wrap) {
    wrap = doc.createElement('div');
    wrap.id = '__gm_fit__';
    wrap.style.transformOrigin = '0 0';
    while (body.firstChild) wrap.appendChild(body.firstChild);
    body.appendChild(wrap);
  }

  wrap.style.transform = '';
  wrap.style.width = '';
  body.style.height = '';
  body.style.overflow = 'hidden';

  const containerWidth = body.clientWidth;
  if (containerWidth <= 0) return;

  const naturalWidth = wrap.scrollWidth;
  if (naturalWidth <= containerWidth + 2) return;

  const scale = containerWidth / naturalWidth;
  wrap.style.width = naturalWidth + 'px';
  wrap.style.transform = `scale(${scale})`;
  body.style.height = wrap.scrollHeight * scale + 'px';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return `<pre>${escapeHtml(text)}</pre>`;
}

export default function MessageView({
  uid,
  folder,
  onBack,
}: {
  uid: number | null;
  folder: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['message', folder, uid],
    queryFn: () => api.message(folder, uid as number),
    enabled: uid != null,
    retry: false,
  });

  useEffect(() => {
    if (data) {
      qc.invalidateQueries({ queryKey: ['messages', folder] });
    }
  }, [data, folder, qc]);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitIframe(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const srcDoc = useMemo(() => {
    if (!data) return '';
    const raw =
      data.html ?? (data.text ? textToHtml(data.text) : '<p style="color:#a3a3a3">(empty)</p>');
    DOMPurify.removeAllHooks();
    const clean = DOMPurify.sanitize(raw, {
      WHOLE_DOCUMENT: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      ADD_ATTR: ['target'],
    });
    return buildIframeDoc(clean);
  }, [data]);

  // Hide iframe before each new srcDoc loads so the user never sees the
  // un-fitted natural-width paint. onLoad reveals it after fit runs.
  useEffect(() => {
    const el = iframeRef.current;
    if (!el || !srcDoc) return;
    el.style.visibility = 'hidden';
    el.srcdoc = srcDoc;
  }, [srcDoc]);

  if (uid == null) {
    return (
      <div className="hidden h-full place-items-center text-sm text-ink-400 md:grid">
        Select a message
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-white">
        <ViewHeader folder={folder} onBack={onBack} />
        <div className="grid flex-1 place-items-center text-sm text-ink-400">Loading…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col bg-white">
        <ViewHeader folder={folder} onBack={onBack} />
        <div className="grid flex-1 place-items-center px-6 text-center text-sm text-red-600">
          Failed to load message.
        </div>
      </div>
    );
  }

  const visibleAttachments = data.attachments.filter((a) => !a.inline);

  return (
    <div className="flex h-full flex-col bg-white">
      <ViewHeader folder={folder} onBack={onBack} />

      <div className="flex flex-col gap-3 border-b border-ink-200 px-5 pb-4 pt-5 md:px-7">
        <h1 className="text-lg font-semibold leading-tight tracking-tight">
          {data.headers.subject || '(no subject)'}
        </h1>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <HeaderRow label="From" addrs={data.headers.from} />
          <HeaderRow label="To" addrs={data.headers.to} />
          {data.headers.cc.length > 0 && <HeaderRow label="Cc" addrs={data.headers.cc} />}
          <span className="text-ink-400">Date</span>
          <span className="text-ink-700">{fmtDate(data.headers.date)}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          title="message body"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{ visibility: 'hidden' }}
          onLoad={(e) => {
            const el = e.currentTarget;
            fitIframe(el);
            el.style.visibility = 'visible';
            const doc = el.contentDocument;
            doc?.querySelectorAll('img').forEach((img) => {
              if (!img.complete)
                img.addEventListener(
                  'load',
                  () => {
                    fitIframe(el);
                  },
                  { once: true },
                );
            });
            setTimeout(() => fitIframe(el), 400);
          }}
          className="h-full w-full border-0"
        />
      </div>

      {visibleAttachments.length > 0 && (
        <div className="border-t border-ink-200 bg-ink-50 px-5 py-3 md:px-7">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Paperclip size={12} />
            {visibleAttachments.length} attachment{visibleAttachments.length > 1 ? 's' : ''}
          </div>
          <ul className="flex flex-wrap gap-2">
            {visibleAttachments.map((a) => (
              <Attachment key={a.idx} a={a} folder={folder} uid={data.uid} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HeaderRow({ label, addrs }: { label: string; addrs: Addr[] }) {
  return (
    <>
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-700">{addrs.map(addrLabel).join(', ') || '—'}</span>
    </>
  );
}

function ViewHeader({ folder, onBack }: { folder: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-2 border-b border-ink-200 px-3 py-3 md:px-5">
      <button
        onClick={onBack}
        className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden"
        aria-label="Back"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="text-xs text-ink-400">{folder}</div>
    </header>
  );
}

function Attachment({ a, folder, uid }: { a: AttachmentMeta; folder: string; uid: number }) {
  const href = api.attachmentUrl(folder, uid, a.idx);
  return (
    <li>
      <a
        href={href}
        download={a.filename ?? `attachment-${a.idx}`}
        className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 hover:border-accent hover:text-accent"
      >
        <Download size={12} />
        <span className="max-w-[16rem] truncate">{a.filename || `attachment ${a.idx + 1}`}</span>
        <span className="text-ink-400">· {fmtSize(a.size)}</span>
      </a>
    </li>
  );
}
