import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FutebolEvento,
  JogadorTime,
  TabelaBrasileiraoRow,
  TimeDetalhes,
  TimeSerieA,
  normalizeTeamName,
} from '../services/futebolService';
import {
  FootballMatch,
  FootballPlayer,
  FootballTeam,
  Competition,
  getCompetitionStandings,
  getCompetitions,
  getRedxFootballFull,
  getTeamDetails,
} from '@/services/sportsApi';
import { dedupeFutebolEventos } from '../utils/dedupeJogos';

interface TeamIdLookup {
  [normalizedTeamName: string]: string;
}

interface ElencoPorPosicao {
  goleiros: JogadorTime[];
  defensores: JogadorTime[];
  meioCampo: JogadorTime[];
  atacantes: JogadorTime[];
}

function scoreToString(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mapStatus(status: string | null | undefined): string | null {
  const value = String(status || '').toLowerCase();
  if (value === 'finished') return 'Match Finished';
  if (value === 'live') return 'Live';
  if (value === 'postponed') return 'Postponed';
  if (value === 'cancelled') return 'Cancelled';
  return 'Scheduled';
}

function firstBroadcast(match: FootballMatch): { name: string | null; logo: string | null } {
  const full = match.transmissoes || match.broadcasts || [];
  const item = full.find((broadcast) => Boolean(broadcast?.canal)) || null;
  return {
    name: item?.canal || match.broadcast?.[0] || null,
    logo: item?.logo || null,
  };
}

function matchToEvento(match: FootballMatch): FutebolEvento & { strChannelLogo?: string | null } {
  const broadcast = firstBroadcast(match);
  return {
    idEvent: match.id,
    idHomeTeam: match.homeTeam?.id || null,
    idAwayTeam: match.awayTeam?.id || null,
    strEvent: `${match.homeTeam?.name || 'Mandante'} x ${match.awayTeam?.name || 'Visitante'}`,
    strHomeTeam: match.homeTeam?.name || null,
    strAwayTeam: match.awayTeam?.name || null,
    strLeague: match.competition || null,
    dateEvent: match.date || null,
    strTime: match.time || null,
    intHomeScore: scoreToString(match.score?.home),
    intAwayScore: scoreToString(match.score?.away),
    strStatus: mapStatus(match.status),
    strVenue: match.venue || match.city || null,
    strHomeTeamBadge: match.homeTeam?.logo || null,
    strAwayTeamBadge: match.awayTeam?.logo || null,
    strTVStation: broadcast.name,
    strChannelLogo: broadcast.logo,
  };
}

function standingsToTabela(row: import('@/services/sportsApi').StandingsRow): TabelaBrasileiraoRow {
  return {
    teamId: normalizeTeamName(row.time),
    posicao: row.posicao ?? null,
    nomeTime: row.time,
    pontos: row.pontos ?? null,
    jogos: row.jogos ?? null,
    vitorias: row.vitorias ?? null,
    empates: row.empates ?? null,
    derrotas: row.derrotas ?? null,
    saldoGols: row.saldoGols ?? null,
    aproveitamento:
      row.aproveitamento === null || row.aproveitamento === undefined
        ? null
        : `${row.aproveitamento}%`,
  };
}

function teamToSerieA(team: { id: string; name: string; logo?: string | null }): TimeSerieA {
  return {
    idTeam: team.id,
    strTeam: team.name,
    strTeamBadge: team.logo || null,
  };
}

function teamToDetalhes(team: FootballTeam): TimeDetalhes {
  return {
    idTeam: team.id,
    strTeam: team.name,
    strAlternate: team.apelidos?.join(', ') || null,
    strLeague: 'Brasileirão Série A',
    strCountry: team.country || 'Brasil',
    strManager: team.coach || null,
    intFormedYear: team.founded || null,
    strStadium: team.stadium?.name || null,
    strStadiumLocation: [team.city, team.state].filter(Boolean).join(' - ') || null,
    intStadiumCapacity: team.stadium?.capacity ? String(team.stadium.capacity) : null,
    strTeamBadge: team.logo || null,
    strTeamBanner: null,
    strTeamFanart1: null,
    strTeamFanart2: null,
    strTeamFanart3: null,
    strTeamFanart4: null,
    strTeamJersey: null,
    strColour1: team.colors?.[0] || null,
    strColour2: team.colors?.[1] || null,
    strWebsite: null,
    strFacebook: team.redesSociais?.facebook || null,
    strTwitter: team.redesSociais?.twitter || null,
    strInstagram: team.redesSociais?.instagram || null,
    strDescriptionPT: team.historiaCompleta || team.history || null,
    strDescriptionEN: team.history || null,
  };
}

function playerToJogador(player: FootballPlayer, teamId: string, index: number): JogadorTime {
  return {
    idPlayer: player.id || `${teamId}-${index + 1}`,
    strPlayer: player.nome || null,
    strPosition: player.posicao || null,
    strCutout: player.foto || null,
    strThumb: player.foto || null,
    strNumber: player.numero ? String(player.numero) : null,
    strNationality: player.nacionalidade || null,
    intGoals: null,
  };
}

function getArtilheiroFromElenco(elenco: JogadorTime[]): JogadorTime | null {
  return (
    elenco
      .map((player) => ({ player, goals: Number(player.intGoals) }))
      .filter((entry) => Number.isFinite(entry.goals))
      .sort((a, b) => b.goals - a.goals)[0]?.player || null
  );
}

function normalizeLookupKey(value: string | null | undefined): string {
  return normalizeTeamName(value)
    .replace(/saf$/g, '')
    .replace(/fc$/g, '')
    .replace(/futebolclube$/g, '')
    .trim();
}

function buildTeamMapFromTimes(times: TimeSerieA[]): TeamIdLookup {
  const map: TeamIdLookup = {};
  times
    .filter((team) => Boolean(team.idTeam) && Boolean(team.strTeam))
    .forEach((team) => {
      map[normalizeTeamName(team.strTeam)] = team.idTeam;
      map[normalizeLookupKey(team.strTeam)] = team.idTeam;
    });
  return map;
}

function getBucketFromPosition(position: string | null): keyof ElencoPorPosicao {
  const normalized = (position || '').toLowerCase();
  if (normalized.includes('goal') || normalized.includes('goleiro')) return 'goleiros';
  if (
    normalized.includes('defender') ||
    normalized.includes('back') ||
    normalized.includes('zagueiro') ||
    normalized.includes('lateral') ||
    normalized.includes('defesa')
  ) {
    return 'defensores';
  }
  if (
    normalized.includes('mid') ||
    normalized.includes('meio') ||
    normalized.includes('volante') ||
    normalized.includes('armador')
  ) {
    return 'meioCampo';
  }
  if (
    normalized.includes('forward') ||
    normalized.includes('striker') ||
    normalized.includes('wing') ||
    normalized.includes('atacante') ||
    normalized.includes('ponta')
  ) {
    return 'atacantes';
  }
  return 'meioCampo';
}

function groupElencoByPosition(elenco: JogadorTime[]): ElencoPorPosicao {
  const grouped: ElencoPorPosicao = {
    goleiros: [],
    defensores: [],
    meioCampo: [],
    atacantes: [],
  };

  elenco.forEach((player) => {
    grouped[getBucketFromPosition(player.strPosition)].push(player);
  });

  return grouped;
}

function getEventoTimestamp(evento: FutebolEvento): number {
  const rawDate = String(evento.dateEvent || '').trim();
  if (!rawDate) return Number.MAX_SAFE_INTEGER;
  const rawTime = String(evento.strTime || '').trim();
  const normalizedTime = rawTime ? rawTime.slice(0, 5) : '00:00';
  const iso = `${rawDate}T${normalizedTime}:00`;
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortUpcomingFutebolEventos(eventos: FutebolEvento[]): FutebolEvento[] {
  return [...eventos].sort((a, b) => getEventoTimestamp(a) - getEventoTimestamp(b));
}

export function useFutebol() {
  const [proximosJogos, setProximosJogos] = useState<FutebolEvento[]>([]);
  const [resultadosRecentes, setResultadosRecentes] = useState<FutebolEvento[]>([]);
  const [tabela, setTabela] = useState<TabelaBrasileiraoRow[]>([]);
  const [timesSerieA, setTimesSerieA] = useState<TimeSerieA[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [teamIdLookup, setTeamIdLookup] = useState<TeamIdLookup>({});
  const [loading, setLoading] = useState(true);
  const [loadingJogos, setLoadingJogos] = useState(true);
  const [loadingTabela, setLoadingTabela] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classificacaoIndisponivel, setClassificacaoIndisponivel] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadingJogos(true);
    setLoadingTabela(true);
    setError(null);
    setClassificacaoIndisponivel(false);

    try {
      const [full, competitionsData] = await Promise.all([
        getRedxFootballFull(14),
        getCompetitions(),
      ]);
      if (!full) throw new Error('REDX API indisponivel');

      const times = full.times.map((time) =>
        teamToSerieA({ id: time.id, name: time.name, logo: time.logo || time.escudo || null })
      );
      const lookup = buildTeamMapFromTimes(times);
      const jogos = dedupeFutebolEventos([
        ...full.jogosDoDia.map(matchToEvento),
        ...full.proximosJogos.map(matchToEvento),
      ]);

      setTeamIdLookup(lookup);
      setTimesSerieA(times);
      setCompetitions(competitionsData);
      setProximosJogos(sortUpcomingFutebolEventos(jogos));
      setResultadosRecentes(dedupeFutebolEventos((full.ultimosResultados || []).map(matchToEvento)));
      setTabela(full.tabela.map(standingsToTabela));
    } catch {
      setProximosJogos([]);
      setResultadosRecentes([]);
      setTimesSerieA([]);
      setCompetitions([]);
      setTeamIdLookup({});
      setTabela([]);
      setError('Nao foi possivel carregar os jogos do Brasileirao 2026.');
    } finally {
      setLoadingJogos(false);
      setLoadingTabela(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const resolverTeamId = useCallback(
    (teamName: string | null | undefined, explicitTeamId?: string | null): string | null => {
      const key = normalizeTeamName(teamName);
      const reduced = normalizeLookupKey(teamName);
      return (
        (key ? teamIdLookup[key] : null) ||
        (reduced ? teamIdLookup[reduced] : null) ||
        explicitTeamId ||
        null
      );
    },
    [teamIdLookup]
  );

  return {
    proximosJogos,
    resultadosRecentes,
    timesSerieA,
    competitions,
    tabela,
    loading,
    loadingJogos,
    loadingTabela,
    error,
    classificacaoIndisponivel,
    loadInitial,
    resolverTeamId,
  };
}

export function useFutebolTime(teamId: string | undefined) {
  const [detalhesTime, setDetalhesTime] = useState<TimeDetalhes | null>(null);
  const [dadosLocais, setDadosLocais] = useState<FootballTeam | null>(null);
  const [classificacaoAtual, setClassificacaoAtual] = useState<TabelaBrasileiraoRow | null>(null);
  const [proximosJogos, setProximosJogos] = useState<FutebolEvento[]>([]);
  const [resultadosRecentes, setResultadosRecentes] = useState<FutebolEvento[]>([]);
  const [elenco, setElenco] = useState<JogadorTime[]>([]);

  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingElenco, setLoadingElenco] = useState(true);

  const [erroResumo, setErroResumo] = useState<string | null>(null);
  const [erroElenco, setErroElenco] = useState<string | null>(null);
  const [classificacaoIndisponivel, setClassificacaoIndisponivel] = useState(false);

  const loadResumo = useCallback(async () => {
    if (!teamId) {
      setErroResumo('Time invalido.');
      setLoadingResumo(false);
      return;
    }

    setLoadingResumo(true);
    setErroResumo(null);
    setClassificacaoIndisponivel(false);

    try {
      const [time, tabelaRows] = await Promise.all([
        getTeamDetails(teamId),
        getCompetitionStandings('brasileirao-serie-a'),
      ]);
      if (!time) throw new Error('Time nao encontrado na REDX API');

      const detalhes = teamToDetalhes(time);
      setDetalhesTime(detalhes);
      setDadosLocais(time);
      setProximosJogos((time.proximosJogos || []).map(matchToEvento));
      setResultadosRecentes((time.ultimosResultados || []).map(matchToEvento));

      const tabela = tabelaRows.map(standingsToTabela);
      const normalized = normalizeTeamName(time.name);
      const classificacao =
        tabela.find((row) => normalizeTeamName(row.nomeTime) === normalized) ||
        tabela.find((row) => normalizeTeamName(row.nomeTime).includes(normalized)) ||
        null;
      setClassificacaoAtual(classificacao ?? null);
      setClassificacaoIndisponivel(!classificacao);
    } catch {
      setDetalhesTime(null);
      setDadosLocais(null);
      setProximosJogos([]);
      setResultadosRecentes([]);
      setErroResumo('Nao foi possivel carregar os dados principais do time.');
    } finally {
      setLoadingResumo(false);
    }
  }, [teamId]);

  const loadElenco = useCallback(async () => {
    if (!teamId) {
      setErroElenco('Time invalido.');
      setLoadingElenco(false);
      return;
    }

    setLoadingElenco(true);
    setErroElenco(null);

    try {
      const time = await getTeamDetails(teamId);
      const players = (time?.elenco || time?.squad || []).map((player, index) =>
        playerToJogador(player, teamId, index)
      );
      if (players.length > 0) {
        setElenco(players);
      } else {
        setElenco([]);
      }
    } catch {
      setElenco([]);
      setErroElenco('Nao foi possivel carregar o elenco.');
    } finally {
      setLoadingElenco(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadResumo();
  }, [loadResumo]);

  useEffect(() => {
    if (!teamId) return;
    const timeoutId = window.setTimeout(() => {
      loadElenco();
    }, 220);
    return () => window.clearTimeout(timeoutId);
  }, [teamId, loadElenco]);

  const elencoPorPosicao = useMemo(() => groupElencoByPosition(elenco), [elenco]);
  const artilheiro = useMemo(() => getArtilheiroFromElenco(elenco), [elenco]);

  return {
    detalhesTime,
    dadosLocais,
    classificacaoAtual,
    classificacaoIndisponivel,
    proximosJogos,
    resultadosRecentes,
    elencoPorPosicao,
    artilheiro,
    loadingResumo,
    loadingElenco,
    erroResumo,
    erroElenco,
    recarregarResumo: loadResumo,
    recarregarElenco: loadElenco,
  };
}
