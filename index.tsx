import './index.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTVBoxMode, syncTvBoxClassWithHtml } from './utils/tvBoxDetector';
import { initLiteMode, updateLiteModeAsync, watchAndUpdateLiteMode } from './utils/liteMode';
import { purgeDeadSourceCaches } from './utils/sourceSanitizer';

void purgeDeadSourceCaches();

function installLegacyWebViewPolyfills(): void {
  if (typeof window === 'undefined') return;

  const win = window as typeof window & {
    IntersectionObserver?: typeof IntersectionObserver;
    ResizeObserver?: typeof ResizeObserver;
    matchMedia?: typeof window.matchMedia;
  };

  if (typeof win.matchMedia !== 'function') {
    win.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  if (typeof win.IntersectionObserver !== 'function') {
    class FallbackIntersectionObserver {
      private callback: IntersectionObserverCallback;

      readonly root: Element | Document | null = null;
      readonly rootMargin = '0px';
      readonly thresholds: ReadonlyArray<number> = [0];

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element): void {
        window.setTimeout(() => {
          const rect = target.getBoundingClientRect();
          this.callback(
            [
              {
                boundingClientRect: rect,
                intersectionRatio: 1,
                intersectionRect: rect,
                isIntersecting: true,
                rootBounds: null,
                target,
                time: performance.now(),
              },
            ],
            this as unknown as IntersectionObserver
          );
        }, 0);
      }

      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    win.IntersectionObserver =
      FallbackIntersectionObserver as unknown as typeof IntersectionObserver;
  }

  if (typeof win.ResizeObserver !== 'function') {
    class FallbackResizeObserver {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element): void {
        window.setTimeout(() => {
          const rect = target.getBoundingClientRect();
          this.callback(
            [
              {
                target,
                contentRect: rect,
                borderBoxSize: [],
                contentBoxSize: [],
                devicePixelContentBoxSize: [],
              },
            ],
            this as unknown as ResizeObserver
          );
        }, 0);
      }

      unobserve(): void {}
      disconnect(): void {}
    }

    win.ResizeObserver = FallbackResizeObserver as unknown as typeof ResizeObserver;
  }

  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      writable: true,
      value(index: number) {
        const normalized = Math.trunc(index) || 0;
        const finalIndex = normalized < 0 ? this.length + normalized : normalized;
        return this[finalIndex];
      },
    });
  }

  if (typeof window.structuredClone !== 'function') {
    window.structuredClone = (<T,>(value: T): T =>
      JSON.parse(JSON.stringify(value))) as typeof structuredClone;
  }
}

installLegacyWebViewPolyfills();

// ── Sentry: monitoramento de erros em produção ───────────────────────────────
// Configure VITE_SENTRY_DSN no .env para ativar. Sem DSN = sem overhead.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

// Aviso visível no console de produção se o DSN não estiver configurado.
// Erros de usuário real não serão capturados — a equipe não será notificada.
if (import.meta.env.PROD && !sentryDsn) {
  console.warn(
    '[Sentry] VITE_SENTRY_DSN não configurado — erros em produção não serão capturados automaticamente.\n' +
      '         Adicione VITE_SENTRY_DSN=https://... ao .env e reconstrua o bundle.'
  );
}

if (sentryDsn) {
  import('@sentry/react').then(({ init, browserTracingIntegration }) => {
    const version = String(import.meta.env.VITE_APP_VERSION || '').trim();
    const dist = String(import.meta.env.VITE_SENTRY_DIST || '').trim();
    init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      release: version ? `redflix@${version}` : undefined,
      dist: dist || undefined,
      integrations: [browserTracingIntegration()],
      tracesSampleRate: 0.1,
    });
  });
}

// ── Web Vitals: medir LCP/CLS/INP/FCP/TTFB de usuários reais ────────────────
// Reporta ao Sentry quando DSN configurado; caso contrário, apenas console.info.
if (import.meta.env.PROD) {
  import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    const report = (metric: { name: string; value: number; rating: string }) => {
      // Sempre logar no console (ADB/logcat) — mesmo com Sentry, p/ medição local na TV.
      console.info('[Vitals]', metric.name, Math.round(metric.value), metric.rating);
      if (sentryDsn) {
        void import('@sentry/react').then(({ captureEvent }) => {
          captureEvent({
            message: `Web Vital: ${metric.name}`,
            level: metric.rating === 'poor' ? 'warning' : 'info',
            extra: { value: Math.round(metric.value), rating: metric.rating },
          });
        });
      }
    };
    onCLS(report);
    onINP(report);
    onLCP(report);
    onFCP(report);
    onTTFB(report);
  });
}

try {
  initTVBoxMode();
} catch (_) {
  // Não bloquear boot se detecção TV falhar
}

// Sync: decide lite mode baseado em device + Network Information API.
// Roda antes do React montar para evitar flash de conteúdo pesado.
try {
  initLiteMode();
} catch (_) {
  // Não bloquear boot se detecção lite mode falhar
}

// Async: probe de rede real (HEAD request) depois que o browser estabilizou.
// Atualiza lite mode se a rede for mais lenta do que o sync detectou.
window.addEventListener('DOMContentLoaded', () => {
  void updateLiteModeAsync();
  // Monitora degradação de rede em tempo real (ex: usuário passa de Wi-Fi para 2g)
  watchAndUpdateLiteMode();
}, { once: true });

// ── Captura erros de promises não tratadas (network, fetch, timers) ──
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason ?? 'Promise rejected');
  if (import.meta.env.DEV) {
    console.error('[UnhandledPromiseRejection]', msg);
  }
  // Limite a 1 log por 20s para evitar spam
  const now = Date.now();
  if (_lastUnhandledLog == null || now - _lastUnhandledLog > 20000) {
    _lastUnhandledLog = now;
    void import('@sentry/react')
      .then(({ captureEvent }) => {
        captureEvent({ message: `[UnhandledRejection] ${msg}`, level: 'warning' });
      })
      .catch(() => {
        /* Sentry unavailable */
      });
  }
});
let _lastUnhandledLog: number | null = null;

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncTvBoxClassWithHtml);
  } else {
    syncTvBoxClassWithHtml();
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
// Streams e players HTML5 sofrem com render/effect duplo do StrictMode no desktop.
root.render(<App />);
