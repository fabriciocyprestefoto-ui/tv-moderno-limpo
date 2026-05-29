/**
 * liteMode.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Modo leve unificado: combina detecção de DEVICE + REDE.
 *
 * Lite mode ativa quando:
 *   - Dispositivo antigo: Android ≤7 ou Firestick (qualquer rede)
 *   - Hardware fraco: TV Box com pouca RAM/CPU
 *   - Rede lenta: effectiveType 2g/slow-2g ou probe > 2500ms
 *   - WebView sem fetch: versão tão antiga que fetch não existe
 *
 * Ao ativar: adiciona 'lite-mode' + 'tv-box' + 'tv-box-mode' + 'low-power' no <html>.
 * O CSS do index.css usa essas classes para desligar backdrop-filter, animações, vidro.
 *
 * Expõe um CustomEvent 'redx-lite-mode-change' para que componentes React reajam.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isLegacyHtml5OnlyTV, isFireTV, isTVBox, isLowPower } from './tvBoxDetector';
import { getNetworkQualitySync, probeNetworkQuality, watchNetworkQuality, NetworkQuality } from './networkDetector';

const LITE_CLASS = 'lite-mode';
// Sinal global para leitura síncrona sem depender de DOM (útil em workers)
const WINDOW_KEY = '__REDX_LITE_MODE';
// Garante log único por sessão independente de re-inicializações
let _loggedOnce = false;

// ── Lógica de decisão ────────────────────────────────────────────────────────

function isOldDevice(): boolean {
  return isLegacyHtml5OnlyTV() || isFireTV();
}

function isWeakHardware(): boolean {
  return isTVBox() && isLowPower();
}

export function shouldEnableLiteMode(netQuality: NetworkQuality): boolean {
  if (typeof fetch === 'undefined') return true; // WebView antigo demais
  if (isOldDevice()) return true;
  if (isWeakHardware()) return true;
  if (netQuality === 'slow') return true;
  return false;
}

// ── Aplicação no DOM ─────────────────────────────────────────────────────────

export function applyLiteMode(enable: boolean, reason = 'device/network'): void {
  if (typeof document === 'undefined') return;

  const html = document.documentElement;
  const current = html.classList.contains(LITE_CLASS);
  if (current === enable) return; // sem mudança → não disparar evento

  if (enable) {
    // Herda todas as otimizações já existentes no CSS + as novas regras de .lite-mode
    html.classList.add(LITE_CLASS, 'tv-box', 'tv-box-mode', 'low-power');
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>)[WINDOW_KEY] = true;

    if (!_loggedOnce) {
      _loggedOnce = true;
      const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 100) : '';
      console.info('[REDX LiteMode]', { enabled: true, reason, ua });
    }
  } else {
    html.classList.remove(LITE_CLASS);
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>)[WINDOW_KEY] = false;
  }

  window.dispatchEvent(
    new CustomEvent('redx-lite-mode-change', { detail: { lite: enable } })
  );
}

// ── API pública ──────────────────────────────────────────────────────────────

/** Leitura síncrona — segura de chamar antes do React montar. */
export function isLiteMode(): boolean {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)[WINDOW_KEY] !== undefined) {
    return !!(window as unknown as Record<string, unknown>)[WINDOW_KEY];
  }
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains(LITE_CLASS);
}

/**
 * Init síncrono — chame ANTES do ReactDOM.render().
 * Usa apenas APIs síncronas (device + Network Information API).
 * Se a decisão for incerta, espera o probe assíncrono.
 */
export function initLiteMode(): void {
  if (typeof document === 'undefined') return;

  // fetch ausente = WebView muito antigo = lite direto
  if (typeof fetch === 'undefined') {
    applyLiteMode(true, 'no-fetch');
    return;
  }

  // Dispositivo claramente antigo = lite direto, sem esperar rede
  if (isOldDevice()) {
    applyLiteMode(true, 'old-device');
    return;
  }
  if (isWeakHardware()) {
    applyLiteMode(true, 'weak-hardware');
    return;
  }

  // Verifica rede sincronamente (Network Information API)
  const syncNet = getNetworkQualitySync();
  if (syncNet === 'slow') {
    applyLiteMode(true, 'network-slow-sync');
    return;
  }

  // Dispositivo moderno + rede desconhecida/boa: não aplica ainda.
  // O probe assíncrono decidirá depois do primeiro render.
}

/**
 * Probe assíncrono — chame depois do React montar (useEffect, bootDone, etc.).
 * Faz HEAD request para medir TTFB e atualiza lite mode se necessário.
 * No-op se já estiver em lite mode.
 */
export async function updateLiteModeAsync(): Promise<void> {
  if (isLiteMode()) return; // já decidido → não re-testar

  try {
    const quality = await probeNetworkQuality();
    if (shouldEnableLiteMode(quality)) {
      applyLiteMode(true, 'network-slow-probe');
    }
  } catch { /* probe falhou → manter modo atual */ }
}

/**
 * Monitora mudanças de conexão em tempo real via Network Information API.
 * Retorna cleanup function. Chame no useEffect da raiz do app.
 */
export function watchAndUpdateLiteMode(): () => void {
  return watchNetworkQuality((quality) => {
    if (isLiteMode()) return; // já em lite mode
    if (quality === 'slow') {
      applyLiteMode(true, 'network-degraded');
    }
  });
}
