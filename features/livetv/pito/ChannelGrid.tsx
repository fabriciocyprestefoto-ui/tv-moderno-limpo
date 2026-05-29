import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { PitoChannel } from './types';
import { handleChannelLogoError } from '@/utils/channelLogo';

interface ChannelGridProps {
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

export const PitoChannelGrid: React.FC<ChannelGridProps> = ({
  channels,
  onSelectChannel,
  activeCategoryName,
  selectedChannelId,
  focusedIndex,
  isFocused,
}) => {
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

    if (typeof ResizeObserver === 'undefined') {
      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

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
    <motion.div
      key={activeCategoryName}
      initial={{ width: 0 }}
      animate={{ width: 230 }}
      exit={{ width: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      className="self-stretch flex flex-col py-[clamp(8px,2vh,20px)] px-3 overflow-hidden livetv-sidebar-purple relative z-20"
      aria-label={activeCategoryName}
    >
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pito-no-scrollbar pb-2"
        onScroll={handleScroll}
      >
        <div style={{ paddingTop: topPad, paddingBottom: bottomPad }}>
          <div className="flex flex-col gap-[3px]">
            {channels.length > 0 ? (
              visibleChannels.map((channel, localIdx) => {
                const idx = startIdx + localIdx;
                const isActive = selectedChannelId === channel.id;
                const isItemFocused = isFocused && focusedIndex === idx;
                // Highlight segue seta (igual ao menu gênero): --active no focado quando grid focado
                const showActive = isActive || isItemFocused;

                return (
                  <div key={channel.id} style={{ height: itemHeight }} className="flex items-start">
                    <button
                      ref={isItemFocused ? focusedItemRef : null}
                      onClick={() => onSelectChannel(channel)}
                      style={{ height: cardHeight }}
                      type="button"
                      tabIndex={0}
                      data-nav-item
                      aria-label={`Canal ${channel.number}, ${channel.name}, agora: ${channel.currentProgram.title}`}
                      aria-current={isActive ? 'true' : undefined}
                      className={`livetv-sidebar-row flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                        showActive ? 'livetv-sidebar-row--active' : ''
                      }`}
                    >
                      <span
                        className={`text-[10px] font-medium w-4 flex-shrink-0 tabular-nums ${
                          showActive ? 'text-white/70' : 'text-purple-300/40'
                        }`}
                      >
                        {channel.number}
                      </span>
                      <div className="relative w-7 h-7 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-1 bg-black/25 border border-white/10">
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white/55">
                          {channel.name.slice(0, 2).toUpperCase()}
                        </span>
                        {channel.logo ? (
                          <img
                            src={channel.logo}
                            alt={channel.name}
                            loading="lazy"
                            className="relative z-[1] block w-full h-full object-contain opacity-100"
                            referrerPolicy="no-referrer"
                            onError={(e) => handleChannelLogoError(channel.name, e.currentTarget)}
                          />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[11px] font-bold truncate leading-tight ${
                            showActive ? 'text-white' : 'text-purple-100/85'
                          }`}
                        >
                          {channel.name}
                        </div>
                        <div
                          className={`text-[9px] truncate leading-tight mt-0.5 ${
                            showActive ? 'text-white/65' : 'text-purple-300/45'
                          }`}
                        >
                          {channel.currentProgram.title}
                        </div>
                      </div>
                      <div
                        className={`flex-shrink-0 flex flex-col items-center gap-[1px] ${
                          showActive ? 'opacity-80' : 'opacity-30'
                        }`}
                      >
                        <span
                          className={`text-[7px] font-black tracking-widest leading-none ${
                            showActive ? 'text-white' : 'text-purple-200'
                          }`}
                        >
                          EPG
                        </span>
                        <ChevronRight
                          className={`w-3 h-3 ${showActive ? 'text-white' : 'text-purple-200'}`}
                        />
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-purple-300/30 text-xs font-medium">
                Nenhum canal encontrado.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
