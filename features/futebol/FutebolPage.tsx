import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFutebol } from '@/features/futebol/hooks/useFutebol';
import {
  TabelaBrasileiraoRow,
  normalizeTeamName,
  TEAM_LOGO_SVG_OVERRIDES,
  TEAM_COLOR_OVERRIDES,
} from '@/features/futebol/services/futebolService';
import { BRASILEIRAO_TEAMS } from '@/data/brasileiraoTimes';
import { playSelectSound } from '@/utils/soundEffects';
import { FutebolHero, FutebolJogos, FutebolTabela } from '@/features/futebol/components';
import { FutebolArtilharia } from '@/features/futebol/components/FutebolArtilharia';
import SelecaoSection from '@/features/futebol/components/SelecaoSection';
import { FutebolMatchCard } from '@/features/futebol/components/FutebolMatchCard';
import '@/features/futebol/futebolVisionOS.css';
import { channelsService } from '@/services/channelsService';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';
import {
  buildChannelLogoLookup,
  buildChannelTargetLookup,
} from '@/features/futebol/utils/channelLogoLookup';

const PLACEHOLDER_BADGE = '/logored.png';

/** Mapeamento strLeague (lowercase) → TheSportsDB idLeague */
const LEAGUE_TSDB_ID: Record<string, string> = {
  'campeonato brasileiro serie a': '4351',
  'campeonato brasileiro série a': '4351',
  'brasileirão série a': '4351',
  'brazilian serie a': '4351',
  'serie a': '4351',
  brasileiro: '4351',
  'campeonato brasileiro': '4351',
  'brasileirão série b': 'brasileirao-serie-b',
  'brasileirao serie b': 'brasileirao-serie-b',
  'copa do mundo fifa 2026': '4429',
  'copa do mundo': '4429',
  'fifa world cup': '4429',
  'copa do brasil': '4853',
  'copa libertadores': '1967',
  'conmebol libertadores': '1967',
  libertadores: '1967',
  'copa sudamericana': '1968',
  'conmebol sudamericana': '1968',
  sudamericana: '1968',
  'sul-americana': '1968',
  'uefa champions league': '4480',
  'champions league': '4480',
  'uefa europa league': '4481',
  'europa league': '4481',
  'uefa conference league': 'conference-league',
  'conference league': 'conference-league',
  'premier league': '4328',
  'la liga': '4335',
  bundesliga: '4331',
  'serie a italiana': '4332',
  'serie a (itália)': '4332',
  'ligue 1': '4334',
  'eliminatórias uefa': 'eliminatorias-uefa',
  'eliminatórias conmebol': 'eliminatorias-conmebol',
};

const LEAGUE_BADGE_URL: Record<string, string> = {
  '4328': 'https://r2.thesportsdb.com/images/media/league/badge/gasy9d1737743125.png',
  '4331': 'https://r2.thesportsdb.com/images/media/league/badge/teqh1b1679952008.png',
  '4332': 'https://r2.thesportsdb.com/images/media/league/badge/67q3q21679951383.png',
  '4334': 'https://r2.thesportsdb.com/images/media/league/badge/9f7z9d1742983155.png',
  '4335': 'https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png',
  '4429': 'https://r2.thesportsdb.com/images/media/league/badge/e7er5g1696521789.png',
  '4480': 'https://r2.thesportsdb.com/images/media/league/badge/facv1u1742998896.png',
  '4481': 'https://r2.thesportsdb.com/images/media/league/badge/mlsr7d1718774547.png',
};

const LEAGUE_COLOR: Record<string, string> = {
  '4351': '#22c55e',
  'brasileirao-serie-b': '#10b981',
  '4853': '#16a34a',
  '1967': '#eab308',
  '1968': '#ef4444',
  '4480': '#3b82f6',
  '4481': '#f97316',
  'conference-league': '#84cc16',
  '4328': '#8b5cf6',
  '4335': '#f59e0b',
  '4331': '#d97706',
  '4332': '#06b6d4',
  '4334': '#0ea5e9',
  '4429': '#22c55e',
  'eliminatorias-uefa': '#60a5fa',
  'eliminatorias-conmebol': '#facc15',
};

