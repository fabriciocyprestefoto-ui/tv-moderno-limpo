/**
 * swRegister.ts — Registro do Service Worker
 * Registra o SW após o app montar para não competir com o carregamento inicial.
 * Fallback silencioso se SW não for suportado (WebView antigo).
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // Adiar registro para não competir com recursos críticos do app
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (import.meta.env.DEV) {
          console.log('[SW] Registrado com sucesso, scope:', reg.scope);
        }
        // Auto-update: checar nova versão a cada 30 min
        setInterval(() => reg.update(), 30 * 60 * 1000);
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[SW] Falha no registro:', err);
        }
      });
  };

  // Registrar após load da página (não bloqueia render)
  if (document.readyState === 'complete') {
    setTimeout(register, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(register, 1000));
  }
}
