/**
 * Anti-Scraping - Detecção de bots e scraping automatizado
 * Proteção contra extração automatizada de conteúdo
 */

import { logSecurityEvent } from './securityLogger';
import { logger } from './logger';

interface BehaviorMetrics {
  mouseMovements: number;
  clicks: number;
  keyPresses: number;
  scrolls: number;
  pageViews: number;
  timeOnPage: number;
  startTime: number;
}

let metrics: BehaviorMetrics = {
  mouseMovements: 0,
  clicks: 0,
  keyPresses: 0,
  scrolls: 0,
  pageViews: 0,
  timeOnPage: 0,
  startTime: Date.now(),
};

/**
 * Analisa comportamento e retorna score de confiança (0-100)
 * 100 = humano, 0 = bot
 */
export function calculateHumanScore(): number {
  const elapsed = (Date.now() - metrics.startTime) / 1000; // segundos
  let score = 50; // baseline

  // Movimentos de mouse (humanos movem muito)
  if (metrics.mouseMovements > 10) score += 15;
  else if (metrics.mouseMovements === 0) score -= 20;

  // Cliques (bots clicam muito rápido ou não clicam)
  if (metrics.clicks > 0 && metrics.clicks < 50) score += 10;
  else if (metrics.clicks > 100) score -= 15; // cliques excessivos

  // Tempo na página (bots são muito rápidos)
  if (elapsed > 5) score += 10;
  if (elapsed > 30) score += 10;

  // Scrolls (humanos scrollam)
  if (metrics.scrolls > 0) score += 10;

  // Teclas (humanos usam teclado)
  if (metrics.keyPresses > 0) score += 5;

  // Velocidade de navegação (bot navega muito rápido)
  const pagesPerSecond = metrics.pageViews / Math.max(elapsed, 1);
  if (pagesPerSecond > 2) score -= 20; // mais de 2 páginas/segundo = suspeito

  return Math.max(0, Math.min(100, score));
}

/**
 * Verifica se comportamento é suspeito
 */
export function isSuspiciousBehavior(): boolean {
  const score = calculateHumanScore();
  return score < 30;
}

/**
 * Inicializa monitoramento de comportamento
 */
export function initBehaviorTracking(): () => void {
  // DESABILITADO: Monitoramento passivo agressivo desativado para performance em TV Box
  logger.debug('[AntiScraping] Monitoramento de comportamento desativado.');

  return () => {
    // No-op
  };
}

/**
 * Honeypot: Link invisível que só bots clicam.
 * Retorna elemento e função de remoção (remove listener + DOM) para evitar memory leak.
 */
export function createHoneypot(): { element: HTMLAnchorElement; remove: () => void } {
  const honeypot = document.createElement('a');
  honeypot.href = '/admin/secret-page-do-not-access';
  honeypot.textContent = 'Admin Panel';
  honeypot.style.position = 'absolute';
  honeypot.style.left = '-9999px';
  honeypot.style.opacity = '0';
  honeypot.setAttribute('aria-hidden', 'true');
  honeypot.setAttribute('tabindex', '-1');

  const handleClick = (e: Event) => {
    e.preventDefault();
    logger.error('🚨 HONEYPOT TRIGGERED - Bot detectado!');
    logSecurityEvent({
      eventType: 'suspicious_activity',
      severity: 'high',
      details: {
        reason: 'Honeypot link clicked',
        userAgent: navigator.userAgent,
      },
    });

    // Sem alert() — em TV Box bloqueia a thread da WebView; apenas log + redirect.
    logger.warn('[AntiScraping] Honeypot acionado — redirecionando para /');
    window.location.href = '/';
  };

  honeypot.addEventListener('click', handleClick);
  document.body.appendChild(honeypot);

  return {
    element: honeypot,
    remove: () => {
      honeypot.removeEventListener('click', handleClick);
      if (honeypot.parentNode) {
        honeypot.parentNode.removeChild(honeypot);
      }
    },
  };
}

/**
 * Detecta user agents de bots conhecidos
 * Padrões removidos para evitar false-positives em Android WebView:
 * 'java', 'http', 'fetch' — são comuns em UAs legítimos de TV Boxes
 */
export function isBotUserAgent(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'curl',
    'wget',
    'python-',
    'headless',
    'phantom',
    'selenium',
    'puppeteer',
    'playwright',
  ];

  return botPatterns.some((pattern) => ua.includes(pattern));
}

/**
 * Detecta características de automação
 */
export function detectAutomation(): boolean {
  // Verificar se window.navigator.webdriver está definido (Selenium/Puppeteer)
  if (navigator.webdriver) return true;

  // Verificar se window.callPhantom existe (PhantomJS)
  if (window.callPhantom) return true;

  // Verificar se _phantom ou __nightmare existe
  if (window._phantom || window.__nightmare) return true;

  // Verificar se Chrome DevTools Protocol está ativo
  if (window.chrome?.runtime) {
    // Pode ser extensão legítima, não bloquear automaticamente
  }

  return false;
}

/**
 * Inicializa todas as proteções anti-scraping
 */
export function initAntiScraping(): () => void {
  // Apenas em produção
  if (import.meta.env.DEV) {
    return () => {};
  }

  // Verificar bot user agent
  if (isBotUserAgent()) {
    logSecurityEvent({
      eventType: 'suspicious_activity',
      severity: 'medium',
      details: {
        reason: 'Bot user agent',
        userAgent: navigator.userAgent,
      },
    });
  }

  // Verificar automação
  if (detectAutomation()) {
    logSecurityEvent({
      eventType: 'suspicious_activity',
      severity: 'high',
      details: {
        reason: 'Automation tools detected',
        webdriver: navigator.webdriver,
      },
    });
  }

  // Criar honeypot (com cleanup de listener)
  const { remove: removeHoneypot } = createHoneypot();

  // Iniciar rastreamento de comportamento
  const stopTracking = initBehaviorTracking();

  // Cleanup
  return () => {
    stopTracking();
    removeHoneypot();
  };
}

/**
 * Reseta métricas (útil para SPA ao mudar de página)
 */
export function resetMetrics(): void {
  metrics = {
    mouseMovements: 0,
    clicks: 0,
    keyPresses: 0,
    scrolls: 0,
    pageViews: 1,
    timeOnPage: 0,
    startTime: Date.now(),
  };
}
