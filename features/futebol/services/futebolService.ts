import { supabase } from '@/services/supabaseService';
import { stripDiacriticsSafe } from '@/utils/safeUnicodeNormalize';

const SPORTS_DB_KEY = import.meta.env.VITE_SPORTS_DB_KEY ?? '3';
const SPORTS_DB_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_KEY}`;
const API_BR_URL = (
  import.meta.env.VITE_API_BR_URL ||
  (typeof process !== 'undefined' ? process.env?.VITE_API_BR_URL : undefined) ||
  'http://localhost:8000'
).replace(/\/$/, '');

const BRASILEIRAO_SERIE_A_ID = '4351';
const SEASON = '2026';
const EVENTOS_CACHE_TTL_MS = 10 * 60_000;
const TABELA_CACHE_TTL_MS = 10 * 60_000;
const TIMES_CACHE_TTL_MS = 10 * 60_000;
const LOCAL_CBF_CACHE_URL = '/cbf_serie_a_2026_cache.json';
const LOCAL_CBF_STANDINGS_URL = '/cbf_serie_a_2026_standings.json';
const SUPABASE_CBF_BUNDLES_KEY = 'serie_a_2026_bundles';
const SUPABASE_CBF_STANDINGS_KEY = 'serie_a_2026_standings';
const SUPABASE_CBF_EVENTS_KEY = 'serie_a_2026_events';
const SUPABASE_CBF_EPG_CHANNELS_KEY = 'serie_a_2026_epg_channels';
export const TEAM_LOGO_SVG_OVERRIDES: Record<string, string> = {
  // ── chaves originais (legado) ──────────────────────────────────────
  athleticopr: 'https://s.sde.globo.com/media/organizations/2019/09/09/Athletico-PR-65x65.png',
  bahia: 'https://s.sde.globo.com/media/organizations/2014/04/14/bahia_60x60.png',
  botafogo: 'https://s.sde.globo.com/media/organizations/2019/02/04/botafogo-65.png',
  bragantino: 'https://s.sde.globo.com/media/organizations/2020/01/01/65.png',
  chapecoense: 'https://s.sde.globo.com/media/organizations/2021/06/21/chapecoense65.png',
  corinthians:
    'https://s.sde.globo.com/media/organizations/2024/10/09/Corinthians_2024_Q4ahot4.svg',
  cruzeiro: 'https://s.sde.globo.com/media/organizations/2021/02/13/65_cruzeiro-2021.png',
  flamengo: 'https://s.sde.globo.com/media/organizations/2018/04/09/Flamengo-65.png',
  fluminense: 'https://s.sde.globo.com/media/organizations/2014/04/14/fluminense_60x60.png',
  gremio: 'https://s.sde.globo.com/media/organizations/2014/04/14/gremio_60x60.png',
  mirassol: 'https://s.sde.globo.com/media/organizations/2024/08/20/mirassol-65-71693.png',
  palmeiras: 'https://s.sde.globo.com/media/organizations/2014/04/14/palmeiras_60x60.png',
  remo: 'https://s.sde.globo.com/media/organizations/2013/10/11/REmo-65.png',
  vasco: 'https://s.sde.globo.com/media/organizations/2021/09/04/ESCUDO-VASCO-RGB_65px.png',
  vitoria: 'https://s.sde.globo.com/media/organizations/2025/12/18/Vitoria-2025-65.png',
  americamg: 'https://s.glbimg.com/es/sde/f/organizacoes/escudo_default_65x65.png',
  tabela: 'https://s3.glbimg.com/v1/AUTH_b922f1376f6c452e9bb337cc7d996a6e/logo/tenant/gshow.svg',
  sao: 'https://s.sde.globo.com/media/organizations/2014/04/14/sao_paulo_60x60.png',
  coritiba: 'https://s.sde.globo.com/media/organizations/2017/03/29/coritiba65.png',
  santos: 'https://s.sde.globo.com/media/organizations/2014/04/14/santos_60x60.png',
  atleticomg:
    'https://s.sde.globo.com/media/organizations/2017/11/23/Atletico-Mineiro-escudo65px.png',
  internacional: 'https://s.sde.globo.com/media/organizations/2016/05/03/inter65.png',

  // ── chaves normalizadas corretas (normalizeTeamName) ───────────────
  // normalizeTeamName remove espaços, acentos e caracteres especiais
  vascodagama: 'https://s.sde.globo.com/media/organizations/2021/09/04/ESCUDO-VASCO-RGB_65px.png',
  saopaulo: 'https://s.sde.globo.com/media/organizations/2014/04/14/sao_paulo_60x60.png',
  saopaulofc: 'https://s.sde.globo.com/media/organizations/2014/04/14/sao_paulo_60x60.png',
  atleticomineiro:
    'https://s.sde.globo.com/media/organizations/2017/11/23/Atletico-Mineiro-escudo65px.png',
  athleticoparanaense:
    'https://s.sde.globo.com/media/organizations/2019/09/09/Athletico-PR-65x65.png',
  clubeathleticoparanaense:
    'https://s.sde.globo.com/media/organizations/2019/09/09/Athletico-PR-65x65.png',
  redbullbragantino: 'https://s.sde.globo.com/media/organizations/2020/01/01/65.png',
  redbbragantino: 'https://s.sde.globo.com/media/organizations/2020/01/01/65.png',
  gremiofbpa: 'https://s.sde.globo.com/media/organizations/2014/04/14/gremio_60x60.png',
  botafogodefuteboleregattas:
    'https://s.sde.globo.com/media/organizations/2019/02/04/botafogo-65.png',
  botafogofr: 'https://s.sde.globo.com/media/organizations/2019/02/04/botafogo-65.png',
  cruzeirosec: 'https://s.sde.globo.com/media/organizations/2021/02/13/65_cruzeiro-2021.png',
  cruzeiroec: 'https://s.sde.globo.com/media/organizations/2021/02/13/65_cruzeiro-2021.png',
  santosfc: 'https://s.sde.globo.com/media/organizations/2014/04/14/santos_60x60.png',
  esporteclubebahia: 'https://s.sde.globo.com/media/organizations/2014/04/14/bahia_60x60.png',
  fluminensefootballclub:
    'https://s.sde.globo.com/media/organizations/2014/04/14/fluminense_60x60.png',

  // ── times ainda sem logo no CDN Globo — usando CDN alternativo ─────
  fortaleza: 'https://s.sde.globo.com/media/organizations/2019/05/15/Fortaleza-65px.png',
  fortalezaec: 'https://s.sde.globo.com/media/organizations/2019/05/15/Fortaleza-65px.png',
  fortalezaesporteclube:
    'https://s.sde.globo.com/media/organizations/2019/05/15/Fortaleza-65px.png',
  juventude: 'https://s.sde.globo.com/media/organizations/2022/04/16/Juventude-65.png',
  esporteclubeejuventude: 'https://s.sde.globo.com/media/organizations/2022/04/16/Juventude-65.png',
  cuiaba: 'https://s.sde.globo.com/media/organizations/2021/01/20/cuiaba65.png',
  cuiabaec: 'https://s.sde.globo.com/media/organizations/2021/01/20/cuiaba65.png',
  goias: 'https://s.sde.globo.com/media/organizations/2021/09/15/goias65-2021.png',
  goiasec: 'https://s.sde.globo.com/media/organizations/2021/09/15/goias65-2021.png',
  goiasesporteclube: 'https://s.sde.globo.com/media/organizations/2021/09/15/goias65-2021.png',
};

const STATUS_FINALIZADO = new Set(['match finished', 'finished', 'ft', 'aet', 'pen']);

let eventosCache: FutebolEvento[] | null = null;
let eventosCacheExpiration = 0;
let eventosInFlight: Promise<FutebolEvento[]> | null = null;

let tabelaCache: TabelaBrasileiraoRow[] | null = null;
let tabelaCacheExpiration = 0;
let tabelaInFlight: Promise<TabelaBrasileiraoRow[]> | null = null;

let timesSerieACache: TimeSerieA[] | null = null;
let timesSerieACacheExpiration = 0;
let timesSerieAInFlight: Promise<TimeSerieA[]> | null = null;

let localCbfCache: LocalCbfBundle[] | null = null;
let localCbfInFlight: Promise<LocalCbfBundle[]> | null = null;
let localCbfStandingsCache: TabelaBrasileiraoRow[] | null = null;
let localCbfStandingsInFlight: Promise<TabelaBrasileiraoRow[]> | null = null;
let localCbfEventsCache: FutebolEvento[] | null = null;
let localCbfEventsInFlight: Promise<FutebolEvento[]> | null = null;
let localCbfEpgMapCache: Map<string, string> | null = null;
let localCbfEpgMapInFlight: Promise<Map<string, string>> | null = null;
let teamLogoMapCache: Map<string, string> | null = null;
let teamLogoMapInFlight: Promise<Map<string, string>> | null = null;
const sportsDbTeamCacheByKey = new Map<string, TimeDetalhes>();
const sportsDbTeamInFlightByKey = new Map<string, Promise<TimeDetalhes | null>>();

const SPORTS_DB_TEAM_ALIASES: Record<string, string[]> = {
  athleticoparanaense: ['Athletico Paranaense', 'Athletico-PR'],
  atleticomineiro: ['Atletico Mineiro', 'Atletico-MG', 'Clube Atletico Mineiro'],
  bahia: ['Bahia', 'Esporte Clube Bahia'],
  botafogo: ['Botafogo', 'Botafogo FR'],
  chapecoense: ['Chapecoense', 'Associacao Chapecoense de Futebol'],
  corinthians: ['Corinthians', 'Sport Club Corinthians Paulista'],
  coritiba: ['Coritiba', 'Coritiba Foot Ball Club'],
  cruzeiro: ['Cruzeiro', 'Cruzeiro EC'],
  flamengo: ['Flamengo', 'Clube de Regatas do Flamengo'],
  fluminense: ['Fluminense', 'Fluminense Football Club'],
  gremio: ['Gremio', 'Gremio FBPA'],
  internacional: ['Internacional', 'Sport Club Internacional', 'Inter'],
  mirassol: ['Mirassol', 'Mirassol FC'],
  palmeiras: ['Palmeiras', 'Sociedade Esportiva Palmeiras'],
  redbullbragantino: ['Red Bull Bragantino', 'Bragantino'],
  remo: ['Remo', 'Clube do Remo'],
  santos: ['Santos', 'Santos FC'],
  saopaulo: ['Sao Paulo', 'Sao Paulo FC'],
  vascodagama: ['Vasco da Gama', 'Vasco'],
  vitoria: ['Vitoria', 'Esporte Clube Vitoria'],
};

const TEAM_METADATA_OVERRIDES: Record<string, { city?: string; stadium?: string }> = {
  flamengo: { city: 'Rio de Janeiro', stadium: 'Maracanã' },
  cruzeiro: { city: 'Belo Horizonte', stadium: 'Mineirão' },
  coritiba: { city: 'Curitiba', stadium: 'Couto Pereira' },
  santos: { city: 'Santos', stadium: 'Vila Belmiro' },
  palmeiras: { city: 'São Paulo', stadium: 'Allianz Parque' },
  redbullbragantino: { city: 'Bragança Paulista', stadium: 'Nabi Abi Chedid' },
  bragantino: { city: 'Bragança Paulista', stadium: 'Nabi Abi Chedid' },
  remo: { city: 'Belém', stadium: 'Baenão (Evandro Almeida)' },
};

export const TEAM_COLOR_OVERRIDES: Record<string, { primary: string; secondary: string }> = {
  athleticoparanaense: { primary: '#C1121F', secondary: '#111827' },
  atleticomineiro: { primary: '#111827', secondary: '#D1D5DB' },
  bahia: { primary: '#1D4ED8', secondary: '#DC2626' },
  botafogo: { primary: '#111827', secondary: '#F9FAFB' },
  chapecoense: { primary: '#166534', secondary: '#052E16' },
  corinthians: { primary: '#111827', secondary: '#F3F4F6' },
  coritiba: { primary: '#15803D', secondary: '#ECFDF5' },
  cruzeiro: { primary: '#1D4ED8', secondary: '#93C5FD' },
  flamengo: { primary: '#B91C1C', secondary: '#111827' },
  fluminense: { primary: '#166534', secondary: '#7F1D1D' },
  gremio: { primary: '#2563EB', secondary: '#111827' },
  internacional: { primary: '#C1121F', secondary: '#111827' },
  mirassol: { primary: '#EA580C', secondary: '#FACC15' },
  palmeiras: { primary: '#166534', secondary: '#14532D' },
  redbullbragantino: { primary: '#DC2626', secondary: '#111827' },
  remo: { primary: '#1D4ED8', secondary: '#60A5FA' },
  santos: { primary: '#E5E7EB', secondary: '#111827' },
  saopaulo: { primary: '#DC2626', secondary: '#111827' },
  vascodagama: { primary: '#111827', secondary: '#B91C1C' },
  vitoria: { primary: '#DC2626', secondary: '#111827' },
};

export interface FutebolEvento {
  idEvent: string;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strEvent: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  strLeague?: string | null;
  dateEvent: string | null;
  strTime: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strVenue: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  strTVStation?: string | null;
}

export interface TabelaBrasileiraoRow {
  teamId: string | null;
  posicao: number | null;
  nomeTime: string;
  pontos: number | null;
  jogos: number | null;
  vitorias: number | null;
  empates: number | null;
  derrotas: number | null;
  saldoGols: number | null;
  aproveitamento: string | null;
}

export interface TimeDetalhes {
  idTeam: string;
  strTeam: string | null;
  strAlternate: string | null;
  strLeague: string | null;
  strCountry: string | null;
  strManager: string | null;
  intFormedYear: string | null;
  strStadium: string | null;
  strStadiumLocation: string | null;
  intStadiumCapacity: string | null;
  strTeamBadge: string | null;
  strTeamBanner: string | null;
  strTeamFanart1: string | null;
  strTeamFanart2: string | null;
  strTeamFanart3: string | null;
  strTeamFanart4: string | null;
  strTeamJersey: string | null;
  strColour1: string | null;
  strColour2: string | null;
  strWebsite: string | null;
  strFacebook: string | null;
  strTwitter: string | null;
  strInstagram: string | null;
  strDescriptionPT: string | null;
  strDescriptionEN: string | null;
}

export interface JogadorTime {
  idPlayer: string;
  strPlayer: string | null;
  strPosition: string | null;
  strCutout: string | null;
  strThumb: string | null;
  strNumber: string | null;
  strNationality: string | null;
  intGoals: string | null;
}

export interface TimeSerieA {
  idTeam: string;
  strTeam: string;
  strTeamBadge: string | null;
}

interface EventosTemporadaResponse {
  events: FutebolEvento[] | null;
}

interface LookupTeamResponse {
  teams: TimeDetalhes[] | null;
}

interface LookupAllPlayersResponse {
  player: JogadorTime[] | null;
}

interface SearchPlayersResponse {
  player: JogadorTime[] | null;
}

interface EventosTimeResponse {
  events: FutebolEvento[] | null;
}

interface ResultadosTimeResponse {
  results: FutebolEvento[] | null;
}

interface LookupTableResponse {
  table: Record<string, unknown>[] | null;
}

interface LocalCbfTeam {
  cbf_id?: string;
  name: string;
  logo_url: string;
  stadium?: string;
  city?: string;
  team_page_url?: string;
}

interface LocalCbfSquad {
  name: string;
  position?: string;
  number?: string;
}

interface LocalCbfGame {
  id_jogo: string;
  competition: string;
  date: string;
  time: string;
  datetime_iso?: string;
  home_team: string;
  away_team: string;
  home_team_cbf_id?: string;
  away_team_cbf_id?: string;
  home_score?: string;
  away_score?: string;
  local?: string;
}

interface LocalCbfBundle {
  team: LocalCbfTeam;
  squad: LocalCbfSquad[];
  games: LocalCbfGame[];
}

interface LocalCbfEpgChannel {
  game_id: string;
  channel: string;
}

interface LocalCbfEventPayload extends Partial<FutebolEvento> {
  idEvent?: string;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
}

function parseBrDateToIso(dateBr: string | null | undefined): string | null {
  const m = String(dateBr || '')
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function parseScore(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function readFutebolCachePayload<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('futebol_cache')
      .select('payload')
      .eq('key', key)
      .maybeSingle();

    if (error || !data || typeof data !== 'object') return null;
    const payload = (data as { payload?: unknown }).payload;
    return (payload as T) ?? null;
  } catch {
    return null;
  }
}

function normalizeTeamLogoKey(name: string | null | undefined): string {
  if (!name) return '';
  return normalizeTeamName(name)
    .replace(/saf$/g, '')
    .replace(/fc$/g, '')
    .replace(/futebolclube$/g, '')
    .replace(/clubederegatas/g, '')
    .replace(/sociedadeanonimadefutebol/g, '')
    .trim();
}

function sanitizeTeamDisplayName(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw) return '';

  return raw
    .replace(/\bS\.?A\.?F\.?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildSportsDbSearchCandidates(teamName: string | null | undefined): string[] {
  const raw = String(teamName || '').trim();
  if (!raw) return [];

  const normalizedKey = normalizeTeamLogoKey(raw);
  const aliases = SPORTS_DB_TEAM_ALIASES[normalizedKey] || [];
  const variants = new Set<string>([
    raw,
    raw.replace(/\bSAF\b/gi, '').trim(),
    raw.replace(/\bFC\b/gi, '').trim(),
    ...aliases,
  ]);

  return Array.from(variants).filter((value) => Boolean(value));
}

function scoreSportsDbTeamCandidate(team: TimeDetalhes, candidateKeys: Set<string>): number {
  const teamKey = normalizeTeamLogoKey(team.strTeam || '');
  if (!teamKey) return 0;

  let score = 0;
  if (candidateKeys.has(teamKey)) score += 100;
  else if (
    Array.from(candidateKeys).some((key) => key && (teamKey.includes(key) || key.includes(teamKey)))
  )
    score += 80;
  else score += 10;

  const countryKey = normalizeTeamName(team.strCountry || '');
  const leagueKey = normalizeTeamName(team.strLeague || '');
  if (countryKey.includes('brazil')) score += 40;
  if (
    leagueKey.includes('brazil') ||
    leagueKey.includes('brasileiro') ||
    leagueKey.includes('seriea')
  )
    score += 25;

  return score;
}

function isTransparentLogo(url: string | null | undefined): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.startsWith('data:image/svg+xml')) return true;

  try {
    const parsed = new URL(raw, 'https://redx.local');
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.png') || pathname.endsWith('.webp') || pathname.endsWith('.svg'))
      return true;

    const format = (parsed.searchParams.get('format') || '').toLowerCase();
    if (format === 'png' || format === 'webp' || format === 'svg') return true;
  } catch {
    // fallback abaixo
  }

  return lower.includes('.png') || lower.includes('.webp') || lower.includes('.svg');
}

function sanitizeLogoUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  return isTransparentLogo(raw) ? raw : null;
}

function resolveStaticSvgLogo(teamName: string | null | undefined): string | null {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) return null;
  return TEAM_LOGO_SVG_OVERRIDES[normalized] || null;
}

function resolvePreferredLogo(
  teamName: string | null | undefined,
  preferredLogos: Map<string, string>
): string | null {
  const base = normalizeTeamName(teamName);
  if (!base) return resolveStaticSvgLogo(teamName);
  const reduced = normalizeTeamLogoKey(teamName);

  return (
    preferredLogos.get(base) ||
    (reduced ? preferredLogos.get(reduced) : null) ||
    resolveStaticSvgLogo(teamName) ||
    null
  );
}

function enrichEventosWithPreferredLogos(
  eventos: FutebolEvento[],
  preferredLogos: Map<string, string>
): FutebolEvento[] {
  if (preferredLogos.size === 0) {
    return eventos.map((evento) => ({
      ...evento,
      strHomeTeamBadge: sanitizeLogoUrl(evento.strHomeTeamBadge) || null,
      strAwayTeamBadge: sanitizeLogoUrl(evento.strAwayTeamBadge) || null,
    }));
  }

  return eventos.map((evento) => ({
    ...evento,
    strHomeTeamBadge:
      resolvePreferredLogo(evento.strHomeTeam, preferredLogos) ||
      sanitizeLogoUrl(evento.strHomeTeamBadge) ||
      null,
    strAwayTeamBadge:
      resolvePreferredLogo(evento.strAwayTeam, preferredLogos) ||
      sanitizeLogoUrl(evento.strAwayTeamBadge) ||
      null,
  }));
}

function buildBadgeLookupFromLocal(
  data: LocalCbfBundle[],
  preferredLogos: Map<string, string> = new Map()
): Map<string, string> {
  const map = new Map<string, string>();
  data.forEach((entry) => {
    const teamNameKey = normalizeTeamName(entry.team.name);
    const preferred = resolvePreferredLogo(entry.team.name, preferredLogos);
    const localTransparent = sanitizeLogoUrl(entry.team.logo_url);
    if (teamNameKey && (preferred || localTransparent)) {
      map.set(teamNameKey, (preferred || localTransparent) as string);
    }
    const teamIdKey = String(entry.team.cbf_id || '').trim();
    if (teamIdKey && (preferred || localTransparent)) {
      map.set(teamIdKey, (preferred || localTransparent) as string);
    }
  });
  return map;
}

function buildEventosFromLocal(
  data: LocalCbfBundle[],
  channelByGameId: Map<string, string> = new Map(),
  preferredLogos: Map<string, string> = new Map()
): FutebolEvento[] {
  const badgeLookup = buildBadgeLookupFromLocal(data, preferredLogos);
  const seen = new Set<string>();
  const output: FutebolEvento[] = [];

  data.forEach((entry) => {
    entry.games.forEach((game) => {
      const homeTeamName = sanitizeTeamDisplayName(game.home_team);
      const awayTeamName = sanitizeTeamDisplayName(game.away_team);
      const key =
        game.id_jogo ||
        `${normalizeTeamName(homeTeamName)}-${normalizeTeamName(awayTeamName)}-${game.date}-${game.time}`;
      if (seen.has(key)) return;
      seen.add(key);

      const dateIso = parseBrDateToIso(game.date);
      const homeId = String(game.home_team_cbf_id || '').trim() || null;
      const awayId = String(game.away_team_cbf_id || '').trim() || null;
      const homeNameKey = normalizeTeamName(homeTeamName);
      const awayNameKey = normalizeTeamName(awayTeamName);
      const homeBadge = (homeId && badgeLookup.get(homeId)) || badgeLookup.get(homeNameKey) || null;
      const awayBadge = (awayId && badgeLookup.get(awayId)) || badgeLookup.get(awayNameKey) || null;
      const homeScore = parseScore(game.home_score);
      const awayScore = parseScore(game.away_score);

      output.push({
        idEvent: key,
        idHomeTeam: homeId,
        idAwayTeam: awayId,
        strEvent: `${homeTeamName} vs ${awayTeamName}`,
        strHomeTeam: homeTeamName || null,
        strAwayTeam: awayTeamName || null,
        strLeague: game.competition || null,
        dateEvent: dateIso,
        strTime: game.time || null,
        intHomeScore: homeScore === null ? null : String(homeScore),
        intAwayScore: awayScore === null ? null : String(awayScore),
        strStatus: homeScore !== null && awayScore !== null ? 'Match Finished' : 'Scheduled',
        strVenue: game.local || null,
        strHomeTeamBadge: homeBadge,
        strAwayTeamBadge: awayBadge,
        strTVStation: channelByGameId.get(String(game.id_jogo || '').trim()) || null,
      });
    });
  });

  return output.sort(sortByDateAsc);
}

function buildTimesFromLocal(
  data: LocalCbfBundle[],
  preferredLogos: Map<string, string> = new Map()
): TimeSerieA[] {
  return data
    .map((entry) => {
      const displayName = sanitizeTeamDisplayName(entry.team.name);
      const normalized = normalizeTeamName(displayName);
      const preferred = resolvePreferredLogo(displayName, preferredLogos);
      const localTransparent = sanitizeLogoUrl(entry.team.logo_url);
      return {
        idTeam: String(entry.team.cbf_id || '').trim() || normalized,
        strTeam: displayName || entry.team.name,
        strTeamBadge: preferred || localTransparent || null,
      };
    })
    .filter((team) => team.idTeam && team.strTeam)
    .sort((a, b) => a.strTeam.localeCompare(b.strTeam, 'pt-BR'));
}

function buildTabelaFromLocal(data: LocalCbfBundle[]): TabelaBrasileiraoRow[] {
  const teamStats = new Map<
    string,
    {
      teamId: string;
      nomeTime: string;
      jogos: number;
      vitorias: number;
      empates: number;
      derrotas: number;
      pontos: number;
      golsPro: number;
      golsContra: number;
    }
  >();

  data.forEach((entry) => {
    const displayName = sanitizeTeamDisplayName(entry.team.name);
    const id = String(entry.team.cbf_id || '').trim() || normalizeTeamName(displayName);
    teamStats.set(id, {
      teamId: id,
      nomeTime: displayName || entry.team.name,
      jogos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
      pontos: 0,
      golsPro: 0,
      golsContra: 0,
    });
  });

  const uniqueGames = buildEventosFromLocal(data);

  uniqueGames.forEach((game) => {
    const homeId = String(game.idHomeTeam || '').trim();
    const awayId = String(game.idAwayTeam || '').trim();
    const home = teamStats.get(homeId);
    const away = teamStats.get(awayId);
    if (!home || !away) return;

    const hs = parseScore(game.intHomeScore);
    const as = parseScore(game.intAwayScore);
    if (hs === null || as === null) return;

    home.jogos += 1;
    away.jogos += 1;
    home.golsPro += hs;
    home.golsContra += as;
    away.golsPro += as;
    away.golsContra += hs;

    if (hs > as) {
      home.vitorias += 1;
      home.pontos += 3;
      away.derrotas += 1;
    } else if (hs < as) {
      away.vitorias += 1;
      away.pontos += 3;
      home.derrotas += 1;
    } else {
      home.empates += 1;
      away.empates += 1;
      home.pontos += 1;
      away.pontos += 1;
    }
  });

  const ordered = Array.from(teamStats.values()).sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    const saldoA = a.golsPro - a.golsContra;
    const saldoB = b.golsPro - b.golsContra;
    if (saldoB !== saldoA) return saldoB - saldoA;
    if (b.golsPro !== a.golsPro) return b.golsPro - a.golsPro;
    return a.nomeTime.localeCompare(b.nomeTime, 'pt-BR');
  });

  return ordered.map((item, index) => {
    const saldo = item.golsPro - item.golsContra;
    const aproveitamento =
      item.jogos > 0 ? `${((item.pontos / (item.jogos * 3)) * 100).toFixed(1)}%` : null;
    return {
      teamId: item.teamId,
      posicao: index + 1,
      nomeTime: item.nomeTime,
      pontos: item.pontos,
      jogos: item.jogos,
      vitorias: item.vitorias,
      empates: item.empates,
      derrotas: item.derrotas,
      saldoGols: saldo,
      aproveitamento,
    };
  });
}

async function getLocalCbfBundles(): Promise<LocalCbfBundle[]> {
  if (localCbfCache) return localCbfCache;
  if (localCbfInFlight) return localCbfInFlight;

  localCbfInFlight = Promise.resolve()
    .then(async () => {
      const supabasePayload =
        await readFutebolCachePayload<LocalCbfBundle[]>(SUPABASE_CBF_BUNDLES_KEY);
      if (Array.isArray(supabasePayload) && supabasePayload.length > 0) {
        localCbfCache = supabasePayload;
        return localCbfCache;
      }

      const response = await fetch(LOCAL_CBF_CACHE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao carregar cache CBF local (${response.status})`);
      const payload = (await response.json()) as LocalCbfBundle[];
      localCbfCache = Array.isArray(payload) ? payload : [];
      return localCbfCache;
    })
    .catch(() => {
      localCbfCache = [];
      return localCbfCache;
    })
    .finally(() => {
      localCbfInFlight = null;
    });

  return localCbfInFlight;
}

