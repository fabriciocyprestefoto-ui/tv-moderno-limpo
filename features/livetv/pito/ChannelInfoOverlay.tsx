import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PitoChannel } from './types';
import { G, vGlass, VISION_HUD_STYLE } from '@/components/player/playerTokens';

interface ChannelInfoOverlayProps {
  channel: PitoChannel;
}

export const PitoChannelInfoOverlay: React.FC<ChannelInfoOverlayProps> = ({
  channel,
}) => {
  // Tick a cada 30s para atualizar tempo restante sem re-render constante
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Calcula o progresso real do programa em % (0-100)
  const progress = React.useMemo(() => {
    const { startTime, endTime } = channel.currentProgram;
    if (!startTime || !endTime) return null;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const total = end - start;
    if (total <= 0) return null;
    const elapsed = Date.now() - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.currentProgram.startTime, channel.currentProgram.endTime, tick]);

  // Tempo restante em minutos
  const timeRemaining = React.useMemo(() => {
    const { endTime } = channel.currentProgram;
    if (!endTime) return null;
    const remaining = Math.round((new Date(endTime).getTime() - Date.now()) / 60_000);
    if (remaining <= 0) return null;
    return remaining;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.currentProgram.endTime, tick]);

  // Horário de início e fim do programa atual
  const timeLabel = React.useMemo(() => {
    const { startTime, endTime } = channel.currentProgram;
    if (!startTime || !endTime) return null;
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${fmt(startTime)} – ${fmt(endTime)}`;
  }, [channel.currentProgram.startTime, channel.currentProgram.endTime]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3"
      data-testid="livetv-info-overlay"
      style={{ ...VISION_HUD_STYLE, pointerEvents: 'none' }}
      aria-hidden="true"
    >
        <div className="flex items-center gap-3">
          {/* Logo do canal */}
          <div
            className="w-11 h-11 rounded-full p-2 flex items-center justify-center flex-shrink-0"
            style={vGlass({
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.68)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.38)',
            })}
          >
            <img
              src={channel.logo}
              alt={channel.name}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Informações do programa */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase text-white"
                style={{ background: 'rgba(6,182,212,0.72)', letterSpacing: '0.08em' }}
              >
                LIVE
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: G.textSec }}>
                {channel.name}
              </span>
            </div>
            <h2 className="text-lg font-black uppercase tracking-tight leading-none" style={{ color: G.textPrimary }}>
              {channel.currentProgram.title}
            </h2>
            {channel.currentProgram.description && (
              <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'rgba(255,255,255,0.50)' }}>
                {channel.currentProgram.description}
              </p>
            )}
          </div>

          {/* Horário e tempo restante */}
          <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
            {timeLabel ? (
              <>
                <span className="text-base font-black leading-none" style={{ color: G.textPrimary }}>{timeLabel}</span>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  horário
                </p>
                {timeRemaining !== null && (
                  <span className="text-[10px] font-bold" style={{ color: G.accent }}>
                    Falta{' '}
                    {timeRemaining < 60
                      ? `${timeRemaining} min`
                      : `${Math.floor(timeRemaining / 60)}h ${timeRemaining % 60}min`}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-lg font-black leading-none" style={{ color: G.textPrimary }}>AO VIVO</span>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  transmissão
                </p>
              </>
            )}
          </div>
        </div>

        {/* Barra de progresso — real se EPG disponível */}
        {progress !== null && (
          <div
            className="relative h-1 w-full rounded-full overflow-hidden"
            style={{ background: G.progressTrack }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute top-0 left-0 h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg,#0891b2,#67e8f9)',
                boxShadow: '0 0 12px rgba(6,182,212,0.55)',
              }}
            />
          </div>
        )}

        {/* Próximos programas — A SEGUIR (5 itens) */}
        {channel.nextPrograms.length > 0 && (
          <div
            className="flex items-center gap-3 mt-0"
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
          >
            <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.40)' }}>
              A SEGUIR
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {channel.nextPrograms.slice(0, 5).map((prog, idx) => (
                <div
                  key={idx}
                  className="rounded-full px-3 py-1 flex items-center gap-2"
                  style={{
                    background: 'rgba(6,182,212,0.18)',
                    border: 'none',
                    boxShadow: 'none',
                  }}
                  tabIndex={-1}
                >
                  <span className="text-[10px] font-black" style={{ color: G.textPrimary }}>
                    {prog.time}
                  </span>
                  <span className="text-xs font-bold whitespace-nowrap" style={{ color: G.textPrimary }}>
                    {prog.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
    </motion.div>
  );
};
