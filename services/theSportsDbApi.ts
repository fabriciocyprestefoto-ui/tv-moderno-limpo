import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';

/**
 * services/theSportsDbApi.ts
 * Integração com TheSportsDB para logos, eventos e dados de competições brasileiras.
 * API Key lida de VITE_SPORTS_DB_KEY (free tier: "3" | paga: sua chave).
 *
 * League IDs:
 *  - Brazilian Serie A: 4351
 *  - Copa do Brasil: 4725
 *  - Copa Libertadores: 4501
 */

const SPORTS_DB_KEY = import.meta.env.VITE_SPORTS_DB_KEY ?? '3';
const API_BASE = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_KEY}`;

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */

export interface SportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string;
  strTeamAlternate: string;
  strBadge: string; // escudo (com fundo)
  strLogo: string; // logo (sem fundo — transparente)
  strCountry: string;
  strLeague: string;
  strStadium: string;
  strColour1: string;
  strColour2: string;
  strEquipment: string;
  strFanart1: string;
  strBanner: string;
}

export interface SportsDbEvent {
  idEvent: string;
  strEvent: string;
  strLeague: string;
  strSeason: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  intRound: string;
  dateEvent: string;
  strTime: string;
  strTimestamp: string;
  strStatus: string;
  strVenue: string;
  strThumb: string;
  strHomeTeamBadge: string;
  strAwayTeamBadge: string;
  strPostponed: string;
  idHomeTeam: string;
  idAwayTeam: string;
}

export interface SportsDbTodayTvEvent extends SportsDbEvent {
  strTVStation: string | null;
  strChannelLogo?: string | null;
  strHomeTeamColor1?: string | null;
  strHomeTeamColor2?: string | null;
  strAwayTeamColor1?: string | null;
  strAwayTeamColor2?: string | null;
}

export interface SportsDbPlayer {
  idPlayer: string;
  strPlayer: string | null;
  strNationality?: string | null;
  strNumber?: string | null;
  strPosition?: string | null;
  strCutout?: string | null;
  strThumb?: string | null;
  intGoals?: string | number | null;
}

export interface TeamBadgeMap {
  [teamName: string]: {
    badge: string; // escudo com fundo
    logo: string; // logo sem fundo
  };
}

/* ═══════════════════════════════════════════════════════
   CACHE
   ═══════════════════════════════════════════════════════ */

const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function cachedFetch<T>(url: string): Promise<T | null> {
  const now = Date.now();
  if (cache[url] && now - cache[url].ts < CACHE_TTL) {
    return cache[url].data as T;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    cache[url] = { data, ts: now };
    return data as T;
  } catch (err) {
    console.warn('[TheSportsDB] fetch error:', url, err);
    return null;
  }
}

async function cachedTextFetch(url: string): Promise<string | null> {
  const now = Date.now();
  if (cache[url] && now - cache[url].ts < CACHE_TTL) {
    return cache[url].data as string;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.text();
    cache[url] = { data, ts: now };
    return data;
  } catch (err) {
    console.warn('[TheSportsDB] fetch error:', url, err);
    return null;
  }
}

function sanitizeHexColor(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(normalized) || /^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized}`;
  }
  return null;
}