async function getLocalCbfStandings(): Promise<TabelaBrasileiraoRow[]> {
  if (localCbfStandingsCache) return localCbfStandingsCache;
  if (localCbfStandingsInFlight) return localCbfStandingsInFlight;

  localCbfStandingsInFlight = Promise.resolve()
    .then(async () => {
      const payload = await readFutebolCachePayload<TabelaBrasileiraoRow[]>(
        SUPABASE_CBF_STANDINGS_KEY
      );
      if (Array.isArray(payload) && payload.length > 0) {
        localCbfStandingsCache = payload
          .map((item) => normalizeTabelaRow(item as unknown as Record<string, unknown>))
          .sort((a, b) => {
            const posA = a.posicao ?? Number.MAX_SAFE_INTEGER;
            const posB = b.posicao ?? Number.MAX_SAFE_INTEGER;
            return posA - posB;
          });
        return localCbfStandingsCache;
      }

      const response = await fetch(LOCAL_CBF_STANDINGS_URL, { cache: 'no-store' });
      if (!response.ok) {
        localCbfStandingsCache = [];
        return localCbfStandingsCache;
      }

      const fallback = (await response.json()) as TabelaBrasileiraoRow[];
      if (!Array.isArray(fallback) || fallback.length === 0) {
        localCbfStandingsCache = [];
        return localCbfStandingsCache;
      }

      localCbfStandingsCache = fallback
        .map((item) => normalizeTabelaRow(item as unknown as Record<string, unknown>))
        .sort((a, b) => {
          const posA = a.posicao ?? Number.MAX_SAFE_INTEGER;
          const posB = b.posicao ?? Number.MAX_SAFE_INTEGER;
          return posA - posB;
        });
      return localCbfStandingsCache;
    })
    .catch(() => {
      localCbfStandingsCache = [];
      return localCbfStandingsCache;
    })
    .finally(() => {
      localCbfStandingsInFlight = null;
    });

  return localCbfStandingsInFlight;
}

