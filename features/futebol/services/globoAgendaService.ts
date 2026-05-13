/**
 * globoAgendaService.ts
 * Busca próximos jogos por time no ge.globo.com (API pública SDE/Esporte).
 * Fallback: retorna lista vazia sem lançar erro.
 */

import { normalizeTeamName } from '@/features/futebol/services/futebolService';

// ─── Mapeamento: slug normalizado → slug ge.globo.com ──────────────────────

export const GLOBO_TEAM_SLUGS: Record<string, string> = {
  flamengo: 'flamengo',
  botafogo: 'botafogo',
  palmeiras: 'palmeiras',
  fluminense: 'fluminense',
  saopaulo: 'sao-paulo',
  corinthians: 'corinthians',
  santos: 'santos',
  gremio: 'gremio',
  internacional: 'internacional',
  atleticomineiro: 'atletico-mg',
  atleticomg: 'atletico-mg',
  athleticoparanaense: 'athletico-pr',
  cruzeiro: 'cruzeiro',
  vasco: 'vasco-da-gama',
  vascodagama: 'vasco-da-gama',
  vitoria: 'vitoria',
  bahia: 'bahia',
  fortaleza: 'fortaleza',
  ceara: 'ceara',
  redbullbragantino: 'red-bull-bragantino',
  bragantino: 'red-bull-bragantino',
  juventude: 'juventude',
  coritiba: 'coritiba',
  chapecoense: 'chapecoense',
  mirassol: 'mirassol',
  remo: 'remo',
  sportrecife: 'sport-recife',
  sport: 'sport-recife',
  americamineiro: 'america-mg',
  pontepreta: 'ponte-preta',
  guarani: 'guarani',
  avai: 'avai',
  goias: 'goias',
  cuiaba: 'cuiaba',
};

// ─── IDs internos Globo Esporte (SDE) — usados na API JSON ─────────────────
// Fonte: ge.globo.com/futebol/times/{slug}/index/feed.json

