/**
 * EventosDodia — Cards visionOS 3D translúcido com os confrontos do dia
 * Fonte: Supabase `channels` categoria "⚽ EVENTOS DO DIA"
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Radio } from 'lucide-react';
import { fetchEventosDodia, type EventoDodia } from '@/features/futebol/services/eventosService';
import {
  normalizeTeamName,
  TEAM_LOGO_SVG_OVERRIDES,
} from '@/features/futebol/services/futebolService';
import '@/features/futebol/futebolVisionOS.css';

const PLACEHOLDER = '/logored.webp';

function getBadgeUrl(name: string): string {
  const key = normalizeTeamName(name);
  return (key && TEAM_LOGO_SVG_OVERRIDES[key]) || PLACEHOLDER;
}

// ─── Esqueleto de loading ────────────────────────────────────────────────────
function EventoSkeleton() {
  return (
    <div className="evt-card p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-5 w-16 rounded-full bg-white/10" />
        <div className="h-5 w-20 rounded-full bg-white/10" />
      </div>
      <div className="h-px bg-white/5" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2 w-2/5">
          <div className="size-12 rounded-xl bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/10" />
        </div>
        <div className="h-4 w-6 rounded bg-white/10" />
        <div className="flex flex-col items-center gap-2 w-2/5">
          <div className="size-12 rounded-xl bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/10" />
        </div>
      </div>
      <div className="h-px bg-white/5" />
      <div className="h-8 rounded-full bg-white/10" />
    </div>
  );
}

// ─── Card individual ─────────────────────────────────────────────────────────
interface EventoCardProps {
  evento: EventoDodia;
  onPlay: (url: string, title: string) => void;
}

const EventoCard: React.FC<EventoCardProps> = ({ evento, onPlay }) => {
  const homeBadge = getBadgeUrl(evento.home);
  const awayBadge = getBadgeUrl(evento.away);

  const mainStream = evento.streams[0];
  const altStream = evento.streams[1];

  const title = `${evento.home} x ${evento.away}`;

  return (
    <article className="evt-card p-5 flex flex-col gap-4">
      {/* Cabeçalho: horário + broadcaster */}
      <div className="flex items-center justify-between relative z-10">
        <span className="evt-time-chip">
          <span className="evt-live-dot" />
          {evento.time}
        </span>

        <div className="evt-broadcaster-chip">
          {evento.broadcasterLogo && (
            <img
              src={evento.broadcasterLogo}
              alt={evento.broadcaster}
              className="h-4 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span className="text-[10px] font-bold text-white/70 tracking-wider uppercase leading-none">
            {evento.broadcaster || 'Ao Vivo'}
          </span>
        </div>
      </div>

      <div className="evt-divider relative z-10" />

      {/* Times */}
      <div className="flex items-center justify-between gap-2 relative z-10">
        {/* Time 1 */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          <div className="evt-team-logo">
            <img
              src={homeBadge}
              alt={evento.home}
              className="w-8 h-8 object-contain fut-team-shield"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src = PLACEHOLDER;
              }}
            />
          </div>
          <span className="text-[11px] font-black text-white/90 text-center leading-tight tracking-wide uppercase max-w-[5.5rem] line-clamp-2">
            {evento.home}
          </span>
        </div>

        {/* VS */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="evt-vs">vs</span>
        </div>

        {/* Time 2 */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          <div className="evt-team-logo">
            <img
              src={awayBadge}
              alt={evento.away}
              className="w-8 h-8 object-contain fut-team-shield"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src = PLACEHOLDER;
              }}
            />
          </div>
          <span className="text-[11px] font-black text-white/90 text-center leading-tight tracking-wide uppercase max-w-[5.5rem] line-clamp-2">
            {evento.away}
          </span>
        </div>
      </div>

      <div className="evt-divider relative z-10" />

      {/* Botões de stream */}
      <div className="flex items-center gap-2 relative z-10">
        {mainStream && (
          <button
            type="button"
            className="evt-play-btn flex-1 justify-center"
            onClick={() => onPlay(mainStream.url, title)}
          >
            <Play size={11} strokeWidth={3} />
            Assistir
          </button>
        )}
        {altStream && (
          <button
            type="button"
            className="evt-play-btn evt-play-btn-alt"
            title="Stream alternativo"
            onClick={() => onPlay(altStream.url, title)}
          >
            <Radio size={11} strokeWidth={2.5} />
            Alt
          </button>
        )}
      </div>
    </article>
  );
};

// ─── Container principal ─────────────────────────────────────────────────────
interface EventosDodiaProps {
  /** Callback recebido de FutebolPage para navegar ao player */
  onPlay?: (url: string, title: string) => void;
}

export const EventosDodia: React.FC<EventosDodiaProps> = ({ onPlay }) => {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState<EventoDodia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchEventosDodia()
      .then((data) => {
        setEventos(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Não foi possível carregar os eventos.');
        setLoading(false);
      });
  }, []);

  const handlePlay = useCallback(
    (url: string, title: string) => {
      if (onPlay) {
        onPlay(url, title);
        return;
      }
      // Fallback: navega para o player via query string
      navigate(`/player?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
    },
    [onPlay, navigate]
  );

  if (error) {
    return <div className="px-6 md:px-12 py-4 text-white/50 text-sm">{error}</div>;
  }

  if (!loading && eventos.length === 0) return null;

  return (
    <section className="px-6 md:px-12" data-nav-row="2" style={{ marginTop: '0.5cm' }}>
      {/* Título da seção */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
          Eventos do Dia
        </h2>
        <span className="px-3 py-1 rounded-full bg-green-500/15 border border-green-400/35 text-green-300 text-[11px] font-bold tracking-wider uppercase">
          AO VIVO
        </span>
      </div>

      {/* Grid */}
      <div className="evt-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <EventoSkeleton key={i} />)
          : eventos.map((ev) => <EventoCard key={ev.id} evento={ev} onPlay={handlePlay} />)}
      </div>
    </section>
  );
};

export default EventosDodia;