async function getLocalCbfEvents(): Promise<FutebolEvento[]> {
  if (localCbfEventsCache) return localCbfEventsCache;
  if (localCbfEventsInFlight) return localCbfEventsInFlight;

  localCbfEventsInFlight = readFutebolCachePayload<LocalCbfEventPayload[]>(SUPABASE_CBF_EVENTS_KEY)
    .then((payload) => {
      if (!Array.isArray(payload) || payload.length === 0) {
        localCbfEventsCache = [];
        return localCbfEventsCache;
      }

      const mapped = payload
        .map((item) => {
          const idEvent = String(item.idEvent || '').trim();
          const strHomeTeam = sanitizeTeamDisplayName(item.strHomeTeam ?? null) || null;
          const strAwayTeam = sanitizeTeamDisplayName(item.strAwayTeam ?? null) || null;
          if (!idEvent || !strHomeTeam || !strAwayTeam) return null;

          return {
            idEvent,
            idHomeTeam: item.idHomeTeam || null,
            idAwayTeam: item.idAwayTeam || null,
            strEvent: item.strEvent || `${strHomeTeam} vs ${strAwayTeam}`,
            strHomeTeam,
            strAwayTeam,
            strLeague: item.strLeague || null,
            dateEvent: item.dateEvent || null,
            strTime: item.strTime || null,
            intHomeScore: item.intHomeScore || null,
            intAwayScore: item.intAwayScore || null,
            strStatus: item.strStatus || null,
            strVenue: item.strVenue || null,
            strHomeTeamBadge: item.strHomeTeamBadge || null,
            strAwayTeamBadge: item.strAwayTeamBadge || null,
            strTVStation: item.strTVStation || null,
          } as FutebolEvento;
        })
        .filter((item): item is FutebolEvento => Boolean(item))
        .sort(sortByDateAsc);

      localCbfEventsCache = mapped;
      return mapped;
    })
    .catch(() => {
      localCbfEventsCache = [];
      return localCbfEventsCache;
    })
    .finally(() => {
      localCbfEventsInFlight = null;
    });

  return localCbfEventsInFlight;
}