export const GLOBO_TEAM_IDS: Record<string, string> = {
  flamengo: '1297',
  botafogo: '1308',
  palmeiras: '1296',
  fluminense: '1304',
  saopaulo: '1299',
  corinthians: '1295',
  santos: '1300',
  gremio: '1303',
  internacional: '1305',
  atleticomineiro: '1301',
  atleticomg: '1301',
  athleticoparanaense: '1325',
  cruzeiro: '1302',
  vasco: '1306',
  vascodagama: '1306',
  vitoria: '1318',
  bahia: '1314',
  fortaleza: '1319',
  redbullbragantino: '1363',
  bragantino: '1363',
  juventude: '1347',
  coritiba: '1313',
  chapecoense: '1360',
  mirassol: '1339',
  sportrecife: '1320',
};

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface GloboJogo {
  /** ID do evento (pode ser string vazia se indisponível) */
  id: string;
  /** Data no formato YYYY-MM-DD */
  data: string;
  /** Horário no formato HH:mm (horário de Brasília) */
  hora: string;
  /** Nome do time mandante */
  timeCasa: string;
  /** Escudo do time mandante (URL) */
  escudoCasa: string | null;
  /** Nome do time visitante */
  timeVisitante: string;
  /** Escudo do time visitante (URL) */
  escudoVisitante: string | null;
  /** Nome da competição */
  competicao: string;
  /** Rodada (ex: "Rodada 5") */
  rodada: string | null;
  /** Canal de transmissão, se disponível */
  transmissao: string | null;
  /** Local (estádio) se disponível */
  local: string | null;
  /** URL da página do jogo no ge.globo.com */
  urlGlobo: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Retorna o slug ge.globo.com para um time a partir de qualquer variação
 * de nome (normalizado).
 */
export function getGloboSlug(teamNameOrId: string): string | null {
  const key = normalizeTeamName(teamNameOrId);
  return GLOBO_TEAM_SLUGS[key] ?? null;
}

/**
 * Retorna o ID interno Globo Esporte para um time.
 */
export function getGloboTeamId(teamNameOrId: string): string | null {
  const key = normalizeTeamName(teamNameOrId);
  return GLOBO_TEAM_IDS[key] ?? null;
}

/**
 * URL da página do time no ge.globo.com.
 */
export function getGloboTeamPageUrl(teamNameOrId: string): string | null {
  const slug = getGloboSlug(teamNameOrId);
  if (!slug) return null;
  return `https://ge.globo.com/futebol/times/${slug}/`;
}

/**
 * URL da agenda/próximos jogos no ge.globo.com para exibir em webview.
 */
export function getGloboAgendaUrl(teamNameOrId: string): string | null {
  const slug = getGloboSlug(teamNameOrId);
  if (!slug) return null;
  return `https://ge.globo.com/futebol/times/${slug}/#jogos`;
}

// ─── Cache em memória ───────────────────────────────────────────────────────

const agendaCache = new Map<string, { data: GloboJogo[]; expiresAt: number }>();
const AGENDA_CACHE_TTL_MS = 15 * 60_000; // 15 minutos

// ─── Fetch próximos jogos ───────────────────────────────────────────────────

/**
 * Parseia resposta JSON da API feed do ge.globo.com para extrair próximos jogos.
 * A estrutura pode variar — tenta extrair com múltiplos formatos.
 */
function parseGloboFeedResponse(json: unknown): GloboJogo[] {
  if (!json || typeof json !== 'object') return [];

  const obj = json as Record<string, unknown>;
  const items: GloboJogo[] = [];

  // Formato: { jogos: [...] } ou { data: { jogos: [...] } }
  const rawJogos: unknown[] =
    (Array.isArray(obj['jogos']) ? obj['jogos'] : null) ??
    (Array.isArray((obj['data'] as Record<string, unknown>)?.['jogos'])
      ? ((obj['data'] as Record<string, unknown>)['jogos'] as unknown[])
      : null) ??
    [];

  for (const jogo of rawJogos) {
    if (!jogo || typeof jogo !== 'object') continue;
    const j = jogo as Record<string, unknown>;

    const dataRaw = String(j['data_realizacao'] ?? j['date'] ?? j['data'] ?? '');
    const horaRaw = String(j['hora_realizacao'] ?? j['time'] ?? j['hora'] ?? '');

    // Só próximos jogos (sem placar)
    const hasScore =
      j['placar_mandante'] != null || j['score_home'] != null || j['placarMandante'] != null;
    if (hasScore) continue;

    const mandante = (j['equipes'] as Record<string, unknown>)?.['mandante'] as
      | Record<string, unknown>
      | undefined;
    const visitante = (j['equipes'] as Record<string, unknown>)?.['visitante'] as
      | Record<string, unknown>
      | undefined;

    const timeCasa = String(
      j['time_mandante'] ?? j['home_team'] ?? mandante?.['nome_popular'] ?? ''
    );
    const timeVisitante = String(
      j['time_visitante'] ?? j['away_team'] ?? visitante?.['nome_popular'] ?? ''
    );

    if (!timeCasa || !timeVisitante) continue;

    items.push({
      id: String(j['id'] ?? j['event_id'] ?? ''),
      data: dataRaw.slice(0, 10) || '',
      hora: horaRaw.slice(0, 5) || '',
      timeCasa,
      escudoCasa:
        String(mandante?.['escudo'] ?? j['escudo_mandante'] ?? j['home_badge'] ?? '') || null,
      timeVisitante,
      escudoVisitante:
        String(visitante?.['escudo'] ?? j['escudo_visitante'] ?? j['away_badge'] ?? '') || null,
      competicao: String(j['campeonato'] ?? j['competition'] ?? 'Brasileirão Série A'),
      rodada: j['rodada'] ? `Rodada ${j['rodada']}` : null,
      transmissao: String(j['transmissao'] ?? j['broadcast'] ?? '') || null,
      local: String(j['sede'] ?? j['venue'] ?? j['estadio'] ?? '') || null,
      urlGlobo: String(j['url'] ?? j['link'] ?? '') || null,
    });
  }

  return items;
}

/**
 * Tenta buscar próximos jogos via API JSON do ge.globo.com.
 * Usa dois endpoints em cascata; retorna [] se ambos falharem (CORS/rede).
 */
async function fetchFromGloboApi(globoTeamId: string): Promise<GloboJogo[]> {
  const endpoints = [
    `https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=${globoTeamId}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      const parsed = parseGloboFeedResponse(json);
      if (parsed.length > 0) return parsed;
    } catch {
      // CORS ou rede — ignora
    }
  }
  return [];
}

/**
 * Retorna próximos jogos de um time buscados a partir do ge.globo.com.
 *
 * @param teamNameOrId  Nome normalizado, slug ou ID interno Globo do time.
 * @returns             Lista de GloboJogo (pode ser vazia em caso de erro/CORS).
 */
export async function getGloboAgendaByTeam(teamNameOrId: string): Promise<GloboJogo[]> {
  const cacheKey = normalizeTeamName(teamNameOrId);
  const cached = agendaCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const globoId = getGloboTeamId(teamNameOrId);
  if (!globoId) return [];

  const jogos = await fetchFromGloboApi(globoId);

  agendaCache.set(cacheKey, { data: jogos, expiresAt: Date.now() + AGENDA_CACHE_TTL_MS });
  return jogos;
}

/**
 * Limpa o cache de agenda (útil para forçar recarregamento).
 */
export function clearGloboAgendaCache(): void {
  agendaCache.clear();
}

/**
 * Retorna todos os slugs ge.globo.com mapeados.
 */
export function getAllGloboSlugs(): Array<{ teamKey: string; slug: string; pageUrl: string }> {
  return Object.entries(GLOBO_TEAM_SLUGS).map(([teamKey, slug]) => ({
    teamKey,
    slug,
    pageUrl: `https://ge.globo.com/futebol/times/${slug}/`,
  }));
}
