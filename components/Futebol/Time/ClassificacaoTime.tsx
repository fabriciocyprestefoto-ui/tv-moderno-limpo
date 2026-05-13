import React, { memo } from 'react';
import { BarChart3 } from 'lucide-react';
import type { TabelaBrasileiraoRow } from '@/features/futebol/types';

interface ClassificacaoTimeProps {
  classificacaoAtual: TabelaBrasileiraoRow | null;
  indisponivel: boolean;
}

function valueOrDash(value: number | null): string {
  return value === null ? '-' : String(value);
}

const ClassificacaoTime: React.FC<ClassificacaoTimeProps> = memo(
  ({ classificacaoAtual, indisponivel }) => {
    return (
      <section className="max-w-6xl mx-auto px-6 md:px-12 mt-8" data-nav-row="1">
        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
          <BarChart3 size={20} className="text-cyan-400" />
          Classificacao Atual
        </h2>

        {indisponivel ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/65">
            Classificação temporariamente indisponível
          </div>
        ) : classificacaoAtual ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Posicao</p>
              <p className="text-3xl font-black mt-1">{valueOrDash(classificacaoAtual.posicao)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Pontos</p>
              <p className="text-3xl font-black mt-1">{valueOrDash(classificacaoAtual.pontos)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Jogos</p>
              <p className="text-3xl font-black mt-1">{valueOrDash(classificacaoAtual.jogos)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Saldo</p>
              <p className="text-3xl font-black mt-1">
                {valueOrDash(classificacaoAtual.saldoGols)}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/65">
            Time nao encontrado na classificacao.
          </div>
        )}
      </section>
    );
  }
);

ClassificacaoTime.displayName = 'ClassificacaoTime';

export default ClassificacaoTime;
