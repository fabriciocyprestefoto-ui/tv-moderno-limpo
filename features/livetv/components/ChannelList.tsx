/**
 * features/livetv/components/ChannelList.tsx
 * Lista de canais da LiveTV agrupados por gênero, com foco D-Pad e EPG inline
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Channel } from '@/types';
import {
  getCurrentProgrammeCached,
  getChannelScheduleCached,
  getProgrammeProgressCached,
} from '../services/epgFacade';
import type { LiveTVFocusArea } from '../tv/liveTVFocusEngine';

interface ChannelListProps {
  filteredChannels: Channel[];
  activeCategoryName: string;
  onSearchClick: () => void;
  focusArea: LiveTVFocusArea;
  focusedHeaderIndex: number;
  focusedIndex: number;
  selectedChannel: Channel | null;
  epgReady: boolean;
  onSelectChannel: (ch: Channel) => void;
  setFocusedIndex: (idx: number) => void;
  listRef: React.RefObject<HTMLDivElement>;
  channelRefs: React.MutableRefObject<HTMLButtonElement[]>;
  compact?: boolean;
}

const ITEM_HEIGHT = 68;
const HEADER_HEIGHT = 36;
const OVERSCAN = 8;

type RowItem =
  | { type: 'header'; category: string; count: number }
  | { type: 'channel'; channel: Channel; channelIndex: number };

const ChannelList: React.FC<ChannelListProps> = ({
  filteredChannels,
  activeCategoryName,
  onSearchClick: _onSearchClick,
  focusArea,
  focusedHeaderIndex: _focusedHeaderIndex,
  focusedIndex,
  selectedChannel,
  epgReady,
  onSelectChannel,
  setFocusedIndex,
  listRef,
  channelRefs,
  compact = false,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  // Pre-compute which channels have EPG data for arrow indicator
  const channelsWithEpg = useMemo(() => {
    if (!epgReady) return new Set<string>();
    const s = new Set<string>();
    for (const ch of filteredChannels) {
      const name = ch.name || '';
      if (name && getChannelScheduleCached(name, 1).length > 0) s.add(name);
    }
    return s;
  }, [epgReady, filteredChannels]);

  // Build grouped rows: category headers + channel items
  const { rows, rowOffsets, totalHeight } = useMemo(() => {
    const grouped = new Map<string, Channel[]>();
    filteredChannels.forEach((ch) => {
      const cat = ch.category || 'Geral';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(ch);
    });

    // Sort categories alphabetically, but put "Geral" last
    const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
      if (a === 'Geral') return 1;
      if (b === 'Geral') return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    const items: RowItem[] = [];
    const offsets: number[] = [];
    let offset = 0;
    let channelIdx = 0;

    for (const cat of sortedCategories) {
      const channels = grouped.get(cat)!;
      // Category header
      items.push({ type: 'header', category: cat, count: channels.length });
      offsets.push(offset);
      offset += HEADER_HEIGHT;

      // Channel items
      for (const ch of channels) {
        items.push({ type: 'channel', channel: ch, channelIndex: channelIdx });
        offsets.push(offset);
        offset += ITEM_HEIGHT;
        channelIdx++;
      }
    }

    return { rows: items, rowOffsets: offsets, totalHeight: offset };
  }, [filteredChannels]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const updateSize = () => setViewportHeight(el.clientHeight || 640);
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setScrollTop(el.scrollTop));
    };
    updateSize();
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateSize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateSize);
      cancelAnimationFrame(rafId);
    };
  }, [listRef]);

  // Scroll to focused channel
  useEffect(() => {
    if (focusArea !== 'channels' || focusedIndex < 0) return;
    const el = listRef.current;
    if (!el) return;
    // Find the row for this channel index
    const rowIdx = rows.findIndex((r) => r.type === 'channel' && r.channelIndex === focusedIndex);
    if (rowIdx < 0) return;
    const itemTop = rowOffsets[rowIdx];
    const itemHeight = ITEM_HEIGHT;
    const itemBottom = itemTop + itemHeight;
    if (itemTop < el.scrollTop) el.scrollTop = itemTop;
    else if (itemBottom > el.scrollTop + el.clientHeight)
      el.scrollTop = itemBottom - el.clientHeight;
  }, [focusArea, focusedIndex, listRef, rows, rowOffsets]);

  // Determine visible rows based on scroll
  const visibleRows = useMemo(() => {
    const topBound = scrollTop - OVERSCAN * ITEM_HEIGHT;
    const bottomBound = scrollTop + viewportHeight + OVERSCAN * ITEM_HEIGHT;
    const result: { row: RowItem; rowIndex: number; top: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const top = rowOffsets[i];
      const height = rows[i].type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT;
      if (top + height >= topBound && top <= bottomBound) {
        result.push({ row: rows[i], rowIndex: i, top });
      }
    }
    return result;
  }, [rows, rowOffsets, scrollTop, viewportHeight]);

  const totalItems = filteredChannels.length;

  return (
    <div
      className={`livetv-channel-menu ${compact ? 'w-50' : 'w-62'} h-[calc(100%-24px)] mt-3 mb-3 mr-3 flex flex-col rounded-4xl border border-white/20 transition-all duration-300 bg-linear-to-b from-white/10 to-white/5 backdrop-blur-xl saturate-120 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_30px_rgba(0,0,0,0.28)]`}
    >
      {/* Compact count bar */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/10">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
          {activeCategoryName}
        </span>
        <span className="text-[10px] font-black text-white/60 tabular-nums">{totalItems}</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-2.5 pb-3.5 hide-scrollbar">
        {totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-white/50 text-sm font-medium mb-2">Nenhum canal encontrado</p>
            <p className="text-white/30 text-xs">
              Verifique a conexão ou filtre por outra categoria.
            </p>
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleRows.map(({ row, top }) => {
              if (row.type === 'header') {
                return (
                  <div
                    key={`hdr-${row.category}`}
                    style={{
                      position: 'absolute',
                      top,
                      left: 0,
                      right: 0,
                      height: HEADER_HEIGHT,
                    }}
                    className="flex items-end px-1 pb-1 pointer-events-none"
                  >
                    <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a78bfa]/80">
                      {row.category}
                    </span>
                    <span className="ml-auto text-[8px] font-bold text-white/30 tabular-nums">
                      {row.count}
                    </span>
                  </div>
                );
              }

              const ch = row.channel;
              const absoluteIndex = row.channelIndex;
              const isSelected = selectedChannel?.stream_url === ch.stream_url;
              const isFocused =
                (focusArea === 'channels' || focusArea === 'epg') && focusedIndex === absoluteIndex;
              const isActive = isFocused || isSelected;
              const programme = epgReady ? getCurrentProgrammeCached(ch.name || '') : null;

              return (
                <div
                  key={`${ch.name}-${ch.stream_url}-${absoluteIndex}`}
                  style={{
                    position: 'absolute',
                    top,
                    left: 0,
                    right: 0,
                    height: ITEM_HEIGHT,
                    paddingTop: 3,
                    paddingBottom: 3,
                  }}
                >
                  <button
                    ref={(el) => {
                      if (el) channelRefs.current[absoluteIndex] = el;
                    }}
                    data-channel-idx={absoluteIndex}
                    tabIndex={0}
                    onClick={() => onSelectChannel(ch)}
                    onMouseEnter={() => setFocusedIndex(absoluteIndex)}
                    onFocus={() => setFocusedIndex(absoluteIndex)}
                    aria-label={`Canal ${absoluteIndex + 1}, ${ch.name}${programme ? `, agora: ${programme.title}` : ch.category ? `, categoria ${ch.category}` : ''}`}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`w-full group flex items-center gap-3 rounded-2xl outline-none transition-all duration-200 relative focus:outline-none bg-white/5 border border-transparent ${isFocused ? 'z-2 bg-[#371960] shadow-[0_0_15px_rgba(109,40,217,0.5)] border-[#9370db]' : isSelected ? 'z-1 bg-[#371960] border-[#9370db]' : 'z-1'}`}
                    style={{
                      padding: '8px 10px',
                    }}
                  >
                    <div
                      className={`w-6 text-center shrink-0 transition-colors ${isActive ? 'text-[#c4a4ff]' : 'text-white/35'}`}
                    >
                      <span className="text-[10px] font-black tabular-nums">
                        {absoluteIndex + 1}
                      </span>
                    </div>
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border ${
                        isFocused || isSelected
                          ? 'border-[#9370db]/70 bg-[#c4a4ff]/20'
                          : 'border-white/10 bg-white/4'
                      }`}
                    >
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt=""
                          className="w-full h-full object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            const fallback = img.parentElement?.querySelector(
                              '.ch-logo-fallback'
                            ) as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <span
                        className="text-[11px] font-black text-white/55 ch-logo-fallback flex items-center justify-center"
                        style={{ display: ch.logo ? 'none' : 'flex' }}
                      >
                        {(ch.name || '').substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 text-left overflow-hidden min-w-0">
                      <p
                        className={`text-[11px] font-bold truncate ${isActive ? 'text-white' : 'text-white/85'}`}
                      >
                        {ch.name}
                      </p>
                      {!compact &&
                        (programme ? (
                          <div className="flex flex-col gap-1 w-full overflow-hidden">
                            <p className="text-[9px] text-[rgba(196,164,255,0.7)] truncate font-semibold leading-tight">
                              {programme.title}
                            </p>
                            <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full transition-all duration-500"
                                style={{ width: `${getProgrammeProgressCached(programme)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-[8px] text-white/30 truncate uppercase tracking-tighter">
                            {ch.category || ''}
                          </p>
                        ))}
                    </div>
                    {!compact && channelsWithEpg.has(ch.name || '') && (
                      <span className="shrink-0 text-[14px] font-bold text-white/25 ml-1">›</span>
                    )}
                    {isSelected && !isFocused && (
                      <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.7)] animate-pulse" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ChannelList);
