/**
 * services/sportsApi.ts
 *
 * Cliente para a Futebol Brasil API (local / self-hosted).
 * URL base: VITE_SPORTS_API_URL (default: REDX API ESPORTE na Vercel)
 *
 * Cobre futebol BR, Europa, Copa 2026, NBA e Lutas/UFC.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env
    ? ((import.meta as unknown as { env: Record<string, string> }).env.VITE_SPORTS_API_URL ?? 'https://futebol-brasil-api-vercel-ok.vercel.app')
    : 'https://futebol-brasil-api-vercel-ok.vercel.app').replace(/\/$/, '') + '/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SportsCard {
  id: string
  type: 'match' | 'team' | 'competition' | 'fighter' | 'event'
  title: string
  subtitle?: string
  image?: string | null
  logoLeft?: string | null
  logoRight?: string | null
  badge?: string | null
  status?: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
  date?: string
  time?: string
  score?: { home: number | null; away: number | null }
  competition?: string
  href?: string
  sport?: string
}

export interface SportsSection {
  id: string
  title: string
  type: string
  items: SportsCard[]
}

export interface SportsHome {
  updatedAt: string
  sections: SportsSection[]
}

export interface FootballMatch {
  id: string
  sport: string
  competition: string
  homeTeam: { id: string; name: string; logo?: string | null }
  awayTeam: { id: string; name: string; logo?: string | null }
  date: string
  time?: string
  status: string
  score?: { home: number | null; away: number | null } | null
  venue?: string | null
  city?: string | null
  broadcast?: string[]
  broadcasts?: SportsBroadcast[]
  transmissoes?: SportsBroadcast[]
  updatedAt: string
}

export interface SportsBroadcast {
  canal: string
  tipo: 'tv_aberta' | 'tv_fechada' | 'streaming' | 'youtube' | 'desconhecido'
  url: string | null
  logo: string | null
}

export interface NBAGame {
  id: string
  sport: string
  competition: string
  homeTeam: { id: string; name: string; logo?: string | null }
  awayTeam: { id: string; name: string; logo?: string | null }
  date: string
  time?: string
  status: string
  score?: { home: number | null; away: number | null } | null
  period?: number | null
  clock?: string | null
  venue?: string | null
  broadcast?: string[]
  updatedAt: string
}

export interface NBAStandings {
  east: NBATeamRecord[]
  west: NBATeamRecord[]
}

export interface NBATeamRecord {
  position: number
  team: string
  logo?: string | null
  wins: number
  losses: number
  winPct: number
}

export interface NBATeam {
  id: string
  name: string
  shortName?: string
  logo?: string | null
  color?: string | null
  conference?: string | null
  squad?: NBAPlayer[]
}

export interface NBAPlayer {
  id: string
  name: string
  photo?: string | null
  position?: string | null
  jersey?: string | null
  age?: number | null
  nationality?: string | null
}

export interface FightEvent {
  id: string
  sport: string
  name: string
  nickname?: string | null
  date: string
  time?: string
  venue?: string | null
  city?: string | null
  country?: string | null
  status: string
  mainEvent?: {
    fighter1: FightFighter
    fighter2: FightFighter
    weightClass: string
    rounds: number
    winner?: string | null
    method?: string | null
  } | null
  card?: FightCard[]
  broadcast?: string[]
}

export interface FightFighter {
  id: string
  name: string
  nickname?: string | null
  country?: string | null
  flag?: string | null
  record?: string | null
  photo?: string | null
}

export interface FightCard {
  id: string
  weightClass: string
  rounds: number
  fighter1: Omit<FightFighter, 'id'>
  fighter2: Omit<FightFighter, 'id'>
  winner?: string | null
  method?: string | null
  status: string
}

export interface FootballTeam {
  id: string
  name: string
  logo?: string | null
  country?: string
  state?: string
  city?: string
  stadium?: { name?: string; capacity?: number | null }
  founded?: string
  colors?: string[]
  coach?: string | null
  // História e títulos
  history?: string | null
  historiaCompleta?: string | null
  honors?: string[]
  conquistasInternacionais?: number
  conquistasNacionais?: number
  // Identidade do clube
  apelidos?: string[]
  mascote?: string | null
  hino?: string | null
  presidente?: string | null
  socioTorcedor?: string | null
  museu?: string | null
  redesSociais?: {
    instagram?: string | null
    twitter?: string | null
    youtube?: string | null
    tiktok?: string | null
    facebook?: string | null
  }
  rivais?: string[]
  // Elenco com fotos ESPN
  squad?: FootballPlayer[]
  elenco?: FootballPlayer[]
  proximosJogos?: FootballMatch[]
  ultimosResultados?: FootballMatch[]
  updatedAt?: string
}

export interface FootballPlayer {
  id?: string | null
  nome: string
  posicao?: string | null
  numero?: number | null
  nacionalidade?: string | null
  idade?: number | null
  foto?: string | null
  fotoReal?: boolean
  perfilUrl?: string | null
}

export interface FootballTopScorer {
  posicao: number
  jogador: string
  time: string
  gols: number
  assistencias: number | null
  foto: string
  fotoReal?: boolean
  perfilUrl?: string | null
}

export interface Competition {
  id: string
  name: string
  country: string
  type: string
  logo?: string | null
}

export interface StandingsRow {
  posicao: number
  time: string
  escudo?: string | null
  jogos: number
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  golsPro: number
  golsContra: number
  saldoGols: number
  aproveitamento: number
}

export interface RedxFootballFull {
  competition: string
  endpoints: Record<string, string>
  jogosDoDia: FootballMatch[]
  transmissoesHoje: Array<{
    matchId: string
    jogo: string
    campeonato: string
    data: string
    horario?: string
    homeTeam?: { name: string; logo?: string | null }
    awayTeam?: { name: string; logo?: string | null }
    transmissoes: SportsBroadcast[]
  }>
  times: Array<{
    id: string
    name: string
    slug: string
    logo?: string | null
    escudo?: string | null
    city?: string
    state?: string
    stadium?: string
    colors?: string[]
    teamUrl?: string
    squadUrl?: string
    matchesUrl?: string
  }>
  tabela: StandingsRow[]
  artilharia: FootballTopScorer[]
  ultimosResultados: FootballMatch[]
  proximosJogos: FootballMatch[]
  updatedAt: string
}

export interface WorldCup2026Info {
  nome: string
  edicao: number
  ano: number
  paises: string[]
  inicio: string
  fim: string
  selecoesParticipantes: number
  totalJogos: number
  mascote: string
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

const API_TIMEOUT_MS = 8000

const DEV: boolean =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

/** Log apenas em desenvolvimento — silencioso em produção/TV Box. */
function logError(...args: unknown[]): void {
  if (DEV) console.error(...args)
}

