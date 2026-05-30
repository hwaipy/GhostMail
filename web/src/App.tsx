import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api/client';
import Login from './components/Login';
import Layout from './components/Layout';

export default function App() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
  });

  useEffect(() => {
    if (data && !data.authenticated && window.location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [data, navigate]);

  if (isLoading) {
    return <div className="grid h-full place-items-center text-ink-400 text-sm">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={data?.authenticated ? <Layout /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
