import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { SpatialNavProvider } from '../hooks/useSpatialNavigation';
import { useTvBackHandler } from '@/hooks/useTvBackHandler';

const NotFoundPageInner: React.FC = () => {
  const navigate = useNavigate();
  const btnRef = useRef<HTMLButtonElement>(null);

  useTvBackHandler(() => navigate('/'));

  useEffect(() => {
    const t = setTimeout(() => btnRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
      style={{
        background: 'linear-gradient(135deg, #0b0514 0%, #1a1a1f 50%, #0f0f12 100%)',
      }}
    >
      <h1 className="text-4xl font-bold text-white/90">404</h1>
      <p className="text-lg text-white/70 text-center">Página não encontrada</p>
      <button
        ref={btnRef}
        data-nav-item
        data-nav-row={0}
        data-nav-col={0}
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 hover:scale-[1.03] active:scale-95 transition-all duration-200 text-white outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
      >
        <Home size={20} /> Voltar ao Início
      </button>
    </div>
  );
};

const NotFoundPage: React.FC = () => (
  <SpatialNavProvider>
    <NotFoundPageInner />
  </SpatialNavProvider>
);

export default NotFoundPage;
