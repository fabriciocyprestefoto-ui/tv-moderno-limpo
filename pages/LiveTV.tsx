/**
 * LiveTV — UI completa substituída pelo design PIto-main
 * Fonte de dados: channelsService (Supabase, real-time)
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Hls from 'hls.js';
import { useNavigate } from 'react-router-dom';

import { loadChannelsFromSupabase } from '@/services/channelsFromSupabase';
import { adaptChannels } from '@/features/livetv/pito/channelAdapter';
import { PitoChannel, PitoCategory } from '@/features/livetv/pito/types';
import { PitoSidebar } from '@/features/livetv/pito/Sidebar';
import { PitoChannelGrid } from '@/features/livetv/pito/ChannelGrid';
import { PitoChannelInfoOverlay } from '@/features/livetv/pito/ChannelInfoOverlay';
import AdultPinModal, {
  setAdultUnlocked as markAdultUnlocked,
  isAdultUnlocked,
  isAdultChannel,
} from '@/pages/livetv/AdultPinModal';

import { setSignal } from '@/utils/appSignals';
import { sanitizeUrlForLog } from '@/utils/sanitizeUrlForLog';
import { getAdjacentLiveTvChannelIndex } from '@/utils/liveTvControls';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';
import { runtimeFlags } from '@/config/runtimeFlags';
import { isNativePlatform, playNative } from '@/services/nativePlayerService';
import { isFireTV } from '@/utils/tvBoxDetector';
import { platformBannerFallbackUrls } from '@/utils/publicAssetUrl';

// PIN adulto gerenciado via AdultPinModal/Edge Function; PIN nunca deve ir no bundle.

/** Fundo atrás do vídeo — neutro escuro (evita “lavado” roxo sobre o sinal). */
const LIVETV_BACKDROP_BG = '#000000';

/** Carregamento inicial da lista de canais — mesmas variáveis que `redx-bg.css` (html/body). */
const LIVETV_LOADING_SURFACE = {
  backgroundColor: 'var(--redx-bg-darkest, #020617)',
  backgroundImage: 'var(--redx-app-gradient)',
  backgroundRepeat: 'no-repeat' as const,
  backgroundSize: 'cover' as const,
};
const LOCAL_CHANNEL_PLACEHOLDER = '/logored.webp';
/** Vinheta de fundo no splash de entrada dos Canais (mesma fonte da intro). */
const LIVETV_INTRO_VINHETA_URLS = platformBannerFallbackUrls(
  'vinheta-tv.mp4',
  import.meta.env.VITE_APP_VERSION ?? '1'
);
const LIVE_STREAM_UNAVAILABLE_MESSAGE = 'Canal indisponível ou servidor não respondeu.';
// Timeouts HLS.js (web/Fire Stick). O painel fontez.cc faz 302 rápido para uma CDN
// edge; uma edge lenta-mas-viva pode levar >8s para o manifest. 28s dá folga para
// edge lenta sem deixar "CARREGANDO..." infinito quando a edge está morta.
const LIVE_HLS_TIMEOUT_MS = 28_000;        // manifest/level/frag loadingTimeOut
const LIVE_HLS_LOAD_TIMEOUT_MS = 30_000;   // watchdog JS geral (> manifest p/ HLS.js errar primeiro)
const LIVE_HLS_MAX_RETRIES = 1;            // retry baixo — não martelar edge morta
// Após falha de um canal, pula auto-zap desse canal+url por 2 min. Enter/ChannelUp/
// ChannelDown/clique e o botão "Tentar novamente" ignoram/limpam o bloqueio.
const LIVE_FAILURE_STORAGE_KEY = 'redx:liveChannelFailures';
const LIVE_FAILURE_TTL_MS = 2 * 60_000;

/** Alias retrocompat — mascara token/credencial antes de logar (aparece no logcat da TV). */
const maskLiveTvUrlForLog = sanitizeUrlForLog;

function isHlsTimeoutDetails(details: unknown): boolean {
  return String(details || '').toLowerCase().includes('timeout');
}

function isHlsManifestLoadError(details: unknown): boolean {
  return String(details || '').toLowerCase().includes('manifestloaderror');
}

/** Fábrica única de Hls configurado para Live (timeouts e retry padronizados). */
function createHlsForLiveChannel(): any {
  return new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    manifestLoadingTimeOut: LIVE_HLS_TIMEOUT_MS,
    manifestLoadingMaxRetry: LIVE_HLS_MAX_RETRIES,
    manifestLoadingRetryDelay: 1000,
    manifestLoadingMaxRetryTimeout: 8000,
    levelLoadingTimeOut: LIVE_HLS_TIMEOUT_MS,
    levelLoadingMaxRetry: LIVE_HLS_MAX_RETRIES,
    levelLoadingRetryDelay: 1000,
    levelLoadingMaxRetryTimeout: 8000,
    fragLoadingTimeOut: LIVE_HLS_TIMEOUT_MS,
    fragLoadingMaxRetry: LIVE_HLS_MAX_RETRIES,
    fragLoadingRetryDelay: 1000,
    fragLoadingMaxRetryTimeout: 8000,
  });
}

/**
 * URL base aproximada de um canal (para checagem de auto-zap antes de selecionar).
 * Respeita região SP quando o canal é regional; o efetivo final (qualidade/região
 * escolhida) é resolvido em `effectiveStreamUrl` só para o canal selecionado.
 */
function baseStreamUrlOf(channel: PitoChannel): string {
  if (channel.regions && channel.regions.length > 0) {
    const sp = channel.regions.find((r) => r.state === 'SP');
    return (sp ?? channel.regions[0]).streamUrl || channel.streamUrl || '';
  }
  return channel.streamUrl || '';
}

// ── Registro de falhas por canal+url (TTL 2 min) ───────────────────────────
// Substitui o slot único anterior por um mapa, para que trocar de canal não
// apague a memória de falha de OUTROS canais (auto-zap continua pulando-os).
interface LiveChannelFailure {
  reason: string;
  message: string;
  timestamp: number;
}
type LiveFailureMap = Record<string, LiveChannelFailure>;

function liveFailureKey(channelId: string, url: string): string {
  return `${channelId}|${url}`;
}

function writeLiveFailureMap(map: LiveFailureMap): void {
  try {
    sessionStorage.setItem(LIVE_FAILURE_STORAGE_KEY, JSON.stringify(map));
  } catch { /* noop */ }
}

function readLiveFailureMap(): LiveFailureMap {
  try {
    const raw = sessionStorage.getItem(LIVE_FAILURE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LiveFailureMap;
    const now = Date.now();
    let mutated = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || now - value.timestamp > LIVE_FAILURE_TTL_MS) {
        delete parsed[key];
        mutated = true;
      }
    }
    if (mutated) writeLiveFailureMap(parsed);
    return parsed;
  } catch {
    return {};
  }
}

function markChannelFailed(
  channelId: string,
  url: string,
  reason: string,
  message: string = LIVE_STREAM_UNAVAILABLE_MESSAGE
): void {
  if (!channelId || !url) return;
  const map = readLiveFailureMap();
  map[liveFailureKey(channelId, url)] = { reason, message, timestamp: Date.now() };
  writeLiveFailureMap(map);
}

function getRecentChannelFailure(channelId: string, url: string): LiveChannelFailure | null {
  if (!channelId || !url) return null;
  return readLiveFailureMap()[liveFailureKey(channelId, url)] ?? null;
}

/** True se este canal+url falhou nos últimos 2 min — auto-zap deve pulá-lo. */
function shouldSkipAutoZap(channelId: string, url: string): boolean {
  return getRecentChannelFailure(channelId, url) !== null;
}

