/**
 * AdultoPage — Layout full-screen estilo LiveTV (Pito)
 * Vídeo em tela cheia com overlay de lista de canais
 * Fonte única: Supabase (tabela adult_streams), igual à página Canais.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';

import AdultPinModal, { isAdultUnlocked } from '@/pages/livetv/AdultPinModal';
import { loadAdultStreamsFromSupabase, type AdultStream } from '@/services/adultoService';
import { sanitizeUrlForLog } from '@/utils/sanitizeUrlForLog';
import { useTvBackHandler } from '@/hooks/useTvBackHandler';
import { logger } from '@/utils/logger';
import { setSignal } from '@/utils/appSignals';
import { runtimeFlags } from '@/config/runtimeFlags';
import { isNativePlatform, playNative } from '@/services/nativePlayerService';
import { isFireTV } from '@/utils/tvBoxDetector';

const ADULT_LIMIT = 400;
const LOCAL_CHANNEL_PLACEHOLDER = '/logored.webp';

/** Adapta AdultStream para formato usado pela página Adultos. */
function adaptAdultStreams(streams: AdultStream[]): Array<{
  id: string;
  number: number;
  name: string;
  logo: string;
  category: string;
  stream_url: string;
}> {
  return streams.map((s, index) => ({
    id: s.id,
    number: index + 1,
    name: s.title,
    logo: s.logo_url || LOCAL_CHANNEL_PLACEHOLDER,
    category: (s.group_title || 'xxx-adultos').trim(),
    stream_url: s.stream_url,
  }));
}

