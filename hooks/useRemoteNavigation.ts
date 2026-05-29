/**
 * hooks/useRemoteNavigation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook que encapsula toda a lógica de navegação por controle remoto / D-Pad.
 *
 * Extraído do GlobalRemoteHandler em App.tsx para:
 *   1. Separar responsabilidades (App.tsx apenas compõe, não lida com input)
 *   2. Facilitar testes unitários isolados
 *   3. Tornar a lógica reutilizável em outros contextos
 *
 * Deve ser chamado DENTRO do contexto de Router (usa useNavigate/useLocation).
 *
 * Hierarquia de prioridade dos guards (não alterar a ordem):
 *   useSpatialNavigation > Player > LiveTV > Sidebar > Search > GlobalRemote
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import {
  resetNavDebounce,
  shouldProcessNavEvent,
  shouldProcessVerticalNavEvent,
} from '../utils/dpadDebounce';
import { clearFocusRetry } from './useSpatialNavigation';
import { normalizeRemoteKey } from './useRemoteControl';
import { addPageTransitionStyles } from '../utils/pageTransitionStyles';
import { getSignal } from '../utils/appSignals';
import { isTVBox } from '../utils/tvBoxDetector';

type RemoteDir = 'up' | 'down' | 'left' | 'right';

// ── Restauração de posição por rota ───────────────────────────────────────────
// Guarda scroll + foco (linha/coluna) das páginas de catálogo para que voltar de
// Detalhes/Player caia na mesma posição. Module-level: sobrevive ao remount da rota.
interface NavPosition {
  scrollY: number;
  row: string | null;
  col: string | null;
}
const _navPositions = new Map<string, NavPosition>();
const NAV_RESTORABLE_PATHS = new Set([
  '/',
  '/filmes',
  '/series',
  '/kids',
  '/generos',
  '/lista',
  '/busca',
  '/search',
]);
function normalizeNavPath(p: string): string {
  return p.replace(/\/$/, '') || '/';
}

// ── Cache de rects por tick de navegação ─────────────────────────────────────
// getBoundingClientRect() força layout reflow — com 80+ cards na Home, chamar
// uma vez por elemento por keypress gera 80 reflows. O cache de 150ms cobre
// o repeat-rate típico de controles TV (120-150ms) sem dados stale visíveis.
let _rectCache: Map<Element, DOMRect> | null = null;
let _rectCacheTs = 0;
const RECT_CACHE_TTL = 150;

function getCachedRect(el: Element): DOMRect {
  const now = Date.now();
  if (!_rectCache || now - _rectCacheTs > RECT_CACHE_TTL) {
    _rectCache = new Map();
    _rectCacheTs = now;
  }
  let r = _rectCache.get(el);
  if (!r) {
    r = el.getBoundingClientRect();
    _rectCache.set(el, r);
  }
  return r;
}

// ── Cache da LISTA de focáveis ───────────────────────────────────────────────
// querySelectorAll(doc inteiro) a cada tecla é O(tamanho do DOM). A lista só muda
// quando o DOM monta/desmonta (virtualização, troca de rota), não a cada navegação.
// Invalidamos via MutationObserver (instalado no hook); rects continuam medidos por
// keypress (posições mudam com scroll, membros da lista não).
const FOCUSABLE_SELECTOR =
  '[data-nav-item], [data-nav-livetv-category], [data-player-control], [tabindex="0"]';
let _focusableCache: HTMLElement[] | null = null;

function getFocusables(): HTMLElement[] {
  if (_focusableCache) return _focusableCache;
  _focusableCache = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return _focusableCache;
}

function invalidateFocusables(): void {
  _focusableCache = null;
}

/** Verifica se um elemento pode receber foco — rect via cache para evitar reflow múltiplo. */
function isElementFocusable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.tabIndex < 0) return false;
  // Checar dimensões primeiro (barato via cache) antes de getComputedStyle (caro)
  const rect = getCachedRect(el);
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

