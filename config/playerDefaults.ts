/**
 * config/playerDefaults.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Constantes do Player centralizadas.
 * Antes estavam hardcoded em pages/Player.tsx como magic numbers.
 *
 * Centralizando aqui:
 *   1. Fácil de tunar sem abrir o componente
 *   2. Possibilidade futura de carregar esses valores de uma config remota
 *   3. Documenta o "por quê" de cada valor
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Milliseconds após o último input antes de esconder os controles automaticamente. */
export const PLAYER_AUTO_HIDE_MS = 5_000;

/**
 * Segundos de seek ao pressionar ◄◄ / ►► no controle remoto.
 * Padrão da indústria para AndroidTV / Fire TV / Apple TV.
 */
export const PLAYER_SEEK_STEP_SEC = 30;

/** Intervalo do heartbeat de save-progress (ms). */
export const PLAYER_HEARTBEAT_MS = 10_000;

/**
 * Vinheta em tela cheia antes de abrir detalhes de filme/série (clique no poster).
 * Arquivo em `public/vinheta-tv.mp4` (H.264 Baseline leve para TVBox antiga).
 */
export const DETAILS_VINHETA_VIDEO_URL = 'vinheta-tv.mp4';

/**
 * Cache-buster estável para a vinheta.
 *
 * Usar Date.now() aqui faz a WebView enxergar "outra vinheta" em cada carga do
 * bundle, o que facilita piscar/alternar cache antigo antes da fonte correta.
 * A versão do app muda apenas quando geramos um novo build.
 */
const VINHETA_CACHE_BUSTER = `v=${encodeURIComponent(import.meta.env.VITE_APP_VERSION || '1')}`;

/**
 * Tempo máximo da vinheta de detalhes se `ended` não ocorrer (codec, ficheiro em falta).
 * 8s garante preload completo do servidor antes de abrir filmes/séries.
 * Também é o tempo MÍNIMO garantido (MIN_DISPLAY_MS = FAILSAFE_MS em VinhetaGate).
 */
export const DETAILS_VINHETA_MAX_MS = 8_000;

/** URL absoluta da vinheta na raiz pública (`public/vinheta-tv.mp4`) com cache-buster. */
export function getDetailsVinhetaSrc(): string {
  const file = DETAILS_VINHETA_VIDEO_URL.replace(/^\//, '');
  return `/${file}?${VINHETA_CACHE_BUSTER}`;
}

/**
 * Vinheta opcional: só o Player usa se `Media.introVideoUrl` estiver definido.
 * Todos os fluxos (Kids, etc.) usam a vinheta.mp4 unificada.
 * Cache-buster garante que o browser/WebView sempre busca o ficheiro atualizado.
 */
export const PLAYER_INTRO_VIDEO_URL = `/vinheta-tv.mp4?${VINHETA_CACHE_BUSTER}`;

/** Vinheta ao dar play em filme a partir da página Kids (`introVideoUrl` no objeto media). */
export const PLAYER_KIDS_MOVIE_INTRO_URL = `/vinheta-tv.mp4?${VINHETA_CACHE_BUSTER}`;

/**
 * Timeout máximo da vinheta quando ela é exibida (ms).
 */
export const PLAYER_INTRO_TIMEOUT_MS = 8_000;

/**
 * Quantos segundos antes do fim do episódio mostrar o overlay "Próximo Episódio".
 * Apple TV usa 30s, Netflix usa ~60s. Valor de 40s é um meio-termo confortável.
 */
export const PLAYER_NEXT_EPISODE_TRIGGER_SEC = 40;

/**
 * Quantos segundos antes do fim iniciar o countdown de auto-play.
 * Após esse tempo, o próximo episódio é iniciado automaticamente se o usuário não cancelar.
 */
export const PLAYER_NEXT_EPISODE_AUTOPLAY_SEC = 10;

/** Número máximo de membros do elenco exibidos no painel Cast. */
export const PLAYER_CAST_MAX_MEMBERS = 15;

/** Threshold de progresso (0–1) a partir do qual o conteúdo é marcado como "assistido". */
export const PLAYER_WATCHED_THRESHOLD = 0.95;

/**
 * Tempo mínimo de progresso salvo (em segundos) para retomar a reprodução.
 * Abaixo desse valor, inicia do começo (evita "resumir de 3 segundos").
 */
export const PLAYER_RESUME_MIN_SEC = 10;
