import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { PitoChannel } from './types';

interface LiveTvChannelGridProps {
  channels: PitoChannel[];
  onSelectChannel: (channel: PitoChannel) => void;
  activeCategoryName: string;
  selectedChannelId?: string;
  focusedIndex?: number;
  isFocused?: boolean;
}

const DEFAULT_ITEM_HEIGHT = 72;
const MIN_ITEM_HEIGHT = 52;
const MAX_ITEM_HEIGHT = 72;
const TARGET_VISIBLE_ITEMS = 13;
const OVERSCAN = 10;

export function LiveTvChannelGrid({
  channels,
  onSelectChannel,
  activeCategoryName,
  selectedChannelId,
  focusedIndex,
  isFocused,
}: LiveTvChannelGridProps) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(1000);
  const [itemHeight, setItemHeight] = React.useState(DEFAULT_ITEM_HEIGHT);
  const focusedItemRef = React.useRef<HTMLButtonElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isFocused && focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused, focusedIndex]);

  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      const nextHeight = el.clientHeight;
      const responsiveItemHeight = Math.max(
        MIN_ITEM_HEIGHT,
        Math.min(MAX_ITEM_HEIGHT, Math.floor(nextHeight / TARGET_VISIBLE_ITEMS))
      );
      setContainerHeight(nextHeight);
      setItemHeight(responsiveItemHeight);
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    updateSize();
    return () => ro.disconnect();
  }, []);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIdx = Math.min(channels.length, startIdx + visibleCount + OVERSCAN * 2);
  const visibleChannels = channels.slice(startIdx, endIdx);
  const topPad = startIdx * itemHeight;
  const bottomPad = Math.max(0, (channels.length - endIdx) * itemHeight);
  const cardHeight = Math.max(44, itemHeight - 6);

  return (
    <div
      className="relative z-20 flex w-[230px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-stream-sidebar/95 to-black/85 py-[clamp(8px,2vh,20px)] pl-2 pr-3"
      aria-label={activeCategoryName}
    >
      <div
        ref={scrollContainerRef}
        className="pito-no-scrollbar flex-1 overflow-y-auto pb-2"
        onScroll={handleScroll}
      >
        <div style={{ paddingTop: topPad, paddingBottom: bottomPad }}>
          <div className="flex flex-col gap-[3px]">
            {channels.length > 0 ? (
              visibleChannels.map((channel, localIdx) => {
                const idx = startIdx + localIdx;
                const isActive = selectedChannelId === channel.id;
                const isItemFocused = isFocused && focusedIndex === idx;

                return (
                  <div key={channel.id} style={{ height: itemHeight }} className="flex items-start">
                    <button
                      ref={isItemFocused ? focusedItemRef : null}
                      onClick={() => onSelectChannel(channel)}
                      style={{ height: cardHeight }}
                      type="button"
                      tabIndex={0}
                      aria-label={channel.name}
                      aria-current={isActive ? 'true' : undefined}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left transition-colors ${
                        isActive ? 'bg-white/12' : 'hover:bg-white/10'
                      } ${isItemFocused ? 'ring-2 ring-white/40' : ''}`}
                    >
                      <span
                        className={`w-4 flex-shrink-0 tabular-nums text-[10px] font-medium ${
                          isActive ? 'text-white/70' : 'text-stream-muted/40'
                        }`}
                      >
                        {channel.number}
                      </span>
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                        <img
                          src={channel.logo}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-[11px] font-bold leading-tight ${
                            isActive ? 'text-white' : 'text-stream-muted/88'
                          }`}
                        >
                          {channel.name}
                        </div>
                        <div
                          className={`mt-0.5 truncate text-[9px] leading-tight ${
                            isActive ? 'text-white/65' : 'text-stream-muted/45'
                          }`}
                        >
                          {channel.currentProgram.title}
                        </div>
                      </div>
                      <div
                        className={`flex flex-shrink-0 flex-col items-center gap-[1px] ${
                          isActive ? 'opacity-80' : 'opacity-30'
                        }`}
                      >
                        <span
                          className={`text-[7px] font-black leading-none tracking-widest ${
                            isActive ? 'text-white' : 'text-stream-muted/90'
                          }`}
                        >
                          EPG
                        </span>
                        <ChevronRight className={`h-3 w-3 ${isActive ? 'text-white' : 'text-stream-muted/85'}`} />
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-10 text-center text-xs font-medium text-stream-muted/35">
                Nenhum canal encontrado.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
