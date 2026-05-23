import { supabase } from '@/services/supabaseService';
import { TEAM_LOGO_SVG_OVERRIDES } from '@/features/futebol/services/futebolService';
import { stripDiacriticsSafe } from '@/utils/safeUnicodeNormalize';

const SPORTS_DB_KEY = import.meta.env.VITE_SPORTS_DB_KEY ?? '3';
const SPORTS_DB_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_KEY}`;

export interface JogoTransmissao {
  id: string;
  titulo: string | null;
  time_casa: string | null;
  time_fora: string | null;
  canal: string | null;
  start_time: string | null;
  end_time: string | null;
}

/** Formato unificado para exibição (compatível com FutebolEvento) */
export interface JogoTransmissaoView {
  idEvent: string;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  dateEvent: string;
  strTime: string;
  strTVStation: string | null;
  canal: string | null;
}

// ─── Cache de escudos em memória ────────────────────────────────────────────
const badgeCache = new Map<string, string | null>();
const badgeInFlight = new Map<string, Promise<string | null>>();

// Pré-carrega logos SVG dos times da Série A para resposta instantânea
Object.entries(TEAM_LOGO_SVG_OVERRIDES).forEach(([key, url]) => {
  badgeCache.set(key, url);
});

/**
 * Mapa de aliases: normaliza variações de nome para a chave canônica.
 * As chaves canônicas coincidem com as presentes em TEAM_LOGO_SVG_OVERRIDES.
 */
const TEAM_ALIAS_MAP: Record<string, string> = {
  // Atlético MG / Mineiro — canônico: atleticomineiro
  atletico: 'atleticomineiro',
  atleticomg: 'atleticomineiro',
  caatleticomineiro: 'atleticomineiro',
  clubeatleticomineiro: 'atleticomineiro',
  // Athletico PR — canônico: athleticoparanaense
  athletico: 'athleticoparanaense',
  athleticopr: 'athleticoparanaense',
  // Bragantino — canônico: redbullbragantino
  bragantino: 'redbullbragantino',
  rbbbragantino: 'redbullbragantino',
  rbbragantino: 'redbullbragantino',
  // Vasco — canônico: vascodagama
  vasco: 'vascodagama',
  cravascodagama: 'vascodagama',
  // São Paulo — canônico: saopaulo
  saopaulofc: 'saopaulo',
  spfc: 'saopaulo',
  // Sport — canônico: sportrecife
  sport: 'sportrecife',
  sportclubdorecife: 'sportrecife',
  // Vitória — canônico: vitoria
  ecvitoria: 'vitoria',
  vitoriaec: 'vitoria',
  vitoriaecba: 'vitoria',
  // Ceará — canônico: ceara
  cearasc: 'ceara',
  // Fluminense — canônico: fluminense
  fluminensefc: 'fluminense',
  // Grêmio — canônico: gremio
  gremiofbpa: 'gremio',
  gremiofootball: 'gremio',
  // Fortaleza — canônico: fortaleza
  fortalezaec: 'fortaleza',
  // Juventude — canônico: juventude
  ecjuventude: 'juventude',
  // Mirassol — canônico: mirassol
  mirassolfc: 'mirassol',
  // Cruzeiro — canônico: cruzeiro
  cruzeiroec: 'cruzeiro',
};

function normalizeKey(name: string | null | undefined): string {
  const raw = stripDiacriticsSafe(String(name || '').toLowerCase())
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return TEAM_ALIAS_MAP[raw] ?? raw;
}

/** Nomes usados para pre-fetch no TheSportsDB (20 times Série A 2026) */
const SERIE_A_PREFETCH_NAMES: string[] = [
  'Flamengo',
  'Palmeiras',
  'Corinthians',
  'São Paulo',
  'Santos',
  'Vasco da Gama',
  'Fluminense',
  'Botafogo',
  'Atletico Mineiro',
  'Cruzeiro',
  'Gremio',
  'Internacional',
  'Bahia',
  'Fortaleza',
  'Ceara',
  'Red Bull Bragantino',
  'Juventude',
  'Sport Recife',
  'Vitoria',
  'Mirassol',
];

// Pré-fetch dos escudos reais via TheSportsDB — não bloqueia o carregamento
if (typeof window !== 'undefined') {
  setTimeout(() => {
    for (let i = 0; i < SERIE_A_PREFETCH_NAMES.length; i += 4) {
      Promise.allSettled(
        SERIE_A_PREFETCH_NAMES.slice(i, i + 4).map((n) => fetchBadgeFromSportsDB(n))
      );
    }
  }, 500);
}

/** Busca o escudo de um time pelo nome na TheSportsDB (key 123, free tier) */
async function fetchBadgeFromSportsDB(teamName: string): Promise<string | null> {
  const key = normalizeKey(teamName);
  if (!key) return null;
  if (badgeCache.has(key)) return badgeCache.get(key) ?? null;
  if (badgeInFlight.has(key)) return badgeInFlight.get(key)!;

  const inFlight = fetch(`${SPORTS_DB_URL}/searchteams.php?t=${encodeURIComponent(teamName)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const json = (await res.json()) as { teams?: Array<{ strTeamBadge?: string | null }> | null };
      const badge = json?.teams?.[0]?.strTeamBadge ?? null;
      badgeCache.set(key, badge);
      return badge;
    })
    .catch(() => {
      badgeCache.set(key, null);
      return null;
    })
    .finally(() => {
      badgeInFlight.delete(key);
    });

  badgeInFlight.set(key, inFlight);
  return inFlight;
}

