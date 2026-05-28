import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativePlayerType = 'movie' | 'series' | 'live';
export const NATIVE_PLAYER_PIPELINE_ID = 'NativePlayerPlugin' as const;

export interface NativePlayerOptions {
  url: string;
  title?: string;
  year?: string | number;
  logo?: string;
  type?: NativePlayerType;
  poster?: string;
  position?: number;
  /** Legacy: equivalente a `type === 'live'`. Plugin honra qualquer um dos dois. */
  isLive?: boolean;
  /** URL de vinheta (file:// public/ ou https) tocada antes do main stream. */
  introUrl?: string;
  /** Cabeçalhos opcionais (Referer, Authorization, X-Forwarded-For, etc.) */
  headers?: Record<string, string>;
}

export interface NativePlayerResult {
  position: number;
  cancelled: boolean;
  /** Ação opcional devolvida por LiveTV (ex.: zapping ChannelUp/ChannelDown). */
  action?: string;
  error?: boolean;
  errorMessage?: string;
}

interface NativePlayerPlugin {
  play(options: NativePlayerOptions): Promise<NativePlayerResult>;
}

const NativePlayer = registerPlugin<NativePlayerPlugin>('NativePlayer');

/** Roda em Android/iOS via Capacitor (não em browser). */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Abre Activity nativa fullscreen com Media3 ExoPlayer.
 * Retorna `{ position, cancelled }` quando usuário pressiona BACK ou ao final do stream.
 *
 * Pipeline oficial para VOD (filmes/séries) a partir da estabilização da arquitetura.
 * Adulto e fluxos legados ainda podem usar `window.Android.openPlayer` até as próximas etapas.
 *
 * Use sempre que `isNativePlatform()` for true em vez do `<video>` HTML5,
 * para evitar tela preta com áudio em m3u8 e o ícone gigante de play em TVs novas.
 */
function isBlobUrl(url: string): boolean {
  return typeof url === 'string' && /^blob:/i.test(url.trim());
}

function isAcceptableNativeUrl(url: string): boolean {
  if (!url) return false;
  return /^(https?:\/\/|file:\/\/|asset:\/\/|content:\/\/|rtmp:\/\/|rtsp:\/\/)/i.test(url.trim());
}

export async function playNative(options: NativePlayerOptions): Promise<NativePlayerResult> {
  if (!options.url) {
    throw new Error('[NativePlayer] url obrigatória');
  }
  // Guard 1: blob: URLs vêm de URL.createObjectURL no WebView e NÃO podem ser
  // lidas pelo processo ExoPlayer nativo (escopo de origem do WebView). Rejeitar
  // cedo evita Activity abrir e morrer com erro silencioso.
  if (isBlobUrl(options.url)) {
    // eslint-disable-next-line no-console
    console.error('[NativePlayer] URL blob não pode ser usada no ExoPlayer:', options.url);
    throw new Error('[NativePlayer] blob URL inválida para Activity nativa: ' + options.url.slice(0, 80));
  }
  // Guard 2: schemes desconhecidos (data:, javascript:, ws:, etc.) também não rolam.
  if (!isAcceptableNativeUrl(options.url)) {
    // eslint-disable-next-line no-console
    console.error('[NativePlayer] scheme não suportado:', options.url);
    throw new Error('[NativePlayer] scheme inválido: ' + options.url.slice(0, 80));
  }
  try {
    const result = await NativePlayer.play({
      url: options.url,
      title: options.title || '',
      year: options.year != null ? String(options.year) : '',
      logo: options.logo || '',
      type: options.type || (options.isLive ? 'live' : 'movie'),
      poster: options.poster || '',
      introUrl: options.introUrl || '',
      position: options.position || 0,
      isLive: options.isLive ?? options.type === 'live',
      headers: options.headers || {},
    });
    return {
      position: result?.position ?? 0,
      cancelled: result?.cancelled ?? false,
      action: result?.action,
      error: result?.error,
      errorMessage: result?.errorMessage,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[NativePlayer] erro', err);
    throw err;
  }
}