/** Encontra o elemento focável mais próximo na direção indicada usando geometria 2D. */
function getDirectionalTarget(current: HTMLElement, direction: RemoteDir): HTMLElement | null {
  // Invalidar cache ao começar nova busca — garante dados frescos por keypress
  _rectCache = null;

  const currentRect = getCachedRect(current);
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  // Pré-filtrar por quadrante antes de chamar isElementFocusable (evita getComputedStyle desnecessário).
  // Lista cacheada (invalidada por MutationObserver) — evita querySelectorAll por keypress.
  const all = getFocusables();

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const el of all) {
    if (el === current) continue;
    const r = getCachedRect(el);
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;

    // Filtro de quadrante: descartar elementos na direção errada antes de qualquer outra checagem
    let valid = false;
    if (direction === 'up') valid = dy < -2;
    else if (direction === 'down') valid = dy > 2;
    else if (direction === 'left') valid = dx < -2;
    else valid = dx > 2;
    if (!valid) continue;

    // Só agora verificar focabilidade (getComputedStyle apenas em candidatos válidos)
    if (!isElementFocusable(el)) continue;

    let primary = 0;
    let lateral = 0;
    if (direction === 'up' || direction === 'down') {
      primary = Math.abs(dy);
      lateral = Math.abs(dx);
    } else {
      primary = Math.abs(dx);
      lateral = Math.abs(dy);
    }

    // Score: prioriza eixo principal, penaliza lateral
    const score = primary + lateral * 2.4;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

/** Encontra o primeiro elemento focável disponível na página como fallback. */
function findFallbackFocusable(): HTMLElement | null {
  const selectors = [
    '[data-nav-item]',
    '[data-nav-livetv-category]',
    '[data-player-control]',
    '[tabindex="0"]',
    'button',
  ];
  for (const sel of selectors) {
    const list = Array.from(document.querySelectorAll<HTMLElement>(sel));
    const found = list.find((el) => {
      if (!el || typeof el.focus !== 'function') return false;
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        el.getBoundingClientRect().width > 0
      );
    });
    if (found) return found;
  }
  return null;
}

/**
 * Scroll suave após mover foco.
 * Só rola a janela principal se o elemento está fora da zona segura do viewport.
 * Preserva scroll horizontal de rows (não interfere com overflow-x containers).
 */
function smoothScrollToFocused(el: HTMLElement, dir: RemoteDir): void {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const MARGIN = 80; // px de margem segura no topo/bottom
  const behavior: ScrollBehavior = isTVBox() ? 'auto' : 'smooth';

  if (dir === 'down' && rect.bottom > vh - MARGIN) {
    window.scrollBy({ top: rect.bottom - (vh - MARGIN), behavior });
  } else if (dir === 'up' && rect.top < MARGIN) {
    window.scrollBy({ top: rect.top - MARGIN, behavior });
  }
  // left/right: o scroll horizontal da row é gerido pelo próprio container
}

/**
 * Hook principal de navegação remota.
 * Gerencia: D-Pad, Enter, Back — com prioridade correta para cada contexto.
 */
