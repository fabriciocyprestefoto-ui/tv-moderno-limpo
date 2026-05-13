import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ArrowLeft, Play, X } from 'lucide-react';
import { Channel } from '../types';
import {
  getChannelSchedule,
  getCurrentProgramme,
  getProgrammeProgress,
  formatTime,
  hasEPG,
  EPGProgramme,
} from '../services/epgService';
import { playSelectSound, playBackSound, playNavigateSound } from '../utils/soundEffects';
import { useSpatialNav } from '../hooks/useSpatialNavigation';

/** WebView Android TV: muitas vezes só expõe keyCode (19–22), não e.key */
function normalizeTvKey(e: KeyboardEvent): string {
  let key = e.key || '';
  if (key === 'Up') key = 'ArrowUp';
  else if (key === 'Down') key = 'ArrowDown';
  else if (key === 'Left') key = 'ArrowLeft';
  else if (key === 'Right') key = 'ArrowRight';
  else if (key === 'OK' || key === 'Select') key = 'Enter';
  else if (key === 'Back') key = 'Backspace';
  else if (!key) {
    const code = e.keyCode || e.which || 0;
    switch (code) {
      case 19:
        key = 'ArrowUp';
        break;
      case 20:
        key = 'ArrowDown';
        break;
      case 21:
        key = 'ArrowLeft';
        break;
      case 22:
        key = 'ArrowRight';
        break;
      case 23:
      case 66:
        key = 'Enter';
        break;
      case 4:
      case 27:
      case 67:
        key = 'Backspace';
        break;
      default:
        break;
    }
  }
  return key;
}

const ACCENT_GRADIENT = 'linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(219, 39, 119) 100%)';
const ACCENT_GLOW = '0 4px 15px rgba(124, 58, 237, 0.5), inset 0 0 0 1px rgba(255,255,255,0.2)';
const GLASS_BG = 'rgba(14, 8, 28, 0.92)';

const PROGRAM_BLOCK: React.CSSProperties = {
  background:
    'linear-gradient(135deg, rgba(154, 102, 247, 0.35) 0%, rgba(116, 66, 217, 0.25) 100%)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(240, 220, 255, 0.18)',
  boxShadow: '0 4px 16px rgba(18, 8, 36, 0.12)',
};

const PROGRAM_HIGHLIGHT: React.CSSProperties = {
  background:
    'linear-gradient(135deg, rgba(190, 125, 255, 0.70) 0%, rgba(140, 72, 232, 0.55) 55%, rgba(95, 45, 180, 0.42) 100%)',
  border: '1px solid rgba(248, 236, 255, 0.38)',
  boxShadow: '0 8px 24px rgba(76, 29, 149, 0.24)',
};

const CHANNEL_ACTIVE: React.CSSProperties = {
  background: ACCENT_GRADIENT,
  border: '1px solid rgba(255, 255, 255, 0.25)',
  boxShadow: ACCENT_GLOW,
};

interface ChannelGuideProps {
  channels: Channel[];
  onBack: () => void;
  onSelectChannel: (channel: Channel) => void;
  /** Preferir id do canal (índice em `epgChannels` pode diferir de `channels`) */
  initialChannelId?: string;
}

const HOUR_WIDTH = 200;
const ROW_HEIGHT = 56;
const HOURS = 12;

