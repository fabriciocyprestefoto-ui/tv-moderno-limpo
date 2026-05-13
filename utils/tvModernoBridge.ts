/**
 * RedFlix TV Moderno — Bridge para player nativo Android (Media3/ExoPlayer).
 *
 * Compatibilidade legada do TV Moderno: abre ExoPlayerActivity nativa via bridge
 * JavaScript (`window.Android.openPlayer`).
 *
 * Pipeline oficial de VOD: `NativePlayerPlugin`, exposto por `services/nativePlayerService.ts`.
 * Este bridge permanece ativo durante a migração segura de LiveTV/adulto/rotas antigas.
 *
 * Fallback: scheme custom `redflix-player://<url>` interceptado pelo WebViewClient.
 */

export interface NativeOpenPlayerArgs {
  url: string;
  title?: string;
  /** 'live' | 'movie' | 'series' | 'vinheta' */
  type?: string;
  poster?: string;
}

interface AndroidBridge {
  openPlayer?: (url: string, title?: string, type?: string, poster?: string) => void;
  isAvailable?: () => boolean;
}

declare global {
  interface Window {
    Android?: AndroidBridge;
  }
}

/** True se o bridge nativo Android está disponível (build TV Moderno em APK Capacitor). */
export function hasNativePlayer(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.Android?.openPlayer === 'function' &&
      window.Android.isAvailable?.() === true
    );
  } catch {
    return false;
  }
}

/**
 * Abre vídeo no player nativo Media3 via bridge `window.Android.openPlayer`.
 * Sem fallback `redflix-player://` (WebViewClient não é sobrescrito por exigência
 * do Capacitor; scheme custom não seria interceptado). Bridge é garantida em APK
 * TV Moderno; chamada só ocorre quando `hasNativePlayer()===true`.
 */
export function openNativePlayer(args: NativeOpenPlayerArgs): boolean {
  const { url, title = '', type = 'movie', poster = '' } = args;
  if (!url) return false;

  try {
    if (typeof window.Android?.openPlayer === 'function') {
      window.Android.openPlayer(url, title, type, poster);
      return true;
    }
    console.error('[tvModernoBridge] window.Android.openPlayer indisponível');
    return false;
  } catch (err) {
    console.error('[tvModernoBridge] window.Android.openPlayer falhou', err);
    return false;
  }
}
