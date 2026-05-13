import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { logger } from '../utils/logger';
import { ChevronLeft, Trophy, Calendar, Users, Info } from 'lucide-react';
import { BRASILEIRAO_TEAMS } from '../data/brasileiraoTimes';
import {
  getBrasileiraoTable,
  getTeamMatches,
  getTeamLastMatches,
  getTeamWikiSummary,
  lookupTeamDetails,
  getTeamPlayers,
  Standing,
  Match,
  WikiSummary,
  TeamDetailsInfo,
  Player,
} from '../features/brasileirao/apiService';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

interface TeamDetailsProps {
  teamId: string;
  onBack: () => void;
}

const TeamDetails: React.FC<TeamDetailsProps> = ({ teamId, onBack }) => {
  const { setEnabled } = useSpatialNav();
  const team = useMemo(() => BRASILEIRAO_TEAMS.find((t) => t.id === teamId), [teamId]);

  // Garantir navegação espacial ativa nesta tela (data-nav-row / data-nav-item)
  useEffect(() => {
    setEnabled(true);
    return () => setEnabled(true);
  }, [setEnabled]);

  // Listener para botão 'Voltar' do controle (Escape / Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (key === 'Escape' || key === 'Backspace') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const [loading, setLoading] = useState(true);
  const [wiki, setWiki] = useState<WikiSummary | null>(null);
  const [table, setTable] = useState<Standing[]>([]);
  const [nextMatches, setNextMatches] = useState<Match[]>([]);
  const [lastMatches, setLastMatches] = useState<Match[]>([]);
  const [teamInfo, setTeamInfo] = useState<TeamDetailsInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!team) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [wikiData, tableData, nextData, detailsData, squadData] = await Promise.all([
          getTeamWikiSummary(team.wiki),
          getBrasileiraoTable(),
          getTeamMatches(team.name),
          lookupTeamDetails(team.tsdbId),
          getTeamPlayers(team.tsdbId),
        ]);

        setWiki(wikiData);
        setTable(tableData);
        setNextMatches(nextData);
        setTeamInfo(detailsData);
        setPlayers(squadData);

        // Buscar timeId para últimos jogos (pode ser diferente do ID de seleção)
        const teamInTable = tableData.find((s) =>
          s.team.toLowerCase().includes(team.name.toLowerCase())
        );
        if (teamInTable) {
          const lastData = await getTeamLastMatches(teamInTable.teamId);
          setLastMatches(lastData);
        }
      } catch (error) {
        logger.error('[TeamDetails] Error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [team]);

  if (!team) return null;

  if (loading) {
    return (
      <div className="w-full h-screen bg-transparent flex items-center justify-center">
        <div
          className="w-12 h-12 border-4 rounded-full animate-spin"
          style={{ borderColor: team.colors.primary, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-transparent text-white pb-32 overflow-x-hidden">
      {/* Hero Header */}
      <div className="relative w-full h-[65vh] min-h-[500px]">
        <div className="absolute inset-0">
          <img
            src={teamInfo?.banner || wiki?.originalimage?.source}
            alt=""
            className="w-full h-full object-cover opacity-20 filter blur-sm"
          />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: `linear-gradient(45deg, ${team.colors.primary}, ${team.colors.secondary || '#000'})`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090912] via-[#090912]/80 to-transparent" />
        </div>

        <button
          onClick={onBack}
          tabIndex={0}
          data-nav-item
          data-nav-row="0"
          data-nav-col="0"
          className="absolute top-10 left-10 z-30 p-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 outline-none focus:ring-4 ring-white/50 transition-all"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="absolute bottom-10 left-12 z-10 flex items-end gap-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-56 h-56 rounded-[48px] bg-white/5 backdrop-blur-2xl border border-white/10 p-8 flex items-center justify-center shadow-2xl relative group"
          >
            <img
              src={teamInfo?.badge || wiki?.originalimage?.source || '/placeholder-shield.png'}
              alt={team.name}
              className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]"
            />
          </motion.div>

          <div className="flex flex-col mb-6">
            <div className="flex items-center gap-4 mb-4">
              <span className="px-4 py-1.5 rounded-full bg-[#A855F7] text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-purple-600/20">
                Brasileirão Série A{teamInfo?.formedYear && ` • Est. ${teamInfo.formedYear}`}
              </span>
              <div
                className="w-4 h-4 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                style={{ backgroundColor: team.colors.primary }}
              />
            </div>
            <h1 className="text-7xl font-black italic uppercase tracking-tighter mb-4 leading-none">
              {team.name}
            </h1>
            <div className="flex items-center gap-6 text-white/60 font-medium uppercase tracking-[0.15em] text-xs">
              <span className="flex items-center gap-2">
                <Info size={16} style={{ color: team.colors.primary }} />
                {teamInfo?.stadium || 'Estádio Principal'}
              </span>
              {teamInfo?.stadiumCapacity && (
                <span className="flex items-center gap-2">
                  <Users size={16} />
                  {parseInt(teamInfo.stadiumCapacity).toLocaleString()} Cap.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-12 grid grid-cols-1 lg:grid-cols-4 gap-12 mt-16">
        <div className="lg:col-span-3 space-y-20">
          {/* Squad Section */}
          {players.length > 0 && (
            <section data-nav-row="1">
              <div className="flex items-center gap-4 mb-8">
                <Users className="text-white/40" size={24} />
                <h2 className="text-2xl font-black uppercase tracking-widest italic">
                  Elenco Atual
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
                {players.map((player, idx) => (
                  <div
                    key={player.id}
                    tabIndex={0}
                    data-nav-item
                    data-nav-col={idx}
                    className="group relative flex flex-col items-center gap-3 p-4 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all outline-none focus:ring-4 ring-white/50"
                  >
                    <div className="w-full aspect-square rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center">
                      {player.thumb ? (
                        <img
                          src={player.thumb}
                          alt={player.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <Users size={40} className="opacity-10" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-black uppercase tracking-tighter truncate w-full">
                        {player.name}
                      </p>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                        {player.position}
                      </p>
                    </div>
                    {player.number && (
                      <span className="absolute top-2 right-2 text-xl font-black opacity-10 italic">
                        #{player.number}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section data-nav-row="2">
            <div className="flex items-center gap-4 mb-8">
              <Info className="text-white/40" size={24} />
              <h2 className="text-2xl font-black uppercase tracking-widest italic">
                História & Identidade
              </h2>
            </div>
            <div
              tabIndex={0}
              data-nav-item
              data-nav-col={0}
              className="rounded-[40px] bg-white/5 border border-white/10 p-12 backdrop-blur-xl relative overflow-hidden group outline-none focus:ring-4 ring-white/50 transition-all"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-white/10 transition-colors" />
              <p className="text-xl leading-relaxed text-white/80 font-medium relative z-10">
                {teamInfo?.description ||
                  wiki?.extract ||
                  'A história deste glorioso clube está sendo escrita todos os dias no coração dos torcedores.'}
              </p>

              {teamInfo?.jersey && (
                <div className="mt-10 pt-10 border-t border-white/5 flex items-center gap-10">
                  <img
                    src={teamInfo.jersey}
                    alt="Manto Sagrado"
                    className="h-32 object-contain drop-shadow-2xl"
                  />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-2">
                      Manto Sagrado
                    </p>
                    <p className="text-sm font-bold opacity-60 uppercase">
                      Uniforme Oficial Temporada 2024
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section data-nav-row="4">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black uppercase tracking-widest italic opacity-40">
                Agenda e Resultados
              </h2>
              <Calendar size={20} className="opacity-20" />
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {nextMatches.length > 0 ? (
                  nextMatches.slice(0, 4).map((m, idx) => (
                    <div
                      key={m.id}
                      tabIndex={0}
                      data-nav-item
                      data-nav-col={idx + 100}
                      className="rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col gap-6 hover:bg-white/10 transition-colors focus:ring-4 ring-white/50 outline-none group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#A855F7] bg-[#A855F7]/10 px-3 py-1 rounded-full">
                          Próximo Jogo
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                          {new Date(m.date).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'long',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4">
                        <div className="flex flex-col items-center gap-2 flex-1">
                          {m.homeBadge && (
                            <img src={m.homeBadge} className="w-12 h-12 object-contain" alt="" />
                          )}
                          <span className="font-black uppercase tracking-tighter text-sm text-center line-clamp-1">
                            {m.home}
                          </span>
                        </div>
                        <span className="text-xl font-black opacity-20 italic mx-4">VS</span>
                        <div className="flex flex-col items-center gap-2 flex-1">
                          {m.awayBadge && (
                            <img src={m.awayBadge} className="w-12 h-12 object-contain" alt="" />
                          )}
                          <span className="font-black uppercase tracking-tighter text-sm text-center line-clamp-1 text-right">
                            {m.away}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 py-10 text-center opacity-20 italic uppercase tracking-[0.3em]">
                    Nenhum jogo agendado
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {lastMatches.length > 0
                  ? lastMatches.slice(0, 4).map((m, idx) => (
                      <div
                        key={m.id}
                        tabIndex={0}
                        data-nav-item
                        data-nav-col={idx + 200}
                        className="rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col gap-6 hover:bg-white/10 transition-colors focus:ring-4 ring-white/50 outline-none opacity-60 filter grayscale-[0.5]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                            Resultado Final
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                            {new Date(m.date).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-4">
                          <div className="flex flex-col items-center gap-2 flex-1">
                            <span className="font-black uppercase tracking-tighter text-xs text-center line-clamp-1">
                              {m.home}
                            </span>
                            <span className="text-3xl font-black">{m.homeScore}</span>
                          </div>
                          <span className="text-xs font-black opacity-10 mx-4">X</span>
                          <div className="flex flex-col items-center gap-2 flex-1">
                            <span className="font-black uppercase tracking-tighter text-xs text-center line-clamp-1 text-right">
                              {m.away}
                            </span>
                            <span className="text-3xl font-black">{m.awayScore}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-12" data-nav-row="5">
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black uppercase tracking-widest opacity-40 italic">
                Na Tabela
              </h2>
              <Trophy size={20} className="text-yellow-500 opacity-50" />
            </div>

            <div className="rounded-[40px] bg-white/5 border border-white/10 overflow-hidden backdrop-blur-xl shadow-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                    <th className="px-6 py-5">#</th>
                    <th className="px-6 py-5">PTS</th>
                    <th className="px-6 py-5">VIT</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {table.slice(0, 10).map((s, _idx) => {
                    const isCurrentTeam = s.team.toLowerCase().includes(team.name.toLowerCase());
                    return (
                      <tr
                        key={s.teamId}
                        className={`border-t border-white/5 transition-colors ${isCurrentTeam ? 'bg-white/10' : 'hover:bg-white/[0.02]'}`}
                      >
                        <td className="px-6 py-5">
                          <span
                            className={`w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-black ${isCurrentTeam ? 'bg-white text-black' : 'text-white/40 border border-white/10'}`}
                          >
                            {s.position}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-black">
                          <div className="flex items-center gap-3">
                            {isCurrentTeam && (
                              <div
                                className="w-2 h-2 rounded-full shadow-[0_0_10px_white]"
                                style={{ backgroundColor: team.colors.primary }}
                              />
                            )}
                            <span className={isCurrentTeam ? 'text-white' : 'text-white/80'}>
                              {s.points}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-white/60 font-bold">{s.wins}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-6 bg-white/5 text-center">
                <button
                  tabIndex={0}
                  data-nav-item
                  data-nav-col={0}
                  className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 hover:text-white transition-colors outline-none focus:text-white"
                >
                  Ver Tabela Completa
                </button>
              </div>
            </div>
          </section>

          {/* Social Section */}
          <section>
            <h2 className="text-xl font-black uppercase tracking-widest opacity-40 italic mb-8 text-center">
              Conecte-se
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {teamInfo?.website && (
                <a
                  href={`https://${teamInfo.website}`}
                  target="_blank"
                  tabIndex={0}
                  data-nav-item
                  data-nav-col={1}
                  className="flex items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors uppercase text-[10px] font-black tracking-widest outline-none focus:ring-4 ring-white/50"
                  rel="noreferrer"
                >
                  Site
                </a>
              )}
              {teamInfo?.instagram && (
                <a
                  href={`https://${teamInfo.instagram}`}
                  target="_blank"
                  tabIndex={0}
                  data-nav-item
                  data-nav-col={2}
                  className="flex items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors uppercase text-[10px] font-black tracking-widest outline-none focus:ring-4 ring-white/50"
                  rel="noreferrer"
                >
                  Instagram
                </a>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TeamDetails;
