import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Login() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.login(password);
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/', { replace: true });
    } catch {
      setErr('Wrong password');
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
          <h1 className="text-xl font-semibold tracking-tight">GhostMail</h1>
          <p className="text-sm text-ink-500">Sign in to continue</p>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-700">Password</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
