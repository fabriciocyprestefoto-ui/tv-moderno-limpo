/**
 * features/brasileirao/apiService.ts
 * API para dados do Brasileirão via TheSportsDB (gratuita)
 */

const BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const BRASILEIRAO_ID = '4351'; // Brasileirão Série A

export interface Standing {
  teamId: string;
  team: string;
  position: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
  goalDiff: number;
}

export interface Match {
  id: string;
  home: string;
  away: string;
  homeScore?: number | string | null;
  awayScore?: number | string | null;
  homeBadge?: string | null;
  awayBadge?: string | null;
  date: string;
  venue?: string | null;
}

export interface WikiSummary {
  title?: string;
  extract?: string;
  originalimage?: { source: string } | null;
}

export interface TeamDetailsInfo {
  id?: string;
  name?: string;
  badge?: string | null;
  banner?: string | null;
  stadium?: string | null;
  stadiumCapacity?: string | null;
  formedYear?: string | null;
  description?: string | null;
  website?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  jersey?: string | null;
}

export interface Player {
  id: string;
  name: string;
  position?: string | null;
  number?: string | null;
  nationality?: string | null;
  thumb?: string | null;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getBrasileiraoTable(): Promise<Standing[]> {
  const data = await fetchJSON<any>(`${BASE}/lookuptable.php?l=${BRASILEIRAO_ID}&s=2024`);
  if (!data?.table) return [];
  return (data.table as any[]).map((r: any) => ({
    teamId: r.idTeam || '',
    team: r.strTeam || '',
    position: Number(r.intRank) || 0,
    points: Number(r.intPoints) || 0,
    wins: Number(r.intWin) || 0,
    draws: Number(r.intDraw) || 0,
    losses: Number(r.intLoss) || 0,
    played: Number(r.intPlayed) || 0,
    goalDiff: Number(r.intGoalDifference) || 0,
  }));
}

export async function getTeamMatches(teamName: string): Promise<Match[]> {
  const data = await fetchJSON<any>(`${BASE}/searchevents.php?e=${encodeURIComponent(teamName)}`);
  if (!data?.event) return [];
  return (data.event as any[]).slice(0, 10).map((e: any) => ({
    id: e.idEvent || '',
    home: e.strHomeTeam || '',
    away: e.strAwayTeam || '',
    homeScore: e.intHomeScore,
    awayScore: e.intAwayScore,
    homeBadge: e.strHomeTeamBadge || null,
    awayBadge: e.strAwayTeamBadge || null,
    date: e.dateEvent || '',
    venue: e.strVenue || null,
  }));
}

export async function getTeamLastMatches(teamId: string): Promise<Match[]> {
  const data = await fetchJSON<any>(`${BASE}/eventslast.php?id=${teamId}`);
  if (!data?.results) return [];
  return (data.results as any[]).slice(0, 5).map((e: any) => ({
    id: e.idEvent || '',
    home: e.strHomeTeam || '',
    away: e.strAwayTeam || '',
    homeScore: e.intHomeScore,
    awayScore: e.intAwayScore,
    homeBadge: e.strHomeTeamBadge || null,
    awayBadge: e.strAwayTeamBadge || null,
    date: e.dateEvent || '',
    venue: e.strVenue || null,
  }));
}

export async function getTeamWikiSummary(wikiTitle: string): Promise<WikiSummary | null> {
  if (!wikiTitle) return null;
  try {
    const res = await fetch(
      `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || '',
      extract: data.extract || '',
      originalimage: data.originalimage || null,
    };
  } catch {
    return null;
  }
}

export async function lookupTeamDetails(tsdbId: string): Promise<TeamDetailsInfo | null> {
  if (!tsdbId) return null;
  const data = await fetchJSON<any>(`${BASE}/lookupteam.php?id=${tsdbId}`);
  if (!data?.teams?.[0]) return null;
  const t = data.teams[0];
  return {
    id: t.idTeam,
    name: t.strTeam,
    badge: t.strTeamBadge || null,
    banner: t.strTeamBanner || null,
    stadium: t.strStadium || null,
    stadiumCapacity: t.intStadiumCapacity || null,
    formedYear: t.intFormedYear || null,
    description: t.strDescriptionPT || t.strDescriptionEN || null,
    website: t.strWebsite || null,
    instagram: t.strInstagram || null,
    twitter: t.strTwitter || null,
    facebook: t.strFacebook || null,
    jersey: t.strTeamJersey || null,
  };
}

export async function getTeamPlayers(tsdbId: string): Promise<Player[]> {
  if (!tsdbId) return [];
  const data = await fetchJSON<any>(`${BASE}/lookup_all_players.php?id=${tsdbId}`);
  if (!data?.player) return [];
  return (data.player as any[]).map((p: any) => ({
    id: p.idPlayer || '',
    name: p.strPlayer || '',
    position: p.strPosition || null,
    number: p.strNumber || null,
    nationality: p.strNationality || null,
    thumb: p.strThumb || p.strCutout || null,
  }));
}