export default function AdultoPage() {
  const navigate = useNavigate();

  // Estado de autenticação PIN
  const [pinOk, setPinOk] = useState<boolean>(() => isAdultUnlocked());

  // Estado de carregamento
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [allChannels, setAllChannels] = useState<
    Array<{
      id: string;
      number: number;
      name: string;
      logo: string;
      category: string;
      stream_url: string;
    }>
  >([]);

  // Estado da UI
  const [selectedChannel, setSelectedChannel] = useState<(typeof allChannels)[0] | null>(null);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState(0);
  // Adulto abre direto no primeiro canal — sem menu lateral.
  // Setas direita/esquerda trocam canal sem reabrir menu.
  const [isChannelMenuVisible, setIsChannelMenuVisible] = useState(false);

  // Player
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any | null>(null);
  const nativeAdultLaunchRef = useRef(0);
  const [liveStreamError, setLiveStreamError] = useState<string | null>(null);
  // Gate idêntico à página Canais (LiveTV): SEM isLegacyHtml5OnlyTV(). O player nativo é
  // Activity Android (Media3/ExoPlayer) e independe do WebView. Bloquear por essa heurística
  // fazia o Adulto cair no <video> HTML5 (que não toca http fontez na TCL) — não funcionava.
  const useNativeAdultPlayer =
    runtimeFlags.isTvBuild &&
    runtimeFlags.nativeAndroidPlayerEnabled &&
    !isFireTV() &&
    isNativePlatform();

  // Marcar página como adulta para CSS + sinalizar player ativo para spatial/remote nav
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-page', 'adulto');
    window.__adultoActive = true;
    // Mesmo sinal que LiveTV usa — spatial-nav e remote-nav fazem early return
    // e a página trata setas/Enter localmente sem interferência.
    setSignal('livetvActive', true);
    return () => {
      window.__adultoActive = false;
      setSignal('livetvActive', false);
      html.removeAttribute('data-page');
    };
  }, []);

  // Carregar streams do Supabase (tabela adult_streams), igual à página Canais.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadError(null);

      let list: AdultStream[];
      try {
        list = await loadAdultStreamsFromSupabase();
      } catch (err) {
        if (cancelled) return;
        logger.warn('[Adulto] player error reason=load-failed', err);
        setLoadError('Falha ao carregar streams.');
        setLoading(false);
        return;
      }

      if (cancelled) return;

      const filtered = list.filter((s) => Boolean(String(s.stream_url || '').trim())).slice(0, ADULT_LIMIT);
      const adapted = adaptAdultStreams(filtered);

      const categoryCount = new Set(adapted.map((c) => c.category)).size;
      logger.log(`[Adulto] loaded categories=${categoryCount} items=${adapted.length}`);

      setAllChannels(adapted);
      if (adapted.length > 0) {
        setSelectedChannel(adapted[0]);
        setFocusedChannelIndex(0);
      } else {
        setLoadError('Nenhum conteúdo disponível.');
      }
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChannel) return;
    const idx = allChannels.findIndex((ch) => ch.id === selectedChannel.id);
    if (idx >= 0) setFocusedChannelIndex(idx);
  }, [allChannels, selectedChannel?.id]);

  // Removido: handler que reabria menu lateral em focus/pageshow.
  // User pediu Adulto sem menu lateral; setas trocam canal direto.

  // Navegação por teclado - menu de canais adulto.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pinOk || allChannels.length === 0) return;

      const isNavigationKey =
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'ChannelUp' ||
        e.key === 'ChannelDown' ||
        e.key === 'Enter' ||
        e.key === 'OK';

      if (!isNavigationKey) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'ArrowRight' || e.key === 'ChannelUp') {
        const currentIndex = allChannels.findIndex((ch) => ch.id === selectedChannel?.id);
        const nextIndex = ((currentIndex >= 0 ? currentIndex : focusedChannelIndex) + 1) % allChannels.length;
        const nextChannel = allChannels[nextIndex];
        if (!nextChannel) return;
        setFocusedChannelIndex(nextIndex);
        setSelectedChannel(nextChannel);
        setLiveStreamError(null);
        setIsChannelMenuVisible(false);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ChannelDown') {
        const currentIndex = allChannels.findIndex((ch) => ch.id === selectedChannel?.id);
        const prevIndex = ((currentIndex >= 0 ? currentIndex : focusedChannelIndex) - 1 + allChannels.length) % allChannels.length;
        const prevChannel = allChannels[prevIndex];
        if (!prevChannel) return;
        setFocusedChannelIndex(prevIndex);
        setSelectedChannel(prevChannel);
        setLiveStreamError(null);
        setIsChannelMenuVisible(false);
        return;
      }

      // ArrowUp/ArrowDown/OK tambem trocam canal: cima = anterior, baixo = proximo.
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'OK') {
        const currentIndex = allChannels.findIndex((ch) => ch.id === selectedChannel?.id);
        const nextIndex = ((currentIndex >= 0 ? currentIndex : focusedChannelIndex) + 1) % allChannels.length;
        const nextChannel = allChannels[nextIndex];
        if (!nextChannel) return;
        setFocusedChannelIndex(nextIndex);
        setSelectedChannel(nextChannel);
        setLiveStreamError(null);
        return;
      }

      if (e.key === 'ArrowUp') {
        const currentIndex = allChannels.findIndex((ch) => ch.id === selectedChannel?.id);
        const prevIndex = ((currentIndex >= 0 ? currentIndex : focusedChannelIndex) - 1 + allChannels.length) % allChannels.length;
        const prevChannel = allChannels[prevIndex];
        if (!prevChannel) return;
        setFocusedChannelIndex(prevIndex);
        setSelectedChannel(prevChannel);
        setLiveStreamError(null);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [pinOk, allChannels, focusedChannelIndex, isChannelMenuVisible, selectedChannel?.id]);

  const selectAdultChannelFromMenu = useCallback((index: number) => {
    const channel = allChannels[index];
    if (!channel) return;
    setFocusedChannelIndex(index);
    setSelectedChannel(channel);
    setLiveStreamError(null);
    setIsChannelMenuVisible(false);
  }, [allChannels]);
  // Player HLS — padrão jogador2 (minimalista). Mesmo path que LiveTV (funcionando).
  // TV Moderno: NativePlayerPlugin abre Media3 — nenhum <video> renderizado.
  useEffect(() => {
    if (!useNativeAdultPlayer || !selectedChannel?.stream_url) return;

    const launchId = ++nativeAdultLaunchRef.current;
    let cancelled = false;
    setLiveStreamError(null);
    setSignal('playerActive', true);
    logger.log('[Adulto] using native live player');
    logger.log(`[Adulto] stream selected url=${sanitizeUrlForLog(selectedChannel.stream_url)}`);

    void playNative({
      url: selectedChannel.stream_url,
      title: selectedChannel.name,
      type: 'live',
      poster: selectedChannel.logo || '',
      logo: selectedChannel.logo || '',
      isLive: true,
    })
      .then((result) => {
        if (cancelled || nativeAdultLaunchRef.current !== launchId) return;
        setSignal('playerActive', false);

        if (result.action === 'channelUp' || result.action === 'channelDown') {
          const currentIndex = allChannels.findIndex((ch) => ch.id === selectedChannel.id);
          const baseIndex = currentIndex >= 0 ? currentIndex : focusedChannelIndex;
          const delta = result.action === 'channelUp' ? 1 : -1;
          const nextIndex = (baseIndex + delta + allChannels.length) % allChannels.length;
          const nextChannel = allChannels[nextIndex];
          if (nextChannel) {
            setFocusedChannelIndex(nextIndex);
            setSelectedChannel(nextChannel);
          }
        }
      })
      .catch((err) => {
        if (cancelled || nativeAdultLaunchRef.current !== launchId) return;
        setSignal('playerActive', false);
        logger.warn('[Adulto] player error reason=native-error', err);
        logger.log('[Adulto] UI error shown');
        setLiveStreamError(err instanceof Error ? err.message : 'Falha ao abrir este stream.');
      });

    return () => {
      cancelled = true;
      setSignal('playerActive', false);
    };
  }, [allChannels, focusedChannelIndex, selectedChannel, useNativeAdultPlayer]);

  // URLs adult_streams já são .m3u8 nativos.
  useEffect(() => {
    if (useNativeAdultPlayer) return;
    const video = videoRef.current;
    if (!video || !selectedChannel?.stream_url) return;

    setLiveStreamError(null);
    video.muted = false;

    const url = selectedChannel.stream_url;
    logger.log('[Adulto] using HLS fallback');
    logger.log(`[Adulto] stream selected url=${sanitizeUrlForLog(url)}`);
    const isHls =
      /\.m3u8(\?|$)/i.test(url) ||
      url.toLowerCase().includes('.m3u8') ||
      url.includes('application/x-mpegurl');

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let playOnMetadata: (() => void) | null = null;

    if (!isHls) {
      video.src = url;
      void video.play().catch(() => {});
      return () => {
        try {
          video.removeAttribute('src');
          video.load();
        } catch { /* noop */ }
      };
    }

    try {
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else {
              hls.destroy();
              logger.warn('[Adulto] player error reason=hls-fatal');
              logger.log('[Adulto] UI error shown');
              setLiveStreamError('Falha ao carregar este stream.');
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
        video.src = url;
        playOnMetadata = () => {
          video.play().catch(() => {});
        };
        video.addEventListener('loadedmetadata', playOnMetadata, { once: true });
      } else {
        video.src = url;
        video.play().catch(() => {});
      }
    } catch (err) {
      logger.error('[AdultoPage] Erro ao inicializar player', err);
      video.src = url;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      try {
        if (playOnMetadata) video.removeEventListener('loadedmetadata', playOnMetadata);
        video.removeAttribute('src');
        video.load();
      } catch { /* noop */ }
    };
  }, [selectedChannel, useNativeAdultPlayer]);

  // Retry stream
  const retryStream = useCallback(() => {
    setLiveStreamError(null);
    const v = videoRef.current;
    if (v && selectedChannel?.stream_url) {
      try {
        v.src = selectedChannel.stream_url;
        v.load();
        void v.play().catch(() => {});
      } catch { /* noop */ }
    }
  }, [selectedChannel]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Hooks que DEVEM ser chamados SEMPRE (antes dos early returns)
  // ═══════════════════════════════════════════════════════════════════════════

  // Botão voltar TV — includeKeydown captura Backspace/Escape/Back direto
  // (AdultoPage não usa useRemoteNavigation, então redx-native-back nunca dispara).
  useTvBackHandler(() => {
    navigate('/');
  }, { includeKeydown: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // EARLY RETURNS — DEPOIS de TODOS os hooks para evitar React Error #310
  // ═══════════════════════════════════════════════════════════════════════════

  // PIN Gate — sempre primeiro: o usuário pode interagir e cancelar imediatamente
  if (!pinOk) {
    return <AdultPinModal onSuccess={() => setPinOk(true)} onCancel={() => navigate('/')} />;
  }

  // Loading fallback enquanto canais carregam
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  // Render principal - vídeo full-screen com menu overlay
  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Vídeo full-screen — WebView Android renderiza <video> em surface nativa
          ATRÁS do DOM; outer bg opaco esconderia frames. Manter transparente. */}
      <div className="absolute inset-0 z-0" style={{ background: 'transparent' }}>
        {useNativeAdultPlayer ? null :
        selectedChannel?.stream_url &&
        !selectedChannel.stream_url.toLowerCase().match(/youtube|youtu\.be/) ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            preload="auto"
            controls={false}
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            className="w-full h-full object-contain"
            style={{ backgroundColor: 'transparent' }}
            onError={() => {
              logger.warn('[Adulto] player error reason=video-element');
              logger.log('[Adulto] UI error shown');
              setLiveStreamError('Falha ao carregar este stream.');
            }}
          />
        ) : selectedChannel?.stream_url?.match(/youtube|youtu\.be/) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 text-white px-8 text-center">
            <div>
              <p className="text-xl font-bold mb-2">Canal indisponivel no APK TV moderno</p>
              <p className="text-sm text-white/60">
                Links YouTube via iframe foram desativados para evitar playback pelo WebView.
              </p>
            </div>
          </div>
        ) : null}

        {/* Error overlay */}
        {liveStreamError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <p className="text-white text-xl mb-4">{liveStreamError}</p>
              <button
                onClick={retryStream}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-bold"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botão Voltar - canto superior esquerdo */}
      <button
        onClick={() => navigate('/')}
        tabIndex={0}
        autoFocus
        className="absolute top-8 left-8 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/16 transition-all focus:outline-none focus:ring-2 focus:ring-purple-400/60"
        aria-label="Voltar para o início"
      >
        <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center bg-white/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-purple-200/70"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-purple-100/80">
          Voltar
        </span>
      </button>

      {/* Logo do canal - canto superior direito */}
      {selectedChannel && (
        <div className="absolute top-8 right-8 z-30">
          <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl">
            {selectedChannel.logo && (
              <img
                src={selectedChannel.logo}
                alt={selectedChannel.name}
                className="h-10 object-contain brightness-200"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = LOCAL_CHANNEL_PLACEHOLDER;
                }}
              />
            )}
            <span className="text-lg font-black text-white uppercase tracking-tighter">
              {selectedChannel.name}
            </span>
          </div>
        </div>
      )}

      {isChannelMenuVisible && allChannels.length > 0 && (
        <div className="absolute left-8 top-28 bottom-8 z-40 w-[420px] max-w-[42vw] rounded-2xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-purple-200/70">
              Canais adultos
            </p>
            <p className="mt-1 text-lg font-black text-white">
              {selectedChannel?.name || 'Selecione um canal'}
            </p>
          </div>
          <div className="h-[calc(100%-88px)] overflow-y-auto p-3">
            {allChannels.map((channel, index) => {
              const focused = focusedChannelIndex === index;
              const active = selectedChannel?.id === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  tabIndex={0}
                  onClick={() => selectAdultChannelFromMenu(index)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                    focused
                      ? 'bg-purple-600 text-white ring-2 ring-purple-300/70'
                      : active
                        ? 'bg-white/14 text-white'
                        : 'bg-transparent text-white/78 hover:bg-white/10'
                  }`}
                >
                  <span className="w-10 text-sm font-black text-white/70 tabular-nums">
                    {channel.number}
                  </span>
                  {channel.logo && (
                    <img
                      src={channel.logo}
                      alt=""
                      className="h-8 w-10 object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = LOCAL_CHANNEL_PLACEHOLDER;
                      }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {channel.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Load error toast */}
      {loadError && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 px-6 py-3 bg-amber-500/90 rounded-xl text-white font-semibold">
          {loadError}
        </div>
      )}
    </div>
  );
}
