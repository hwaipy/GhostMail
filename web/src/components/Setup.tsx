import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';

export default function Setup() {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const qc = useQueryClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw1.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }
    if (pw1 !== pw2) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.setupInit(pw1);
      await api.login(pw1);
      await qc.invalidateQueries({ queryKey: ['setup-status'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center bg-ink-50 px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-ink-200"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Welcome to GhostMail</h1>
          <p className="text-sm text-ink-500">
            Set a password to protect this mailbox. You can change it later in Settings.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-700">New password</label>
          <input
            type="password"
            autoFocus
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-700">Confirm password</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <button
          type="submit"
          disabled={busy || !pw1 || !pw2}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {busy ? 'Setting up…' : 'Create password'}
        </button>
      </form>
    </div>
  );
}