/** Limpa o bloqueio de um canal+url específico (usado pelo "Tentar novamente"). */
function clearChannelFailure(channelId: string, url: string): void {
  if (!channelId || !url) return;
  const map = readLiveFailureMap();
  const key = liveFailureKey(channelId, url);
  if (map[key]) {
    delete map[key];
    writeLiveFailureMap(map);
  }
}

function isRemovedSbtSpChannel(name: string): boolean {
  const normalized = name.trim().toUpperCase();
  return /^SBT SP(?:\s|$|-)/.test(normalized);
}

interface LiveTVProps {
  onBack?: () => void;
  initialChannel?: string;
  /** Pre-selects a category by its id/name when channels load (e.g. 'adultos') */
  initialCategory?: string;
}

export default function LiveTV({ onBack, initialChannel, initialCategory }: LiveTVProps = {}) {
  const navigate = useNavigate();
  const handleExitToHome = useCallback(() => {
    if (onBack) onBack();
    else navigate('/');
  }, [onBack, navigate]);
  // data-page=livetv: html/body sem gradiente app (redx-bg) + overrides CSS do menu Pito
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-page', 'livetv');
    setSignal('livetvActive', true);
    return () => {
      setSignal('livetvActive', false);
      html.removeAttribute('data-page');
    };
  }, []);

  // ── Dados de canais ──────────────────────────────────────────────────────
  const [allChannels, setAllChannels] = useState<PitoChannel[]>([]);
  const [categories, setCategories] = useState<PitoCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [channelLoadError, setChannelLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const raw = await loadChannelsFromSupabase();
        if (!mounted) return;
        if (raw.length === 0) {
          setIsLoading(false);
          return;
        }
        const visibleChannels = raw.filter((channel) => !isRemovedSbtSpChannel(channel.name));
        const adapted = adaptChannels(visibleChannels);
        setAllChannels(adapted.channels);
        setCategories(adapted.categories);
        setIsLoading(false);
      } catch (err) {
        console.error('[LiveTV] Falha ao carregar canais:', err);
        if (mounted) {
          setChannelLoadError(
            err instanceof Error ? err.message : 'Erro de conexão com o servidor'
          );
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ── Estado da UI ─────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<PitoChannel | null>(null);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isGenreExpanded, setIsGenreExpanded] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(true);
  const [isInfoOverlayVisible, setIsInfoOverlayVisible] = useState(false);

  // Controle parental — lazy init lê TTL do sessionStorage (evita re-pedir PIN após nav)
  // Em build de loja (adultContentEnabled=false) o canal adulto nunca destrava.
  const [adultUnlocked, setAdultUnlocked] = useState(
    () => runtimeFlags.adultContentEnabled && isAdultUnlocked(),
  );
  const [showAdultPin, setShowAdultPin] = useState(false);

  // Navegação por teclado
  const [focusedSection, setFocusedSection] = useState<'sidebar' | 'grid' | 'states' | 'qualities' | null>('sidebar');
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState(0);
  const [focusedChannelIndex, setFocusedChannelIndex] = useState(0);
  const [focusedStateIndex, setFocusedStateIndex] = useState(0);
  const [focusedQualityIndex, setFocusedQualityIndex] = useState(0);

  // Player
  const videoRef = useRef<HTMLVideoElement>(null);
  // Hls é carregado dinamicamente; ref tipado como any.
  const hlsRef = useRef<any | null>(null);
  const [liveStreamError, setLiveStreamError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [streamRetryNonce, setStreamRetryNonce] = useState(0);
  // Gate idêntico ao VOD (Player.tsx): SEM isLegacyHtml5OnlyTV(). O player nativo é uma
  // Activity Android (Media3/ExoPlayer) e independe da versão do WebView/Chromium.
  // TCL Android TV roda OS novo com System WebView antigo (Chromium < 80): bloquear o
  // nativo por essa heurística fazia LiveTV cair no <video> HTML5 (webview) — regressão.
  const useNativeLivePlayer =
    runtimeFlags.isTvBuild &&
    runtimeFlags.nativeAndroidPlayerEnabled &&
    !isFireTV() &&
    isNativePlatform();
  const nativeLiveLaunchRef = useRef(0);
  // Auto-zap só dispara após navegação real do usuário na grade. Trocar de gênero
  // desarma; ArrowUp/Down na grade arma. Evita tocar o 1º canal ao só filtrar gênero.
  const autoZapArmedRef = useRef(false);
  // Chave do último launch nativo (id|url|nonce) — torna o efeito idempotente e
  // evita duplo loadSource quando o efeito re-roda por troca de identidade de callback.
  const lastNativeLaunchKeyRef = useRef('');

  /** Limpa só o estado VISUAL de playback (erro + ready). Não apaga o registro de falhas. */
  const resetLivePlaybackState = useCallback(() => {
    setLiveStreamError(null);
    setIsVideoReady(false);
  }, []);

  // ── Região padrão ────────────────────────────────────────────────────────
  // Sem geolocalização IP. Padrão = SP (maior cobertura BR). Usuário troca via
  // seletor de estado se quiser outra UF.
  const geoState: string | null = 'SP';

  // ── Estado/Região e Qualidade selecionados pelo usuário ──────────────────
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeQuality, setActiveQuality] = useState<string | null>(null);

  // Região efetiva (para canais regionais)
  const currentRegion = useMemo(() => {
    if (!selectedChannel?.regions?.length) return null;
    return (
      selectedChannel.regions.find((r) => r.state === activeRegion) ?? selectedChannel.regions[0]
    );
  }, [selectedChannel, activeRegion]);

  // ── Input numérico para seleção de canal via D-pad ───────────────────────────
  const [_numericInput, _setNumericInput] = useState<{ value: string; active: boolean }>({
    value: '',
    active: false,
  });

  // Qualidades disponíveis para o canal/região atual
  const currentQualities = useMemo(() => {
    return currentRegion?.qualities ?? selectedChannel?.qualities ?? [];
  }, [currentRegion, selectedChannel]);

  // streamUrl efetivo: respeita região e qualidade escolhidas.
  // Supabase já entrega .m3u8 nativamente — sem conversão.
  const effectiveStreamUrl = useMemo(() => {
    if (!selectedChannel) return '';
    const base = currentRegion ? currentRegion.streamUrl : selectedChannel.streamUrl;
    if (activeQuality) {
      const q = currentQualities.find((q) => q.label === activeQuality);
      if (q) return q.streamUrl;
    }
    return base || '';
  }, [selectedChannel, currentRegion, currentQualities, activeQuality]);


  // Ao trocar canal, pré-seleciona o estado do usuário (se disponível no canal)
  useEffect(() => {
    if (!selectedChannel) {
      setActiveRegion(null);
      setActiveQuality(null);
      return;
    }
    const regions = selectedChannel.regions;
    if (regions && regions.length > 0 && geoState) {
      const match = regions.find((r) => r.state === geoState);
      setActiveRegion(match ? geoState : null);
    } else {
      setActiveRegion(null);
    }
    setActiveQuality(null);
  }, [selectedChannel?.id, geoState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Número de canal digitado
  const [numberBuffer, setNumberBuffer] = useState('');
  const numberBufferTimeoutRef = useRef<number | null>(null);
  const openInfoDelayRef = useRef<number | null>(null);
  const openInfoDelay2Ref = useRef<number | null>(null); // ref separada para o timer aninhado
  const selectGuardTimeoutRef = useRef<number | null>(null);
  const selectingChannelRef = useRef(false); // guard contra duplo Enter no mesmo canal
  const channelSwitchDebounceRef = useRef<number | null>(null); // debounce ChannelUp/Down
  const pendingAdultChannelRef = useRef<PitoChannel | null>(null); // canal aguardando PIN adulto

  // ── Inicializa categoria ao carregar (suporta ?channel= da rota e initialCategory) ──
  useEffect(() => {
    if (categories.length === 0 || activeCategory) return;

    // Pre-seleciona categoria via prop (ex: 'adultos' para a tela Adulto)
    if (initialCategory) {
      const norm = initialCategory.toLowerCase();
      const cat = categories.find(
        (c) => c.id.toLowerCase().includes(norm) || c.name.toLowerCase().includes(norm)
      );
      if (cat) {
        setActiveCategory(cat.id);
        const firstChannel = allChannels.find((c) => c.category === cat.id) || allChannels[0] || null;
        if (firstChannel) setSelectedChannel(firstChannel);
        return;
      }
    }

    if (initialChannel) {
      const norm = initialChannel.toLowerCase();
      const found = allChannels.find(
        (c) => c.name.toLowerCase().includes(norm) || String(c.number) === initialChannel
      );
      if (found) {
        const cat = categories.find((c) => c.id === found.category) || categories[0];
        setActiveCategory(cat.id);
        setSelectedChannel(found);
        return;
      }
    }

    const firstCat = categories[0];
    // Canal padrão ao abrir Canais = History (pedido do usuário). Sem ele, cai no 1º da 1ª categoria.
    const defaultChannel = allChannels.find((c) => /\bhistory\b/i.test(c.name));
    if (defaultChannel) {
      const cat = categories.find((c) => c.id === defaultChannel.category) || firstCat;
      setActiveCategory(cat.id);
      setSelectedChannel(defaultChannel);
      return;
    }
    setActiveCategory(firstCat.id);
    const firstChannel =
      allChannels.find((c) => c.category === firstCat.id) || allChannels[0] || null;
    if (firstChannel) setSelectedChannel(firstChannel);
  }, [categories, allChannels, activeCategory, initialChannel, initialCategory]);

  // ── Canais filtrados por categoria ───────────────────────────────────────
  const filteredChannels = useMemo(() => {
    if (!activeCategory) return [];
    return allChannels.filter((c) => c.category === activeCategory);
  }, [allChannels, activeCategory]);

  const activeCategoryName = useMemo(
    () => categories.find((c) => c.id === activeCategory)?.name || '',
    [categories, activeCategory]
  );


  const handleVideoElementError = useCallback(() => {
    console.warn('[LiveTV] canal indisponível');
    setLiveStreamError(LIVE_STREAM_UNAVAILABLE_MESSAGE);
  }, []);

  // Canal selecionado sem URL: exibe erro em vez de tela preta silenciosa
  useEffect(() => {
    if (!selectedChannel) return;
    if (!effectiveStreamUrl) {
      setLiveStreamError('URL do canal indisponível. Tente outro canal.');
    }
  }, [selectedChannel, effectiveStreamUrl]);

  // Player effect HTML5 — usado apenas quando bridge nativo NÃO disponível
  // (desenvolvimento web, build legacy). Em TV Moderno este effect não executa.
  useEffect(() => {
    if (useNativeLivePlayer) return;
    const video = videoRef.current;
    if (!video || !effectiveStreamUrl) return;

    const url = effectiveStreamUrl;
    const maskedUrl = maskLiveTvUrlForLog(url);
    console.warn(`[LiveTV] opening channel number=${selectedChannel?.number} name=${selectedChannel?.name} url=${maskedUrl}`);
    const recentStreamError = selectedChannel
      ? getRecentChannelFailure(selectedChannel.id, url)
      : null;
    if (recentStreamError) {
      console.warn(`[LiveTV] canal indisponível reason=hls-recent-error url=${maskedUrl}`);
      console.warn('[LiveTV] UI error shown');
      setIsVideoReady(false);
      setLiveStreamError(recentStreamError.message);
      return;
    }

    setLiveStreamError(null);
    setIsVideoReady(false);
    video.muted = false;

    const isHls =
      /\.m3u8(\?|$)/i.test(url) ||
      url.toLowerCase().includes('.m3u8') ||
      url.includes('application/x-mpegurl');

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let playOnMetadata: (() => void) | null = null;
    let closed = false;
    let loadTimeout: number | null = null;

    const clearLoadTimeout = () => {
      if (loadTimeout !== null) {
        window.clearTimeout(loadTimeout);
        loadTimeout = null;
      }
    };

    const markReady = () => {
      clearLoadTimeout();
      setIsVideoReady(true);
    };

    const markUnavailable = (reason: string) => {
      if (closed) return;
      clearLoadTimeout();
      console.warn(`[LiveTV] channel failed reason=${reason} url=${maskedUrl}`);
      if (selectedChannel) {
        markChannelFailed(selectedChannel.id, url, reason);
      }
      setIsVideoReady(false);
      setLiveStreamError(LIVE_STREAM_UNAVAILABLE_MESSAGE);
      console.warn('[LiveTV] UI error shown');
      try {
        hlsRef.current?.stopLoad?.();
      } catch { /* noop */ }
    };

    const startLoadTimeout = () => {
      clearLoadTimeout();
      loadTimeout = window.setTimeout(() => {
        console.warn(`[LiveTV] HLS timeout url=${maskedUrl} timeoutMs=${LIVE_HLS_LOAD_TIMEOUT_MS}`);
        markUnavailable('timeout');
      }, LIVE_HLS_LOAD_TIMEOUT_MS);
    };

    video.addEventListener('loadedmetadata', markReady);
    video.addEventListener('loadeddata', markReady);
    video.addEventListener('canplay', markReady);
    video.addEventListener('playing', markReady);

    if (!isHls) {
      startLoadTimeout();
      video.src = url;
      void video.play().catch(() => {});
      return () => {
        closed = true;
        clearLoadTimeout();
        try {
          video.removeEventListener('loadedmetadata', markReady);
          video.removeEventListener('loadeddata', markReady);
          video.removeEventListener('canplay', markReady);
          video.removeEventListener('playing', markReady);
          video.removeAttribute('src');
          video.load();
        } catch { /* noop */ }
      };
    }

    // Static import (sem dynamic import) — Android 5 WebView (Chromium 37-39)
    // não suporta dynamic import. plugin-legacy transpila o resto.
    try {
      if (Hls && Hls.isSupported()) {
        const hls = createHlsForLiveChannel();
        hlsRef.current = hls;
        console.warn(`[LiveTV] HLS loadSource url=${maskedUrl}`);
        startLoadTimeout();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_LOADED, () => {
          console.warn(`[LiveTV] HLS MANIFEST_LOADED channel=${selectedChannel?.number}`);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.warn(`[LiveTV] HLS MANIFEST_PARSED channel=${selectedChannel?.number}`);
          clearLoadTimeout();
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn(`[LiveTV] HLS NETWORK_ERROR details=${String(data.details || '')} fatal=${Boolean(data.fatal)} url=${maskedUrl}`);
            if (isHlsTimeoutDetails(data.details) || isHlsManifestLoadError(data.details)) {
              console.warn(`[LiveTV] HLS timeout details=${String(data.details || '')} url=${maskedUrl}`);
            }
          }

          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            markUnavailable(
              isHlsManifestLoadError(data.details)
                ? 'manifestLoadError'
                : isHlsTimeoutDetails(data.details)
                  ? 'timeout'
                  : 'network'
            );
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            markUnavailable('media');
          } else {
            hls.destroy();
            markUnavailable('fatal');
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
        // Fallback Safari / native HLS
        startLoadTimeout();
        video.src = url;
        playOnMetadata = () => {
          video.play().catch(() => {});
        };
        video.addEventListener('loadedmetadata', playOnMetadata, { once: true });
      } else {
        startLoadTimeout();
        video.src = url;
        video.play().catch(() => {});
      }
    } catch (err) {
      console.error('[LiveTV] Failed to init player', err);
      startLoadTimeout();
      video.src = url;
      video.play().catch(() => {});
    }

    return () => {
      closed = true;
      clearLoadTimeout();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      try {
        if (playOnMetadata) video.removeEventListener('loadedmetadata', playOnMetadata);
        video.removeEventListener('loadedmetadata', markReady);
        video.removeEventListener('loadeddata', markReady);
        video.removeEventListener('canplay', markReady);
        video.removeEventListener('playing', markReady);
        video.removeAttribute('src');
        video.load();
      } catch { /* noop */ }
    };
  }, [effectiveStreamUrl, selectedChannel?.id, useNativeLivePlayer, streamRetryNonce]);

  const retryLiveStream = useCallback(() => {
    // Manual: limpa o bloqueio só deste canal+url e força relançar (novo nonce).
    if (selectedChannel && effectiveStreamUrl) {
      clearChannelFailure(selectedChannel.id, effectiveStreamUrl);
    }
    lastNativeLaunchKeyRef.current = '';
    setLiveStreamError(null);
    setIsVideoReady(false);
    setStreamRetryNonce((value) => value + 1);
  }, [selectedChannel?.id, effectiveStreamUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navegação por número ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (numberBufferTimeoutRef.current) window.clearTimeout(numberBufferTimeoutRef.current);
      if (channelSwitchDebounceRef.current) window.clearTimeout(channelSwitchDebounceRef.current);
    };
  }, []);

  const handleNumberInput = (num: string) => {
    const newBuffer = numberBuffer + num;
    setNumberBuffer(newBuffer);
    if (numberBufferTimeoutRef.current) window.clearTimeout(numberBufferTimeoutRef.current);
    numberBufferTimeoutRef.current = window.setTimeout(() => {
      const ch = allChannels.find((c) => String(c.number) === newBuffer);
      if (ch) handleSelectChannel(ch);
      setNumberBuffer('');
      numberBufferTimeoutRef.current = null;
    }, 1200);
  };

  const infoOverlayTimeoutRef = useRef<number | null>(null);
  // Limpa timers no unmount (evita overlay "fantasma" após trocar rota)
  useEffect(() => {
    return () => {
      if (selectGuardTimeoutRef.current) {
        window.clearTimeout(selectGuardTimeoutRef.current);
        selectGuardTimeoutRef.current = null;
      }
      if (openInfoDelayRef.current) {
        window.clearTimeout(openInfoDelayRef.current);
        openInfoDelayRef.current = null;
      }
      if (openInfoDelay2Ref.current) {
        window.clearTimeout(openInfoDelay2Ref.current);
        openInfoDelay2Ref.current = null;
      }
      if (infoOverlayTimeoutRef.current) {
        window.clearTimeout(infoOverlayTimeoutRef.current);
        infoOverlayTimeoutRef.current = null;
      }
    };
  }, []);

  // ── Selecionar canal ─────────────────────────────────────────────────────
  const handleSelectChannel = (channel: PitoChannel) => {
    if (!channel) return;
    // Guard contra duplo Enter (TV Box físico pode disparar 2x em ~200ms)
    if (selectingChannelRef.current) return;
    selectingChannelRef.current = true;

    if (selectGuardTimeoutRef.current) {
      window.clearTimeout(selectGuardTimeoutRef.current);
      selectGuardTimeoutRef.current = null;
    }
    selectGuardTimeoutRef.current = window.setTimeout(() => {
      selectingChannelRef.current = false;
      selectGuardTimeoutRef.current = null;
    }, 600);

    // Trocar de canal limpa o erro VISUAL anterior (mas mantém o registro de
    // falhas, para o auto-zap continuar pulando canais que falharam há <2 min).
    resetLivePlaybackState();
    setIsInfoOverlayVisible(false);
    setIsMenuVisible(false);

    // Controle parental — adulto (normalizado para 'adultos')
    const isAdultCategory =
      channel.category === 'adultos' ||
      channel.category === 'adulto' ||
      channel.category === 'hot';
    if (!runtimeFlags.adultContentEnabled) {
      // Build de loja: bloqueia QUALQUER categoria adulta (inclui keywords
      // +18/xxx/adult via isAdultChannel canônico), sem expor PIN.
      if (isAdultCategory || isAdultChannel(channel.category ?? '')) {
        selectingChannelRef.current = false;
        return;
      }
    }
    if (isAdultCategory && !adultUnlocked) {
      selectingChannelRef.current = false;
      pendingAdultChannelRef.current = channel;
      setShowAdultPin(true);
      return;
    }

    setSelectedChannel(channel);

    // Cancelar todos os timers anteriores (refs separadas evitam sobrescrita)
    if (infoOverlayTimeoutRef.current) window.clearTimeout(infoOverlayTimeoutRef.current);
    if (openInfoDelayRef.current) window.clearTimeout(openInfoDelayRef.current);
    if (openInfoDelay2Ref.current) window.clearTimeout(openInfoDelay2Ref.current);

    openInfoDelayRef.current = window.setTimeout(() => {
      openInfoDelayRef.current = null;
      setIsMenuVisible(false);
      setFocusedSection(null);
      openInfoDelay2Ref.current = window.setTimeout(() => {
        openInfoDelay2Ref.current = null;
        setIsInfoOverlayVisible(true);
        infoOverlayTimeoutRef.current = window.setTimeout(() => {
          setIsInfoOverlayVisible(false);
          infoOverlayTimeoutRef.current = null;
        }, 10000);
      }, 500);
    }, 1000);
  };

  /** Nome público do fluxo de abrir canal (Enter/clique/zap manual). */
  const openLiveChannel = handleSelectChannel;

  const selectAdjacentLiveChannel = useCallback((direction: 1 | -1) => {
    const currentIndex = selectedChannel
      ? filteredChannels.findIndex((ch) => ch.id === selectedChannel.id)
      : focusedChannelIndex;
    const nextIndex = getAdjacentLiveTvChannelIndex({
      channelCount: filteredChannels.length,
      currentIndex,
      direction,
    });
    if (nextIndex >= 0 && filteredChannels[nextIndex]) {
      setFocusedSection('grid');
      setFocusedChannelIndex(nextIndex);
      handleSelectChannel(filteredChannels[nextIndex]);
    }
  }, [filteredChannels, focusedChannelIndex, selectedChannel]);

  // selectAdjacentLiveChannel muda de identidade a cada navegação de gênero
  // (deps filteredChannels/focusedChannelIndex). Mantemos em ref para que o
  // efeito de launch nativo NÃO o tenha como dependência — senão o efeito
  // re-rodaria a cada tecla do D-pad, re-exibindo o overlay de erro do canal
  // com falha recente (bug: "ao trocar o gênero sai da tela / pisca erro").
  const selectAdjacentLiveChannelRef = useRef(selectAdjacentLiveChannel);
  selectAdjacentLiveChannelRef.current = selectAdjacentLiveChannel;

  // TV Moderno: LiveTV abre via NativePlayerPlugin para receber retorno da Activity.
  // Nenhum <video> é montado no APK TV moderno; fallback HTML5 fica apenas web/legacy.
  useEffect(() => {
    if (!useNativeLivePlayer || !selectedChannel || !effectiveStreamUrl) return;

    const launchId = ++nativeLiveLaunchRef.current;
    let cancelled = false;

    const isBlobUrl = /^blob:/i.test(effectiveStreamUrl);
    const rawChannelUrl = currentRegion?.streamUrl ?? selectedChannel.streamUrl ?? '';
    const maskedRawChannelUrl = maskLiveTvUrlForLog(rawChannelUrl);
    const maskedEffectiveStreamUrl = maskLiveTvUrlForLog(effectiveStreamUrl);
    // eslint-disable-next-line no-console
    console.warn(`[LiveTV] canal clicado: ${selectedChannel.name} id=${selectedChannel.id}`);
    // eslint-disable-next-line no-console
    console.warn(`[LiveTV] raw url do Supabase: ${maskedRawChannelUrl}`);
    // eslint-disable-next-line no-console
    console.warn(`[LiveTV] url enviada ao Android: ${maskedEffectiveStreamUrl}`);
    // eslint-disable-next-line no-console
    console.warn(`[LiveTV] isBlobUrl: ${isBlobUrl}`);

    // Guard: nunca enviar blob: para o player nativo (URL.createObjectURL é local ao WebView).
    if (isBlobUrl) {
      // eslint-disable-next-line no-console
      console.error('[LiveTV] ERRO: URL blob não pode ser usada no ExoPlayer', effectiveStreamUrl);
      const fallback = rawChannelUrl && !/^blob:/i.test(rawChannelUrl) ? rawChannelUrl : '';
      if (!fallback) {
        setIsVideoReady(false);
        setLiveStreamError('URL inválida (blob) — canal sem fonte original.');
        setSignal('playerActive', false);
        return;
      }
      // eslint-disable-next-line no-console
      console.warn('[LiveTV] recuperando rawUrl do canal:', fallback);
    }

    const urlToPlay = isBlobUrl ? rawChannelUrl : effectiveStreamUrl;
    const maskedPlayUrl = maskLiveTvUrlForLog(urlToPlay);
    console.warn(`[LiveTV] opening channel number=${selectedChannel.number} name=${selectedChannel.name} url=${maskedPlayUrl}`);

    // Canal com falha recente (<2 min): mostra erro sem relançar (não martela edge morta).
    const recentNativeError = getRecentChannelFailure(selectedChannel.id, urlToPlay);
    if (recentNativeError) {
      console.warn(`[LiveTV] channel failed reason=native-last-error url=${maskedPlayUrl}`);
      console.warn('[LiveTV] UI error shown');
      setSignal('playerActive', false);
      setIsVideoReady(false);
      setIsMenuVisible(true);
      setFocusedSection('grid');
      setLiveStreamError(recentNativeError.message);
      return;
    }

    // Idempotência: não relançar a Activity para o mesmo canal+url+nonce se o efeito
    // re-rodar por troca de identidade de callback (selectAdjacentLiveChannel muda ref).
    const launchKey = `${selectedChannel.id}|${urlToPlay}|${streamRetryNonce}`;
    if (lastNativeLaunchKeyRef.current === launchKey) return;
    lastNativeLaunchKeyRef.current = launchKey;

    console.warn(`[NativePlayer] start live url=${maskedPlayUrl}`);
    setLiveStreamError(null);
    setIsVideoReady(true);
    setSignal('playerActive', true);

    void playNative({
      url: urlToPlay,
      title: selectedChannel.name,
      type: 'live',
      poster: selectedChannel.logo || '',
      logo: selectedChannel.logo || '',
      isLive: true,
    })
      .then((result) => {
        if (cancelled || nativeLiveLaunchRef.current !== launchId) return;
        setSignal('playerActive', false);

        if (result.error) {
          const message = result.errorMessage || LIVE_STREAM_UNAVAILABLE_MESSAGE;
          markChannelFailed(selectedChannel.id, urlToPlay, 'native-result-error', message);
          console.warn(`[LiveTV] channel failed reason=native-result-error url=${maskedPlayUrl}`);
          console.warn('[LiveTV] UI error shown');
          setIsVideoReady(false);
          setIsMenuVisible(true);
          setFocusedSection('grid');
          setLiveStreamError(message);
          return;
        }

        if (result.action === 'channelUp') {
          selectAdjacentLiveChannelRef.current(1);
          return;
        }
        if (result.action === 'channelDown') {
          selectAdjacentLiveChannelRef.current(-1);
          return;
        }

        setIsMenuVisible(true);
        setIsInfoOverlayVisible(false);
        setFocusedSection('grid');
      })
      .catch((err) => {
        if (cancelled || nativeLiveLaunchRef.current !== launchId) return;
        setSignal('playerActive', false);
        console.error('[LiveTV] Native live player failed:', err);
        const message = err instanceof Error && err.message
          ? err.message
          : LIVE_STREAM_UNAVAILABLE_MESSAGE;
        markChannelFailed(selectedChannel.id, urlToPlay, 'native-error', message);
        console.warn(`[LiveTV] channel failed reason=native-error url=${maskedPlayUrl}`);
        console.warn('[LiveTV] UI error shown');
        setIsVideoReady(false);
        setIsMenuVisible(true);
        setFocusedSection('grid');
        setLiveStreamError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [currentRegion?.streamUrl, effectiveStreamUrl, selectedChannel?.id, streamRetryNonce, useNativeLivePlayer]);

  const handleSelectCategory = (id: string) => {
    // Trocar categoria limpa o erro visual anterior (registro de falhas preservado).
    resetLivePlaybackState();
    setIsInfoOverlayVisible(false);
    setIsMenuVisible(true);
    setActiveCategory(id);
    // NÃO trocar selectedChannel ao escolher categoria — isso tocava o 1º canal do
    // gênero imediatamente (bug universal "trocar gênero já muda o canal"). Escolher
    // categoria apenas FILTRA a grade; o canal em reprodução continua. O canal só muda
    // quando o usuário seleciona um canal na grade (OK / handleSelectChannel).
    setFocusedChannelIndex(0);
    autoZapArmedRef.current = false; // entrar na grade por troca de gênero não auto-zapa
    setFocusedSection('grid');
    setIsSidebarExpanded(false);
    setIsGenreExpanded(true);
  };

  const toggleMenu = () => {
    if (isMenuVisible) {
      setIsMenuVisible(false);
      setIsInfoOverlayVisible(false);
      setFocusedSection(null);
    } else {
      // Cancelar timers do info overlay para reabrir imediatamente
      if (infoOverlayTimeoutRef.current) {
        window.clearTimeout(infoOverlayTimeoutRef.current);
        infoOverlayTimeoutRef.current = null;
      }
      if (openInfoDelayRef.current) {
        window.clearTimeout(openInfoDelayRef.current);
        openInfoDelayRef.current = null;
      }
      if (openInfoDelay2Ref.current) {
        window.clearTimeout(openInfoDelay2Ref.current);
        openInfoDelay2Ref.current = null;
      }
      setIsMenuVisible(true);
      setIsInfoOverlayVisible(false);
      // Abre direto no grid (canal já está selecionado)
      setFocusedSection('grid');
    }
  };

  // ── Sincroniza expansão da sidebar com a seção focada ────────────────────
  useEffect(() => {
    if (focusedSection === 'sidebar' || focusedSection === 'grid') {
      setIsSidebarExpanded(true);
      setIsGenreExpanded(true);
    } else {
      setIsSidebarExpanded(false);
    }
  }, [focusedSection]);

  // Auto-trocar categoria ao navegar pelo sidebar — canais do genero focado abrem
  // sem precisar de OK (feedback do usuario). Mantem sidebar focado: nao muda
  // focusedSection para 'grid' aqui (so OK/Direita movem para a grid).
  useEffect(() => {
    if (focusedSection !== 'sidebar') return;
    if (focusedCategoryIndex < 0) return;
    const cat = categories[focusedCategoryIndex];
    if (!cat || cat.id === activeCategory) return;
    setActiveCategory(cat.id);
    setFocusedChannelIndex(0);
    autoZapArmedRef.current = false; // navegar gênero na sidebar não auto-zapa
    setIsGenreExpanded(true);
    // Limpa o overlay de erro do canal anterior ao trocar de gênero — senão o
    // erro de um canal com edge morto fica "preso" sobre o menu enquanto navega.
    resetLivePlaybackState();
    // NÃO trocar selectedChannel ao focar um gênero — em NENHUM ambiente.
    // Antes, no path não-nativo (web/desktop/Firestick) isto setava selectedChannel,
    // e o efeito de HLS (dep selectedChannel?.id) tocava o 1º canal do gênero só ao
    // navegar pelo menu lateral — bug: "trocar o gênero já mudava o canal".
    // Fluxo IPTV correto (igual ao nativo): focar gênero apenas FILTRA a grade; o
    // canal só muda ao entrar na grade (auto-zap 600ms) ou via OK (handleSelectChannel).
    // O info card mantém o canal em reprodução enquanto o usuário navega o guia.
  }, [focusedCategoryIndex, focusedSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-zap: ao parar sobre um canal na grade por 600ms, abre o player nativo
  // automaticamente. Substitui necessidade de OK e replica comportamento de
  // zapping de IPTV. Debounce evita lancar Activity a cada tick do D-pad.
  // Só dispara após navegação REAL do usuário na grade (autoZapArmedRef). Entrar na
  // grade por troca de gênero NÃO arma — senão o 1º canal do gênero tocava sozinho
  // ("trocar gênero já muda o canal"). O canal só muda em navegação real ou OK.
  useEffect(() => {
    if (focusedSection !== 'grid') return;
    if (!autoZapArmedRef.current) return;
    if (liveStreamError) return;
    if (focusedChannelIndex < 0) return;
    const ch = filteredChannels[focusedChannelIndex];
    if (!ch) return;
    // Canal já selecionado (carregando ou tocando): não relançar via foco.
    if (selectedChannel?.id === ch.id) return;
    // Outro canal ainda carregando: não interromper. Só Enter/ChannelUp/ChannelDown/
    // clique trocam de canal durante o carregamento (ações explícitas do usuário).
    if (selectedChannel && !isVideoReady) return;
    // Falha recente (<2 min) deste canal+url: pula auto-zap (não martela edge morta).
    if (shouldSkipAutoZap(ch.id, baseStreamUrlOf(ch))) {
      console.warn('[LiveTV] auto-zap skipped due to recent error');
      return;
    }
    const t = window.setTimeout(() => {
      handleSelectChannel(ch);
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSection, focusedChannelIndex, filteredChannels, liveStreamError, selectedChannel, isVideoReady]);

  // ── Navegação por teclado ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (showAdultPin) return;

      // Com overlay de info visível, não roubar o primeiro D-pad (botão EPG / leitura)
      const shouldOpenMenuForKey = [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Enter',
        'ContextMenu', // botão Menu do controle remoto Android (keycode 82)
      ].includes(key);

      // Qualquer tecla de navegação reabre o menu — mesmo que o overlay de info esteja visível
      if (!isMenuVisible && shouldOpenMenuForKey) {
        // Cancelar timers pendentes do info overlay
        if (infoOverlayTimeoutRef.current) {
          window.clearTimeout(infoOverlayTimeoutRef.current);
          infoOverlayTimeoutRef.current = null;
        }
        if (openInfoDelayRef.current) {
          window.clearTimeout(openInfoDelayRef.current);
          openInfoDelayRef.current = null;
        }
        if (openInfoDelay2Ref.current) {
          window.clearTimeout(openInfoDelay2Ref.current);
          openInfoDelay2Ref.current = null;
        }
        setIsMenuVisible(true);
        setIsInfoOverlayVisible(false);
        setFocusedSection('grid');
        // Não damos 'return' aqui para que a tecla pressionada já seja processada abaixo
      }

      if (key >= '0' && key <= '9') {
        handleNumberInput(key);
        return;
      }

      switch (key) {
        case 'ArrowUp':
          e.preventDefault();
          if (focusedSection === 'sidebar') {
            setFocusedCategoryIndex((p) => (p <= -1 ? categories.length - 1 : p - 1));
          } else if (focusedSection === 'grid') {
            autoZapArmedRef.current = true; // navegação real do usuário → permite auto-zap
            setFocusedChannelIndex((p) => Math.max(0, p - 1));
          } else if (focusedSection === 'states' || focusedSection === 'qualities') {
            setFocusedSection('grid');
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (focusedSection === 'sidebar') {
            setFocusedCategoryIndex((p) => (p >= categories.length - 1 ? 0 : p + 1));
          } else if (focusedSection === 'grid') {
            autoZapArmedRef.current = true; // navegação real do usuário → permite auto-zap
            setFocusedChannelIndex((p) => Math.min(filteredChannels.length - 1, p + 1));
          } else if (focusedSection === 'states' || focusedSection === 'qualities') {
            setFocusedSection('grid');
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (focusedSection === 'sidebar') {
            // Categoria já está ativa (sincronizada pelo useEffect acima); apenas entra no grid
            setFocusedSection('grid');
            setFocusedChannelIndex(0);
            setIsGenreExpanded(true);
            setIsSidebarExpanded(true);
          } else if (focusedSection === 'grid') {
            // Se canal tem regiões, mover foco para o seletor de estados; senão, para qualidades.
            if (selectedChannel?.regions && selectedChannel.regions.length > 1) {
              setFocusedSection('states');
              setFocusedStateIndex(0);
            } else if (currentQualities.length > 1) {
              setFocusedSection('qualities');
              setFocusedQualityIndex(0);
            }
          } else if (focusedSection === 'states') {
            const regionCount = selectedChannel?.regions?.length ?? 0;
            if (focusedStateIndex < regionCount - 1) {
              setFocusedStateIndex((p) => p + 1);
            } else if (currentQualities.length > 1) {
              setFocusedSection('qualities');
              setFocusedQualityIndex(0);
            }
          } else if (focusedSection === 'qualities') {
            const qualityCount = currentQualities.length;
            setFocusedQualityIndex((p) => Math.min(qualityCount - 1, p + 1));
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (focusedSection === 'grid') {
            setFocusedSection('sidebar');
            setIsSidebarExpanded(true);
          } else if (focusedSection === 'states') {
            if (focusedStateIndex > 0) {
              setFocusedStateIndex((p) => p - 1);
            } else {
              setFocusedSection('grid');
            }
          } else if (focusedSection === 'qualities') {
            if (focusedQualityIndex > 0) {
              setFocusedQualityIndex((p) => p - 1);
            } else if (selectedChannel?.regions && selectedChannel.regions.length > 1) {
              setFocusedSection('states');
              setFocusedStateIndex((selectedChannel.regions.length ?? 1) - 1);
            } else {
              setFocusedSection('grid');
            }
          }
          break;
        case 'ChannelUp':
        case 'ChannelDown': {
          e.preventDefault();
          const chDir = key === 'ChannelUp' ? 1 : -1;
          // Debounce: cancela troca anterior — aguarda 600ms quieto (mais responsivo que 800ms)
          if (channelSwitchDebounceRef.current !== null) {
            window.clearTimeout(channelSwitchDebounceRef.current);
          }
          channelSwitchDebounceRef.current = window.setTimeout(() => {
            channelSwitchDebounceRef.current = null;
            const currentIndex = selectedChannel
              ? filteredChannels.findIndex((ch) => ch.id === selectedChannel.id)
              : focusedChannelIndex;
            const nextIndex = getAdjacentLiveTvChannelIndex({
              channelCount: filteredChannels.length,
              currentIndex,
              direction: chDir,
            });
            if (nextIndex >= 0 && filteredChannels[nextIndex]) {
              setFocusedSection('grid');
              setFocusedChannelIndex(nextIndex);
              handleSelectChannel(filteredChannels[nextIndex]);
            }
          }, 600);
          break;
        }
        case 'Enter':
          e.preventDefault();
          if (focusedSection === 'sidebar') {
            if (focusedCategoryIndex === -1) {
              handleExitToHome();
            } else {
              handleSelectCategory(categories[focusedCategoryIndex]?.id || '');
            }
          } else if (focusedSection === 'grid' && filteredChannels[focusedChannelIndex]) {
            handleSelectChannel(filteredChannels[focusedChannelIndex]);
          } else if (focusedSection === 'states') {
            const regions = selectedChannel?.regions ?? [];
            const region = regions[focusedStateIndex];
            if (region) {
              setActiveRegion(region.state);
              setActiveQuality(null);
              setFocusedSection('grid');
            }
          } else if (focusedSection === 'qualities') {
            const quality = currentQualities[focusedQualityIndex];
            if (quality) {
              setActiveQuality(quality.label);
              setFocusedSection('grid');
            }
          }
          break;
        case 'ContextMenu':
          // Botão Menu do controle remoto (keycode 82): toggle menu de canais
          e.preventDefault();
          if (isMenuVisible) {
            setIsMenuVisible(false);
            setIsInfoOverlayVisible(false);
            setFocusedSection(null);
          } else {
            if (infoOverlayTimeoutRef.current) {
              window.clearTimeout(infoOverlayTimeoutRef.current);
              infoOverlayTimeoutRef.current = null;
            }
            if (openInfoDelayRef.current) {
              window.clearTimeout(openInfoDelayRef.current);
              openInfoDelayRef.current = null;
            }
            if (openInfoDelay2Ref.current) {
              window.clearTimeout(openInfoDelay2Ref.current);
              openInfoDelay2Ref.current = null;
            }
            setIsMenuVisible(true);
            setIsInfoOverlayVisible(false);
            setFocusedSection('grid');
          }
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          e.stopPropagation(); // impede que o back chegue ao useSpatialNavigation global
          if (!isMenuVisible) {
            // Canal em tela cheia: 1º back reabre menu de canais
            if (infoOverlayTimeoutRef.current) {
              window.clearTimeout(infoOverlayTimeoutRef.current);
              infoOverlayTimeoutRef.current = null;
            }
            setIsMenuVisible(true);
            setIsInfoOverlayVisible(false);
            setFocusedSection('grid');
          } else {
            // Menu já aberto: sai pra home
            handleExitToHome();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [
    isMenuVisible,
    focusedSection,
    focusedCategoryIndex,
    focusedChannelIndex,
    focusedStateIndex,
    focusedQualityIndex,
    filteredChannels,
    numberBuffer,
    categories,
    showAdultPin,
    isInfoOverlayVisible,
    handleExitToHome,
    handleSelectChannel,
    selectedChannel?.id,
    selectedChannel?.regions,
    currentQualities,
  ]);

  // Regras de estado
  useEffect(() => {
    if (isMenuVisible) setIsInfoOverlayVisible(false);
  }, [isMenuVisible]);

  // ── Botão físico de Back no Android (Capacitor via GlobalRemoteHandler) ──
  // GlobalRemoteHandler despacha 'redx-native-back' antes de navegar para Home.
  // LiveTV intercepta o evento para: fechar o guia se aberto, ou sair para Home.
  useEffect(() => {
    const handleNativeBack = (e: Event) => {
      e.preventDefault(); // sinaliza ao goBackInsideApp() que foi tratado
      if (!isMenuVisible) {
        if (infoOverlayTimeoutRef.current) {
          window.clearTimeout(infoOverlayTimeoutRef.current);
          infoOverlayTimeoutRef.current = null;
        }
        setIsMenuVisible(true);
        setIsInfoOverlayVisible(false);
        setFocusedSection('grid');
      } else {
        handleExitToHome();
      }
    };
    window.addEventListener('redx-native-back', handleNativeBack);
    return () => window.removeEventListener('redx-native-back', handleNativeBack);
  }, [isMenuVisible, handleExitToHome]);

  // ── Controle parental ────────────────────────────────────────────────────
  const handleAdultPinSuccess = useCallback(() => {
    markAdultUnlocked();
    setAdultUnlocked(true);
    setShowAdultPin(false);
    // Tenta reselecionar o canal que estava pendente
    if (pendingAdultChannelRef.current) {
      handleSelectChannel(pendingAdultChannelRef.current);
      pendingAdultChannelRef.current = null;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdultPinCancel = useCallback(() => {
    setShowAdultPin(false);
    pendingAdultChannelRef.current = null;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // EARLY RETURNS — DEPOIS de TODOS os hooks para evitar React Error #310
  // ═══════════════════════════════════════════════════════════════════════════

  if (!isLoading && allChannels.length === 0) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center"
        style={{ background: LIVETV_BACKDROP_BG }}
      >
        <div className="livetv-vision-boot w-full max-w-md px-8 py-10 flex flex-col items-center gap-5">
          <img
            src="/logored.webp"
            alt="Redflix"
            className="h-14 w-auto object-contain opacity-90"
          />
          <p className="text-white/85 text-lg font-bold">
            {channelLoadError ? 'Erro ao carregar canais' : 'Nenhum canal disponível'}
          </p>
          <p className="text-white/45 text-sm">
            {channelLoadError
              ? channelLoadError
              : 'Verifique a internet, o .env (Supabase) e se a tabela de canais tem dados.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              type="button"
              autoFocus
              tabIndex={0}
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-2xl bg-white/12 border border-white/20 text-white font-bold hover:bg-white/16 focus:outline-none focus:ring-2 focus:ring-purple-400/60 transition-colors"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              tabIndex={0}
              onClick={handleExitToHome}
              className="px-6 py-3 rounded-2xl text-white/55 text-sm font-semibold hover:text-white/80 focus:outline-none focus:ring-2 focus:ring-white/30 transition-colors"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading (até dados estarem prontos)
  if (isLoading) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8 overflow-hidden"
        style={LIVETV_LOADING_SURFACE}
      >
        {/* Vinheta como background em segundo plano.
            WebView nativo (TV box) não reproduz o <video> (aparecia símbolo quebrado),
            então usa um frame estático da vinheta. No web/desktop toca o vídeo. */}
        {isNativePlatform() ? (
          <img
            src="/vinheta-poster.webp"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: 0 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <video
            src={LIVETV_INTRO_VINHETA_URLS[0]}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: 0 }}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            onError={(e) => {
              (e.currentTarget as HTMLVideoElement).style.display = 'none';
            }}
          />
        )}
        {/* Escurecido + tom roxo para contraste do card sobre a vinheta */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 1,
            background:
              'radial-gradient(ellipse at center, rgba(30,10,60,0.45) 0%, rgba(0,0,0,0.72) 100%)',
          }}
          aria-hidden
        />
        {/* Card translúcido roxo com a logo REDX (sem blur — perf TV) */}
        <div
          className="relative z-10 px-12 py-12 flex flex-col items-center gap-6 rounded-[28px]"
          style={{
            background: 'var(--exit-glass-bg)',
            border: '1px solid var(--exit-glass-border)',
            boxShadow: 'var(--exit-glass-shadow)',
          }}
        >
          <img
            src="/logored.webp"
            alt="Redflix"
            className="h-14 w-auto object-contain opacity-90"
          />
          <div
            className="h-10 w-10 rounded-full animate-spin"
            style={{
              border: '2px solid rgba(255,255,255,0.12)',
              borderTopColor: 'rgba(192,132,252,0.95)',
            }}
            aria-hidden
          />
          <p className="text-white/60 text-xs font-semibold uppercase tracking-[0.2em]">
            Carregando canais…
          </p>
        </div>
      </div>
    );
  }

  // Estados de loading / vazio / erro já tratados acima com UI estilizada (glass + retry).
  // Erro transitório COM canais presentes: mantém a grade renderizada; o overlay por-stream
  // cuida de falha de reprodução (sem tomar a tela inteira com debug cru).

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 overflow-hidden font-sans antialiased"
      style={{ background: 'transparent' }}
    >
      {/* Vídeo de fundo — WebView HLS.js OU NativePlayerPlugin (TV Moderno).
          Em build TV nativo, <video> NÃO é montado. */}
      <div className="live-tv-video absolute inset-0 z-0" onClick={toggleMenu}>
        {!useNativeLivePlayer && (
          <video
            ref={(el) => {
              (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
              if (el) {
                el.controls = false;
                el.autoplay = true;
                el.playsInline = true;
                el.setAttribute('playsinline', 'true');
                el.setAttribute('webkit-playsinline', 'true');
                el.setAttribute('disableremoteplayback', 'true');
                el.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback noplaybackrate');
              }
            }}
            autoPlay
            playsInline
            preload="auto"
            controls={false}
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            className="redx-live-video w-full h-full object-contain"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              backgroundColor: 'transparent',
              display: effectiveStreamUrl ? 'block' : 'none',
            }}
            onError={handleVideoElementError}
            onLoadedMetadata={() => setIsVideoReady(true)}
            onLoadedData={() => setIsVideoReady(true)}
            onCanPlay={() => setIsVideoReady(true)}
            onPlaying={() => setIsVideoReady(true)}
            onTimeUpdate={() => setIsVideoReady(true)}
          />
        )}
        {/* Spinner enquanto stream carrega — some quando vídeo tem dados */}
        {selectedChannel && effectiveStreamUrl && !isVideoReady && !liveStreamError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div
              className="w-10 h-10 rounded-full animate-spin"
              style={{ border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'rgba(192,132,252,0.9)' }}
              aria-hidden
            />
            <span className="text-white/40 text-xs font-semibold uppercase tracking-[0.2em]">
              Carregando…
            </span>
          </div>
        )}
        {liveStreamError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-8 text-center">
            <div className="livetv-vision-boot max-w-md px-8 py-7">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45 mb-3">
                Canal indisponível
              </p>
              <p className="text-white/85 text-lg font-black mb-6">
                {liveStreamError}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  autoFocus
                  onClick={retryLiveStream}
                  onKeyDown={(e) => {
                    const k = normalizeRemoteKey(e as unknown as KeyboardEvent);
                    if (k === 'Enter') retryLiveStream();
                  }}
                  className="px-6 py-3 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-[0.18em] outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={() => selectAdjacentLiveChannel(1)}
                  onKeyDown={(e) => {
                    const k = normalizeRemoteKey(e as unknown as KeyboardEvent);
                    if (k === 'Enter') selectAdjacentLiveChannel(1);
                  }}
                  className="px-6 py-3 rounded-xl bg-white/12 border border-white/25 text-white text-xs font-black uppercase tracking-[0.18em] outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 hover:bg-white/18 transition-colors"
                >
                  Próximo canal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Logo do canal + seletor de estado/qualidade */}
      {selectedChannel && (
        <AnimatePresence>
          {isMenuVisible && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-10 right-10 z-10 flex flex-col items-end gap-2"
            >
              <div className="livetv-vision-floating-header flex items-center gap-4 pointer-events-none px-5 py-3">
                {selectedChannel.logo && (
                  <img
                    src={selectedChannel.logo}
                    alt={selectedChannel.name}
                    className="h-12 object-contain brightness-200"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = LOCAL_CHANNEL_PLACEHOLDER;
                    }}
                  />
                )}
                <span className="text-2xl font-black text-white/80 uppercase tracking-tighter">
                  {selectedChannel.name}
                </span>
              </div>

              {/* Seletor de ESTADO — aparece apenas em canais regionais */}
              {selectedChannel.regions && selectedChannel.regions.length > 1 && (
                <div className="flex items-center gap-1 flex-wrap justify-end max-w-xs pointer-events-auto">
                  {selectedChannel.regions.map((r, idx) => {
                    const isActive =
                      activeRegion === r.state ||
                      (activeRegion === null && r.state === selectedChannel.regions![0].state);
                    const isFocusedState = focusedSection === 'states' && focusedStateIndex === idx;
                    return (
                      <button
                        key={r.state}
                        title={r.affiliateLabel}
                        onClick={() => {
                          setActiveRegion(r.state);
                          setActiveQuality(null);
                        }}
                        tabIndex={focusedSection === 'states' ? 0 : -1}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase transition-all outline-none ${
                          isFocusedState
                            ? 'bg-white text-purple-700 scale-110 shadow-[0_0_0_2px_rgba(167,139,250,0.8)]'
                            : isActive
                            ? 'bg-purple-600 text-white'
                            : 'bg-purple-700/70 text-white hover:bg-purple-600 hover:text-white'
                        }`}
                      >
                        {r.state}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Seletor de QUALIDADE — aparece se houver mais de 1 variante */}
              {currentQualities.length > 1 && (
                <div className="flex items-center gap-1 pointer-events-auto">
                  {currentQualities.map((q, idx) => {
                    const isCurrent =
                      activeQuality === null
                        ? q.streamUrl === (currentRegion?.streamUrl ?? selectedChannel.streamUrl)
                        : activeQuality === q.label;
                    const isFocusedQuality =
                      focusedSection === 'qualities' && focusedQualityIndex === idx;
                    return (
                      <button
                        key={q.label}
                        onClick={() => {
                          setActiveQuality(q.label);
                          setFocusedSection('qualities');
                          setFocusedQualityIndex(idx);
                        }}
                        tabIndex={focusedSection === 'qualities' ? 0 : -1}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase transition-all outline-none ${
                          isFocusedQuality
                            ? 'bg-white text-blue-700 scale-110 shadow-[0_0_0_2px_rgba(96,165,250,0.85)]'
                            : isCurrent
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                        }`}
                        aria-pressed={isCurrent}
                        title={`Qualidade ${q.label}`}
                      >
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Interface principal */}
      <div className="relative z-20 flex w-full h-full pointer-events-none">
        <AnimatePresence>
          {isMenuVisible && (
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="flex h-full pointer-events-auto w-full md:w-auto gap-2 pl-2"
            >
              {focusedSection === 'sidebar' && (
                <PitoSidebar
                  categories={categories}
                  activeCategory={activeCategory}
                  onSelectCategory={handleSelectCategory}
                  isExpanded={isSidebarExpanded}
                  onToggleExpand={() => setIsSidebarExpanded((p) => !p)}
                  focusedIndex={focusedCategoryIndex}
                  isFocused
                />
              )}

              <AnimatePresence mode="wait">
                {isGenreExpanded && (
                  <PitoChannelGrid
                    channels={filteredChannels}
                    onSelectChannel={openLiveChannel}
                    activeCategoryName={activeCategoryName}
                    selectedChannelId={selectedChannel?.id}
                    focusedIndex={focusedChannelIndex}
                    isFocused={focusedSection === 'grid'}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {isInfoOverlayVisible && selectedChannel && (
          <PitoChannelInfoOverlay channel={selectedChannel} />
        )}
      </AnimatePresence>

      {/* Indicador de número de canal */}
      <AnimatePresence>
        {numberBuffer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none"
          >
            <div className="livetv-vision-numpad px-16 py-10 flex flex-col items-center justify-center">
              <span className="text-sm font-bold uppercase tracking-[0.3em] mb-2" style={{ color: 'rgba(192, 132, 252, 0.85)' }}>
                Canal
              </span>
              <span className="text-9xl font-black tracking-widest tabular-nums leading-none" style={{ color: '#e9d5ff', textShadow: '0 4px 30px rgba(167,139,250,0.55)' }}>
                {numberBuffer}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal controle parental — numpad TV-friendly */}
      {showAdultPin && (
        <AdultPinModal onSuccess={handleAdultPinSuccess} onCancel={handleAdultPinCancel} />
      )}


    </div>
  );
}