async function getLocalCbfEpgChannelMap(): Promise<Map<string, string>> {
  if (localCbfEpgMapCache) return localCbfEpgMapCache;
  if (localCbfEpgMapInFlight) return localCbfEpgMapInFlight;

  localCbfEpgMapInFlight = readFutebolCachePayload<LocalCbfEpgChannel[]>(
    SUPABASE_CBF_EPG_CHANNELS_KEY
  )
    .then((payload) => {
      const map = new Map<string, string>();
      if (Array.isArray(payload)) {
        payload.forEach((entry) => {
          const id = String(entry?.game_id || '').trim();
          const channel = String(entry?.channel || '').trim();
          if (id && channel) map.set(id, channel);
        });
      }
      localCbfEpgMapCache = map;
      return map;
    })
    .catch(() => {
      localCbfEpgMapCache = new Map();
      return localCbfEpgMapCache;
    })
    .finally(() => {
      localCbfEpgMapInFlight = null;
    });

  return localCbfEpgMapInFlight;
}

async function getSupabaseTeamLogoMap(): Promise<Map<string, string>> {
  if (teamLogoMapCache) return teamLogoMapCache;
  if (teamLogoMapInFlight) return teamLogoMapInFlight;

  teamLogoMapInFlight = Promise.resolve()
    .then(async () => {
      const { data, error } = await supabase.from('teams').select('name,logo_url');
      if (error || !Array.isArray(data)) return new Map<string, string>();

      const map = new Map<string, string>();
      data.forEach((entry) => {
        const rawName = (entry as { name?: string }).name || '';
        const name = normalizeTeamName(rawName);
        const reduced = normalizeTeamLogoKey(rawName);
        const logo = sanitizeLogoUrl((entry as { logo_url?: string }).logo_url);
        if (name && logo) map.set(name, logo);
        if (reduced && logo) map.set(reduced, logo);
      });
      return map;
    })
    .catch(() => new Map<string, string>())
    .then((map) => {
      teamLogoMapCache = map;
      return map;
    })
    .finally(() => {
      teamLogoMapInFlight = null;
    });

  return teamLogoMapInFlight;
}