export function useRemoteNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressMs = useRef(0);

  /** Verifica se useSpatialNavigation está ativo na página atual. */
  const isSpatialNavActive = () => Boolean(window.__spatialNavEnabled);

  const goBackInsideApp = useCallback(() => {
    const now = Date.now();
    // Debounce 450ms: evita duplo disparo por pressão física longa
    if (now - lastBackPressMs.current < 450) return;
    lastBackPressMs.current = now;

    // Emitir evento customizado para que handlers locais (Player, LiveTV, modais)
    // possam interceptar antes de navegar para a Home
    const evt = new CustomEvent('redx-native-back', { cancelable: true });
    const wasHandled = !window.dispatchEvent(evt);
    if (wasHandled) return;

    // Nunca usar navigate(-1) em WebView/TV: pode empilhar saída do app
    if (location.pathname !== '/') {
      navigate('/');
    } else {
      // Já na raiz — solicitar confirmação de saída ao App container
      window.dispatchEvent(new CustomEvent('redx-exit-request'));
    }
  }, [location.pathname, navigate]);

  // ── Foco + restauração de posição ao mudar de rota ────────────────────────
  // Páginas de catálogo (grids/rows) guardam scroll+foco ao sair e restauram ao
  // voltar (ex.: Home → Detalhes → Back cai na mesma linha/posição, estilo Netflix).
  // Demais rotas mantêm o comportamento antigo: focar o 1º item.
  useEffect(() => {
    if (isSpatialNavActive()) return;

    const path = normalizeNavPath(location.pathname);
    const saved = NAV_RESTORABLE_PATHS.has(path) ? _navPositions.get(path) : undefined;

    const selectors =
      location.pathname === '/canais'
        ? ['#chan-0', '[id^="chan-"]', '[data-nav-livetv-category]', '[tabindex="0"]']
        : ['[data-nav-item]', '[tabindex="0"]'];

    // Tenta restaurar o elemento salvo (linha+coluna). Reaplica o scrollY salvo.
    const tryRestore = (): boolean => {
      if (!saved || (!saved.row && !saved.col)) return false;
      let target: HTMLElement | null = null;
      if (saved.row != null && saved.col != null) {
        target = document.querySelector<HTMLElement>(
          `[data-nav-row="${saved.row}"] [data-nav-col="${saved.col}"]`
        );
      }
      if (!target && saved.col != null) {
        target = document.querySelector<HTMLElement>(`[data-nav-col="${saved.col}"]`);
      }
      if (target && target.getBoundingClientRect().width > 0) {
        target.focus({ preventScroll: true });
        if (typeof saved.scrollY === 'number') window.scrollTo(0, saved.scrollY);
        return true;
      }
      return false;
    };

    const tryFocus = (): boolean => {
      if (tryRestore()) return true;
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && typeof el.focus === 'function' && el.getBoundingClientRect().width > 0) {
          el.focus({ preventScroll: true });
          return true;
        }
      }
      return false;
    };

    // Tenta imediatamente (rota já renderizada) ou aguarda via MutationObserver
    const focusedNow = tryFocus();

    const observer = focusedNow
      ? null
      : new MutationObserver(() => {
          if (tryFocus()) observer?.disconnect();
        });
    observer?.observe(document.body, { childList: true, subtree: true });

    // Retentativas intermediárias para TV Boxes lentos (Android 7/8 WebView demora 2-4s).
    // Reaplicam o scrollY salvo conforme o conteúdo cresce (rows virtualizadas montam tarde).
    const reapply = () => {
      if (saved && typeof saved.scrollY === 'number') window.scrollTo(0, saved.scrollY);
    };
    const retry300 = window.setTimeout(() => {
      if (!focusedNow) tryFocus();
      reapply();
    }, 300);
    const retry800 = window.setTimeout(() => {
      if (!focusedNow) tryFocus();
      reapply();
    }, 800);
    // Fallback de segurança: desconecta após 2.5s mesmo sem encontrar elemento
    const fallback = window.setTimeout(() => observer?.disconnect(), 2500);

    return () => {
      observer?.disconnect();
      window.clearTimeout(retry300);
      window.clearTimeout(retry800);
      window.clearTimeout(fallback);
      // Salva posição da rota que está sendo deixada (apenas páginas de catálogo).
      if (NAV_RESTORABLE_PATHS.has(path)) {
        const active = document.activeElement as HTMLElement | null;
        const card = active?.closest('[data-nav-col]') as HTMLElement | null;
        const rowEl = active?.closest('[data-nav-row]') as HTMLElement | null;
        _navPositions.set(path, {
          scrollY: window.scrollY,
          row: rowEl?.getAttribute('data-nav-row') ?? null,
          col: card?.getAttribute('data-nav-col') ?? null,
        });
      }
    };
  }, [location.pathname]);

  // ── Limpar atributos de página ao sair do Player/LiveTV ───────────────────
  useEffect(() => {
    addPageTransitionStyles();
    if (
      location.pathname === '/canais' ||
      location.pathname.startsWith('/player') ||
      /^\/watch\//.test(location.pathname)
    )
      return;
    const html = document.documentElement;
    const currentPageAttr = html.getAttribute('data-page');
    const playerActive = getSignal('playerActive');
    const liveTvActive = getSignal('livetvActive');
    if (
      (currentPageAttr === 'player' || currentPageAttr === 'livetv') &&
      !playerActive &&
      !liveTvActive
    ) {
      html.removeAttribute('data-page');
    }
  }, [location.pathname]);

  // ── Reset de debounce ao mudar de rota ────────────────────────────────────
  useEffect(() => {
    resetNavDebounce();
    clearFocusRetry();
  }, [location.pathname]);

  // ── Invalidação do cache de focáveis ──────────────────────────────────────
  // A lista de elementos navegáveis só muda quando o DOM monta/desmonta (cards
  // virtualizados entram/saem, troca de rota). Um MutationObserver marca o cache
  // sujo; rects seguem medidos por keypress. rAF coalesce rajadas de mutação.
  useEffect(() => {
    invalidateFocusables();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      invalidateFocusables();
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(flush);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      invalidateFocusables();
    };
  }, [location.pathname]);

  // ── Handler principal de teclado / D-Pad ─────────────────────────────────
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const key = normalizeRemoteKey(event);
      const isArrow =
        key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
      const isEnter = key === 'Enter';
      const isBack = key === 'Escape' || key === 'Backspace';

      if (!isArrow && !isEnter && !isBack) return;
      const target = event.target as HTMLElement | null;

      // ── Guards de prioridade — NÃO alterar a ordem ──────────────────────
      // 0. Modal trap: foco preso em modal — não interferir com navegação global
      if ((window.__modalTrapDepth ?? 0) > 0 || getSignal('modalKeyTrap')) return;
      // 1. Spatial navigation ativa → useSpatialNavigation gerencia tudo
      if (isSpatialNavActive()) return;
      // 1.5. Evento originado no sidebar → o Sidebar gerencia as setas.
      if (target?.closest?.('[data-nav-sidebar]')) return;
      // 2. Sidebar em foco → não interferir
      if (window.__sidebarFocused) return;
      // 3. Player ativo → apenas Back passa (Player gerencia suas próprias setas)
      if (getSignal('playerActive') && !isBack) return;
      // 4. LiveTV ativa → LiveTV trata todas as teclas (setas, enter e back)
      //    incluindo Back: fecha o guia de canais antes de sair, via handleKeyDown
      if (getSignal('livetvActive')) return;
      // 5. Search ativo → não interceptar teclado virtual
      if (window.__searchActive) return;
      if (window.__profilesActive && !isBack) return;
      if (window.__whoIsWatchingActive && !isBack) return;

      // Inputs de texto: ignorar setas/enter (exceto Back)
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTextInput && !isBack) return;

      // Back: disparar navegação unificada
      if (isBack) {
        if (getSignal('playerActive')) return; // Player tem seu próprio listener
        event.preventDefault();
        event.stopPropagation();
        goBackInsideApp();
        return;
      }

      // Sem elemento ativo: focar fallback
      const active = document.activeElement as HTMLElement | null;
      const activeIsUsable =
        active && active !== document.body && typeof active.focus === 'function';
      if (!activeIsUsable) {
        const fallback = findFallbackFocusable();
        if (fallback) {
          event.preventDefault();
          fallback.focus({ preventScroll: true });
        }
        return;
      }

      // Enter: clicar no elemento ativo
      if (isEnter) {
        event.preventDefault();
        event.stopPropagation();
        active.click?.();
        return;
      }

      // Setas: mover foco direcionalmente
      if (isArrow) {
        // Debounce por eixo — evita disparos múltiplos por keyrepeat do controle (~30ms)
        const isVertical = key === 'ArrowUp' || key === 'ArrowDown';
        if (isVertical ? !shouldProcessVerticalNavEvent() : !shouldProcessNavEvent()) return;

        const dir =
          key === 'ArrowUp'
            ? 'up'
            : key === 'ArrowDown'
              ? 'down'
              : key === 'ArrowLeft'
                ? 'left'
                : ('right' as RemoteDir);

        // Netflix behavior: ArrowLeft navega dentro da row primeiro;
        // só abre sidebar quando já está na borda esquerda (sem destino à esquerda)
        if (key === 'ArrowLeft' && !active?.closest('[data-nav-sidebar]')) {
          const leftTarget = getDirectionalTarget(active, 'left');
          if (leftTarget) {
            event.preventDefault();
            leftTarget.focus({ preventScroll: true });
            return;
          }
          // Na borda esquerda: focar sidebar
          const sidebar = document.querySelector('[data-nav-sidebar]');
          const firstSidebarItem = sidebar?.querySelector('[data-nav-item]') as HTMLElement | null;
          if (firstSidebarItem) {
            event.preventDefault();
            event.stopPropagation();
            firstSidebarItem.focus({ preventScroll: true });
          }
          return;
        }

        const directionalTarget = getDirectionalTarget(active, dir);
        if (directionalTarget) {
          event.preventDefault();
          directionalTarget.focus({ preventScroll: true });
          // Scroll suave: só rola se o elemento está fora do viewport visível
          smoothScrollToFocused(directionalTarget, dir);
        }
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [goBackInsideApp]);

  // ── Botão BACK físico do Android (Capacitor) ──────────────────────────────
  useEffect(() => {
    const backHandler = CapApp.addListener('backButton', () => {
      goBackInsideApp();
    });
    return () => {
      backHandler.then((h) => h.remove()).catch(() => {});
    };
  }, [goBackInsideApp]);

  return { goBackInsideApp };
}
