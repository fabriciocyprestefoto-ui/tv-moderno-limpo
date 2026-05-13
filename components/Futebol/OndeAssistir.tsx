import React, { memo } from 'react';
import { MonitorPlay, Tv } from 'lucide-react';
import type { FutebolEvento } from '@/features/futebol/types';

interface OndeAssistirProps {
  jogos: FutebolEvento[];
}

function formatDateTime(dateEvent: string | null, strTime: string | null): string {
  if (!dateEvent) return 'Data a confirmar';

  const normalizedTime = strTime?.trim().match(/^(\d{2}:\d{2})/)?.[1] || '00:00';
  const parsed = new Date(`${dateEvent}T${normalizedTime}:00`);
  if (Number.isNaN(parsed.getTime())) return 'Data a confirmar';

  const date = parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = normalizedTime === '00:00' ? 'Horário a confirmar' : normalizedTime;
  return `${date} • ${time}`;
}

const OndeAssistirCard: React.FC<{ jogo: FutebolEvento; index: number }> = memo(
  ({ jogo, index }) => {
    return (
      <article
        tabIndex={0}
        data-nav-item
        data-nav-col={index}
        className="w-[290px] md:w-[320px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] focus:bg-white/[0.1] outline-none focus:ring-2 focus:ring-white/40 transition-colors"
      >
        <div className="text-[11px] uppercase tracking-[0.16em] text-white/45 mb-3">
          {formatDateTime(jogo.dateEvent, jogo.strTime)}
        </div>
        <p className="text-sm font-bold leading-snug">
          {jogo.strHomeTeam || 'Mandante'} x {jogo.strAwayTeam || 'Visitante'}
        </p>

        <div className="mt-4 rounded-xl bg-black/30 border border-white/10 px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/80">
            <Tv size={13} className="text-amber-300" />
            <span>Transmissão a confirmar</span>
          </div>
          <button
            tabIndex={-1}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-white/75"
          >
            <MonitorPlay size={12} />
            Em breve
          </button>
        </div>
      </article>
    );
  }
);

OndeAssistirCard.displayName = 'OndeAssistirCard';

const OndeAssistir: React.FC<OndeAssistirProps> = memo(({ jogos }) => {
  return (
    <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10" data-nav-row="2">
      <h2 className="text-2xl font-black uppercase tracking-tight mb-5 flex items-center gap-3">
        <Tv size={22} className="text-yellow-400" />
        Onde Serão Transmitidos
      </h2>

      {jogos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/60">
          Sem jogos disponíveis para transmissão no momento.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {jogos.map((jogo, index) => (
            <OndeAssistirCard key={jogo.idEvent} jogo={jogo} index={index} />
          ))}
        </div>
      )}
    </section>
  );
});

OndeAssistir.displayName = 'OndeAssistir';

export default OndeAssistir;
