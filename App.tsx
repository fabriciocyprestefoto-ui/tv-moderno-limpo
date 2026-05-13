import React, { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { useLiteMode } from './hooks/useLiteMode';
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useRemoteNavigation } from './hooks/useRemoteNavigation';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { enforceSecurityPolicy, startSecurityMonitoring } from './utils/deviceSecurity';
import { initAntiReverse } from './utils/antiReverse';
import { initAntiScraping } from './utils/antiScraping';
import { stopSecurityPeriodicCheck } from './utils/securityGate';
import { resetChunkRecoveryFlag } from './utils/chunkRecovery';
import { lazyWithChunkRetry } from './utils/lazyWithChunkRetry';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initGlobalVideoDiagnostics } from './utils/videoDiagnostics';
import SubscriptionBanner from './components/SubscriptionBanner';
import { PageTransition } from './components/PageTransition';
import { ExitConfirmModal } from './components/ExitConfirmModal';
import AppBootScreen from './components/AppBootScreen';
import LiveTVPreloader from './components/LiveTVPreloader';
const AdminRoute = lazyWithChunkRetry(() => import('./components/AdminRoute'), 'AdminRoute');
const NotFoundPage = lazyWithChunkRetry(() => import('./pages/NotFoundPage'), 'NotFoundPage');

// Lazy loaded — bundle principal mínimo
const LiveTV = lazyWithChunkRetry(() => import('./pages/LiveTV'), 'LiveTV');
const LegacyApp = lazyWithChunkRetry(() => import('./LegacyApp'), 'LegacyApp');
const FutebolStandaloneRoute = lazyWithChunkRetry(() => import('./pages/Futebol'), 'Futebol');
const FutebolTeamStandaloneRoute = lazyWithChunkRetry(() => import('./pages/FutebolTime'), 'FutebolTime');
const DebugPage = lazyWithChunkRetry(() => import('./pages/DebugPage'), 'DebugPage');
const enableHlsTestRoute = import.meta.env.VITE_TV_BUILD !== '1';
const HLSTestPlayer = enableHlsTestRoute
  ? lazyWithChunkRetry(() => import('./pages/HLSTestPlayer'), 'HLSTestPlayer')
  : null;
const AdultoPage = lazyWithChunkRetry(() => import('./pages/AdultoPage'), 'AdultoPage');

const isElectronDesktop =
  typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '');
const RouterComponent = isElectronDesktop ? HashRouter : BrowserRouter;

/** Cypress: `sessionStorage.setItem('redx-e2e-throw-root','1')` antes do load testa o ErrorBoundary global. */
const E2EInjectedRootError: React.FC = () => {
  if (
    typeof sessionStorage !== 'undefined' &&
    sessionStorage.getItem('redx-e2e-throw-root') === '1'
  ) {
    sessionStorage.removeItem('redx-e2e-throw-root');
    throw new Error('E2E: forced root render error');
  }
  return null;
};

/**
 * GlobalRemoteHandler: delega toda lógica D-pad ao hook canônico useRemoteNavigation.
 * Evita duplicação de handlers de teclado e listeners Capacitor backButton.
 */
const GlobalRemoteHandler: React.FC = () => {
  useRemoteNavigation();
  return null;
};

/** LiveTV já registra `redx-native-back` internamente via onBack — evitar listener duplicado */
const LiveTVWithChannelParam: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const channel = searchParams.get('channel') || null;
  const goHome = React.useCallback(() => {
    if (location.pathname !== '/') navigate('/');
  }, [location.pathname, navigate]);

  return <LiveTV onBack={goHome} initialChannel={channel ?? undefined} />;
};

// Admin Pages — lazy loaded
const AdminDashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const AdminSubscribers = React.lazy(() => import('./pages/admin/Subscribers'));
const AdminFinance = React.lazy(() => import('./pages/admin/Finance'));
const AdminIPTV = React.lazy(() => import('./pages/admin/IPTV'));
const AdminVOD = React.lazy(() => import('./pages/admin/VOD'));
const AdminResellers = React.lazy(() => import('./pages/admin/Resellers'));
const AdminSecurity = React.lazy(() => import('./pages/admin/Security'));
const AdminSettings = React.lazy(() => import('./pages/admin/Settings'));
const AdminCatalogControl = React.lazy(() => import('./pages/admin/CatalogControl'));
const AdminIngestion = React.lazy(() => import('./pages/admin/Ingestion'));
const StreamTester = React.lazy(() => import('./pages/admin/StreamTester'));
const AdminAccessCodes = React.lazy(() => import('./pages/admin/AccessCodes'));

import { LazyFallback } from './components/LazyFallback';

