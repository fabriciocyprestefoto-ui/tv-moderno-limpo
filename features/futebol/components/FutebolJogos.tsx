import { memo, useMemo } from 'react';
import { FutebolEvento } from '@/features/futebol/services/futebolService';
import { JogoTransmissaoView } from '@/features/futebol/services/jogosTransmissoesService';
import { useBroadcasters } from '@/features/futebol/hooks/useBroadcasters';
import { playSelectSound } from '@/utils/soundEffects';
import { extractChannelNameFromEpg } from '@/features/futebol/utils/channelLogoLookup';
import { FutebolMatchCard } from '@/features/futebol/components/FutebolMatchCard';
import '@/features/futebol/futebolVisionOS.css';

type JogoItem =
  | (FutebolEvento & {
      strChannelLogo?: string | null;
      strHomeTeamColor1?: string | null;
      strHomeTeamColor2?: string | null;
      strAwayTeamColor1?: string | null;
      strAwayTeamColor2?: string | null;
      strThumb?: string | null;
    })
  | (JogoTransmissaoView & {
      idEvent?: string;
      strChannelLogo?: string | null;
      strHomeTeamColor1?: string | null;
      strHomeTeamColor2?: string | null;
      strAwayTeamColor1?: string | null;
      strAwayTeamColor2?: string | null;
      strThumb?: string | null;
    });

interface FutebolJogosProps {
  jogos: JogoItem[];
  loadingJogos: boolean;
  getBadge: (teamName: string | null, explicitBadge?: string | null) => string;
  getTeamColor?: (teamName: string | null) => string | null;
  getChannelLogo?: (epgCanal: string | null | undefined) => string | null;
  getChannelTarget?: (epgCanal: string | null | undefined) => string | null;
  onSelectTeam: (teamName: string | null, explicitId?: string | null) => void;
  onSelectChannel?: (canal: string) => void;
}

interface JogoView {
  jogo: JogoItem;
  weekday: string;
  time: string;
}

function toTimestamp(jogo: JogoItem): number {
  const date = (jogo.dateEvent || '').trim();
  if (!date) return 0;

  const rawTime = (jogo.strTime || '').trim();
  const hhmm = rawTime.match(/^(\d{2}:\d{2})/);
  const normalizedTime = hhmm ? `${hhmm[1]}:00` : '00:00:00';
  const parsed = Date.parse(`${date}T${normalizedTime}`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatSlot(jogo: JogoItem): { weekday: string; time: string } {
  const ts = toTimestamp(jogo);
  if (!ts) return { weekday: '---', time: '--:--' };
  const d = new Date(ts);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

const SkeletonCard: React.FC = () => (
  <article className="fut-vision-card rounded-3xl p-5 flex flex-col gap-4 animate-pulse">
    <div className="h-3 w-24 bg-white/10 rounded" />
    <div className="flex items-center justify-between">
      <div className="flex flex-col items-center gap-2 w-[40%]">
        <div className="size-12 rounded-xl bg-white/10 border border-white/10 p-2" />
        <div className="h-3 w-16 bg-white/10 rounded" />
      </div>
      <div className="h-3 w-4 bg-white/10 rounded" />
      <div className="flex flex-col items-center gap-2 w-[40%]">
        <div className="size-12 rounded-xl bg-white/10 border border-white/10 p-2" />
        <div className="h-3 w-16 bg-white/10 rounded" />
      </div>
    </div>
    <div className="pt-2 border-t border-white/10">
      <div className="h-2 w-24 bg-white/10 rounded" />
      <div className="mt-2 h-3 w-28 bg-white/10 rounded" />
    </div>
  </article>
);

const FutebolJogosComponent: React.FC<FutebolJogosProps> = ({
  jogos,
  loadingJogos,
  getBadge,
  getTeamColor,
  getChannelLogo,
  getChannelTarget,
  onSelectTeam,
  onSelectChannel,
}) => {
  const { lookup: broadcastLookup } = useBroadcasters(jogos as FutebolEvento[]);

  const jogosView = useMemo<JogoView[]>(
    () =>
      jogos.map((jogo) => {
        const slot = formatSlot(jogo);
        return { jogo, weekday: slot.weekday, time: slot.time };
      }),
    [jogos]
  );

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}
    >
      {jogosView.map(({ jogo, weekday, time }, idx) => {
        const jogoId = (jogo as { idEvent?: string }).idEvent ?? String(idx);
        const rawBroadcast =
          broadcastLookup[jogoId]?.channel ||
          jogo.strTVStation ||
          (jogo as JogoTransmissaoView).canal ||
          'Transmissão não confirmada';
        const displayName = extractChannelNameFromEpg(rawBroadcast) || rawBroadcast;
        const channelLogo = jogo.strChannelLogo ?? getChannelLogo?.(rawBroadcast) ?? null;
        const channelTarget = getChannelTarget?.(rawBroadcast) ?? displayName;
        const hasCanal = Boolean(rawBroadcast && rawBroadcast !== 'Transmissão não confirmada');
        const competition = (jogo as FutebolEvento).strLeague ?? null;
        const venue = (jogo as FutebolEvento).strVenue ?? null;

        return (
          <FutebolMatchCard
            key={String(jogoId)}
            mode="upcoming"
            weekday={weekday}
            timeOrSecondary={time}
            homeName={jogo.strHomeTeam}
            awayName={jogo.strAwayTeam}
            homeBadge={getBadge(jogo.strHomeTeam, jogo.strHomeTeamBadge)}
            awayBadge={getBadge(jogo.strAwayTeam, jogo.strAwayTeamBadge)}
            onSelectHome={() => onSelectTeam(jogo.strHomeTeam, (jogo as any).idHomeTeam)}
            onSelectAway={() => onSelectTeam(jogo.strAwayTeam, (jogo as any).idAwayTeam)}
            eyebrow={idx === 0 ? 'Clássico do dia' : 'Jogo do dia'}
            competition={competition}
            venue={venue}
            homeColor={
              getTeamColor?.(jogo.strHomeTeam) ||
              jogo.strHomeTeamColor1 ||
              jogo.strHomeTeamColor2 ||
              null
            }
            awayColor={
              getTeamColor?.(jogo.strAwayTeam) ||
              jogo.strAwayTeamColor1 ||
              jogo.strAwayTeamColor2 ||
              null
            }
            eventThumb={jogo.strThumb || null}
            channelLogo={channelLogo}
            channelName={hasCanal ? displayName : null}
            onSelectChannel={
              hasCanal && onSelectChannel
                ? () => {
                    playSelectSound();
                    onSelectChannel(channelTarget);
                  }
                : undefined
            }
            navRow="3"
            navColBase={idx * 3}
          />
        );
      })}

      {!jogosView.length && loadingJogos ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}

      {!jogosView.length && !loadingJogos ? (
        <div className="col-span-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white/70">
          Nenhum confronto encontrado.
        </div>
      ) : null}
    </div>
  );
};

export const FutebolJogos = memo(FutebolJogosComponent);
