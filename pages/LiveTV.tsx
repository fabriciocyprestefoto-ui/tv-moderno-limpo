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
} from '@/pages/livetv/AdultPinModal';

import { setSignal } from '@/utils/appSignals';
import { getAdjacentLiveTvChannelIndex } from '@/utils/liveTvControls';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';
import { runtimeFlags } from '@/config/runtimeFlags';
import { isNativePlatform, playNative } from '@/services/nativePlayerService';

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
        const adapted = adaptChannels(raw);
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
  const [adultUnlocked, setAdultUnlocked] = useState(() => isAdultUnlocked());
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
  const useNativeLivePlayer = runtimeFlags.isTvBuild && isNativePlatform();
  const nativeLiveLaunchRef = useRef(0);

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
    setLiveStreamError('Falha ao carregar este canal.');
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

    setLiveStreamError(null);
    setIsVideoReady(false);
    video.muted = false;

    const url = effectiveStreamUrl;
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

    // Static import (sem dynamic import) — Android 5 WebView (Chromium 37-39)
    // não suporta dynamic import. plugin-legacy transpila o resto.
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
            else hls.destroy();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
        // Fallback Safari / native HLS
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
      console.error('[LiveTV] Failed to init player', err);
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
  }, [effectiveStreamUrl, useNativeLivePlayer]);

  const retryLiveStream = useCallback(() => {
    setLiveStreamError(null);
    setIsVideoReady(false);
    // força reload do effect via toggle de src
    const v = videoRef.current;
    if (v && effectiveStreamUrl) {
      try {
        v.src = effectiveStreamUrl;
        v.load();
        void v.play().catch(() => {});
      } catch { /* noop */ }
    }
  }, [effectiveStreamUrl]);

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

    // Limpa overlays antes de trocar canal
    setIsInfoOverlayVisible(false);
    setIsMenuVisible(false);
    setLiveStreamError(null);
    setIsVideoReady(false);

    // Controle parental — adulto (normalizado para 'adultos')
    if (
      (channel.category === 'adultos' ||
        channel.category === 'adulto' ||
        channel.category === 'hot') &&
      !adultUnlocked
    ) {
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

  // TV Moderno: LiveTV abre via NativePlayerPlugin para receber retorno da Activity.
  // Nenhum <video> é montado no APK TV moderno; fallback HTML5 fica apenas web/legacy.
  useEffect(() => {
    if (!useNativeLivePlayer || !selectedChannel || !effectiveStreamUrl) return;

    const launchId = ++nativeLiveLaunchRef.current;
    let cancelled = false;
    setLiveStreamError(null);
    setIsVideoReady(true);
    setSignal('playerActive', true);

    void playNative({
      url: effectiveStreamUrl,
      title: selectedChannel.name,
      type: 'live',
      poster: selectedChannel.logo || '',
      logo: selectedChannel.logo || '',
      isLive: true,
    })
      .then((result) => {
        if (cancelled || nativeLiveLaunchRef.current !== launchId) return;
        setSignal('playerActive', false);

        if (result.action === 'channelUp') {
          selectAdjacentLiveChannel(1);
          return;
        }
        if (result.action === 'channelDown') {
          selectAdjacentLiveChannel(-1);
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
        setIsVideoReady(false);
        setIsMenuVisible(true);
        setFocusedSection('grid');
        setLiveStreamError(err instanceof Error ? err.message : 'Falha ao abrir o canal.');
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveStreamUrl, selectedChannel?.id, useNativeLivePlayer, selectAdjacentLiveChannel]);

  const handleSelectCategory = (id: string) => {
    // Limpa overlays ao trocar categoria
    setIsInfoOverlayVisible(false);
    setIsMenuVisible(true);
    setActiveCategory(id);
    const firstChannel = allChannels.find((c) => c.category === id);
    if (firstChannel) {
      setSelectedChannel(firstChannel);
    }
    setFocusedChannelIndex(0);
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
    setIsGenreExpanded(true);
    // Sinaliza primeiro canal do genero como "selecionado" para o info card refletir
    // o genero atual; nao lanca Activity (so o OK / hover-na-grid lanca).
    const firstChannel = allChannels.find((c) => c.category === cat.id);
    if (firstChannel) setSelectedChannel(firstChannel);
  }, [focusedCategoryIndex, focusedSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-zap: ao parar sobre um canal na grade por 600ms, abre o player nativo
  // automaticamente. Substitui necessidade de OK e replica comportamento de
  // zapping de IPTV. Debounce evita lancar Activity a cada tick do D-pad.
  useEffect(() => {
    if (focusedSection !== 'grid') return;
    if (focusedChannelIndex < 0) return;
    const ch = filteredChannels[focusedChannelIndex];
    if (!ch) return;
    if (selectedChannel?.id === ch.id && isVideoReady) return;
    const t = window.setTimeout(() => {
      handleSelectChannel(ch);
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSection, focusedChannelIndex, filteredChannels]);

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
        <div className="livetv-vision-boot relative z-10 w-full max-w-sm px-10 py-12 flex flex-col items-center gap-6">
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
          <p className="text-white/50 text-xs font-semibold uppercase tracking-[0.2em]">
            Carregando canais…
          </p>
        </div>
      </div>
    );
  }

  // ── Debug overlay (sem ADB, único feedback visual) ───────────────────────
  if (isLoading || channelLoadError || allChannels.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'sans-serif',
          textAlign: 'center',
          gap: 12,
          zIndex: 99999,
        }}
      >
        <p style={{ fontSize: 16, fontWeight: 700 }}>
          {isLoading ? 'Carregando canais…' : channelLoadError ? 'Erro' : 'Sem canais'}
        </p>
        {channelLoadError && (
          <p style={{ fontSize: 12, opacity: 0.7, maxWidth: 600 }}>{channelLoadError}</p>
        )}
        {!isLoading && !channelLoadError && (
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Lista de canais retornou vazia. Verifique permissões no Supabase ou
            conexão de rede da TV.
          </p>
        )}
        <button
          type="button"
          onClick={() => window.history.back()}
          style={{
            marginTop: 12,
            padding: '10px 22px',
            background: '#A855F7',
            color: '#fff',
            border: 0,
            borderRadius: 10,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Voltar
        </button>
      </div>
    );
  }

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
                    onSelectChannel={handleSelectChannel}
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
