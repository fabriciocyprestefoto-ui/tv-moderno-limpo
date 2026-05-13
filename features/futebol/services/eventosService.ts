/**
 * eventosService — Busca e agrupa os eventos ao vivo do dia
 * Fonte: tabela Supabase `channels` com category = "⚽ EVENTOS DO DIA"
 *
 * Padrão do nome no M3U:  "HH:MM TEAM1 x TEAM2 N"
 *   onde N = número do stream (1, 2, …)
 */
import { supabase } from '@/services/supabaseService';

export interface EventoStream {
  label: string; // "1", "2" …
  url: string;
}

export interface EventoDodia {
  id: string;
  time: string; // "19:00"
  home: string; // "SANTOS"
  away: string; // "REMO"
  broadcaster: string; // nome limpo "SporTV", "Premiere", "ESPN" …
  broadcasterLogo: string;
  streams: EventoStream[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrai nome do broadcaster a partir da URL do logo.
 * Ex: "…/SporTV_HD.png" → "SporTV"
 *     "…/PREMIERE_3_HD.png" → "Premiere 3"
 *     "…/ESPN_HD.png" → "ESPN"
 *     "…/NBA.png" → "NBA"
 */
function broadcasterFromLogo(logoUrl: string): string {
  if (!logoUrl) return '';
  const file =
    logoUrl
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') || '';
  return file
    .replace(/_HD$/i, '')
    .replace(/_SD$/i, '')
    .replace(/_FHD$/i, '')
    .replace(/_4K$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
    .trim();
}

/** Parseia "HH:MM TEAM1 x TEAM2 N" → {time, home, away, streamNum} ou null */
function parseName(
  raw: string
): { time: string; home: string; away: string; streamNum: string } | null {
  // Ex: "19:00 SANTOS x REMO 1"
  // Ex: "21:30 RB BRAGANTINO x FLAMENGO 2"
  const m = raw.trim().match(/^(\d{1,2}:\d{2})\s+(.+?)\s+x\s+(.+?)\s+(\d+)\s*$/i);
  if (!m) return null;
  return {
    time: m[1],
    home: m[2].trim(),
    away: m[3].trim(),
    streamNum: m[4],
  };
}

/** Limpa nomes de times que têm o nome repetido (ex: "HORNETS HORNETS" → "HORNETS") */
function cleanTeamName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words[0].toLowerCase() === words[words.length - 1].toLowerCase()) {
    return words.slice(0, Math.ceil(words.length / 2)).join(' ');
  }
  // Remove prefixo solitário de 1-2 letras (ex: "C CAVS → CAVS", "DE CHAPECOENSE → CHAPECOENSE")
  if (words.length > 1 && words[0].length <= 2) {
    return words.slice(1).join(' ');
  }
  return name;
}

// ─── Service ──────────────────────────────────────────────────────────────────

let _cache: EventoDodia[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function fetchEventosDodia(): Promise<EventoDodia[]> {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;

  const { data, error } = await supabase
    .from('channels')
    .select('id, name, logo, stream_url')
    .ilike('category', '%EVENTOS DO DIA%')
    .order('name', { ascending: true });

  if (error || !data) return _cache ?? [];

  // Agrupar por chave de jogo (sem o número do stream)
  const groupMap = new Map<string, EventoDodia>();

  for (const row of data) {
    const parsed = parseName(row.name || '');
    if (!parsed || !row.stream_url) continue;

    const { time, home, away, streamNum } = parsed;
    const key = `${time}__${home.toLowerCase()}__${away.toLowerCase()}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: key,
        time,
        home: cleanTeamName(home),
        away: cleanTeamName(away),
        broadcaster: broadcasterFromLogo(row.logo || ''),
        broadcasterLogo: row.logo || '',
        streams: [],
      });
    }

    groupMap.get(key)!.streams.push({
      label: streamNum,
      url: row.stream_url,
    });
  }

  // Ordenar streams de cada evento pelo número
  const result = Array.from(groupMap.values()).map((e) => ({
    ...e,
    streams: e.streams.sort((a, b) => Number(a.label) - Number(b.label)),
  }));

  // Ordenar eventos por horário
  result.sort((a, b) => a.time.localeCompare(b.time));

  _cache = result;
  _cacheAt = now;
  return result;
}

/** Invalida o cache (usar quando o admin atualizar os canais) */
export function invalidateEventosCache(): void {
  _cache = null;
  _cacheAt = 0;
}