async function apiFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, v) })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) throw new Error(`SportsAPI ${res.status}: ${endpoint}`)
    const json = await res.json()
    return (json.data ?? json) as T
  } finally {
    clearTimeout(timer)
  }
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Home agregada — seções prontas para o app de TV */
export async function getSportsHome(): Promise<SportsHome> {
  try {
    return await apiFetch<SportsHome>('/sports/home')
  } catch (e) {
    logError('[SportsAPI] getSportsHome error:', e)
    return { updatedAt: new Date().toISOString(), sections: [] }
  }
}

/** Partidas de futebol de hoje (BR + internacional) */
export async function getTodayFootballMatches(): Promise<FootballMatch[]> {
  try {
    return await apiFetch<FootballMatch[]>('/football/matches/today')
  } catch (e) {
    logError('[SportsAPI] getTodayFootballMatches error:', e)
    return []
  }
}

/** Próximas partidas de futebol */
export async function getUpcomingMatches(days = 7): Promise<FootballMatch[]> {
  try {
    return await apiFetch<FootballMatch[]>('/football/matches/upcoming', { days: String(days) })
  } catch (e) {
    logError('[SportsAPI] getUpcomingMatches error:', e)
    return []
  }
}

/** Partidas ao vivo */
export async function getLiveMatches(): Promise<FootballMatch[]> {
  try {
    return await apiFetch<FootballMatch[]>('/football/matches/live')
  } catch (e) {
    logError('[SportsAPI] getLiveMatches error:', e)
    return []
  }
}

/** Partidas recentes encerradas */
export async function getRecentMatches(): Promise<FootballMatch[]> {
  try {
    return await apiFetch<FootballMatch[]>('/football/matches/recent')
  } catch (e) {
    logError('[SportsAPI] getRecentMatches error:', e)
    return []
  }
}

