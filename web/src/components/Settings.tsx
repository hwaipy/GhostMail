import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, AlertCircle, AtSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type MailServerInput } from '../api/client';

type SectionId = 'accounts';

const SECTIONS: { id: SectionId; label: string; icon: typeof AtSign }[] = [
  { id: 'accounts', label: 'Accounts', icon: AtSign },
];

interface ServerForm {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
}

const emptyServer: ServerForm = {
  host: '',
  port: '',
  secure: true,
  user: '',
  pass: '',
};

function toInput(f: ServerForm): MailServerInput {
  return {
    host: f.host.trim(),
    port: Number(f.port),
    secure: f.secure,
    user: f.user.trim(),
    pass: f.pass,
  };
}

export default function Settings() {
  const nav = useNavigate();
  const [section, setSection] = useState<SectionId>('accounts');

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-ink-200 px-4 py-3">
        <button
          onClick={() => nav(-1)}
          className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-sm font-semibold tracking-tight">Settings</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 border-r border-ink-200 bg-ink-50 p-2 md:w-56">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={[
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-700 hover:bg-ink-200/60',
                ].join(' ')}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {section === 'accounts' && <AccountsPanel />}
        </main>
      </div>
    </div>
  );
}

function AccountsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-settings'], queryFn: () => api.getEmailSettings() });

  const [imap, setImap] = useState<ServerForm>({ ...emptyServer, port: '993' });
  const [smtp, setSmtp] = useState<ServerForm>({ ...emptyServer, port: '465' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ imap: string; smtp: string } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    if (data?.email) {
      setImap((p) => ({
        host: data.email!.imap.host,
        port: String(data.email!.imap.port),
        secure: data.email!.imap.secure,
        user: data.email!.imap.user,
        pass: p.pass,
      }));
      setSmtp((p) => ({
        host: data.email!.smtp.host,
        port: String(data.email!.smtp.port),
        secure: data.email!.smtp.secure,
        user: data.email!.smtp.user,
        pass: p.pass,
      }));
    }
  }, [data]);

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testEmailSettings(toInput(imap), toInput(smtp));
      setTestResult(r);
    } catch (e) {
      setTestResult({
        imap: e instanceof ApiError ? e.message : 'failed',
        smtp: '—',
      });
    } finally {
      setTesting(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveErr(null);
    setSaveOk(false);
    try {
      await api.saveEmailSettings(toInput(imap), toInput(smtp));
      await qc.invalidateQueries({ queryKey: ['email-settings'] });
      await qc.invalidateQueries({ queryKey: ['folders'] });
      await qc.invalidateQueries({ queryKey: ['setup-status'] });
      setSaveOk(true);
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : 'failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="px-5 py-6 md:px-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
          <p className="mt-1 text-xs text-ink-500">
            IMAP for receiving, SMTP for sending. Credentials are stored on the server in
            <code className="mx-1 rounded bg-ink-100 px-1 py-0.5 text-2xs">data/config.json</code>
            with 0600 permissions.
          </p>
        </div>

        <ServerSection title="IMAP (incoming)" value={imap} onChange={setImap} />
        <ServerSection title="SMTP (outgoing)" value={smtp} onChange={setSmtp} />

        {testResult && (
          <div className="space-y-1 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm">
            <ResultLine label="IMAP" result={testResult.imap} />
            <ResultLine label="SMTP" result={testResult.smtp} />
          </div>
        )}

        {saveOk && <p className="text-sm text-green-700">Saved. Mail should now load.</p>}
        {saveErr && <p className="text-sm text-red-600">{saveErr}</p>}

        <div className="flex items-center gap-3 border-t border-ink-200 pt-6">
          <button
            type="button"
            onClick={onTest}
            disabled={testing || saving}
            className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="submit"
            disabled={saving || testing}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}

function ResultLine({ label, result }: { label: string; result: string }) {
  const ok = result === 'ok';
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <Check size={14} className="text-green-600" />
      ) : (
        <AlertCircle size={14} className="text-red-600" />
      )}
      <span className="font-medium text-ink-700">{label}:</span>
      <span className={ok ? 'text-green-700' : 'text-red-600'}>{ok ? 'connected' : result}</span>
    </div>
  );
}

function ServerSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: ServerForm;
  onChange: (v: ServerForm) => void;
}) {
  function patch(p: Partial<ServerForm>) {
    onChange({ ...value, ...p });
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight text-ink-900">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Host" className="sm:col-span-2">
          <input
            value={value.host}
            onChange={(e) => patch({ host: e.target.value })}
            placeholder="imap.example.com"
            className={inputCls}
          />
        </Field>
        <Field label="Port">
          <input
            value={value.port}
            onChange={(e) => patch({ port: e.target.value.replace(/[^0-9]/g, '') })}
            inputMode="numeric"
            className={inputCls}
          />
        </Field>
        <Field label="Username" className="sm:col-span-2">
          <input
            value={value.user}
            onChange={(e) => patch({ user: e.target.value })}
            autoComplete="off"
            className={inputCls}
          />
        </Field>
        <Field label="TLS">
          <label className="flex h-[34px] items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={value.secure}
              onChange={(e) => patch({ secure: e.target.checked })}
            />
            Secure
          </label>
        </Field>
        <Field label="Password" className="sm:col-span-3">
          <input
            type="password"
            value={value.pass}
            onChange={(e) => patch({ pass: e.target.value })}
            placeholder="Leave unchanged to keep current"
            autoComplete="new-password"
            className={inputCls}
          />
        </Field>
      </div>
    </section>
  );
}

const inputCls =
  'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={'space-y-1.5 ' + className}>
      <label className="block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}
