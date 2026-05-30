import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import Login from './components/Login';
import Setup from './components/Setup';
import Layout from './components/Layout';
import Settings from './components/Settings';

export default function App() {
  const status = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.setupStatus(),
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    enabled: !!status.data?.initialized,
  });

  if (status.isLoading) {
    return <div className="grid h-full place-items-center text-sm text-ink-400">Loading…</div>;
  }

  if (!status.data?.initialized) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  const authed = me.data?.authenticated;

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/setup" element={<Navigate to="/" replace />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/*" element={<Layout />} />
    </Routes>
  );
}
