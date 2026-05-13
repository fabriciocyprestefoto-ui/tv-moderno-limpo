import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import { SpatialNavProvider } from '@/hooks/useSpatialNavigation';
import { useTvBackHandler } from '@/hooks/useTvBackHandler';
import { Page } from '@/types';
import FutebolTimePage from '@/features/futebol/FutebolTimePage';

function mapPageToRoute(page: Page): string {
  switch (page) {
    case Page.FUTEBOL:
      return '/futebol';
    case Page.SEARCH:
      return '/search';
    case Page.LIVE:
      return '/canais';
    case Page.GENRES:
      return '/generos';
    case Page.HOME:
    case Page.MOVIES:
    case Page.SERIES:
    case Page.KIDS:
    case Page.MY_LIST:
    default:
      return '/';
  }
}

const FutebolTeamShellInner: React.FC = () => {
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
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/futebol');
    }
  });

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto flex flex-col items-center text-white">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center pointer-events-none bg-linear-to-b from-black/80 to-transparent pt-4 pb-12 px-12">
        <div className="w-full pointer-events-auto">
          <Navigation
            currentPage={Page.FUTEBOL}
            onNavigate={handleNavigate}
            profile={activeProfile}
            onProfileClick={goToSettings}
            onProfileMenuSelect={goToSettings}
          />
        </div>
      </header>

      <main className="w-full flex-1 flex flex-col items-center p-0">
        <FutebolTimePage />
      </main>
    </div>
  );
};

const FutebolTeamStandaloneRoute: React.FC = () => (
  <SpatialNavProvider>
    <FutebolTeamShellInner />
  </SpatialNavProvider>
);

export default FutebolTeamStandaloneRoute;