const ChannelGuide: React.FC<ChannelGuideProps> = ({
  channels,
  onBack,
  onSelectChannel,
  initialChannelId,
}) => {
  // Desabilitar spatial nav — ChannelGuide tem seu próprio handler de D-pad
  const { setEnabled } = useSpatialNav();
  useEffect(() => {
    setEnabled(false);
    return () => setEnabled(true);
  }, [setEnabled]);

  const gridRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const assistirBtnRef = useRef<HTMLButtonElement>(null);
  const progCellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [selectedProg, setSelectedProg] = useState<{ prog: EPGProgramme; channel: Channel } | null>(
    null
  );
  const [_tick, setTick] = useState(0);
  const [focusedChIdx, setFocusedChIdx] = useState(0);
  // -1 = foco na sidebar, >= 0 = índice do programa focado na linha atual
  const [focusedProgIdx, setFocusedProgIdx] = useState(-1);

  // Canais com EPG; se nenhum tiver EPG (ex: EPG não carregou), mostrar todos
  const epgChannels = useMemo(() => {
    const withEpg = channels.filter((c) => hasEPG(c.name));
    return withEpg.length > 0 ? withEpg : channels;
  }, [channels]);

  const resolvedInitialIdx = useMemo(() => {
    if (!initialChannelId) return 0;
    const i = epgChannels.findIndex((c) => String(c.id) === String(initialChannelId));
    return i >= 0 ? i : 0;
  }, [epgChannels, initialChannelId]);

  // Flag para distinguir scroll inicial (instant) de navegação (smooth)
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    setFocusedChIdx(resolvedInitialIdx);
  }, [resolvedInitialIdx]);

  // Foco real no item da sidebar quando focusedProgIdx = -1
  useEffect(() => {
    if (focusedProgIdx !== -1) return;
    const id = requestAnimationFrame(() => {
      const items = sidebarRef.current?.querySelectorAll('[data-ch-item]');
      const el = items?.[focusedChIdx] as HTMLElement | undefined;
      el?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [focusedChIdx, focusedProgIdx]);

  // Foco real na célula de programa quando focusedProgIdx >= 0
  useEffect(() => {
    if (focusedProgIdx < 0) return;
    const id = requestAnimationFrame(() => {
      const key = `${focusedChIdx}-${focusedProgIdx}`;
      const el = progCellRefs.current.get(key);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [focusedChIdx, focusedProgIdx]);

  const baseTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - 2);
    return d;
  }, []);

  const timeSlots = useMemo(
    () =>
      Array.from({ length: HOURS }, (_, i) => {
        const t = new Date(baseTime);
        t.setHours(baseTime.getHours() + i);
        return t;
      }),
    [baseTime]
  );

  // Scroll horizontal para hora atual no mount
  useEffect(() => {
    if (gridRef.current) {
      const now = new Date();
      const px = ((now.getTime() - baseTime.getTime()) / 3600000) * HOUR_WIDTH;
      gridRef.current.scrollLeft = Math.max(0, px - 200);
    }
  }, [baseTime]);

  // Tick a cada 60s para atualizar progresso
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  // Schedules da linha focada (para navegação por programa)
  const focusedRowSchedule = useMemo(() => {
    const channel = epgChannels[focusedChIdx];
    if (!channel) return [];
    return getChannelSchedule(channel.name, 60).filter((prog) => {
      const startOff = (prog.start.getTime() - baseTime.getTime()) / 3600000;
      const dur = (prog.stop.getTime() - prog.start.getTime()) / 3600000;
      if (startOff + dur < 0 || startOff > HOURS) return false;
      const width = Math.min(dur, HOURS - Math.max(0, startOff)) * HOUR_WIDTH;
      return width >= 20;
    });
  }, [epgChannels, focusedChIdx, baseTime]);

  // Escape / D-Pad (keyCode Android TV + e.key)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = normalizeTvKey(e);

      if (selectedProg) {
        if (key === 'Escape' || key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          playBackSound();
          setSelectedProg(null);
        }
        return;
      }

      switch (key) {
        case 'Escape':
        case 'Backspace': {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          e.stopPropagation();
          if (focusedProgIdx >= 0) {
            // Volta ao sidebar
            playBackSound();
            setFocusedProgIdx(-1);
          } else {
            playBackSound();
            onBack();
          }
          break;
        }
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          playNavigateSound();
          setFocusedProgIdx(-1);
          setFocusedChIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          playNavigateSound();
          setFocusedProgIdx(-1);
          setFocusedChIdx((prev) => Math.min(epgChannels.length - 1, prev + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          if (focusedProgIdx > 0) {
            playNavigateSound();
            setFocusedProgIdx((prev) => prev - 1);
          } else if (focusedProgIdx === 0) {
            // Volta ao sidebar
            playNavigateSound();
            setFocusedProgIdx(-1);
          } else {
            // Já no sidebar — scroll timeline
            if (gridRef.current) gridRef.current.scrollLeft -= HOUR_WIDTH;
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          if (focusedProgIdx === -1) {
            // Vai para o primeiro programa da linha
            if (focusedRowSchedule.length > 0) {
              playNavigateSound();
              setFocusedProgIdx(0);
            } else {
              if (gridRef.current) gridRef.current.scrollLeft += HOUR_WIDTH;
            }
          } else if (focusedProgIdx < focusedRowSchedule.length - 1) {
            playNavigateSound();
            setFocusedProgIdx((prev) => prev + 1);
          } else {
            // Já no último programa — scroll timeline
            if (gridRef.current) gridRef.current.scrollLeft += HOUR_WIDTH;
          }
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          playSelectSound();
          if (focusedProgIdx >= 0) {
            // Seleciona programa
            const prog = focusedRowSchedule[focusedProgIdx];
            const channel = epgChannels[focusedChIdx];
            if (prog && channel) {
              setSelectedProg({ prog, channel });
            }
          } else {
            // Seleciona canal
            if (epgChannels[focusedChIdx]) {
              onSelectChannel(epgChannels[focusedChIdx]);
            }
          }
          break;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedProg, onBack, epgChannels, focusedChIdx, focusedProgIdx, focusedRowSchedule]);

  // Auto-scroll sidebar para canal focado
  useEffect(() => {
    if (sidebarRef.current) {
      const items = sidebarRef.current.querySelectorAll('[data-ch-item]');
      const item = items[focusedChIdx] as HTMLElement;
      if (!item) return;
      const behavior = initialScrollDoneRef.current ? 'smooth' : 'instant';
      item.scrollIntoView({ behavior, block: 'center' });
      initialScrollDoneRef.current = true;
    }
  }, [focusedChIdx]);

  // Auto-scroll grid rows para canal focado
  useEffect(() => {
    if (gridRef.current) {
      const rows = gridRef.current.querySelectorAll('[data-ch-row]');
      const row = rows[focusedChIdx] as HTMLElement;
      if (row) {
        const container = gridRef.current;
        const rowTop = row.offsetTop - container.offsetTop;
        const behavior = initialScrollDoneRef.current ? 'smooth' : 'instant';
        container.scrollTo({ top: rowTop - 60, behavior });
      }
    }
  }, [focusedChIdx]);

  // Auto-focus Assistir Canal quando popup abre
  useEffect(() => {
    if (selectedProg && assistirBtnRef.current) {
      assistirBtnRef.current.focus();
    }
  }, [selectedProg]);

  const now = new Date();
  const totalWidth = HOURS * HOUR_WIDTH;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
      style={{
        background: GLASS_BG,
        backgroundImage:
          'linear-gradient(135deg, rgba(10,4,20,0.97) 0%, rgba(26,8,56,0.95) 40%, rgba(15,5,40,0.96) 70%, rgba(10,4,20,0.97) 100%)',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ═══ HEADER ═══ */}
      <header
        className="flex items-center justify-between px-3 shrink-0 border-b border-white/8"
        style={{
          height: '44px',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {/* Título */}
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full" style={{ background: ACCENT_GRADIENT }} />
          <div>
            <h1
              className="text-sm font-black uppercase tracking-[0.22em] text-white leading-none"
              style={{ textShadow: '0 0 20px rgba(124,58,237,0.4)' }}
            >
              GUIA DE CANAIS
            </h1>
            <p className="text-[8px] text-white/35 font-semibold tracking-[0.18em] uppercase mt-0.5">
              {epgChannels.length} canais &nbsp;·&nbsp;{' '}
              {now.toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
        </div>

        {/* Relógio + Fechar */}
        <div className="flex items-center gap-2">
          <span
            className="text-xl font-light tracking-[0.2em] text-white/80 tabular-nums px-3 py-1 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={() => {
              playBackSound();
              onBack();
            }}
            tabIndex={0}
            aria-label="Voltar do guia"
            className="h-10 rounded-xl flex items-center justify-center gap-2 text-white/70 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/40 px-3"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <ArrowLeft size={16} />
            <span className="text-[11px] font-black uppercase tracking-[0.18em]">Voltar</span>
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <section className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Sidebar de Canais ── */}
        <aside
          ref={sidebarRef}
          className="flex flex-col gap-1 overflow-y-auto shrink-0 py-2 px-2 epg-no-scrollbar border-r border-white/8"
          style={{
            width: '160px',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {epgChannels.map((channel, idx) => {
            const isFocused = idx === focusedChIdx && focusedProgIdx === -1;
            const isActiveRow = idx === focusedChIdx;
            const currentProg = getCurrentProgramme(channel.name);
            return (
              <button
                key={channel.name}
                data-ch-item={idx}
                onClick={() => {
                  playSelectSound();
                  setFocusedChIdx(idx);
                  setFocusedProgIdx(-1);
                  onSelectChannel(channel);
                }}
                tabIndex={0}
                className="rounded-xl flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-200 text-left focus:outline-none w-full"
                style={{
                  minHeight: '56px',
                  padding: '6px 8px',
                  ...(isFocused
                    ? { ...CHANNEL_ACTIVE }
                    : isActiveRow
                      ? {
                          background: 'rgba(124,58,237,0.15)',
                          border: '1px solid rgba(124,58,237,0.35)',
                        }
                      : {
                          background: 'transparent',
                          border: '1px solid transparent',
                          opacity: 0.65,
                        }),
                }}
              >
                {/* Logo */}
                <div
                  className="rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    width: '36px',
                    height: '36px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {channel.logo ? (
                    <img
                      src={channel.logo}
                      alt=""
                      className="w-full h-full object-contain p-1"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = 'none';
                        const fallback = el.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <span
                    className="text-xs font-black text-white/50"
                    style={{
                      display: channel.logo ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {channel.name.substring(0, 2).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span
                    className="font-bold tracking-wide block truncate leading-tight"
                    style={{
                      fontSize: '13px',
                      color: isFocused ? '#fff' : 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {channel.name}
                  </span>
                  {currentProg && (
                    <span
                      className="block truncate mt-0.5"
                      style={{
                        fontSize: '9px',
                        color: isFocused ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
                      }}
                    >
                      {currentProg.title}
                    </span>
                  )}
                  {channel.category && (
                    <span
                      className="font-bold uppercase tracking-wider block mt-0.5"
                      style={{
                        fontSize: '8px',
                        color: isFocused ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                      }}
                    >
                      {channel.category}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </aside>

        {/* ── Grade de Programação ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Scrollable grid */}
          <div ref={gridRef} className="flex-1 overflow-auto epg-no-scrollbar relative">
            <div style={{ width: `${totalWidth}px`, minHeight: '100%' }}>
              {/* Time header (sticky top) */}
              <div
                className="sticky top-0 z-20 flex h-9 border-b border-white/6"
                style={{
                  background: 'rgba(20, 10, 45, 0.90)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                {timeSlots.map((t, i) => (
                  <div
                    key={i}
                    className="shrink-0 flex items-center pl-4"
                    style={{
                      width: `${HOUR_WIDTH}px`,
                      borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                  >
                    <span
                      className="font-black tracking-widest uppercase"
                      style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}
                    >
                      {t.getHours().toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Linhas de canal / programa */}
              <div className="flex flex-col py-3 gap-1.5 px-3">
                {epgChannels.map((channel, chIdx) => {
                  const schedule = getChannelSchedule(channel.name, 60);
                  const isFocusedRow = chIdx === focusedChIdx;
                  return (
                    <div
                      key={channel.name}
                      data-ch-row={chIdx}
                      className="relative flex items-stretch transition-all duration-200 rounded-2xl overflow-visible"
                      style={{
                        height: `${ROW_HEIGHT}px`,
                        opacity: isFocusedRow ? 1 : 0.45,
                        borderLeft: isFocusedRow
                          ? '4px solid rgb(124, 58, 237)'
                          : '4px solid rgba(255,255,255,0.04)',
                        background: isFocusedRow
                          ? 'rgba(124, 58, 237, 0.08)'
                          : chIdx % 2 === 0
                            ? 'rgba(255,255,255,0.015)'
                            : 'transparent',
                        boxShadow: isFocusedRow ? 'inset 0 0 40px rgba(124,58,237,0.06)' : 'none',
                      }}
                    >
                      {/* Etiqueta sticky do canal — sempre visível ao rolar horizontalmente */}
                      <div
                        className="sticky left-0 z-10 flex flex-col items-center justify-center shrink-0 gap-1"
                        style={{
                          width: '48px',
                          background: isFocusedRow
                            ? 'linear-gradient(to right, rgba(88,28,135,0.95) 70%, transparent)'
                            : chIdx % 2 === 0
                              ? 'linear-gradient(to right, rgba(14,8,28,0.92) 70%, transparent)'
                              : 'linear-gradient(to right, rgba(10,4,20,0.92) 70%, transparent)',
                          paddingLeft: '6px',
                        }}
                      >
                        {channel.logo ? (
                          <img
                            src={channel.logo}
                            alt=""
                            className="object-contain rounded-md"
                            style={{ width: '24px', height: '24px' }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <span
                          className="font-black text-center leading-none"
                          style={{
                            fontSize: '6px',
                            color: isFocusedRow ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
                            maxWidth: '40px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block',
                          }}
                        >
                          {channel.name}
                        </span>
                      </div>
                      {/* Linhas guia verticais para horas */}
                      {timeSlots.map((_, i) =>
                        i > 0 ? (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: `${i * HOUR_WIDTH}px`,
                              borderLeft: '1px solid rgba(255,255,255,0.04)',
                            }}
                          />
                        ) : null
                      )}

                      {schedule.map((prog, progRenderIdx) => {
                        const startOff = (prog.start.getTime() - baseTime.getTime()) / 3600000;
                        const dur = (prog.stop.getTime() - prog.start.getTime()) / 3600000;
                        if (startOff + dur < 0 || startOff > HOURS) return null;
                        const left = Math.max(0, startOff) * HOUR_WIDTH;
                        const width = Math.min(dur, HOURS - Math.max(0, startOff)) * HOUR_WIDTH;
                        if (width < 20) return null;

                        // Índice real na lista filtrada (para corresponder ao focusedProgIdx)
                        // Conta apenas progs visíveis até este ponto
                        const visibleIdx = (() => {
                          let count = 0;
                          for (let k = 0; k < progRenderIdx; k++) {
                            const p = schedule[k];
                            const s = (p.start.getTime() - baseTime.getTime()) / 3600000;
                            const d = (p.stop.getTime() - p.start.getTime()) / 3600000;
                            if (s + d < 0 || s > HOURS) continue;
                            const w = Math.min(d, HOURS - Math.max(0, s)) * HOUR_WIDTH;
                            if (w >= 20) count++;
                          }
                          return count;
                        })();

                        const isCurrent = prog.start <= now && prog.stop > now;
                        const isFocusedProg = isFocusedRow && focusedProgIdx === visibleIdx;
                        const progress = isCurrent ? getProgrammeProgress(prog) : 0;
                        const cellKey = `${chIdx}-${visibleIdx}`;

                        return (
                          <div
                            key={`${prog.start.getTime()}-${progRenderIdx}`}
                            ref={(el) => {
                              if (el) progCellRefs.current.set(cellKey, el);
                              else progCellRefs.current.delete(cellKey);
                            }}
                            onClick={() => {
                              playSelectSound();
                              setFocusedChIdx(chIdx);
                              setFocusedProgIdx(visibleIdx);
                              setSelectedProg({ prog, channel });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                playSelectSound();
                                setSelectedProg({ prog, channel });
                              }
                            }}
                            tabIndex={isFocusedRow ? 0 : -1}
                            role="button"
                            aria-label={`${prog.title} ${formatTime(prog.start)}–${formatTime(prog.stop)}`}
                            className="absolute top-1.5 bottom-1.5 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 flex flex-col justify-center focus:outline-none"
                            style={{
                              left: `${left + 4}px`,
                              width: `${Math.max(width - 12, 40)}px`,
                              padding: '10px 14px',
                              transitionProperty: 'transform, box-shadow, background, border-color',
                              transform: isFocusedProg ? 'scale(1.02)' : 'scale(1)',
                              zIndex: isFocusedProg ? 10 : 1,
                              ...(isFocusedProg
                                ? {
                                    background: ACCENT_GRADIENT,
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    boxShadow:
                                      '0 8px 32px rgba(124,58,237,0.6), 0 0 0 2px rgba(219,39,119,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                                  }
                                : isCurrent
                                  ? PROGRAM_HIGHLIGHT
                                  : PROGRAM_BLOCK),
                            }}
                          >
                            <h3
                              className="font-black uppercase tracking-wide leading-tight truncate"
                              style={{
                                fontSize: isFocusedProg || isCurrent ? '13px' : '11px',
                                color: isFocusedProg
                                  ? '#fff'
                                  : isCurrent
                                    ? 'rgba(255,255,255,0.95)'
                                    : 'rgba(255,255,255,0.75)',
                                textShadow: isFocusedProg ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
                              }}
                            >
                              {prog.title}
                            </h3>
                            {width > 90 && (
                              <span
                                className="font-semibold mt-1 truncate block"
                                style={{
                                  fontSize: '9px',
                                  color: isFocusedProg
                                    ? 'rgba(255,255,255,0.75)'
                                    : isCurrent
                                      ? 'rgba(255,255,255,0.55)'
                                      : 'rgba(255,255,255,0.35)',
                                }}
                              >
                                {formatTime(prog.start)} – {formatTime(prog.stop)}
                              </span>
                            )}
                            {/* Barra de progresso no programa atual */}
                            {isCurrent && !isFocusedProg && (
                              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/30 rounded-b-xl overflow-hidden">
                                <div
                                  className="h-full transition-all duration-1000"
                                  style={{
                                    width: `${progress}%`,
                                    background:
                                      'linear-gradient(to right, white, rgba(255,255,255,0.8), rgba(255,255,255,0.4))',
                                    boxShadow: '0 0 8px rgba(255,255,255,0.5)',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Linha vertical do horário atual ── */}
            {(() => {
              const nowPx = ((now.getTime() - baseTime.getTime()) / 3600000) * HOUR_WIDTH;
              return (
                <div
                  className="absolute top-0 bottom-0 w-px z-25 pointer-events-none"
                  style={{
                    left: `${nowPx}px`,
                    background:
                      'linear-gradient(to bottom, rgba(52,211,153,0.6), rgba(52,211,153,0.06))',
                  }}
                >
                  <div
                    className="sticky top-0 -ml-1.5 w-3 h-3 rounded-full"
                    style={{
                      background: 'rgba(52,211,153,0.8)',
                      boxShadow: '0 0 12px rgba(52,211,153,0.6)',
                    }}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ═══ KEYBOARD HINT BAR ═══ */}
      <div
        className="flex items-center justify-center gap-6 shrink-0 border-t border-white/6"
        style={{
          height: '32px',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        {[
          { keys: '↑ ↓', label: 'Canais' },
          { keys: '← →', label: 'Programas' },
          { keys: 'Enter', label: 'Selecionar' },
          { keys: 'ESC', label: 'Voltar' },
        ].map(({ keys, label }) => (
          <div key={keys} className="flex items-center gap-1.5">
            <span
              className="font-bold tabular-nums"
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '2px 6px',
                borderRadius: '5px',
              }}
            >
              {keys}
            </span>
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ═══ POPUP DETALHE DO PROGRAMA — Modal Centrado ═══ */}
      {selectedProg && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'rgba(5, 2, 15, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={() => {
            playBackSound();
            setSelectedProg(null);
          }}
        >
          <div
            className="w-full mx-6 rounded-3xl overflow-hidden"
            style={{
              maxWidth: '640px',
              background:
                'linear-gradient(135deg, rgba(30,15,60,0.98) 0%, rgba(20,8,45,0.98) 100%)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow:
                '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
              animation: 'popupIn 0.25s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Accent bar top */}
            <div className="h-1 w-full" style={{ background: ACCENT_GRADIENT }} />

            <div className="p-7">
              {/* Canal + Fechar */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  {/* Logo canal */}
                  <div
                    className="rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
                    style={{
                      width: '64px',
                      height: '64px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.14)',
                    }}
                  >
                    {selectedProg.channel.logo ? (
                      <img
                        src={selectedProg.channel.logo}
                        alt=""
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = 'none';
                          const fb = el.nextElementSibling as HTMLElement;
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <span
                      className="text-base font-black text-white/50"
                      style={{
                        display: selectedProg.channel.logo ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selectedProg.channel.name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>

                  <div>
                    <span
                      className="font-bold uppercase tracking-widest block"
                      style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}
                    >
                      {selectedProg.channel.name}
                    </span>
                    <h2
                      className="font-black uppercase tracking-tight text-white leading-tight mt-1"
                      style={{ fontSize: '22px', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                    >
                      {selectedProg.prog.title}
                    </h2>
                  </div>
                </div>

                <button
                  onClick={() => {
                    playBackSound();
                    setSelectedProg(null);
                  }}
                  tabIndex={0}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-white/30 shrink-0 mt-1"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Horário + categoria + episódio */}
              <div className="flex items-center flex-wrap gap-2 mb-4">
                <span
                  className="font-bold px-3 py-1 rounded-lg"
                  style={{
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.85)',
                    background: 'rgba(124,58,237,0.25)',
                    border: '1px solid rgba(124,58,237,0.4)',
                  }}
                >
                  {formatTime(selectedProg.prog.start)} – {formatTime(selectedProg.prog.stop)}
                </span>
                {selectedProg.prog.category && (
                  <span
                    className="px-3 py-1 rounded-lg font-semibold"
                    style={{
                      fontSize: '11px',
                      color: 'rgba(255,255,255,0.45)',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {selectedProg.prog.category}
                  </span>
                )}
                {selectedProg.prog.episode && (
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                    {selectedProg.prog.episode}
                  </span>
                )}
              </div>

              {/* Descrição */}
              {selectedProg.prog.description && !/^\[\d/.test(selectedProg.prog.description) && (
                <p
                  className="leading-relaxed mb-6"
                  style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.7' }}
                >
                  {selectedProg.prog.description}
                </p>
              )}

              {/* Botão Assistir */}
              <button
                ref={assistirBtnRef}
                onClick={(e) => {
                  e.stopPropagation();
                  playSelectSound();
                  onSelectChannel(selectedProg.channel);
                  setSelectedProg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    playSelectSound();
                    onSelectChannel(selectedProg.channel);
                    setSelectedProg(null);
                  }
                }}
                className="flex items-center gap-3 font-bold text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/30 rounded-2xl"
                style={{
                  background: ACCENT_GRADIENT,
                  boxShadow: ACCENT_GLOW,
                  padding: '14px 28px',
                  fontSize: '14px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <Play size={16} fill="currentColor" />
                Assistir Canal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Ambient overlay ═══ */}
      <div
        className="fixed inset-0 pointer-events-none mix-blend-soft-light opacity-15"
        style={{
          background:
            'linear-gradient(to bottom right, rgba(99,102,241,0.3), transparent, rgba(244,63,94,0.2))',
        }}
      />

      {/* ═══ Styles ═══ */}
      <style>{`
        .epg-no-scrollbar::-webkit-scrollbar { display: none; }
        .epg-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes popupIn {
          from { transform: scale(0.94) translateY(8px); opacity: 0; }
          to   { transform: scale(1) translateY(0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ChannelGuide;
