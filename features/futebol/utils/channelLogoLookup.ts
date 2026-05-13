import { Channel } from '@/types';
import { stripDiacriticsSafe } from '@/utils/safeUnicodeNormalize';

const CHANNEL_ALIASES: Record<string, string[]> = {
  'espn brasil': ['espn 1', 'espn'],
  'fox sports 1 br': ['espn 4', 'fox sports 1', 'fox sports'],
  'fox sports 2 br': ['espn 5', 'fox sports 2', 'fox sports'],
  'band sports': ['band sports'],
  'dazn brasil': ['dazn 01', 'dazn'],
  'tv nsports br': ['nsports'],
  'globo sao paulo': ['globo sp - sao paulo', 'globo sp - são paulo', 'globo sp'],
  'amazon prime video brazil': ['prime video amazon', 'prime video'],
  sportv: ['sportv', 'sportv 1'],
  'sportv 2': ['sportv 2'],
  'sportv 3': ['sportv 3'],
  'premiere clubes': ['premiere clubes', 'premiere'],
  'premiere fc 1': ['premiere 1', 'premiere clubes', 'premiere'],
  'premiere fc 2': ['premiere 2'],
  'premiere fc 3': ['premiere 3'],
  'premiere fc 4': ['premiere 4'],
  'premiere fc 5': ['premiere 5'],
  'premiere fc 6': ['premiere 6'],
  'premiere fc 7': ['premiere 7'],
  'premiere fc 8': ['premiere 8'],
  'premiere fc 9': ['premiere 9'],
  'premiere fc 10': ['premiere 10'],
};

/** Extrai o nome do canal do texto do EPG (ex: "São Paulo/SP  SporTV" -> "SporTV") */
export function extractChannelNameFromEpg(canal: string | null | undefined): string {
  const s = (canal || '').trim();
  if (!s) return '';
  // Remove prefixo regional (ex: "São Paulo/SP  " ou "Cidade  ")
  const doubleSpace = s.indexOf('  ');
  if (doubleSpace >= 0)
    return s
      .slice(doubleSpace + 2)
      .replace(/\s*³\s*$/, '')
      .trim();
  return s.replace(/\s*³\s*$/, '').trim();
}

/** Normaliza nome para matching (lowercase, remove HD/4K/FHD) */
function normalizeForMatch(name: string): string {
  return stripDiacriticsSafe(String(name || '').toLowerCase())
    .replace(/\b(brasil|brazil|br)\b/gi, '')
    .replace(/\s*(hd|4k|fhd|uhd)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueries(epgCanal: string | null | undefined): string[] {
  const extracted = extractChannelNameFromEpg(epgCanal);
  if (!extracted) return [];

  const normalized = normalizeForMatch(extracted);
  const aliasList = CHANNEL_ALIASES[normalized] || [];
  return Array.from(new Set([normalized, ...aliasList.map(normalizeForMatch)].filter(Boolean)));
}

function findChannel(channels: Channel[], epgCanal: string | null | undefined): Channel | null {
  if (!epgCanal || !channels?.length) return null;

  const queries = buildQueries(epgCanal);
  if (!queries.length) return null;

  for (const query of queries) {
    const exact = channels.find((channel) => normalizeForMatch(channel.name || '') === query);
    if (exact) return exact;
  }

  for (const query of queries) {
    const partial = channels.find((channel) => {
      const normalizedChannel = normalizeForMatch(channel.name || '');
      return normalizedChannel.includes(query) || query.includes(normalizedChannel);
    });
    if (partial) return partial;
  }

  for (const query of queries) {
    const startsWith = channels.find((channel) =>
      normalizeForMatch(channel.name || '').startsWith(query.split(' ')[0] || '')
    );
    if (startsWith) return startsWith;
  }

  return null;
}

/** Encontra a logo do canal na lista de canais do banco */
export function findChannelLogo(
  channels: Channel[],
  epgCanal: string | null | undefined
): string | null {
  return findChannel(channels, epgCanal)?.logo ?? null;
}

export function resolveChannelTarget(
  channels: Channel[],
  epgCanal: string | null | undefined
): string | null {
  return findChannel(channels, epgCanal)?.name ?? null;
}

/** Monta lookup de logo por nome de canal (para uso em FutebolJogos) */
export function buildChannelLogoLookup(
  channels: Channel[]
): (epgCanal: string | null | undefined) => string | null {
  return (epgCanal) => findChannelLogo(channels, epgCanal);
}

export function buildChannelTargetLookup(
  channels: Channel[]
): (epgCanal: string | null | undefined) => string | null {
  return (epgCanal) => resolveChannelTarget(channels, epgCanal);
}
