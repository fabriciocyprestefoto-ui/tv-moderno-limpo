/**
 * useNativePlayerGate
 * ─────────────────────────────────────────────────────────────────
 * Em plataforma nativa (Capacitor Android/iOS) intercepta a abertura
 * do <video> HTML5 e abre a Activity ExoPlayer em vez disso.
 *
 * O componente que invoca este hook deve renderizar `null` enquanto
 * `gateActive === true` — assim o WebView nunca tenta executar
 * video.play() (origem do ícone gigante de play em TVs novas e da
 * tela preta com áudio em m3u8 progressivo).
 *
 * Em browser (web/PWA/Electron) o hook não faz nada: `gateActive`
 * volta `false` e o componente segue renderizando o player React.
 */

import { useEffect, useRef, useState } from 'react';
import { isNativePlatform, playNative, type NativePlayerType } from '../services/nativePlayerService';
import { logger } from '../utils/logger';
import { setSignal } from '../utils/appSignals';

export interface NativeGateOptions {
  /** URL final do stream (m3u8/mp4). Se vazia, gate fica inativo. */
  url: string | undefined | null;
  title?: string;
  year?: string | number;
  logo?: string;
  type?: NativePlayerType;
  poster?: string;
  /** Posição inicial em segundos (usada só se type !== 'live'). */
  startPosition?: number;
  /** URL de vinheta tocada antes do main stream (https ou file://). */
  introUrl?: string;
  headers?: Record<string, string>;
  /** Quando muda, forca novo launch mesmo com mesma URL (re-abrir player apos painel React). */
  playToken?: number | string;
  /** Chamado quando o player nativo fecha (BACK ou fim do stream).
   *  `action` opcional propagado quando Activity finaliza por botao do HUD (ex.: 'openCast',
   *  'openEpisodes', 'channelUp', 'channelDown'). */
  onClose: (result: { position: number; cancelled: boolean; action?: string }) => void;
  /** Chamado em erro — fallback p/ player React (se aplicável). */
  onError?: (err: unknown) => void;
}

export function useNativePlayerGate(options: NativeGateOptions): {
  gateActive: boolean;
  /** True após Activity nativa fechar — caller pode mostrar fallback ou navegar. */
  closed: boolean;
} {
  const native = isNativePlatform();
  const [gateActive, setGateActive] = useState(native && Boolean(options.url));
  const [closed, setClosed] = useState(false);
  /** URL da última Activity disparada — distingue troca real (próximo episódio) de re-render. */
  const lastLaunchedUrlRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  // Refs estáveis: evita re-disparo do useEffect quando callbacks mudam.
  const onCloseRef = useRef(options.onClose);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onCloseRef.current = options.onClose;
    onErrorRef.current = options.onError;
  });

  useEffect(() => {
    if (!native || !options.url) {
      setGateActive(false);
      return;
    }
    // Mesma URL já lançada? Evita re-disparo em re-render. Diferente = novo episódio = relança.
    // `playToken` permite forcar relaunch mesmo com mesma URL (apos painel React fechar).
    const effective = `${options.url}::${options.playToken ?? ''}`;
    if (lastLaunchedUrlRef.current === effective) return;
    lastLaunchedUrlRef.current = effective;
    closedRef.current = false;

    setGateActive(true);
    setClosed(false);
    // Sinaliza app pai que player está ativo — guards do useRemoteNavigation
    // precisam disso pra não competir com Activity nativa por input.
    try { setSignal('playerActive', true); } catch { /* noop */ }

    let cancelled = false;
    void (async () => {
      const finishGate = (position: number, didCancel: boolean, action?: string) => {
        if (cancelled || closedRef.current) return;
        closedRef.current = true;
        lastLaunchedUrlRef.current = null;
        setGateActive(false);
        setClosed(true);
        try { setSignal('playerActive', false); } catch { /* noop */ }
        onCloseRef.current({ position, cancelled: didCancel, action });
      };
      try {
        const res = await playNative({
          url: options.url!,
          title: options.title,
          year: options.year,
          logo: options.logo,
          type: options.type,
          poster: options.poster,
          introUrl: options.introUrl,
          position: options.startPosition,
          headers: options.headers,
        });
        finishGate(res.position, res.cancelled, res.action);
      } catch (err) {
        logger.error('[NativeGate] erro reprodução nativa', err);
        // Limpar estado interno SEM chamar onClose — onError é responsável por navegar.
        // Se chamarmos finishGate aqui também, onClose() dispara ANTES do overlay de erro
        // ser legível pelo usuário.
        if (!cancelled && !closedRef.current) {
          closedRef.current = true;
          lastLaunchedUrlRef.current = null;
          setGateActive(false);
          setClosed(false); // Não mostra "Voltando..." — onError gerencia a UX
          try { setSignal('playerActive', false); } catch { /* noop */ }
        }
        if (onErrorRef.current) {
          onErrorRef.current(err);
        } else {
          // Sem handler de erro: cai no fluxo padrão de fechamento
          onCloseRef.current({ position: 0, cancelled: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Disparar uma única vez por URL — mudança de URL exige reset upstream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, options.url, options.playToken]);

  return { gateActive, closed };
}
