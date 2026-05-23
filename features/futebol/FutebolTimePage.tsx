import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { useFutebolTime } from '@/features/futebol/hooks/useFutebol';
import {
  ClassificacaoTime,
  ElencoTime,
  HeroTime,
  HistoriaTime,
  ProximosJogosTime,
  ResultadosTime,
} from '@/components/Futebol/Time';

interface FutebolTimeProps {
  teamId?: string;
}

const FutebolTimePage: React.FC<FutebolTimeProps> = ({ teamId }) => {
  const params = useParams<{ teamId?: string; id?: string }>();
  const navigate = useNavigate();
  const resolvedTeamId = teamId || params.teamId || params.id || '';

  const {
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
    recarregarResumo,
    recarregarElenco,
  } = useFutebolTime(resolvedTeamId || undefined);

  const handleBack = () => {
    navigate('/futebol');
  };

  useEffect(() => {
    const handleRemoteBack = (e: KeyboardEvent) => {
      const key = e.key;
      if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'Back' ||
        key === 'BrowserBack' ||
        key === 'GoBack'
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
      }
    };

    window.addEventListener('keydown', handleRemoteBack, { capture: true });
    return () => window.removeEventListener('keydown', handleRemoteBack, { capture: true });
  }, [navigate]);

  if (!resolvedTeamId) {
    return (
      <div className="w-full h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <p className="text-white/70">Time invalido na rota.</p>
      </div>
    );
  }

  if (loadingResumo) {
    return (
      <div className="w-full h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] text-white pb-14 overflow-x-hidden">
      <HeroTime detalhesTime={detalhesTime} teamId={resolvedTeamId} onBack={handleBack} />

      {erroResumo ? (
        <section className="max-w-6xl mx-auto px-6 md:px-12 mt-8" data-nav-row="11">
          <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-8 text-center">
            <p className="text-red-100 font-bold">{erroResumo}</p>
            <button
              tabIndex={0}
              data-nav-item
              data-nav-col={0}
              onClick={recarregarResumo}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-sm font-bold outline-none focus:ring-2 focus:ring-red-200/60"
            >
              <RefreshCcw size={14} />
              Recarregar dados principais
            </button>
          </div>
        </section>
      ) : (
        <>
          <ClassificacaoTime
            classificacaoAtual={classificacaoAtual}
            indisponivel={classificacaoIndisponivel}
          />
          <ProximosJogosTime jogos={proximosJogos} />
          <ResultadosTime jogos={resultadosRecentes} />
        </>
      )}

      <HistoriaTime dadosLocais={dadosLocais} rowBase={20} />

      <ElencoTime
        elencoPorPosicao={elencoPorPosicao}
        artilheiro={artilheiro}
        loading={loadingElenco}
        error={erroElenco}
        espnSquad={dadosLocais?.squad}
      />

      {!loadingElenco && erroElenco ? (
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <button
            tabIndex={0}
            data-nav-row="12"
            data-nav-item
            data-nav-col={0}
            onClick={recarregarElenco}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-bold outline-none focus:ring-2 focus:ring-white/40"
          >
            <RefreshCcw size={14} />
            Tentar carregar elenco novamente
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default FutebolTimePage;