function getLeagueTsdbId(rawLeague: string): string | null {
  const lower = rawLeague.toLowerCase().trim();
  if (LEAGUE_TSDB_ID[lower]) return LEAGUE_TSDB_ID[lower];
  for (const [key, id] of Object.entries(LEAGUE_TSDB_ID)) {
    if (lower.includes(key) || key.includes(lower)) return id;
  }
  return null;
}

function getLeagueBadgeUrl(rawLeague: string): string | null {
  const id = getLeagueTsdbId(rawLeague);
  if (!id) return createCompetitionBadge(rawLeague, '#a855f7');
  return LEAGUE_BADGE_URL[id] ?? createCompetitionBadge(rawLeague, LEAGUE_COLOR[id] ?? '#a855f7');
}

function getLeagueColor(rawLeague: string): string {
  const id = getLeagueTsdbId(rawLeague);
  return (id && LEAGUE_COLOR[id]) ?? '#a855f7';
}

function createCompetitionBadge(rawLeague: string, color: string): string {
  const initials = rawLeague
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="34" fill="#10131d"/><circle cx="64" cy="64" r="44" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="5"/><text x="64" y="73" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#fff">${initials || 'FUT'}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface DynamicCompetition {
  id: string;
  label: string;
  logo: string | null;
  color: string;
  count: number;
}

