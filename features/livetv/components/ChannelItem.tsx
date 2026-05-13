/**
 * features/livetv/components/ChannelItem.tsx
 * Item individual de canal na lista LiveTV
 */
import React, { memo } from 'react';
import { Channel } from '@/types';
import { Tv, ChevronRight } from 'lucide-react';

interface ChannelItemProps {
  channel: Channel;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  programmeName?: string | null;
  hasEPG?: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onOpenEPG?: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

const ChannelItem: React.FC<ChannelItemProps> = ({
  channel,
  index,
  isSelected,
  isFocused,
  programmeName,
  hasEPG,
  onClick,
  onMouseEnter,
  onOpenEPG: _onOpenEPG,
  buttonRef,
}) => {
  return (
    <button
      ref={buttonRef}
      data-channel-idx={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left outline-none ${
        isFocused
          ? 'bg-[#371960] border border-[#9370db] shadow-[0_0_15px_rgba(109,40,217,0.5)] z-10'
          : isSelected
            ? 'bg-[#371960] border border-[#9370db]'
            : 'border border-transparent hover:bg-white/[0.06]'
      }`}
    >
      <div className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="w-full h-full object-contain"
            loading="lazy"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
              const fallback = img.parentElement?.querySelector('.channel-logo-fallback');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
        ) : null}
        <Tv
          size={18}
          className={`text-white/30 channel-logo-fallback ${channel.logo ? 'hidden' : ''}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-white/85'}`}
        >
          <span className="text-[10px] text-white/35 mr-1.5">{index + 1}</span>
          {channel.name}
        </p>
        {programmeName ? (
          <p className="text-[10px] text-[rgba(196,164,255,0.6)] truncate">{programmeName}</p>
        ) : (
          <p className="text-[10px] text-white/30 truncate">{channel.category || ''}</p>
        )}
      </div>
      {isSelected && (
        <div className="shrink-0 w-14 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="w-full h-full object-contain"
              loading="lazy"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Tv size={14} className="text-white/30" />
          )}
        </div>
      )}
      {isFocused && hasEPG && (
        <div className="shrink-0 flex items-center gap-1 text-[10px] text-purple-400/80">
          <span className="font-bold">EPG</span>
          <ChevronRight size={14} className="animate-pulse" />
        </div>
      )}
    </button>
  );
};

export default memo(ChannelItem);
