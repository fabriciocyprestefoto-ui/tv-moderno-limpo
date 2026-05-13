/**
 * features/livetv/components/InlineEPGPanel.tsx
 * Painel EPG inline que aparece ao pressionar seta direita em um canal.
 * Mostra cards de programação com thumbnail, horário, título e descrição.
 */
import React, { memo, useMemo, useEffect, useRef } from 'react';
import { Channel } from '@/types';
import {
  getChannelScheduleCached,
  getProgrammeProgressCached,
  epgView,
} from '../services/epgFacade';
import type { EPGProgramme } from '@/services/epgService';

interface InlineEPGPanelProps {
  channel: Channel;
  focusedIndex: number;
  onClose: () => void;
}

const ProgrammeCard: React.FC<{
  prog: EPGProgramme;
  isCurrent: boolean;
  isFocused: boolean;
}> = memo(({ prog, isCurrent, isFocused }) => {
  const progress = isCurrent ? getProgrammeProgressCached(prog) : 0;
  const startTime = epgView.formatTime(prog.start);
  const endTime = epgView.formatTime(prog.stop);
  const timeLabel = `${startTime} - ${endTime}`;

  return (
    <div
      className={`rounded-2xl transition-all duration-150 overflow-hidden ${
        isFocused
          ? 'bg-[rgba(59,130,246,0.15)] shadow-[inset_0_0_14px_rgba(59,130,246,0.2),0_0_0_1.5px_rgba(96,165,250,0.5)]'
          : isCurrent
            ? 'bg-white/[0.07]'
            : 'bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      {/* Time bar */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <span
          className={`text-[10px] font-bold tabular-nums ${isCurrent ? 'text-[#60a5fa]' : 'text-white/40'}`}
        >
          {timeLabel}
        </span>
        {isCurrent && (
          <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider bg-red-600/90 text-white">
            AO VIVO
          </span>
        )}
      </div>

      {/* Content row: thumbnail + info */}
      <div className="px-3 pb-2.5 flex gap-2.5">
        {/* Thumbnail placeholder — uses channel logo or category icon */}
        <div className="shrink-0 w-[60px] h-[42px] rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center overflow-hidden">
          {prog.category ? (
            <span className="text-[8px] font-bold text-white/30 uppercase text-center px-1 leading-tight">
              {prog.category}
            </span>
          ) : (
            <svg
              className="w-4 h-4 text-white/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-12.75A1.125 1.125 0 014.5 4.5h15a1.125 1.125 0 011.125 1.125v12.75M3.375 19.5h17.25M20.625 19.5a1.125 1.125 0 001.125-1.125v-12.75"
              />
            </svg>
          )}
        </div>

        {/* Program info */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-[11px] font-bold leading-tight ${isCurrent ? 'text-white' : 'text-white/80'}`}
          >
            {prog.title || 'Sem título'}
          </p>
          {prog.description && (
            <p className="text-[9px] text-white/35 leading-snug mt-0.5 line-clamp-2">
              {prog.description}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar for current programme */}
      {isCurrent && (
        <div className="h-[2px] bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa]"
            style={{ width: `${progress}%`, transition: 'width 1s linear' }}
          />
        </div>
      )}
    </div>
  );
});

const InlineEPGPanel: React.FC<InlineEPGPanelProps> = ({ channel, focusedIndex, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const schedule = useMemo(() => {
    return getChannelScheduleCached(channel.name || '', 8);
  }, [channel.name]);

  const now = useMemo(() => new Date(), []);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll('[data-epg-idx]');
    const target = items[focusedIndex] as HTMLElement;
    if (target) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  if (schedule.length === 0) {
    return (
      <div
        className="w-[320px] h-[calc(100%-24px)] mt-3 mb-3 flex flex-col rounded-[2rem] shadow-[0_4px_30px_rgba(0,0,0,0.18)]"
        style={{
          background: 'rgba(88, 28, 135, 0.14)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(167, 139, 250, 0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
          {channel.logo && (
            <img
              src={channel.logo}
              alt=""
              className="w-8 h-8 rounded-xl object-contain bg-white/5 p-0.5"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white truncate">{channel.name}</p>
            <p className="text-[9px] text-white/30">Guia de Programação</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-white/30 text-xs text-center">
            Sem programação disponível para este canal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-[320px] h-[calc(100%-24px)] mt-3 mb-3 flex flex-col rounded-[2rem] shadow-[0_4px_30px_rgba(0,0,0,0.18)]"
      style={{
        background: 'rgba(88, 28, 135, 0.14)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(167, 139, 250, 0.18)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header com logo, nome e botão fechar */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
        {channel.logo && (
          <img
            src={channel.logo}
            alt=""
            className="w-8 h-8 rounded-xl object-contain bg-white/5 p-0.5"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-white truncate">{channel.name}</p>
          <p className="text-[8px] text-[#a78bfa]/60 uppercase tracking-[0.15em]">Programação</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Lista de programas em cards */}
      <div
        ref={panelRef}
        className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1.5 hide-scrollbar"
      >
        {schedule.map((prog, idx) => {
          const isCurrent = prog.start <= now && prog.stop > now;
          return (
            <div key={`${prog.start.getTime()}-${idx}`} data-epg-idx={idx}>
              <ProgrammeCard prog={prog} isCurrent={isCurrent} isFocused={focusedIndex === idx} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(InlineEPGPanel);
