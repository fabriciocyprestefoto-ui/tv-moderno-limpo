import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional section name for better debug messages */
  section?: string;
}

interface State {
  hasError: boolean;
}

/**
 * SectionErrorBoundary — lightweight boundary for isolated UI sections (rows, panels).
 * Unlike the full ErrorBoundary, it renders a minimal inline fallback so a single
 * broken MovieRow doesn't take down the entire Home screen.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(
        `[SectionErrorBoundary:${this.props.section ?? 'unknown'}]`,
        error.message,
        errorInfo.componentStack
      );
    }
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (dsn) {
      void import('@sentry/react').then(({ captureException }) => {
        captureException(error, {
          tags: { boundary: 'section', section: this.props.section ?? 'unknown' },
          extra: { componentStack: errorInfo.componentStack },
        });
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="w-full py-6 flex items-center justify-center text-white/30 text-sm"
          aria-hidden="true"
        >
          {/* Seção indisponível — não bloqueia o restante da tela */}
        </div>
      );
    }
    return this.props.children;
  }
}