async function searchSportsDbTeamsByName(teamName: string): Promise<TimeDetalhes[]> {
  const response = await fetch(
    `${SPORTS_DB_URL}/searchteams.php?t=${encodeURIComponent(teamName)}`
  );
  if (!response.ok) throw new Error(`Falha ao buscar time no TheSportsDB (${response.status})`);
  const payload = (await response.json()) as LookupTeamResponse;
  return Array.isArray(payload.teams) ? payload.teams : [];
}

async function resolveSportsDbTeam(
  teamName: string | null | undefined
): Promise<TimeDetalhes | null> {
  const key = normalizeTeamLogoKey(teamName);
  if (!key) return null;
  if (sportsDbTeamCacheByKey.has(key)) return sportsDbTeamCacheByKey.get(key) || null;
  if (sportsDbTeamInFlightByKey.has(key)) return sportsDbTeamInFlightByKey.get(key) || null;

  const inFlight = Promise.resolve()
    .then(async () => {
      const candidates = buildSportsDbSearchCandidates(teamName);
      const candidateKeys = new Set(
        candidates.map((item) => normalizeTeamLogoKey(item)).filter(Boolean)
      );
      const fetched = new Map<string, TimeDetalhes>();

      for (const candidate of candidates) {
        try {
          const teams = await searchSportsDbTeamsByName(candidate);
          teams.forEach((team) => {
            const id = String(team.idTeam || '').trim();
            if (!id) return;
            fetched.set(id, team);
          });
        } catch {
          // tenta proximo alias
        }
      }

      const ranked = Array.from(fetched.values())
        .map((team) => ({
          team,
          score: scoreSportsDbTeamCandidate(team, candidateKeys),
        }))
        .sort((a, b) => b.score - a.score);

      const best = ranked.length > 0 && ranked[0].score >= 90 ? ranked[0].team : null;
      if (best) {
        sportsDbTeamCacheByKey.set(key, best);
      }
      return best;
    })
    .catch(() => null)
    .finally(() => {
      sportsDbTeamInFlightByKey.delete(key);
    });

  sportsDbTeamInFlightByKey.set(key, inFlight);
  return inFlight;
}

