/**
 * Extensões tipadas da interface Window
 *
 * Elimina o uso de (window as any) em todo o projeto.
 * Auditoria: 132 ocorrências substituídas por propriedades tipadas.
 */

declare global {
  interface Window {
    // ── Navegação espacial / TV Mode ──────────────────────────────
    /** Indica que a navegação espacial por D-pad está ativa */
    __spatialNavEnabled?: boolean;
    /** Profundidade de armadilha de modal (contador de modais abertos) */
    __modalTrapDepth?: number;
    /** Indica que o foco está bloqueado dentro de um card/modal */
    __modalKeyTrap?: boolean;
    /** Indica que o menu de perfil está aberto */
    __profileMenuOpen?: boolean;
    /** Indica que a sidebar está com foco */
    __sidebarFocused?: boolean;
    /** Indica que a busca está ativa */
    __searchActive?: boolean;

    // ── Estado do Player ──────────────────────────────────────────
    /** Player de vídeo está ativo (intercepta teclas de seta) */
    __playerActive?: boolean;
    /** Live TV está ativa */
    __livetvActive?: boolean;
    /** Tela Adulto está ativa */
    __adultoActive?: boolean;

    // ── Estado de páginas ─────────────────────────────────────────
    /** Details page está ativa (intercepta teclas) */
    __detailsActive?: boolean;
    /** Profiles page está ativa */
    __profilesActive?: boolean;
    /** Tela "Quem está assistindo?" (seleção de perfil pós-login) */
    __whoIsWatchingActive?: boolean;
    /** App pode ser encerrado com Back */
    __canExitApp?: boolean;
    /** Callback de back a partir de Details, registrado por LegacyApp */
    __redxBackFromDetails?: (() => void) | null;
    /** Último erro JavaScript (debug) */
    __lastError?: { error: string; stack?: string; componentStack?: unknown };
    /** Solicita saída do app (modal de confirmação) */
    __requestExitApp?: () => void;
    /** Exibe modal de confirmação de saída */
    __showExitConfirmModal?: () => void;
    /** Remove o listener de confirmação de saída */
    __unregisterExitConfirm?: () => void;

    // ── Boot / Carregamento ───────────────────────────────────────
    /** Home catalog carregado e pronto */
    __REDX_HOME_READY?: boolean;
    /** Live TV pronto */
    __REDX_LIVE_READY?: boolean;
    /** Vinheta pronta */
    __REDX_VINHETA_READY?: boolean;
    /** Tela de login ativa (foco / teclado) */
    __loginActive?: boolean;
    /** Callback para marcar home como pronta */
    __MARK_HOME_READY?: () => void;
    /** Callback para marcar Live TV como pronta */
    __MARK_LIVE_READY?: () => void;
    /** Callback de loading global (injetado por LegacyApp) */
    __setGlobalLoading?: (loading: boolean) => void;
    /** MainActivity Android injeta teclas D-pad */
    __dispatchTVKey__?: (key: string) => void;
    /** Info injetada pelo WebView Android */
    __ANDROID_VERSION__?: number;
    __DEVICE_NAME__?: string;
    __MANUFACTURER__?: string;
    __DEVICE_INFO__?: Record<string, unknown>;
    __DEVICE_CONFIG?: Record<string, unknown>;
    __DEVICE_DETECTOR?: Record<string, unknown>;
    __IMAGE_CACHE_MANAGER?: Record<string, unknown>;
    __reactRouterVersion?: string;
    __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: (...args: unknown[]) => unknown;
    __redx_paused_by_system__?: boolean;

    // ── APIs de plataforma ────────────────────────────────────────
    /** Capacitor (disponível em ambiente Android/iOS nativo) */
    Capacitor?: {
      getPlatform?: () => string;
      isNativePlatform?: () => boolean;
      [key: string]: unknown;
    };

    // ── Web APIs com prefixo vendor / opcionais ───────────────────
    /** AudioContext com prefixo webkit (Safari) */
    webkitAudioContext?: typeof AudioContext;

    // ── Anti-scraping (detecção de bots) ─────────────────────────
    callPhantom?: unknown;
    _phantom?: unknown;
    __nightmare?: unknown;
    chrome?: {
      runtime?: unknown;
      [key: string]: unknown;
    };
  }
}

export {};
