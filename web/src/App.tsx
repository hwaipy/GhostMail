import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
    return (
      <div className="grid h-full place-items-center">
        <Loader2 size={22} className="animate-spin text-ink-400" />
      </div>
    );
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
      <Route path="/*" element={<AuthedShell />} />
    </Routes>
  );
}

// Layout always mounted underneath; Settings is an absolute overlay that
// slides in from the right based on URL. State / queries inside both
// components persist across the slide.
function AuthedShell() {
  const location = useLocation();
  const showSettings = location.pathname.startsWith('/settings');
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Layout />
      <div
        aria-hidden={!showSettings}
        className={[
          'absolute inset-0 z-40 bg-white transform-gpu transition-transform duration-[260ms] ease-out',
          showSettings ? 'translate-x-0 shadow-2xl' : 'translate-x-full pointer-events-none',
        ].join(' ')}
      >
        <Settings />
      </div>
    </div>
  );
}
