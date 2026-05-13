import { FutebolEvento, normalizeTeamName } from '@/features/futebol/services/futebolService';
import { stripDiacriticsSafe } from '@/utils/safeUnicodeNormalize';

export interface WeeklyEpgProgramme {
  channelId: string;
  channelName: string;
  title: string;
  start: Date;
  stop: Date;
  sourceUrl: string;
}

export interface BroadcastMatch {
  channel: string;
  start: string;
  stop: string;
  title: string;
}

export type BroadcastLookup = Record<string, BroadcastMatch>;

const CHANNEL_RULES: Array<{ label: string; regex: RegExp }> = [
  { label: 'Premiere', regex: /premiere/i },
  { label: 'SporTV', regex: /sportv|spor\s*tv/i },
  { label: 'Globo', regex: /\bglobo\b/i },
  { label: 'ESPN', regex: /\bespn\b/i },
  { label: 'BandSports', regex: /bandsports|band\s*sports/i },
  { label: 'Prime', regex: /\bprime\b|amazon\s*prime/i },
  { label: 'Record', regex: /\brecord\b/i },
  { label: 'CazéTV', regex: /caze|cazetv|cazé/i },
];

const FOOTBALL_KEYWORDS = [
  ' x ',
  ' vs ',
  ' futebol',
  'brasileirao',
  'libertadores',
  'copa',
  'champions',
  'sul americana',
];

const TEAM_ALIAS: Record<string, string[]> = {
  atleticomineiro: ['atletico mg', 'atletico-mg', 'galo'],
  saopaulo: ['sao paulo', 'sao paulo fc', 'spfc'],
  redbullbragantino: ['bragantino', 'rb bragantino', 'red bull bragantino'],
  vascodagama: ['vasco', 'vasco da gama'],
  internacional: ['inter', 'internacional'],
};

function normalizeText(value: string | null | undefined): string {
  return stripDiacriticsSafe(String(value || '').toLowerCase())
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toGameTimestamp(jogo: FutebolEvento): number {
  const date = String(jogo.dateEvent || '').trim();
  if (!date) return 0;

  const rawTime = String(jogo.strTime || '').trim();
  const hhmm = rawTime.match(/^(\d{2}:\d{2})/);
  const normalizedTime = hhmm ? `${hhmm[1]}:00` : '00:00:00';
  const parsed = Date.parse(`${date}T${normalizedTime}`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getAllowedChannelLabel(programme: WeeklyEpgProgramme): string | null {
  const raw = `${programme.channelName} ${programme.channelId}`.trim();
  for (const rule of CHANNEL_RULES) {
    if (rule.regex.test(raw)) {
      return rule.label;
    }
  }
  return null;
}

function isFootballTitle(title: string): boolean {
  const normalized = ` ${normalizeText(title)} `;
  return FOOTBALL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function buildTeamCandidates(teamName: string | null | undefined): string[] {
  const normalized = normalizeText(teamName);
  if (!normalized) return [];

  const compact = normalizeTeamName(teamName);
  const aliases = TEAM_ALIAS[compact] || [];
  const tokens = normalized
    .split(' ')
    .filter(
      (token) => token.length >= 3 && !['clube', 'futebol', 'sport', 'esporte'].includes(token)
    );

  const variants = new Set<string>([
    normalized,
    ...aliases.map((alias) => normalizeText(alias)),
    ...tokens,
  ]);

  return Array.from(variants).filter(Boolean);
}

function titleHasTeam(title: string, teamCandidates: string[]): boolean {
  return teamCandidates.some((candidate) => candidate.length > 0 && title.includes(candidate));
}

function scoreMatch(
  titleNormalized: string,
  jogoTimestamp: number,
  programmeTimestamp: number
): { score: number; timeDelta: number } {
  let score = 0;
  const timeDelta =
    jogoTimestamp > 0 ? Math.abs(programmeTimestamp - jogoTimestamp) : Number.MAX_SAFE_INTEGER;

  if (titleNormalized.includes(' x ') || titleNormalized.includes(' vs ')) score += 3;
  if (jogoTimestamp > 0) {
    if (timeDelta <= 15 * 60 * 1000) score += 5;
    else if (timeDelta <= 60 * 60 * 1000) score += 4;
    else if (timeDelta <= 3 * 60 * 60 * 1000) score += 3;
    else if (timeDelta <= 6 * 60 * 60 * 1000) score += 2;
    else score += 1;
  }

  return { score, timeDelta };
}

export function matchBroadcastsForGames(
  jogos: FutebolEvento[],
  programmes: WeeklyEpgProgramme[]
): BroadcastLookup {
  const now = Date.now();
  const maxDate = now + 7 * 24 * 60 * 60 * 1000;

  const candidates = programmes
    .map((programme) => ({
      programme,
      allowedChannel: getAllowedChannelLabel(programme),
      titleNormalized: normalizeText(programme.title),
    }))
    .filter((entry) => {
      if (!entry.allowedChannel) return false;
      const startTs = entry.programme.start.getTime();
      const stopTs = entry.programme.stop.getTime();
      if (stopTs < now || startTs > maxDate) return false;
      return isFootballTitle(entry.titleNormalized);
    });

  const lookup: BroadcastLookup = {};

  jogos.forEach((jogo) => {
    if (!jogo?.idEvent) return;

    const homeCandidates = buildTeamCandidates(jogo.strHomeTeam);
    const awayCandidates = buildTeamCandidates(jogo.strAwayTeam);
    if (homeCandidates.length === 0 || awayCandidates.length === 0) return;

    const gameTs = toGameTimestamp(jogo);
    let best: {
      channel: string;
      programme: WeeklyEpgProgramme;
      score: number;
      timeDelta: number;
    } | null = null;

    candidates.forEach((entry) => {
      const hasHome = titleHasTeam(entry.titleNormalized, homeCandidates);
      const hasAway = titleHasTeam(entry.titleNormalized, awayCandidates);
      if (!hasHome || !hasAway) return;

      const startTs = entry.programme.start.getTime();
      if (gameTs > 0 && Math.abs(startTs - gameTs) > 8 * 60 * 60 * 1000) return;

      const { score, timeDelta } = scoreMatch(entry.titleNormalized, gameTs, startTs);

      if (!best || score > best.score || (score === best.score && timeDelta < best.timeDelta)) {
        best = {
          channel: entry.allowedChannel || entry.programme.channelName,
          programme: entry.programme,
          score,
          timeDelta,
        };
      }
    });

    const _best = best as any;
    if (!_best) return;

    lookup[jogo.idEvent] = {
      channel: _best.channel,
      start: _best.programme.start.toISOString(),
      stop: _best.programme.stop.toISOString(),
      title: _best.programme.title,
    };
  });

  return lookup;
}