function mergeTeamDetails(
  localTeam: LocalCbfTeam | null,
  sportsTeam: TimeDetalhes | null,
  fallbackId: string,
  preferredLogos: Map<string, string>
): TimeDetalhes | null {
  if (!localTeam && !sportsTeam) return null;

  const rawTeamName = localTeam?.name || sportsTeam?.strTeam || fallbackId;
  const teamName = sanitizeTeamDisplayName(rawTeamName) || rawTeamName;
  const teamKey = normalizeTeamLogoKey(teamName);
  const metadataOverride = TEAM_METADATA_OVERRIDES[teamKey] || {};
  const colorOverride = TEAM_COLOR_OVERRIDES[teamKey];
  const resolvedLogo = resolvePreferredLogo(teamName, preferredLogos);
  const localLogo = sanitizeLogoUrl(localTeam?.logo_url);
  const sportsLogo = sanitizeLogoUrl(sportsTeam?.strTeamBadge);
  const localStadium = localTeam?.stadium ? sanitizeTeamDisplayName(localTeam.stadium) : null;
  const localCity = localTeam?.city ? sanitizeTeamDisplayName(localTeam.city) : null;

  return {
    idTeam: String(localTeam?.cbf_id || sportsTeam?.idTeam || fallbackId),
    strTeam: teamName || null,
    strAlternate: sportsTeam?.strAlternate || null,
    strLeague: sportsTeam?.strLeague || 'Campeonato Brasileiro Serie A',
    strCountry: sportsTeam?.strCountry || 'Brazil',
    strManager: sportsTeam?.strManager || null,
    intFormedYear: sportsTeam?.intFormedYear || null,
    strStadium: metadataOverride.stadium || localStadium || sportsTeam?.strStadium || null,
    strStadiumLocation:
      metadataOverride.city || localCity || sportsTeam?.strStadiumLocation || null,
    intStadiumCapacity: sportsTeam?.intStadiumCapacity || null,
    strTeamBadge: resolvedLogo || localLogo || sportsLogo || null,
    strTeamBanner: sportsTeam?.strTeamBanner || null,
    strTeamFanart1: sportsTeam?.strTeamFanart1 || null,
    strTeamFanart2: sportsTeam?.strTeamFanart2 || null,
    strTeamFanart3: sportsTeam?.strTeamFanart3 || null,
    strTeamFanart4: sportsTeam?.strTeamFanart4 || null,
    strTeamJersey: sportsTeam?.strTeamJersey || null,
    strColour1: sanitizeHexColor(colorOverride?.primary || sportsTeam?.strColour1 || null),
    strColour2: sanitizeHexColor(colorOverride?.secondary || sportsTeam?.strColour2 || null),
    strWebsite: sportsTeam?.strWebsite || null,
    strFacebook: sportsTeam?.strFacebook || null,
    strTwitter: sportsTeam?.strTwitter || null,
    strInstagram: sportsTeam?.strInstagram || null,
    strDescriptionPT: sportsTeam?.strDescriptionPT || null,
    strDescriptionEN: sportsTeam?.strDescriptionEN || null,
  };
}

function mergeLocalSquadIntoApiPlayers(
  players: JogadorTime[],
  localSquad: LocalCbfSquad[] = []
): JogadorTime[] {
  if (!players.length) return players;
  const localByName = new Map(
    localSquad.filter((p) => Boolean(p.name)).map((p) => [normalizeTeamName(p.name), p] as const)
  );

  return players.map((player) => {
    const key = normalizeTeamName(player.strPlayer || '');
    const local = key ? localByName.get(key) : undefined;
    return {
      ...player,
      strPosition: player.strPosition || local?.position || null,
      strNumber: player.strNumber || local?.number || null,
      strThumb: player.strThumb || player.strCutout || null,
    };
  });
}

function pickString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeAproveitamento(item: Record<string, unknown>): string | null {
  const raw = pickString(item, [
    'aproveitamento',
    'aproveitamentoPct',
    'percentual',
    'performance',
  ]);
  if (raw) return raw.includes('%') ? raw : `${raw}%`;

  const numeric = pickNumber(item, [
    'aproveitamento',
    'aproveitamentoPct',
    'percentual',
    'performance',
  ]);
  if (numeric === null) return null;
  return `${numeric.toFixed(1)}%`;
}

function sanitizeHexColor(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(normalized) || /^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `#${normalized}`;
  }
  return null;
}

function toTimestamp(evento: FutebolEvento): number {
  const date = (evento.dateEvent || '').trim();
  if (!date) return 0;

  const timeRaw = (evento.strTime || '').trim();
  const timeMatch = timeRaw.match(/^(\d{2}:\d{2})(?::\d{2})?/);
  const timeNormalized = timeMatch ? `${timeMatch[1]}:00` : '00:00:00';

  const fullTimestamp = Date.parse(`${date}T${timeNormalized}`);
  if (!Number.isNaN(fullTimestamp)) return fullTimestamp;

  const dayOnlyTimestamp = Date.parse(date);
  return Number.isNaN(dayOnlyTimestamp) ? 0 : dayOnlyTimestamp;
}

function isStatusFinalizado(status: string | null): boolean {
  return STATUS_FINALIZADO.has((status || '').trim().toLowerCase());
}

function hasScore(evento: FutebolEvento): boolean {
  return evento.intHomeScore !== null && evento.intAwayScore !== null;
}

function isEventoFinalizado(evento: FutebolEvento, now: number): boolean {
  if (isStatusFinalizado(evento.strStatus)) return true;
  const timestamp = toTimestamp(evento);
  return hasScore(evento) && timestamp > 0 && timestamp <= now;
}

function isEventoFuturo(evento: FutebolEvento, now: number): boolean {
  const timestamp = toTimestamp(evento);
  return timestamp > now && !isEventoFinalizado(evento, now);
}

function normalizeTabelaRow(item: Record<string, unknown>): TabelaBrasileiraoRow {
  const rawName =
    pickString(item, ['nomeTime', 'time', 'nome', 'team', 'clube', 'nome_clube']) || 'Time';
  return {
    teamId: pickString(item, ['teamId', 'idTeam', 'id_time', 'idTime', 'id_team']),
    posicao: pickNumber(item, ['posicao', 'posição', 'position', 'rank', 'colocacao', 'colocação']),
    nomeTime: sanitizeTeamDisplayName(rawName) || rawName,
    pontos: pickNumber(item, ['pontos', 'points', 'pts']),
    jogos: pickNumber(item, ['jogos', 'j', 'played', 'partidas']),
    vitorias: pickNumber(item, ['vitorias', 'vitórias', 'v', 'wins']),
    empates: pickNumber(item, ['empates', 'e', 'draws']),
    derrotas: pickNumber(item, ['derrotas', 'd', 'losses']),
    saldoGols: pickNumber(item, ['saldoGols', 'saldo_gols', 'saldo', 'sg', 'goalDifference']),
    aproveitamento: normalizeAproveitamento(item),
  };
}

function extractTabelaRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object'
    );
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const candidates = [data.tabela, data.data, data.items, data.result];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (item): item is Record<string, unknown> => !!item && typeof item === 'object'
        );
      }
    }
  }

  return [];
}

function sortByDateAsc(a: FutebolEvento, b: FutebolEvento): number {
  return toTimestamp(a) - toTimestamp(b);
}

function sortByDateDesc(a: FutebolEvento, b: FutebolEvento): number {
  return toTimestamp(b) - toTimestamp(a);
}

async function fetchEventos2026FromApi(): Promise<FutebolEvento[]> {
  const preferredLogos = await getSupabaseTeamLogoMap();

  const cachedEvents = await getLocalCbfEvents();
  if (cachedEvents.length > 0) {
    const epgMap = await getLocalCbfEpgChannelMap();
    const withChannels = cachedEvents.map((evento) => ({
      ...evento,
      strTVStation: evento.strTVStation || epgMap.get(String(evento.idEvent || '').trim()) || null,
    }));
    return enrichEventosWithPreferredLogos(withChannels, preferredLogos);
  }

  const local = await getLocalCbfBundles();
  if (local.length > 0) {
    const epgMap = await getLocalCbfEpgChannelMap();
    return enrichEventosWithPreferredLogos(
      buildEventosFromLocal(local, epgMap, preferredLogos),
      preferredLogos
    );
  }

  try {
    const response = await fetch(
      `${SPORTS_DB_URL}/eventsseason.php?id=${BRASILEIRAO_SERIE_A_ID}&s=${SEASON}`
    );

    if (!response.ok) {
      throw new Error(`Falha ao carregar eventos 2026 (${response.status})`);
    }

    const payload = (await response.json()) as EventosTemporadaResponse;
    if (Array.isArray(payload.events) && payload.events.length > 0) {
      return enrichEventosWithPreferredLogos(payload.events, preferredLogos);
    }
  } catch {
    // fallback abaixo
  }

  return [];
}