function normalizeTvKey(value: string | null | undefined): string {
  return stripDiacriticsSafe(String(value || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toAbsoluteSportsDbUrl(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.thesportsdb.com${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function parseChannelNameFromHref(href: string | null | undefined): string {
  const raw = String(href || '').trim();
  const match = raw.match(/\/channel\/\d+-([^/?#]+)/i);
  if (!match) return '';
  return decodeURIComponent(match[1])
    .replace(/-(tv-)?schedule$/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitEventName(value: string | null | undefined): {
  home: string | null;
  away: string | null;
} {
  const raw = String(value || '').trim();
  if (!raw) return { home: null, away: null };
  const parts = raw.split(/\s+vs\s+/i);
  if (parts.length < 2) return { home: raw || null, away: null };
  return {
    home: parts[0]?.trim() || null,
    away: parts.slice(1).join(' vs ').trim() || null,
  };
}

function normalizeSearchCandidate(value: string | null | undefined): string {
  return stripDiacriticsSafe(String(value || ''))
    .replace(/\bFC\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ═══════════════════════════════════════════════════════
   API CALLS
   ═══════════════════════════════════════════════════════ */

/** Busca todos os times de uma liga */
export async function getTeamsByLeague(leagueName: string): Promise<SportsDbTeam[]> {
  const data = await cachedFetch<{ teams: SportsDbTeam[] | null }>(
    `${API_BASE}/search_all_teams.php?l=${encodeURIComponent(leagueName)}`
  );
  return data?.teams || [];
}

/** Busca próximos eventos de uma liga (por ID) */
export async function getNextEvents(leagueId: number): Promise<SportsDbEvent[]> {
  const data = await cachedFetch<{ events: SportsDbEvent[] | null }>(
    `${API_BASE}/eventsnextleague.php?id=${leagueId}`
  );
  return data?.events || [];
}

/** Busca últimos eventos (resultados) de uma liga (por ID) */
export async function getLastEvents(leagueId: number): Promise<SportsDbEvent[]> {
  const data = await cachedFetch<{ events: SportsDbEvent[] | null }>(
    `${API_BASE}/eventspastleague.php?id=${leagueId}`
  );
  return data?.events || [];
}

/** Busca eventos por rodada */
export async function getEventsByRound(
  leagueId: number,
  round: number,
  season: string
): Promise<SportsDbEvent[]> {
  const data = await cachedFetch<{ events: SportsDbEvent[] | null }>(
    `${API_BASE}/eventsround.php?id=${leagueId}&r=${round}&s=${season}`
  );
  return data?.events || [];
}

/** Busca tabela de classificação */
export async function getStandings(leagueId: number, season: string): Promise<any[]> {
  const data = await cachedFetch<{ table: any[] | null }>(
    `${API_BASE}/lookuptable.php?l=${leagueId}&s=${season}`
  );
  return data?.table || [];
}

/** Busca time por nome */
export async function searchTeam(teamName: string): Promise<SportsDbTeam | null> {
  const data = await cachedFetch<{ teams: SportsDbTeam[] | null }>(
    `${API_BASE}/searchteams.php?t=${encodeURIComponent(teamName)}`
  );
  return data?.teams?.[0] || null;
}

export async function getTeamById(teamId: string): Promise<SportsDbTeam | null> {
  const data = await cachedFetch<{ teams: SportsDbTeam[] | null }>(
    `${API_BASE}/lookupteam.php?id=${encodeURIComponent(teamId)}`
  );
  return data?.teams?.[0] || null;
}

export async function getTeamPlayers(teamId: string): Promise<SportsDbPlayer[]> {
  const data = await cachedFetch<{ player: SportsDbPlayer[] | null }>(
    `${API_BASE}/lookup_all_players.php?id=${encodeURIComponent(teamId)}`
  );
  return data?.player || [];
}

export async function getTeamNextEvents(teamId: string): Promise<SportsDbEvent[]> {
  const data = await cachedFetch<{ events: SportsDbEvent[] | null }>(
    `${API_BASE}/eventsnext.php?id=${encodeURIComponent(teamId)}`
  );
  return data?.events || [];
}

export async function getTeamLastEvents(teamId: string): Promise<SportsDbEvent[]> {
  const data = await cachedFetch<{ results: SportsDbEvent[] | null }>(
    `${API_BASE}/eventslast.php?id=${encodeURIComponent(teamId)}`
  );
  return (data as any)?.events || (data as any)?.results || [];
}

interface SportsDbLookupEventResponse {
  events: (SportsDbEvent & { strSport?: string | null })[] | null;
}

async function resolveTeamBranding(
  teamId: string | null | undefined,
  teamName: string | null | undefined
) {
  let team = teamId ? await getTeamById(teamId) : null;

  if (!team && teamName) {
    const candidates = Array.from(
      new Set([String(teamName).trim(), normalizeSearchCandidate(teamName)].filter(Boolean))
    );

    for (const candidate of candidates) {
      team = await searchTeam(candidate);
      if (team) break;
    }
  }

  return {
    badge: team?.strBadge || team?.strLogo || null,
    color1: sanitizeHexColor(team?.strColour1),
    color2: sanitizeHexColor(team?.strColour2),
  };
}

export async function getEventById(
  eventId: string
): Promise<(SportsDbEvent & { strSport?: string | null }) | null> {
  const data = await cachedFetch<SportsDbLookupEventResponse>(
    `${API_BASE}/lookupevent.php?id=${encodeURIComponent(eventId)}`
  );
  return data?.events?.[0] || null;
}

export async function getBrazilTvScheduleToday(): Promise<SportsDbTodayTvEvent[]> {
  if (typeof DOMParser === 'undefined') return [];

  const html = await cachedTextFetch('https://www.thesportsdb.com/browse_tv/?c=Brazil');
  if (!html) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const channelLogoMap = new Map<string, string>();

  doc.querySelectorAll<HTMLAnchorElement>("a[href*='/channel/']").forEach((anchor) => {
    const href = toAbsoluteSportsDbUrl(anchor.getAttribute('href'));
    const logoImg = anchor.querySelector<HTMLImageElement>("img[alt='channel logo']");
    const logo = toAbsoluteSportsDbUrl(logoImg?.getAttribute('src'));

    if (!href || !logo) return;

    const textName = anchor.textContent?.trim() || '';
    const hrefName = parseChannelNameFromHref(href);

    channelLogoMap.set(normalizeTvKey(href), logo);
    if (textName) channelLogoMap.set(normalizeTvKey(textName), logo);
    if (hrefName) channelLogoMap.set(normalizeTvKey(hrefName), logo);
  });

  const channelLogoRegex =
    /<a[^>]+href=['"]([^'"]*\/channel\/[^'"]+)['"][^>]*\/?>\s*<img[^>]+src=['"]([^'"]+)['"][^>]+alt=['"]channel logo['"]/gi;
  let regexMatch: RegExpExecArray | null = null;
  while ((regexMatch = channelLogoRegex.exec(html)) !== null) {
    const href = toAbsoluteSportsDbUrl(regexMatch[1]);
    const logo = toAbsoluteSportsDbUrl(regexMatch[2]);
    if (!href || !logo) continue;
    const hrefName = parseChannelNameFromHref(href);
    channelLogoMap.set(normalizeTvKey(href), logo);
    if (hrefName) channelLogoMap.set(normalizeTvKey(hrefName), logo);
  }

  const cards = Array.from(doc.querySelectorAll<HTMLElement>('.tv-events-grid .tv-event-card'));
  const items: Array<SportsDbTodayTvEvent | null> = await Promise.all(
    cards.map(async (card, index) => {
      const eventLink = card.querySelector<HTMLAnchorElement>("a[href*='/event/']");
      const channelLink = card.querySelector<HTMLAnchorElement>("a[href*='/channel/']");
      const rawTitle = eventLink?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const timeMatch = card.textContent?.match(/(\d{2}:\d{2})\s*UTC/i);
      const eventId = eventLink?.getAttribute('href')?.match(/\/event\/(\d+)/i)?.[1] || '';
      const channelName = channelLink?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const channelHref = toAbsoluteSportsDbUrl(channelLink?.getAttribute('href'));
      const channelLogo =
        (channelHref && channelLogoMap.get(normalizeTvKey(channelHref))) ||
        channelLogoMap.get(normalizeTvKey(channelName)) ||
        channelLogoMap.get(normalizeTvKey(parseChannelNameFromHref(channelHref))) ||
        null;
      const eventThumb = toAbsoluteSportsDbUrl(
        eventLink?.querySelector<HTMLImageElement>("img[alt='event thumb']")?.getAttribute('src')
      );
      const event = eventId ? await getEventById(eventId) : null;
      const sportName = String(event?.strSport || '').toLowerCase();

      if (sportName && sportName !== 'soccer') return null;

      const { home, away } = splitEventName(event?.strEvent || rawTitle);
      const [homeBranding, awayBranding] = await Promise.all([
        resolveTeamBranding(event?.idHomeTeam, event?.strHomeTeam || home),
        resolveTeamBranding(event?.idAwayTeam, event?.strAwayTeam || away),
      ]);

      return {
        idEvent: event?.idEvent || eventId || `tv-${index}-${normalizeTvKey(rawTitle)}`,
        strEvent: event?.strEvent || rawTitle,
        strLeague: event?.strLeague || 'Jogos do dia',
        strSeason: event?.strSeason || String(new Date().getFullYear()),
        strHomeTeam: event?.strHomeTeam || home || '',
        strAwayTeam: event?.strAwayTeam || away || '',
        intHomeScore: event?.intHomeScore || null,
        intAwayScore: event?.intAwayScore || null,
        intRound: event?.intRound || '',
        dateEvent: event?.dateEvent || new Date().toISOString().slice(0, 10),
        strTime: (timeMatch?.[1] || event?.strTime || '').trim(),
        strTimestamp: event?.strTimestamp || '',
        strStatus: event?.strStatus || 'Scheduled',
        strVenue: event?.strVenue || '',
        strTVStation: channelName || null,
        strThumb: eventThumb || event?.strThumb || '',
        strHomeTeamBadge: homeBranding.badge || event?.strHomeTeamBadge || '',
        strAwayTeamBadge: awayBranding.badge || event?.strAwayTeamBadge || '',
        strPostponed: event?.strPostponed || '',
        idHomeTeam: event?.idHomeTeam || '',
        idAwayTeam: event?.idAwayTeam || '',
        strChannelLogo: channelLogo,
        strHomeTeamColor1: homeBranding.color1,
        strHomeTeamColor2: homeBranding.color2,
        strAwayTeamColor1: awayBranding.color1,
        strAwayTeamColor2: awayBranding.color2,
      };
    })
  );

  return items.filter((item): item is SportsDbTodayTvEvent => Boolean(item));
}

/* ═══════════════════════════════════════════════════════
   BADGE MAP BUILDER
   ═══════════════════════════════════════════════════════ */

/** Constrói mapa de nomes de times → { badge, logo } para uso no TeamLogo */
export async function buildTeamBadgeMap(leagueName: string): Promise<TeamBadgeMap> {
  const teams = await getTeamsByLeague(leagueName);
  const map: TeamBadgeMap = {};

  for (const team of teams) {
    const names = [
      team.strTeam,
      ...(team.strTeamAlternate
        ? team.strTeamAlternate
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean)
        : []),
    ];

    const entry = {
      badge: team.strBadge || '',
      logo: team.strLogo || team.strBadge || '',
    };

    for (const name of names) {
      map[name] = entry;
    }

    // Aliases comuns para times brasileiros
    const aliases: Record<string, string[]> = {
      'Athletico Paranaense': ['Athletico-PR', 'Athletico PR', 'CAP'],
      'Atlético Mineiro': ['Atlético-MG', 'Atlético MG', 'Galo'],
      'Vasco da Gama': ['Vasco'],
      'Red Bull Bragantino': ['RB Bragantino', 'Bragantino'],
      'São Paulo': ['São Paulo FC', 'SPFC'],
      Palmeiras: ['Verdão'],
      Flamengo: ['Mengão'],
      Corinthians: ['Timão'],
      Santos: ['Peixe'],
      Botafogo: ['Glorioso'],
      Internacional: ['Inter'],
      Cruzeiro: ['Raposa'],
      Grêmio: ['Tricolor Gaúcho'],
      Fluminense: ['Flu', 'Tricolor'],
      Fortaleza: ['Leão'],
      Bahia: ['Tricolor de Aço'],
      Vitória: ['Leão da Barra'],
      Sport: ['Sport Recife'],
      Chapecoense: ['Chape'],
      Coritiba: ['Coxa'],
      Remo: ['Leão Azul'],
      Mirassol: ['Leão da Alta'],
      Ceará: ['Vozão'],
      Juventude: ['Juve'],
    };

    if (aliases[team.strTeam]) {
      for (const alias of aliases[team.strTeam]) {
        map[alias] = entry;
      }
    }
  }

  return map;
}

/* ═══════════════════════════════════════════════════════
   LEAGUE IDS
   ═══════════════════════════════════════════════════════ */

export const LEAGUE_IDS = {
  BRASILEIRAO_A: 4351,
  COPA_DO_BRASIL: 4725,
  COPA_LIBERTADORES: 4501,
};

export const LEAGUE_NAMES = {
  BRASILEIRAO_A: 'Brazilian Serie A',
  COPA_DO_BRASIL: 'Copa do Brasil',
  COPA_LIBERTADORES: 'Copa Libertadores',
};

/* ═══════════════════════════════════════════════════════
   SELEÇÃO BRASILEIRA
   ═══════════════════════════════════════════════════════ */

/** Busca dados da Seleção Brasileira */
export async function getBrazilNationalTeam(): Promise<SportsDbTeam | null> {
  return searchTeam('Brazil');
}

/** Busca próximos jogos da Seleção Brasileira (via eventos do time) */
export async function getBrazilNextEvents(): Promise<SportsDbEvent[]> {
  const team = await getBrazilNationalTeam();
  if (!team) return [];
  const data = await cachedFetch<{ events: SportsDbEvent[] | null }>(
    `${API_BASE}/eventsnext.php?id=${team.idTeam}`
  );
  return data?.events || [];
}

/** Busca últimos jogos da Seleção Brasileira */
export async function getBrazilLastEvents(): Promise<SportsDbEvent[]> {
  const team = await getBrazilNationalTeam();
  if (!team) return [];
  const data = await cachedFetch<{ events: SportsDbEvent[] | null }>(
    `${API_BASE}/eventslast.php?id=${team.idTeam}`
  );
  return data?.events || [];
}