/** Busca escudos para todos os times únicos de uma lista de jogos (em paralelo) */
async function enrichBadges(jogos: JogoTransmissaoView[]): Promise<JogoTransmissaoView[]> {
  const teams = new Set<string>();
  jogos.forEach((j) => {
    if (j.strHomeTeam) teams.add(j.strHomeTeam);
    if (j.strAwayTeam) teams.add(j.strAwayTeam);
  });

  // Busca em paralelo (máximo 8 por vez para respeitar o rate-limit da API gratuita)
  const names = Array.from(teams);
  for (let i = 0; i < names.length; i += 8) {
    await Promise.allSettled(names.slice(i, i + 8).map((n) => fetchBadgeFromSportsDB(n)));
  }

  return jogos.map((j) => ({
    ...j,
    strHomeTeamBadge: j.strHomeTeam ? (badgeCache.get(normalizeKey(j.strHomeTeam)) ?? null) : null,
    strAwayTeamBadge: j.strAwayTeam ? (badgeCache.get(normalizeKey(j.strAwayTeam)) ?? null) : null,
  }));
}

// ─── Extração de nomes ────────────────────────────────────────────────────────

function extractTeamName(value: string | null | undefined): string {
  const s = (value || '').trim();
  if (!s) return '';
  const colonIdx = s.lastIndexOf(': ');
  if (colonIdx >= 0) return s.slice(colonIdx + 2).trim();
  return s;
}

function extractTeamsFromRow(row: JogoTransmissao): { home: string; away: string } {
  const titulo = (row.titulo || '').trim();
  if (titulo.includes(' x ')) {
    const parts = titulo.split(' x ');
    const homePart = parts[0]?.trim() || '';
    const awayPart = parts[1]?.trim() || '';
    return {
      home: extractTeamName(homePart),
      away: awayPart || extractTeamName(row.time_fora),
    };
  }
  return {
    home: extractTeamName(row.time_casa),
    away: extractTeamName(row.time_fora),
  };
}

// ─── Deduplicação ─────────────────────────────────────────────────────────────

/**
 * Agrupa linhas pelo par (home_normalizado + away_normalizado).
 * Ignora a data para evitar divergências de fuso horário (UTC vs BRT).
 * Jogos em múltiplos canais viram uma única entrada com os canais concatenados.
 */
function deduplicateJogos(rows: JogoTransmissao[]): JogoTransmissao[] {
  const map = new Map<string, JogoTransmissao>();

  rows.forEach((row) => {
    const { home, away } = extractTeamsFromRow(row);
    const key = `${normalizeKey(home)}__${normalizeKey(away)}`;

    if (!map.has(key)) {
      map.set(key, { ...row });
    } else {
      // Mescla canais: "SporTV / Premiere"
      const existing = map.get(key)!;
      const newCanal = row.canal?.trim();
      if (newCanal && !existing.canal?.includes(newCanal)) {
        existing.canal = existing.canal ? `${existing.canal} / ${newCanal}` : newCanal;
      }
    }
  });

  return Array.from(map.values());
}

// ─── Filtro Série A 2026 ───────────────────────────────────────────────────

/** Chaves canônicas dos 20 times do Brasileirão Série A 2026. */
const SERIE_A_KEYS = new Set<string>([
  'athleticoparanaense',
  'atleticomineiro',
  'bahia',
  'botafogo',
  'ceara',
  'corinthians',
  'cruzeiro',
  'flamengo',
  'fluminense',
  'fortaleza',
  'gremio',
  'internacional',
  'juventude',
  'mirassol',
  'palmeiras',
  'redbullbragantino',
  'santos',
  'saopaulo',
  'sportrecife',
  'vascodagama',
  'vitoria',
]);

/** Retorna true se o nome do time (após normalização + aliases) pertencer à Série A 2026. */
function isSerieATeam(teamName: string | null | undefined): boolean {
  const key = normalizeKey(teamName);
  return SERIE_A_KEYS.has(key);
}

function toJogoView(row: JogoTransmissao): JogoTransmissaoView {
  const start = row.start_time;
  let dateEvent = '';
  let strTime = '--:--';
  if (start) {
    const d = new Date(start);
    dateEvent = d.toISOString().slice(0, 10);
    strTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const { home, away } = extractTeamsFromRow(row);
  // Resolve imediatamente do cache pré-carregado (overrides SVG + TheSportsDB após pré-fetch)
  const homeBadge = home ? (badgeCache.get(normalizeKey(home)) ?? null) : null;
  const awayBadge = away ? (badgeCache.get(normalizeKey(away)) ?? null) : null;
  return {
    idEvent: row.id,
    strHomeTeam: home || null,
    strAwayTeam: away || null,
    strHomeTeamBadge: homeBadge,
    strAwayTeamBadge: awayBadge,
    dateEvent,
    strTime,
    strTVStation: row.canal,
    canal: row.canal,
  };
}

export async function getJogosTransmissoes(): Promise<JogoTransmissaoView[]> {
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from('jogos_transmissoes')
      .select('*')
      .gte('start_time', now)
      .order('start_time', { ascending: true });

    if (error) {
      console.warn('[jogosTransmissoes] Erro ao buscar:', error.message);
      return [];
    }

    // ── Filtra apenas jogos do Brasileirão Série A 2026 ─────────────────────
    // Só exibe o jogo se AMBOS os times forem da Série A.
    const serieARows = (data || []).filter((row) => {
      const { home, away } = extractTeamsFromRow(row);
      return isSerieATeam(home) && isSerieATeam(away);
    });

    const unique = deduplicateJogos(serieARows);
    const views = unique.map(toJogoView);
    return enrichBadges(views);
  } catch (err) {
    console.warn('[jogosTransmissoes] Erro no try/catch:', err);
    return [];
  }
}
