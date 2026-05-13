import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import { SpatialNavProvider } from '@/hooks/useSpatialNavigation';
import { useTvBackHandler } from '@/hooks/useTvBackHandler';
import { Page } from '@/types';
import FutebolPage from '@/features/futebol/FutebolPage';

function mapPageToRoute(page: Page): string {
  switch (page) {
    case Page.HOME:
      return '/';
    case Page.GENRES:
      return '/generos';
    case Page.MOVIES:
      return '/filmes';
    case Page.SERIES:
      return '/series';
    case Page.KIDS:
      return '/kids';
    case Page.LIVE:
      return '/canais';
    case Page.FUTEBOL:
      return '/futebol';
    case Page.MY_LIST:
      return '/minha-lista';
    case Page.SEARCH:
      return '/busca';
    case Page.SETTINGS:
      return '/configuracoes';
    default:
      return '/';
  }
}

const FutebolShellInner: React.FC = () => {
  const navigate = useNavigate();
  const handleNavigate = useCallback(
    (page: Page) => {
      navigate(mapPageToRoute(page));
    },
    [navigate]
  );

  const activeProfile = (() => {
    try {
      const raw = sessionStorage.getItem('redx-active-profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const goToSettings = useCallback(() => {
    navigate('/');
  }, [navigate]);

  useTvBackHandler(() => {
    navigate('/');
  });

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto flex text-white">
      <Sidebar
        currentPage={Page.FUTEBOL}
        onNavigate={handleNavigate}
        activeProfile={activeProfile}
        onProfileClick={goToSettings}
        onProfileMenuSelect={goToSettings}
      />
      <main className="sidebar-content-offset w-full flex-1 flex flex-col items-center p-0">
        <FutebolPage />
      </main>
    </div>
  );
};

const FutebolStandaloneRoute: React.FC = () => (
  <SpatialNavProvider>
    <FutebolShellInner />
  </SpatialNavProvider>
);

export default FutebolStandaloneRoute;