/** Pacote completo da REDX API para a página Futebol */
export async function getRedxFootballFull(days = 14): Promise<RedxFootballFull | null> {
  try {
    return await apiFetch<RedxFootballFull>('/football/brasil/full', { days: String(days) })
  } catch (e) {
    logError('[SportsAPI] getRedxFootballFull error:', e)
    return null
  }
}

/** Lista de competições disponíveis */
export async function getCompetitions(): Promise<Competition[]> {
  try {
    return await apiFetch<Competition[]>('/football/competitions')
  } catch (e) {
    logError('[SportsAPI] getCompetitions error:', e)
    return []
  }
}

/** Tabela de classificação de uma competição */
export async function getCompetitionStandings(competitionId: string): Promise<StandingsRow[]> {
  try {
    return await apiFetch<StandingsRow[]>(`/football/competitions/${competitionId}/standings`)
  } catch (e) {
    logError('[SportsAPI] getCompetitionStandings error:', e)
    return []
  }
}

/** Artilharia com foto sempre preenchida */
export async function getCompetitionTopScorers(competitionId: string): Promise<FootballTopScorer[]> {
  try {
    return await apiFetch<FootballTopScorer[]>(`/football/competitions/${competitionId}/top-scorers`)
  } catch (e) {
    logError('[SportsAPI] getCompetitionTopScorers error:', e)
    return []
  }
}

/** Partidas de uma competição em uma data */
export async function getCompetitionMatches(competitionId: string, date?: string): Promise<FootballMatch[]> {
  try {
    const params: Record<string, string> = {}
    if (date) params.date = date
    return await apiFetch<FootballMatch[]>(`/football/competitions/${competitionId}/matches`, params)
  } catch (e) {
    logError('[SportsAPI] getCompetitionMatches error:', e)
    return []
  }
}

/** Lista de times brasileiros */
export async function getTeams(): Promise<FootballTeam[]> {
  try {
    return await apiFetch<FootballTeam[]>('/football/teams')
  } catch (e) {
    logError('[SportsAPI] getTeams error:', e)
    return []
  }
}

/** Detalhes de um time (com elenco) */
export async function getTeamDetails(teamId: string): Promise<FootballTeam | null> {
  try {
    return await apiFetch<FootballTeam>(`/football/teams/${teamId}`)
  } catch (e) {
    logError('[SportsAPI] getTeamDetails error:', e)
    return null
  }
}

/** Elenco de um time */
export async function getTeamSquad(teamId: string): Promise<FootballPlayer[]> {
  try {
    return await apiFetch<FootballPlayer[]>(`/football/teams/${teamId}/squad`)
  } catch (e) {
    logError('[SportsAPI] getTeamSquad error:', e)
    return []
  }
}

// ─── Copa do Mundo 2026 ────────────────────────────────────────────────────────

export async function getWorldCup2026(): Promise<WorldCup2026Info | null> {
  try {
    return await apiFetch<WorldCup2026Info>('/world-cup/2026')
  } catch (e) {
    logError('[SportsAPI] getWorldCup2026 error:', e)
    return null
  }
}

export async function getWorldCupTeams(): Promise<unknown[]> {
  try {
    return await apiFetch<unknown[]>('/world-cup/2026/teams')
  } catch (e) {
    logError('[SportsAPI] getWorldCupTeams error:', e)
    return []
  }
}

export async function getWorldCupGroups(): Promise<unknown[]> {
  try {
    return await apiFetch<unknown[]>('/world-cup/2026/groups')
  } catch (e) {
    logError('[SportsAPI] getWorldCupGroups error:', e)
    return []
  }
}

export async function getWorldCupMatches(): Promise<FootballMatch[]> {
  try {
    return await apiFetch<FootballMatch[]>('/world-cup/2026/matches')
  } catch (e) {
    logError('[SportsAPI] getWorldCupMatches error:', e)
    return []
  }
}

export async function getWorldCupStadiums(): Promise<unknown[]> {
  try {
    return await apiFetch<unknown[]>('/world-cup/2026/stadiums')
  } catch (e) {
    logError('[SportsAPI] getWorldCupStadiums error:', e)
    return []
  }
}