const App: React.FC = () => {
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const isLite = useLiteMode();

  useEffect(() => {
    initGlobalVideoDiagnostics();
    // Hidrata desbloqueio PIN adulto de SharedPreferences (Capacitor) para evitar
    // re-pedir PIN quando o WebView perde localStorage entre sessões.
    void import('./pages/livetv/AdultPinModal').then((m) => m.hydrateAdultUnlock?.());
  }, []);

  useEffect(() => {
    if (bootDone && typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-redx-app', 'ready');
    }
  }, [bootDone]);

  useEffect(() => {
    if (!bootDone) return;
    // Evita fallback visual escuro no primeiro acesso de playback.
    void import('./LegacyApp');
    void import('./pages/LiveTV');
  }, [bootDone]);

  // Bloqueia teclas enquanto boot screen estiver ativo — evita Back/D-pad
  // navegando para rotas ou disparando CapApp.exitApp() antes do app estar pronto.
  useEffect(() => {
    if (bootDone) return;
    const block = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', block, { capture: true });
    return () => window.removeEventListener('keydown', block, { capture: true });
  }, [bootDone]);

  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const initSecurity = async () => {
      try {
        await enforceSecurityPolicy();
        if (cancelled) return;

        const arCleanup = initAntiReverse();
        if (typeof arCleanup === 'function') cleanups.push(arCleanup);

        const asCleanup = initAntiScraping();
        if (typeof asCleanup === 'function') cleanups.push(asCleanup);

        const smCleanup = startSecurityMonitoring(30000);
        if (typeof smCleanup === 'function') cleanups.push(smCleanup);
      } catch (error) {
        console.error('[App] Erro ao inicializar segurança:', error);
      }
    };

    initSecurity();

    // Modal de saída disparado pelo GlobalRemoteHandler via 'redx-exit-request'
    // (evita dois listeners Capacitor backButton simultâneos — GlobalRemoteHandler já registra o seu)
    const onExitRequest = () => setExitConfirmVisible(true);
    window.addEventListener('redx-exit-request', onExitRequest);

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn?.());
      stopSecurityPeriodicCheck();
      window.removeEventListener('redx-exit-request', onExitRequest);
    };
  }, []);

  // A flag de recuperação de chunk é removida só após o boot completar e a UI estabilizar.
  useEffect(() => {
    if (!bootDone) return;
    const timer = window.setTimeout(() => {
      resetChunkRecoveryFlag();
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [bootDone]);

  return (
    // MotionConfig desliga todas as animações framer-motion em lite mode (device antigo / rede lenta)
    <MotionConfig reducedMotion={isLite ? 'always' : 'never'}>
    <ErrorBoundary
      onError={(err, info) => {
        if (import.meta.env.DEV) {
          console.error('[App] Erro global:', err?.message, info?.componentStack);
        }
        const dsn = import.meta.env.VITE_SENTRY_DSN;
        if (dsn && err) {
          void import('@sentry/react').then(({ captureException }) => {
            captureException(err, { extra: { componentStack: info?.componentStack } });
          });
        }
      }}
      fallback={(error) => (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white gap-4 px-6">
          <p className="text-lg font-bold">Erro inesperado</p>
          {String(import.meta.env.VITE_BUILD_CHANNEL || '').trim() !== 'production' &&
            error?.message && (
              <p className="max-w-2xl rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-center text-xs font-mono text-white/70">
                {error.message}
              </p>
            )}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.assign(`${window.location.origin}/`)}
              className="px-6 py-3 rounded-xl border border-white/25 bg-white/10 font-bold hover:bg-white/15"
            >
              Ir para início
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-violet-600 font-bold hover:bg-violet-500"
            >
              Recarregar
            </button>
          </div>
        </div>
      )}
    >
      {!bootDone && <AppBootScreen onComplete={() => setBootDone(true)} />}
      <ConfigProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterComponent future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              {(import.meta.env.DEV || String(import.meta.env.VITE_E2E || '').trim() === '1') && (
                <E2EInjectedRootError />
              )}
              <SubscriptionBanner />
              <GlobalRemoteHandler />
              <LiveTVPreloader />
              <PageTransition>
                <Routes>
                  <Route
                    path="/admin"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminDashboard />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/subscribers"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminSubscribers />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/finance"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminFinance />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/iptv"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminIPTV />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/vod"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminVOD />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/resellers"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminResellers />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/security"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminSecurity />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/settings"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminSettings />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/catalog"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminCatalogControl />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/ingestion"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminIngestion />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/stream-test"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <StreamTester />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/admin/access-codes"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <AdminAccessCodes />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/search"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/canais"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LiveTVWithChannelParam />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/adulto"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdultoPage />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/futebol"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <FutebolStandaloneRoute />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/futebol/time/:teamId"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <FutebolTeamStandaloneRoute />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/time/:id"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <FutebolTeamStandaloneRoute />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/debug"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <AdminRoute>
                          <DebugPage />
                        </AdminRoute>
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/hls-test"
                    element={
                      enableHlsTestRoute && HLSTestPlayer ? (
                        <React.Suspense fallback={<LazyFallback />}>
                          <HLSTestPlayer onClose={() => window.history.back()} />
                        </React.Suspense>
                      ) : (
                        <div className="min-h-screen bg-black text-white flex items-center justify-center">
                          Rota indisponivel no APK TV
                        </div>
                      )
                    }
                  />
                  <Route
                    path="/"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/filmes"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/series"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/generos"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/kids"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/lista"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/busca"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="/watch/:watchId"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <LegacyApp />
                      </React.Suspense>
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <React.Suspense fallback={<LazyFallback />}>
                        <NotFoundPage />
                      </React.Suspense>
                    }
                  />
                </Routes>
              </PageTransition>
            </RouterComponent>
            <ExitConfirmModal
              visible={exitConfirmVisible}
              onConfirm={() => {
                setExitConfirmVisible(false);
                CapApp.exitApp().catch(() => {
                  window.close();
                });
              }}
              onCancel={() => setExitConfirmVisible(false)}
            />
          </ToastProvider>
        </AuthProvider>
      </ConfigProvider>
    </ErrorBoundary>
    </MotionConfig>
  );
};

export default App;
