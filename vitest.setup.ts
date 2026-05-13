/**
 * vitest.setup.ts — Setup global para testes com ambiente jsdom.
 * Importado automaticamente por todos os testes do projeto jsdom.
 */
import '@testing-library/jest-dom';

// ── IntersectionObserver — jsdom não implementa; mock minimalista para testes ──
if (typeof IntersectionObserver === 'undefined') {
  class IntersectionObserverMock {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });
}

// ── ResizeObserver — jsdom não implementa ────────────────────────────────────
if (typeof ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  });
}

// ── HTMLMediaElement.play / pause — jsdom lança NotImplementedError ───────────
// Sem o mock, qualquer chamada a video.play() retorna undefined em vez de Promise,
// quebrando código que faz `video.play().catch(...)`.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: () => Promise.resolve(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: () => {},
});

// Suprimir warnings de "act()" em testes de hooks assíncronos
// (são gerados pelo React em testes — não indicam bug real)
const originalError = console.error.bind(console);
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (msg.includes('act(') || msg.includes('ReactDOM.render')) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
