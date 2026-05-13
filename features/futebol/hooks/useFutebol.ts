import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FutebolEvento,
  JogadorTime,
  TimeSerieA,
  TabelaBrasileiraoRow,
  TimeDetalhes,
  buildTeamIdMapFromEventos,
  getArtilheiroDoTime,
  getClassificacaoDoTime,
  getDetalhesTime,
  getElencoTime,
  getEventos2026,
  getProximosJogosFromEventos,
  getProximosJogosTime,
  getResultadosRecentesFromEventos,
  getResultadosTime,
  getTabelaBrasileirao,
  getTimesSerieA2026,
  normalizeTeamName,
} from '../services/futebolService';
import { getJogosTransmissoes } from '../services/jogosTransmissoesService';
import { dedupeFutebolEventos } from '../utils/dedupeJogos';
import { initEPG, getJogosFromEPG, EPGJogoFutebol } from '@/services/epgService';
import { getBrazilTvScheduleToday } from '@/services/theSportsDbApi';

/** Converte EPGJogoFutebol para FutebolEvento para reaproveitamento dos componentes existentes */
function epgJogoToEvento(j: EPGJogoFutebol): FutebolEvento {
  return {
    idEvent: j.idEvent,
    idHomeTeam: j.idHomeTeam ?? null,
    idAwayTeam: j.idAwayTeam ?? null,
    strEvent: j.strEvent,
    strHomeTeam: j.strHomeTeam,
    strAwayTeam: j.strAwayTeam,
    strLeague: j.strLeague,
    dateEvent: j.dateEvent,
    strTime: j.strTime,
    intHomeScore: j.intHomeScore,
    intAwayScore: j.intAwayScore,
    strStatus: j.strStatus,
    strVenue: j.strVenue,
    strHomeTeamBadge: j.strHomeTeamBadge ?? null,
    strAwayTeamBadge: j.strAwayTeamBadge ?? null,
    strTVStation: j.strTVStation,
  };
}

interface TeamIdLookup {
  [normalizedTeamName: string]: string;
}

interface ElencoPorPosicao {
  goleiros: JogadorTime[];
  defensores: JogadorTime[];
  meioCampo: JogadorTime[];
  atacantes: JogadorTime[];
}

function normalizeLookupKey(value: string | null | undefined): string {
  return normalizeTeamName(value)
    .replace(/saf$/g, '')
    .replace(/fc$/g, '')
    .replace(/futebolclube$/g, '')
    .trim();
}

function mergeTeamIdsIntoTabela(
  tabela: TabelaBrasileiraoRow[],
  teamIdLookup: TeamIdLookup
): TabelaBrasileiraoRow[] {
  return tabela.map((row) => ({
    ...row,
    teamId:
      teamIdLookup[normalizeTeamName(row.nomeTime)] ||
      teamIdLookup[normalizeLookupKey(row.nomeTime)] ||
      row.teamId ||
      null,
  }));
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

function buildTimesFromEventos(eventos: FutebolEvento[]): TimeSerieA[] {
  const map = new Map<string, TimeSerieA>();

  eventos.forEach((evento) => {
    if (evento.idHomeTeam && evento.strHomeTeam) {
      map.set(evento.idHomeTeam, {
        idTeam: evento.idHomeTeam,
        strTeam: evento.strHomeTeam,
        strTeamBadge: evento.strHomeTeamBadge || null,
      });
    }

    if (evento.idAwayTeam && evento.strAwayTeam) {
      map.set(evento.idAwayTeam, {
        idTeam: evento.idAwayTeam,
        strTeam: evento.strAwayTeam,
        strTeamBadge: evento.strAwayTeamBadge || null,
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.strTeam.localeCompare(b.strTeam, 'pt-BR'));
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

    const tabelaPromise = getTabelaBrasileirao();
    const timesPromise = getTimesSerieA2026();

    let teamMapFromEventos: TeamIdLookup = {};
    let teamMapFromTimes: TeamIdLookup = {};

    try {
      // 1. Inicializar EPG (mesma fonte da página de canais)
      await initEPG();
      const epgJogos = getJogosFromEPG();

      const [supabaseJogos, eventos, tvJogos] = await Promise.all([
        getJogosTransmissoes(),
        getEventos2026(),
        getBrazilTvScheduleToday().catch(() => []),
      ]);
      const teamMap = buildTeamIdMapFromEventos(eventos);
      teamMapFromEventos = Object.fromEntries(teamMap.entries());

      setTeamIdLookup(teamMapFromEventos);
      setResultadosRecentes(dedupeFutebolEventos(getResultadosRecentesFromEventos(eventos)));
      setTimesSerieA(buildTimesFromEventos(eventos));

      const proximosPriorizados = dedupeFutebolEventos([
        ...epgJogos.map(epgJogoToEvento),
        ...(supabaseJogos as unknown as FutebolEvento[]),
        ...(tvJogos as unknown as FutebolEvento[]),
        ...getProximosJogosFromEventos(eventos),
      ]);
      setProximosJogos(sortUpcomingFutebolEventos(proximosPriorizados));
    } catch {
      setProximosJogos([]);
      setResultadosRecentes([]);
      setTimesSerieA([]);
      setTeamIdLookup({});
      setError('Nao foi possivel carregar os jogos do Brasileirao 2026.');
    } finally {
      setLoadingJogos(false);
      setLoading(false);
    }

    try {
      const times = await timesPromise;
      teamMapFromTimes = buildTeamMapFromTimes(times);
      if (times.length > 0) {
        setTimesSerieA(times);
      }
      if (Object.keys(teamMapFromTimes).length > 0) {
        setTeamIdLookup((prev) => ({
          ...teamMapFromTimes,
          ...prev,
        }));
      }
    } catch {
      // best effort: os jogos já renderizam sem bloquear
    }

    try {
      const tabelaData = await tabelaPromise;
      const mergedMap = {
        ...teamMapFromTimes,
        ...teamMapFromEventos,
      };

      window.setTimeout(() => {
        setTabela(mergeTeamIdsIntoTabela(tabelaData, mergedMap));
      }, 140);
    } catch {
      setTabela([]);
      setClassificacaoIndisponivel(true);
    } finally {
      setLoadingTabela(false);
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
      const [detalhes, proximos, resultados] = await Promise.all([
        getDetalhesTime(teamId),
        getProximosJogosTime(teamId),
        getResultadosTime(teamId),
      ]);

      setDetalhesTime(detalhes);
      setProximosJogos(proximos);
      setResultadosRecentes(resultados);

      try {
        const classificacao = await getClassificacaoDoTime(detalhes?.strTeam || null, teamId);
        setClassificacaoAtual(classificacao);
      } catch {
        setClassificacaoAtual(null);
        setClassificacaoIndisponivel(true);
      }
    } catch {
      setDetalhesTime(null);
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
      const players = await getElencoTime(teamId);
      setElenco(players);
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
  const artilheiro = useMemo(() => getArtilheiroDoTime(elenco), [elenco]);

  return {
    detalhesTime,
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