// ─── NBA ──────────────────────────────────────────────────────────────────────

/** Jogos NBA de hoje */
export async function getNbaGamesToday(): Promise<NBAGame[]> {
  try {
    return await apiFetch<NBAGame[]>('/nba/games/today')
  } catch (e) {
    logError('[SportsAPI] getNbaGamesToday error:', e)
    return []
  }
}

/** Próximos jogos NBA */
export async function getNbaGamesUpcoming(days = 7): Promise<NBAGame[]> {
  try {
    return await apiFetch<NBAGame[]>('/nba/games/upcoming', { days: String(days) })
  } catch (e) {
    logError('[SportsAPI] getNbaGamesUpcoming error:', e)
    return []
  }
}

/** Alias retrocompatível */
export async function getNbaGames(): Promise<NBAGame[]> {
  return getNbaGamesToday()
}

/** Tabela NBA (leste + oeste) */
export async function getNbaStandings(): Promise<NBAStandings> {
  try {
    return await apiFetch<NBAStandings>('/nba/standings')
  } catch (e) {
    logError('[SportsAPI] getNbaStandings error:', e)
    return { east: [], west: [] }
  }
}

/** Times NBA */
export async function getNbaTeams(): Promise<NBATeam[]> {
  try {
    return await apiFetch<NBATeam[]>('/nba/teams')
  } catch (e) {
    logError('[SportsAPI] getNbaTeams error:', e)
    return []
  }
}

/** Detalhe de um time NBA (com roster) */
export async function getNbaTeamDetails(teamId: string): Promise<NBATeam | null> {
  try {
    return await apiFetch<NBATeam>(`/nba/teams/${teamId}`)
  } catch (e) {
    logError('[SportsAPI] getNbaTeamDetails error:', e)
    return null
  }
}

/** Perfil de jogador NBA */
export async function getNbaPlayer(playerId: string): Promise<NBAPlayer | null> {
  try {
    return await apiFetch<NBAPlayer>(`/nba/players/${playerId}`)
  } catch (e) {
    logError('[SportsAPI] getNbaPlayer error:', e)
    return null
  }
}

// ─── Fights / UFC ─────────────────────────────────────────────────────────────

/** Próximo evento UFC ao vivo ou iminente */
export async function getFightEvents(): Promise<FightEvent[]> {
  try {
    return await apiFetch<FightEvent[]>('/fights/events')
  } catch (e) {
    logError('[SportsAPI] getFightEvents error:', e)
    return []
  }
}

/** Calendário completo de eventos de lutas */
export async function getFightEventsUpcoming(): Promise<FightEvent[]> {
  try {
    return await apiFetch<FightEvent[]>('/fights/events/upcoming')
  } catch (e) {
    logError('[SportsAPI] getFightEventsUpcoming error:', e)
    return []
  }
}

/** Detalhe de um evento de lutas */
export async function getFightEventDetails(eventId: string): Promise<FightEvent | null> {
  try {
    return await apiFetch<FightEvent>(`/fights/events/${eventId}`)
  } catch (e) {
    logError('[SportsAPI] getFightEventDetails error:', e)
    return null
  }
}

/** Perfil de lutador */
export async function getFighter(fighterId: string): Promise<FightFighter | null> {
  try {
    return await apiFetch<FightFighter>(`/fights/fighters/${fighterId}`)
  } catch (e) {
    logError('[SportsAPI] getFighter error:', e)
    return null
  }
}

// ─── Busca global ─────────────────────────────────────────────────────────────

export async function searchSports(query: string): Promise<SportsCard[]> {
  if (!query || query.length < 2) return []
  try {
    return await apiFetch<SportsCard[]>('/search', { q: query })
  } catch (e) {
    logError('[SportsAPI] searchSports error:', e)
    return []
  }
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

export function formatMatchDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d
      .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
      .toUpperCase()
  } catch {
    return dateStr
  }
}

export function formatMatchTime(dateStr: string, timeStr?: string): string {
  if (timeStr) {
    const m = timeStr.match(/^(\d{2}:\d{2})/)
    if (m) return m[1]
  }
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '--:--'
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

export function isLive(status: string): boolean {
  return status === 'live' || status === 'ao_vivo'
}

export function isFinished(status: string): boolean {
  return status === 'finished' || status === 'encerrado'
}
