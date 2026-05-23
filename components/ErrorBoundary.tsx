import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_AUTO_RETRIES = 2;

/**
 * Error Boundary — captura erros de renderização e exibe fallback.
 * ERR-04 fix: retry automático, logging persistente, e mensagens mais úteis.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);

    try {
      window.dispatchEvent(
        new CustomEvent('redx:error-boundary', {
          detail: {
            message: error.message,
            retryCount: this.state.retryCount,
            ts: Date.now(),
          },
        })
      );
    } catch {
      /* noop */
    }

    console.error('[CRITICAL_ERROR_DUMP]', error.message, '\\nSTACK:', error.stack);

    // Import dinâmico evita que Sentry (import estático) cause recursão quando offline
    void import('@sentry/react')
      .then(({ captureException }) => {
        captureException(error, {
          extra: {
            componentStack: errorInfo.componentStack?.substring(0, 1000),
            retryCount: this.state.retryCount,
          },
        });
      })
      .catch(() => {
        /* Sentry indisponível — sem rede ou bloqueado */
      });

    // Persistir erro para debugging — sanitizar antes de gravar no sessionStorage
    // para não vazar JWTs, emails ou tokens que possam aparecer em stack traces
    try {
      const sanitize = (s: string) =>
        s
          .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT]')
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
          .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [TOKEN]');
      const errorLog = {
        message: sanitize(error.message.substring(0, 200)),
        stack: sanitize(error.stack?.substring(0, 500) ?? ''),
        component: sanitize(errorInfo.componentStack?.substring(0, 300) ?? ''),
        timestamp: new Date().toISOString(),
      };
      const existing = JSON.parse(sessionStorage.getItem('redx-error-log') || '[]');
      existing.push(errorLog);
      // Manter apenas os 5 últimos erros
      if (existing.length > 5) existing.shift();
      sessionStorage.setItem('redx-error-log', JSON.stringify(existing));
    } catch {
      /* noop */
    }

    // Auto-retry para erros transientes (chunk loading, network)
    const attempt = this.state.retryCount;
    if (attempt < MAX_AUTO_RETRIES) {
      const isTransient = /chunk|loading|network|fetch|dynamically imported/i.test(error.message);
      if (isTransient) {
        const delayMs = 1000 * (attempt + 1);
        setTimeout(() => {
          this.setState((prev) => ({
            hasError: false,
            error: null,
            retryCount: prev.retryCount + 1,
          }));
        }, delayMs);
        return;
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, retryCount: 0 });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error)
          : this.props.fallback;
      }
      const errMsg = this.state.error?.message || '';
      const isConfigError = /Supabase|variáveis de ambiente|VITE_SUPABASE/i.test(errMsg);
      const isCapacitor =
        typeof window.Capacitor !== 'undefined' || /capacitor:\/\//.test(window.location.origin);
      const isChunkError = /chunk|loading|dynamically imported/i.test(errMsg);
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="redx-app-surface fixed inset-0 z-[9999] flex flex-col items-center justify-center p-8 text-white"
        >
          <img src="/logored.png" alt="Redflix" className="h-12 w-auto mb-6 opacity-80" />
          <h2 className="text-xl font-bold mb-2">Algo deu errado</h2>
          <p className="text-white/60 text-sm text-center max-w-md mb-4">
            {isConfigError
              ? 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env e faça o build novamente.'
              : isChunkError
                ? 'Erro ao carregar módulo. Verifique sua conexão e tente novamente.'
                : isCapacitor
                  ? 'Verifique sua conexão com a internet e tente novamente. O app funciona em TV Box e celular Android.'
                  : 'Ocorreu um erro inesperado. Tente recarregar a página.'}
          </p>
          {errMsg && !isConfigError && (
            <p className="text-white/50 text-xs font-mono max-w-lg mb-4 px-4 py-2 bg-black/30 rounded break-all text-center">
              {errMsg}
            </p>
          )}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={this.handleRetry}
              className="px-6 py-3 rounded-xl font-bold bg-[#A855F7] hover:bg-[#9333ea] transition-colors"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.assign(`${window.location.origin}/`)}
              className="px-6 py-3 rounded-xl font-bold border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
            >
              Ir para início
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl font-bold border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