const LeagueFilter: React.FC<{
  competitions: DynamicCompetition[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}> = ({ competitions, selected, onSelect }) => {
  const [failedLogos, setFailedLogos] = React.useState<Set<string>>(new Set());

  if (!competitions.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-bold shrink-0">
          Campeonatos
        </span>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] font-bold px-3 py-1 rounded-full border border-white/15 text-white/50 hover:text-white hover:border-white/30 transition-all"
          >
            Ver todos
          </button>
        )}
      </div>

      {/* Pills ovais de vidro */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {competitions.map((comp) => {
          const active = selected === comp.id;
          return (
            <button
              key={comp.id}
              onClick={() => onSelect(active ? null : comp.id)}
              title={comp.label}
              className="shrink-0 flex items-center gap-3 px-5 py-3 rounded-full transition-all duration-200 outline-none focus:ring-2 focus:ring-purple-400/50"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${comp.color}22, ${comp.color}10)`
                  : 'rgba(255,255,255,0.05)',
                border: active ? `1.5px solid ${comp.color}70` : '1px solid rgba(255,255,255,0.10)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: active
                  ? `0 0 20px ${comp.color}30, inset 0 1px 0 rgba(255,255,255,0.12)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                transform: active ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {/* Logo oval interna */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: active ? `${comp.color}18` : 'rgba(255,255,255,0.07)',
                  border: active ? `1px solid ${comp.color}50` : '1px solid rgba(255,255,255,0.10)',
                }}
              >
                {!comp.logo || failedLogos.has(comp.id) ? (
                  <span
                    className="text-[7px] font-black leading-tight text-center px-0.5"
                    style={{ color: comp.color }}
                  >
                    {comp.label.slice(0, 3).toUpperCase()}
                  </span>
                ) : (
                  <img
                    src={comp.logo}
                    alt={comp.label}
                    loading="lazy"
                    className="w-full h-full object-contain p-1"
                    onError={() =>
                      setFailedLogos((prev) => {
                        const next = new Set(prev);
                        next.add(comp.id);
                        return next;
                      })
                    }
                  />
                )}
              </div>

              {/* Label + contagem */}
              <div className="flex flex-col leading-tight">
                <span
                  className="text-[12px] font-bold whitespace-nowrap transition-colors"
                  style={{ color: active ? comp.color : 'rgba(255,255,255,0.55)' }}
                >
                  {comp.label}
                </span>
                <span
                  className="text-[9px] font-semibold"
                  style={{ color: active ? `${comp.color}bb` : 'rgba(255,255,255,0.25)' }}
                >
                  {comp.count} {comp.count === 1 ? 'jogo' : 'jogos'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

type TeamBadgeLookup = Record<string, string>;

function normalizeBadgeKey(value: string | null | undefined): string {
  const base = normalizeTeamName(value);
  if (!base) return '';
  return base
    .replace(/saf$/g, '')
    .replace(/fc$/g, '')
    .replace(/futebolclube$/g, '')
    .trim();
}

function mergeTableComTimes(tabela: TabelaBrasileiraoRow[], max = 20): TabelaBrasileiraoRow[] {
  return [...tabela]
    .sort((a, b) => {
      const posA = a.posicao ?? Number.MAX_SAFE_INTEGER;
      const posB = b.posicao ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    })
    .slice(0, max);
}

interface FutebolPageProps {
  onBack?: () => void;
}

const FutebolPage: React.FC<FutebolPageProps> = ({ onBack }) => {
  const navigate = useNavigate();

  // Capturar botão Voltar do controle remoto (Esc/Backspace/Back)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (key === 'Escape' || key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (onBack) onBack();
        else navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onBack, navigate]);
  const {
    proximosJogos,
    resultadosRecentes,
    tabela,
    timesSerieA,
    competitions,
    loading,
    loadingJogos,
    loadingTabela,
    error,
    loadInitial,
    resolverTeamId,
  } = useFutebol();

  const [channelLogoLookup, setChannelLogoLookup] = useState<
    ((epgCanal: string | null | undefined) => string | null) | null
  >(null);
  const [channelTargetLookup, setChannelTargetLookup] = useState<
    ((epgCanal: string | null | undefined) => string | null) | null
  >(null);
  useEffect(() => {
    channelsService.loadChannels().then((channels) => {
      setChannelLogoLookup(() => buildChannelLogoLookup(channels));
      setChannelTargetLookup(() => buildChannelTargetLookup(channels));
    });
  }, []);

  const getChannelLogo = useCallback(
    (epgCanal: string | null | undefined) => channelLogoLookup?.(epgCanal) ?? null,
    [channelLogoLookup]
  );
  const getChannelTarget = useCallback(
    (epgCanal: string | null | undefined) => channelTargetLookup?.(epgCanal) ?? null,
    [channelTargetLookup]
  );

  const badgeLookup = useMemo<TeamBadgeLookup>(() => {
    const map: TeamBadgeLookup = {};
    timesSerieA.forEach((time) => {
      const key = normalizeBadgeKey(time.strTeam);
      if (key && time.strTeamBadge) {
        map[key] = time.strTeamBadge;
      }
      const plain = normalizeTeamName(time.strTeam);
      if (plain && time.strTeamBadge) {
        map[plain] = time.strTeamBadge;
      }
    });
    return map;
  }, [timesSerieA]);

  /* ── League/Competition filter ──────────────────────────────── */
  const [selectedLeague, setSelectedLeague] = React.useState<string | null>(null);

  /** Competitions derived from actual upcoming matches — logos from TheSportsDB */
  const dynamicCompetitions = useMemo<DynamicCompetition[]>(() => {
    const seen = new Map<string, DynamicCompetition>();
    competitions.forEach((comp) => {
      seen.set(comp.id, {
        id: comp.id,
        label: comp.name,
        logo: comp.logo || getLeagueBadgeUrl(comp.name),
        color: getLeagueColor(comp.name),
        count: 0,
      });
    });
    proximosJogos.forEach((j) => {
      const league = (j.strLeague || '').trim();
      if (!league) return;
      const id = league.toLowerCase();
      const existing =
        seen.get(id) ||
        Array.from(seen.values()).find((comp) => {
          const label = comp.label.toLowerCase();
          return label === id || label.includes(id) || id.includes(label);
        });
      if (existing) {
        existing.count++;
      } else {
        seen.set(id, {
          id,
          label: league,
          logo: getLeagueBadgeUrl(league),
          color: getLeagueColor(league),
          count: 1,
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  }, [competitions, proximosJogos]);

  const filteredCards = useMemo(() => {
    if (!selectedLeague) return proximosJogos;
    return proximosJogos.filter((j) => {
      const league = (j.strLeague || '').toLowerCase().trim();
      const selected = dynamicCompetitions.find((comp) => comp.id === selectedLeague);
      const selectedLabel = selected?.label.toLowerCase().trim() || selectedLeague;
      return league === selectedLeague || league === selectedLabel || league.includes(selectedLabel) || selectedLabel.includes(league);
    });
  }, [dynamicCompetitions, proximosJogos, selectedLeague]);

  const cards = filteredCards;
  const topTable = useMemo(() => mergeTableComTimes(tabela, 20), [tabela]);

  const teamFilters = useMemo(() => {
    const map = new Map<string, { key: string; teamId: string; name: string; badge: string }>();
    timesSerieA.forEach((team) => {
      const key = normalizeTeamName(team.strTeam);
      const bKey = normalizeBadgeKey(team.strTeam);
      if (!key) return;
      const badgeFromOverride =
        (bKey && TEAM_LOGO_SVG_OVERRIDES[bKey]) || (key && TEAM_LOGO_SVG_OVERRIDES[key]) || null;
      map.set(key, {
        key,
        teamId: team.idTeam,
        name: team.strTeam,
        badge: team.strTeamBadge || badgeFromOverride || PLACEHOLDER_BADGE,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [timesSerieA]);

  const getBadge = useCallback(
    (teamName: string | null, explicitBadge?: string | null): string => {
      if (explicitBadge) return explicitBadge;
      const key = normalizeBadgeKey(teamName);
      const plain = normalizeTeamName(teamName);
      // 1. lookup da tabela de times (TheSportsDB via useFutebol)
      const fromLookup = (key && badgeLookup[key]) || (plain && badgeLookup[plain]) || null;
      if (fromLookup) return fromLookup;
      // 2. overrides SVG locais (20 times Série A) — resposta imediata sem API
      const fromOverride =
        (key && TEAM_LOGO_SVG_OVERRIDES[key]) || (plain && TEAM_LOGO_SVG_OVERRIDES[plain]) || null;
      if (fromOverride) return fromOverride;
      return PLACEHOLDER_BADGE;
    },
    [badgeLookup]
  );

  /* Resolve a cor primária oficial do time.
   * Prioridade: TEAM_COLOR_OVERRIDES (curado) → BRASILEIRAO_TEAMS → null
   * Nunca usa dados da API (strHomeTeamColor1) pois TheSportsDB frequentemente
   * retorna cores erradas para times brasileiros. */
  const getTeamColor = useCallback((teamName: string | null): string | null => {
    if (!teamName) return null;
    const norm = normalizeTeamName(teamName);
    if (!norm) return null;
    // 1. TEAM_COLOR_OVERRIDES — dados curados manualmente
    const fromOverride = TEAM_COLOR_OVERRIDES[norm];
    if (fromOverride) return fromOverride.primary;
    // 2. BRASILEIRAO_TEAMS — fallback por id normalizado
    const team = BRASILEIRAO_TEAMS.find(
      (t) => normalizeTeamName(t.name) === norm || norm.startsWith(t.id.replace(/-/g, ''))
    );
    return team?.colors.primary ?? null;
  }, []);

  const openTeam = useCallback(
    (teamName: string | null, explicitId?: string | null) => {
      const teamId = resolverTeamId(teamName, explicitId || null);
      if (!teamId) return;
      navigate(`/futebol/time/${teamId}`);
    },
    [navigate, resolverTeamId]
  );

  const onSelectCardTeam = useCallback(
    (teamName: string | null, explicitId?: string | null) => {
      playSelectSound();
      openTeam(teamName, explicitId);
    },
    [openTeam]
  );

  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      <div className="relative z-10 w-full space-y-4 pb-20 animate-fade-in">
        <FutebolHero
          teamFilters={teamFilters}
          loadingTeams={loading && !teamFilters.length}
          onSelectTeam={onSelectCardTeam}
        />

        <div className="modern-home-content relative z-20 space-y-8">
          {error ? (
            <section className="px-6 md:px-12" data-nav-row="2">
              <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-6 flex items-center justify-between gap-4">
                <span className="text-red-100 font-semibold">{error}</span>
                <button
                  type="button"
                  onClick={loadInitial}
                  className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 font-bold"
                >
                  Tentar novamente
                </button>
              </div>
            </section>
          ) : null}

          {/* ── Filtro de Campeonatos (dados da API) ── */}
          <section className="px-6 md:px-12" data-nav-row="2">
            <LeagueFilter
              competitions={dynamicCompetitions}
              selected={selectedLeague}
              onSelect={setSelectedLeague}
            />
          </section>

          <section className="px-6 md:px-12" data-nav-row="3" style={{ marginTop: '0.5cm' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
                Jogos do dia
              </h2>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-bold">
                Toque no canal para abrir ao vivo
              </span>
            </div>
            {!loadingJogos && cards.length === 0 && selectedLeague && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-60">
                <span className="text-5xl">⚽</span>
                <p className="text-white/50 font-semibold text-sm">
                  Nenhum jogo encontrado para este campeonato
                </p>
                <button
                  onClick={() => setSelectedLeague(null)}
                  className="text-xs font-bold px-4 py-2 rounded-full border border-white/15 text-white/60 hover:text-white transition-all"
                >
                  Ver todos os jogos
                </button>
              </div>
            )}
            <FutebolJogos
              jogos={cards}
              loadingJogos={loadingJogos}
              getBadge={getBadge}
              getTeamColor={getTeamColor}
              getChannelLogo={getChannelLogo}
              getChannelTarget={getChannelTarget}
              onSelectTeam={onSelectCardTeam}
              onSelectChannel={(canal) => navigate(`/canais?channel=${encodeURIComponent(canal)}`)}
            />
          </section>

          <section className="px-6 md:px-12" data-nav-row="4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
                Tabela
              </h2>
            </div>
            <FutebolTabela
              tabela={topTable}
              loadingTabela={loadingTabela}
              onSelectTeam={onSelectCardTeam}
              getBadge={getBadge}
            />
          </section>

          {/* ── Seleção Brasileira / Copa 2026 ── */}
          <section className="px-6 md:px-12" data-nav-row="5" style={{ marginTop: '1cm' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
                🇧🇷 Seleção
              </h2>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-bold">
                Copa do Mundo 2026
              </span>
            </div>
            <SelecaoSection />
          </section>

          <section className="px-6 md:px-12" data-nav-row="6" style={{ marginTop: '1cm' }}>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
                Artilharia
              </h2>
              <span className="px-3 py-1 rounded-full bg-[#6A0DAD]/30 border border-[#a855f7]/40 text-[#c084fc] text-xs font-bold tracking-wider">
                SÉRIE A 2026
              </span>
            </div>
            <FutebolArtilharia />
          </section>

          {resultadosRecentes.length > 0 && (
            <section className="px-6 md:px-12" data-nav-row="7" style={{ marginTop: '1cm' }}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
                  Últimos Resultados
                </h2>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-bold">
                  {resultadosRecentes.length} jogos
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {resultadosRecentes.map((jogo, idx) => {
                  const ts = jogo.dateEvent
                    ? Date.parse(
                        `${jogo.dateEvent}T${String(jogo.strTime || '12:00').slice(0, 5)}:00`
                      )
                    : NaN;
                  const d = Number.isNaN(ts) ? null : new Date(ts);
                  const weekday = d
                    ? d
                        .toLocaleDateString('pt-BR', { weekday: 'short' })
                        .replace('.', '')
                        .toUpperCase()
                    : '---';
                  const dateLine = jogo.dateEvent || '---';
                  const homeColor =
                    getTeamColor(jogo.strHomeTeam) ||
                    (jogo as any).strHomeTeamColor1 ||
                    (jogo as any).strHomeTeamColor2;
                  const awayColor =
                    getTeamColor(jogo.strAwayTeam) ||
                    (jogo as any).strAwayTeamColor1 ||
                    (jogo as any).strAwayTeamColor2;
                  return (
                    <FutebolMatchCard
                      key={String(jogo.idEvent || idx)}
                      mode="result"
                      weekday={weekday}
                      timeOrSecondary={dateLine}
                      homeName={jogo.strHomeTeam}
                      awayName={jogo.strAwayTeam}
                      homeBadge={getBadge(jogo.strHomeTeam, jogo.strHomeTeamBadge)}
                      awayBadge={getBadge(jogo.strAwayTeam, jogo.strAwayTeamBadge)}
                      homeScore={jogo.intHomeScore ?? '-'}
                      awayScore={jogo.intAwayScore ?? '-'}
                      homeColor={homeColor}
                      awayColor={awayColor}
                      competition={(jogo as any).strLeague ?? null}
                      venue={(jogo as any).strVenue ?? null}
                      onSelectHome={() =>
                        onSelectCardTeam(jogo.strHomeTeam, (jogo as any).idHomeTeam)
                      }
                      onSelectAway={() =>
                        onSelectCardTeam(jogo.strAwayTeam, (jogo as any).idAwayTeam)
                      }
                      navRow="7"
                      navColBase={idx * 2}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default FutebolPage;
