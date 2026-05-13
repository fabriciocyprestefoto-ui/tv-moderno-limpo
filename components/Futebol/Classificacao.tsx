import React, { memo } from 'react';
import { BarChart3 } from 'lucide-react';
import type { TabelaBrasileiraoRow } from '@/features/futebol/types';

interface ClassificacaoProps {
  tabela: TabelaBrasileiraoRow[];
  indisponivel: boolean;
  onTeamClick?: (teamId: string) => void;
}

function formatValue(value: number | null): string {
  return value === null ? '-' : String(value);
}

const TeamBadge: React.FC<{ nomeTime: string }> = memo(({ nomeTime }) => {
  return (
    <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px] font-black uppercase">
      {nomeTime.slice(0, 2)}
    </div>
  );
});

TeamBadge.displayName = 'ClassificacaoTeamBadge';

const Classificacao: React.FC<ClassificacaoProps> = memo(
  ({ tabela, indisponivel, onTeamClick }) => {
    return (
      <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10 pb-4" data-nav-row="4">
        <h2 className="text-2xl font-black uppercase tracking-tight mb-5 flex items-center gap-3">
          <BarChart3 size={22} className="text-cyan-400" />
          Classificacao Atual
        </h2>

        {indisponivel || tabela.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-white/65">
            Classificação temporariamente indisponível
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.18em] text-white/45">
                  <tr>
                    <th className="px-4 py-4">Pos</th>
                    <th className="px-4 py-4">Time</th>
                    <th className="px-4 py-4 text-center">Pts</th>
                    <th className="px-4 py-4 text-center">J</th>
                    <th className="px-4 py-4 text-center">V</th>
                    <th className="px-4 py-4 text-center">E</th>
                    <th className="px-4 py-4 text-center">D</th>
                    <th className="px-4 py-4 text-center">SG</th>
                    <th className="px-4 py-4 text-center">Aproveitamento</th>
                  </tr>
                </thead>
                <tbody>
                  {tabela.map((row, index) => (
                    <tr
                      key={`${row.nomeTime}-${index}`}
                      className="border-t border-white/10 text-sm"
                    >
                      <td className="px-4 py-4 font-bold text-white/80">
                        {formatValue(row.posicao)}
                      </td>
                      <td className="px-4 py-4">
                        {row.teamId && onTeamClick ? (
                          <button
                            tabIndex={0}
                            data-nav-item
                            data-nav-col={index}
                            onClick={() => onTeamClick(row.teamId as string)}
                            className="flex items-center gap-3 outline-none focus:ring-2 focus:ring-white/45 rounded-md px-1 py-1 w-full text-left"
                          >
                            <TeamBadge nomeTime={row.nomeTime} />
                            <span className="font-bold">{row.nomeTime}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-3">
                            <TeamBadge nomeTime={row.nomeTime} />
                            <span className="font-bold">{row.nomeTime}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center font-black text-white">
                        {formatValue(row.pontos)}
                      </td>
                      <td className="px-4 py-4 text-center text-white/75">
                        {formatValue(row.jogos)}
                      </td>
                      <td className="px-4 py-4 text-center text-white/75">
                        {formatValue(row.vitorias)}
                      </td>
                      <td className="px-4 py-4 text-center text-white/75">
                        {formatValue(row.empates)}
                      </td>
                      <td className="px-4 py-4 text-center text-white/75">
                        {formatValue(row.derrotas)}
                      </td>
                      <td className="px-4 py-4 text-center text-white/75">
                        {formatValue(row.saldoGols)}
                      </td>
                      <td className="px-4 py-4 text-center text-white/75">
                        {row.aproveitamento || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    );
  }
);

Classificacao.displayName = 'Classificacao';

export default Classificacao;