async function fetchTabelaFromApi(): Promise<TabelaBrasileiraoRow[]> {
  const standings = await getLocalCbfStandings();
  if (standings.length > 0) return standings;

  try {
    const response = await fetch(`${API_BR_URL}/campeonato/brasileiro/tabela`);

    if (!response.ok) {
      throw new Error(`Falha ao carregar classificacao (${response.status})`);
    }

    const payload = await response.json();
    const parsed = extractTabelaRows(payload)
      .map(normalizeTabelaRow)
      .sort((a, b) => {
        const posA = a.posicao ?? Number.MAX_SAFE_INTEGER;
        const posB = b.posicao ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
      });
    if (parsed.length > 0) return parsed;
  } catch {
    // fallback abaixo
  }

  const local = await getLocalCbfBundles();
  return buildTabelaFromLocal(local);
}

function mapLookupItemToTime(item: Record<string, unknown>): TimeSerieA | null {
  const idTeam = pickString(item, ['idTeam']);
  const rawTeam = pickString(item, ['strTeam']);
  const strTeam = sanitizeTeamDisplayName(rawTeam);
  const strTeamBadge = sanitizeLogoUrl(pickString(item, ['strTeamBadge']));

  if (!idTeam || !strTeam) return null;
  return {
    idTeam,
    strTeam,
    strTeamBadge,
  };
}

async function fetchTimesSerieAFromApi(): Promise<TimeSerieA[]> {
  const preferredLogos = await getSupabaseTeamLogoMap();

  const local = await getLocalCbfBundles();
  if (local.length > 0) {
    const mapped = buildTimesFromLocal(local, preferredLogos);
    if (mapped.length > 0) return mapped;
  }

  try {
    const response = await fetch(
      `${SPORTS_DB_URL}/lookuptable.php?l=${BRASILEIRAO_SERIE_A_ID}&s=${SEASON}`
    );

    if (!response.ok) {
      throw new Error(`Falha ao carregar escudos dos times (${response.status})`);
    }

    const payload = (await response.json()) as LookupTableResponse;
    const table = Array.isArray(payload.table) ? payload.table : [];

    const mapped = table
      .map((item) => mapLookupItemToTime(item))
      .filter((team): team is TimeSerieA => Boolean(team));

    if (mapped.length > 0) {
      const enriched = mapped.map((team) => ({
        ...team,
        strTeamBadge:
          resolvePreferredLogo(team.strTeam, preferredLogos) || team.strTeamBadge || null,
      }));
      return enriched.sort((a, b) => a.strTeam.localeCompare(b.strTeam, 'pt-BR'));
    }
  } catch {
    // fallback abaixo
  }

  return [];
}

export function normalizeTeamName(name: string | null | undefined): string {
  const cleaned = sanitizeTeamDisplayName(name);
  if (!cleaned) return '';
  return stripDiacriticsSafe(cleaned.toLowerCase()).replace(/[^a-z0-9]/g, '');
}

export function buildTeamIdMapFromEventos(eventos: FutebolEvento[]): Map<string, string> {
  const map = new Map<string, string>();

  eventos.forEach((evento) => {
    const homeName = normalizeTeamName(evento.strHomeTeam);
    const awayName = normalizeTeamName(evento.strAwayTeam);

    if (homeName && evento.idHomeTeam) map.set(homeName, evento.idHomeTeam);
    if (awayName && evento.idAwayTeam) map.set(awayName, evento.idAwayTeam);
  });

  return map;
}

export async function getEventos2026(forceRefresh = false): Promise<FutebolEvento[]> {
  const now = Date.now();
  if (!forceRefresh && eventosCache && now < eventosCacheExpiration) {
    return eventosCache;
  }

  if (eventosInFlight) return eventosInFlight;

  eventosInFlight = fetchEventos2026FromApi()
    .then((eventos) => {
      eventosCache = eventos;
      eventosCacheExpiration = Date.now() + EVENTOS_CACHE_TTL_MS;
      return eventos;
    })
    .finally(() => {
      eventosInFlight = null;
    });

  return eventosInFlight;
}

export function getProximosJogosFromEventos(eventos: FutebolEvento[]): FutebolEvento[] {
  const now = Date.now();
  const futurosComData = eventos
    .filter((evento) => isEventoFuturo(evento, now))
    .sort(sortByDateAsc);

  const pendentesSemData = eventos
    .filter((evento) => !isEventoFinalizado(evento, now) && toTimestamp(evento) === 0)
    .sort((a, b) => (a.idEvent || '').localeCompare(b.idEvent || '', 'pt-BR'));

  const merged = [...futurosComData, ...pendentesSemData];
  if (merged.length > 0) return merged.slice(0, 12);

  // Último fallback: só se não houver jogos pendentes.
  return [...eventos].sort(sortByDateDesc).slice(0, 12).reverse();
}

export function getResultadosRecentesFromEventos(eventos: FutebolEvento[]): FutebolEvento[] {
  const now = Date.now();
  return eventos
    .filter((evento) => isEventoFinalizado(evento, now))
    .sort(sortByDateDesc)
    .slice(0, 5);
}

export async function getProximosJogos(): Promise<FutebolEvento[]> {
  const eventos = await getEventos2026();
  return getProximosJogosFromEventos(eventos);
}

export async function getResultadosRecentes(): Promise<FutebolEvento[]> {
  const eventos = await getEventos2026();
  return getResultadosRecentesFromEventos(eventos);
}

export async function getTabelaBrasileirao(forceRefresh = false): Promise<TabelaBrasileiraoRow[]> {
  const now = Date.now();
  if (!forceRefresh && tabelaCache && now < tabelaCacheExpiration) {
    return tabelaCache;
  }

  if (tabelaInFlight) return tabelaInFlight;

  tabelaInFlight = fetchTabelaFromApi()
    .then((tabela) => {
      tabelaCache = tabela;
      tabelaCacheExpiration = Date.now() + TABELA_CACHE_TTL_MS;
      return tabela;
    })
    .finally(() => {
      tabelaInFlight = null;
    });

  return tabelaInFlight;
}

export async function getTimesSerieA2026(forceRefresh = false): Promise<TimeSerieA[]> {
  const now = Date.now();
  if (!forceRefresh && timesSerieACache && now < timesSerieACacheExpiration) {
    return timesSerieACache;
  }

  if (timesSerieAInFlight) return timesSerieAInFlight;

  timesSerieAInFlight = fetchTimesSerieAFromApi()
    .then((times) => {
      timesSerieACache = times;
      timesSerieACacheExpiration = Date.now() + TIMES_CACHE_TTL_MS;
      return times;
    })
    .finally(() => {
      timesSerieAInFlight = null;
    });

  return timesSerieAInFlight;
}

export async function getClassificacaoDoTime(
  nomeTime: string | null,
  teamId?: string | null
): Promise<TabelaBrasileiraoRow | null> {
  const tabela = await getTabelaBrasileirao();
  if (teamId) {
    const byId = tabela.find((row) => row.teamId === teamId);
    if (byId) return byId;
  }

  const normalized = normalizeTeamName(nomeTime);
  if (!normalized) return null;

  return (
    tabela.find((row) => normalizeTeamName(row.nomeTime) === normalized) ||
    tabela.find((row) => normalizeTeamName(row.nomeTime).includes(normalized)) ||
    tabela.find((row) => normalized.includes(normalizeTeamName(row.nomeTime))) ||
    null
  );
}

