import { initEPG } from '@/services/epgService';
import { Media } from '@/types';

// Tipagem para o cache
interface FootballCache {
  timestamp: number;
  data: FootballMatch[];
}

export interface FootballMatch extends Media {
  league: string;
  startTime: Date;
  endTime: Date;
  channelName: string;
  channelId?: string;
  isLive: boolean;
}

const CACHE_KEY = 'football_epg_cache_v1';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

/**
 * Detecta o campeonato baseado no título do evento
 */
export function detectLeague(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('libertadores')) return 'Libertadores';
  if (t.includes('champions')) return 'Champions League';
  if (t.includes('brasileirão') || t.includes('serie a br')) return 'Brasileirão';
  if (t.includes('copa do brasil')) return 'Copa do Brasil';
  if (t.includes('premier league')) return 'Premier League';
  if (t.includes('la liga')) return 'La Liga';
  if (t.includes('serie a itali')) return 'Serie A';
  if (t.includes('bundesliga')) return 'Bundesliga';
  if (t.includes('ligue 1')) return 'Ligue 1';
  if (t.includes('copa américa') || t.includes('copa america')) return 'Copa América';
  if (t.includes('eurocopa')) return 'Eurocopa';
  if (t.includes('eliminatórias') || t.includes('eliminatorias')) return 'Eliminatórias';

  return 'Outros Campeonatos';
}

/**
 * Filtra se o programa é uma partida de futebol
 */
function isFootballMatch(title: string, category: string): boolean {
  const footballKeywords = [
    'futebol',
    'football',
    'soccer',
    'vs',
    ' x ',
    'campeonato',
    'liga',
    'brasileirão',
    'libertadores',
    'champions',
    'copa',
    'premier league',
    'la liga',
    'serie a',
  ];

  const text = `${title} ${category}`.toLowerCase();
  return footballKeywords.some((kw) => text.includes(kw));
}

/**
 * Obtém partidas de futebol do EPG com cache inteligente
 */
export async function getUpcomingFootballMatchesExtreme(): Promise<FootballMatch[]> {
  // 1. Verificar Cache
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { timestamp, data }: FootballCache = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        console.log('[Futebol Service] Usando cache inteligente (v1)');
        // Converter strings de data de volta para objetos Date
        return data.map((m) => ({
          ...m,
          startTime: new Date(m.startTime),
          endTime: new Date(m.endTime),
        }));
      }
    } catch (e) {
      console.error('[Futebol Service] Erro ao ler cache', e);
    }
  }

  // 2. Refresh EPG
  console.log('[Futebol Service] Reprocessando EPG para Futebol Extreme...');

  await initEPG();

  // TRUQUE: O epgService.ts salva no sessionStorage: 'redx_epg_session'
  const sessionData = sessionStorage.getItem('redx_epg_session');
  if (!sessionData) return [];

  const { data: epgData } = JSON.parse(sessionData);
  const matches: FootballMatch[] = [];
  const now = Date.now();

  Object.values(epgData).forEach((ch: any) => {
    ch.programmes.forEach((p: any) => {
      const start = p.start;
      const stop = p.stop;

      if (stop > now && isFootballMatch(p.title, p.category)) {
        matches.push({
          id: `ft-${ch.id}-${start}`,
          tmdb_id: 0,
          title: p.title,
          type: 'movie', // Media type base
          description: p.description,
          league: detectLeague(p.title),
          startTime: new Date(start),
          endTime: new Date(stop),
          channelName: ch.displayName,
          channelId: ch.id,
          isLive: p.isLive || (start <= now && stop > now),
          backdrop: ch.icon || '/placeholder-football.webp',
          poster: ch.icon || '/placeholder-football.webp',
          stream_url: `/watch/${ch.id}`,
        });
      }
    });
  });

  // Ordenar e Limitar
  const sortedMatches = matches
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 50);

  // 3. Salvar Cache
  const cacheToSave: FootballCache = {
    timestamp: Date.now(),
    data: sortedMatches,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cacheToSave));

  return sortedMatches;
}