export async function getDetalhesTime(teamId: string): Promise<TimeDetalhes | null> {
  const preferredLogos = await getSupabaseTeamLogoMap();

  const local = await getLocalCbfBundles();
  const localFound = local.find((entry) => {
    const localId = String(entry.team.cbf_id || '').trim();
    return localId === teamId || normalizeTeamName(entry.team.name) === normalizeTeamName(teamId);
  });

  const sportsByName = await resolveSportsDbTeam(localFound?.team?.name || teamId);
  const mergedByName = mergeTeamDetails(
    localFound?.team || null,
    sportsByName,
    teamId,
    preferredLogos
  );
  if (mergedByName) return mergedByName;

  try {
    const response = await fetch(
      `${SPORTS_DB_URL}/lookupteam.php?id=${encodeURIComponent(teamId)}`
    );

    if (!response.ok) {
      throw new Error(`Falha ao carregar detalhes do time (${response.status})`);
    }

    const payload = (await response.json()) as LookupTeamResponse;
    if (Array.isArray(payload.teams) && payload.teams.length > 0) {
      return mergeTeamDetails(localFound?.team || null, payload.teams[0], teamId, preferredLogos);
    }
  } catch {
    // fallback abaixo
  }

  return mergeTeamDetails(localFound?.team || null, null, teamId, preferredLogos);
}

export async function getElencoTime(teamId: string): Promise<JogadorTime[]> {
  const local = await getLocalCbfBundles();
  const localFound = local.find((entry) => String(entry.team.cbf_id || '').trim() === teamId);
  const teamName = localFound?.team?.name || null;
  const sportsTeam = await resolveSportsDbTeam(teamName || teamId);

  if (sportsTeam?.idTeam) {
    try {
      const response = await fetch(
        `${SPORTS_DB_URL}/lookup_all_players.php?id=${encodeURIComponent(sportsTeam.idTeam)}`
      );

      if (response.ok) {
        const payload = (await response.json()) as LookupAllPlayersResponse;
        const players = Array.isArray(payload.player) ? payload.player : [];
        if (players.length > 0) {
          return mergeLocalSquadIntoApiPlayers(players, localFound?.squad || []);
        }
      }
    } catch {
      // tenta fallback abaixo
    }
  }

  const searchCandidates = buildSportsDbSearchCandidates(teamName || teamId);
  for (const candidate of searchCandidates) {
    try {
      const response = await fetch(
        `${SPORTS_DB_URL}/searchplayers.php?t=${encodeURIComponent(candidate)}`
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as SearchPlayersResponse;
      const players = Array.isArray(payload.player) ? payload.player : [];
      if (players.length > 0) {
        return mergeLocalSquadIntoApiPlayers(players, localFound?.squad || []);
      }
    } catch {
      // proximo alias
    }
  }

  try {
    const response = await fetch(
      `${SPORTS_DB_URL}/lookup_all_players.php?id=${encodeURIComponent(teamId)}`
    );

    if (!response.ok) {
      throw new Error(`Falha ao carregar elenco do time (${response.status})`);
    }

    const payload = (await response.json()) as LookupAllPlayersResponse;
    if (Array.isArray(payload.player) && payload.player.length > 0) {
      return mergeLocalSquadIntoApiPlayers(payload.player, localFound?.squad || []);
    }
  } catch {
    // fallback abaixo
  }

  if (localFound) {
    return (localFound.squad || []).map((player, index) => ({
      idPlayer: `${teamId}-${index + 1}`,
      strPlayer: player.name || null,
      strPosition: player.position || null,
      strCutout: null,
      strThumb: null,
      strNumber: player.number || null,
      strNationality: 'Brazil',
      intGoals: null,
    }));
  }

  return [];
}

export async function getProximosJogosTime(teamId: string): Promise<FutebolEvento[]> {
  const localBundles = await getLocalCbfBundles();
  const normalizedTeamId = normalizeTeamName(teamId);
  const localTeam = localBundles.find((entry) => {
    const localId = String(entry.team.cbf_id || '').trim();
    return localId === teamId || normalizeTeamName(entry.team.name) === normalizedTeamId;
  });
  const localTeamNameKey = localTeam ? normalizeTeamName(localTeam.team.name) : normalizedTeamId;

  const localEvents = await getEventos2026();
  const now = Date.now();
  const localFuture = localEvents
    .filter((event) => {
      const byId = event.idHomeTeam === teamId || event.idAwayTeam === teamId;
      const byName =
        !!localTeamNameKey &&
        (normalizeTeamName(event.strHomeTeam) === localTeamNameKey ||
          normalizeTeamName(event.strAwayTeam) === localTeamNameKey);
      return (byId || byName) && isEventoFuturo(event, now);
    })
    .sort(sortByDateAsc)
    .slice(0, 5);
  if (localFuture.length > 0) return localFuture;

  try {
    const response = await fetch(
      `${SPORTS_DB_URL}/eventsnext.php?id=${encodeURIComponent(teamId)}`
    );

    if (!response.ok) {
      throw new Error(`Falha ao carregar proximos jogos do time (${response.status})`);
    }

    const payload = (await response.json()) as EventosTimeResponse;
    const events = Array.isArray(payload.events) ? payload.events : [];
    if (events.length > 0) return events.sort(sortByDateAsc).slice(0, 5);
  } catch {
    // fallback abaixo
  }

  return [];
}

export async function getResultadosTime(teamId: string): Promise<FutebolEvento[]> {
  const localBundles = await getLocalCbfBundles();
  const normalizedTeamId = normalizeTeamName(teamId);
  const localTeam = localBundles.find((entry) => {
    const localId = String(entry.team.cbf_id || '').trim();
    return localId === teamId || normalizeTeamName(entry.team.name) === normalizedTeamId;
  });
  const localTeamNameKey = localTeam ? normalizeTeamName(localTeam.team.name) : normalizedTeamId;

  const localEvents = await getEventos2026();
  const now = Date.now();
  const localFinished = localEvents
    .filter((event) => {
      const byId = event.idHomeTeam === teamId || event.idAwayTeam === teamId;
      const byName =
        !!localTeamNameKey &&
        (normalizeTeamName(event.strHomeTeam) === localTeamNameKey ||
          normalizeTeamName(event.strAwayTeam) === localTeamNameKey);
      return (byId || byName) && isEventoFinalizado(event, now);
    })
    .sort(sortByDateDesc)
    .slice(0, 5);
  if (localFinished.length > 0) return localFinished;

  try {
    const response = await fetch(
      `${SPORTS_DB_URL}/eventslast.php?id=${encodeURIComponent(teamId)}`
    );

    if (!response.ok) {
      throw new Error(`Falha ao carregar resultados do time (${response.status})`);
    }

    const payload = (await response.json()) as ResultadosTimeResponse;
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length > 0) return results.sort(sortByDateDesc).slice(0, 5);
  } catch {
    // fallback abaixo
  }

  return [];
}

export function getArtilheiroDoTime(elenco: JogadorTime[]): JogadorTime | null {
  const atacantes = elenco.filter((player) =>
    (player.strPosition || '').toLowerCase().includes('forward')
  );

  const comGols = atacantes
    .map((player) => ({
      player,
      goals: Number(player.intGoals),
    }))
    .filter((entry) => Number.isFinite(entry.goals))
    .sort((a, b) => b.goals - a.goals);

  return comGols.length > 0 ? comGols[0].player : null;
}
