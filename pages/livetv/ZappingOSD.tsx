import React, { memo } from 'react';
import { Channel } from '@/types';

interface ZappingOSDProps {
  channel: Channel;
  channelIndex: number;
}

const ZappingOSD: React.FC<ZappingOSDProps> = ({ channel, channelIndex }) => {
  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
      <div className="flex items-center gap-4 bg-black/80 backdrop-blur-2xl border border-white/15 rounded-2xl px-6 py-4 shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
        <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt=""
              className="w-10 h-10 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-sm font-black text-white/50">
              {channel.name.substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black text-[#E50914] tabular-nums">
              CH {channelIndex + 1}
            </span>
            <span className="text-[8px] px-2 py-0.5 bg-white/10 rounded text-white/40 font-bold uppercase">
              {channel.category}
            </span>
          </div>
          <h3 className="text-lg font-black uppercase tracking-tight text-white leading-none">
            {channel.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 ml-4">
          <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
          <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">
            AO VIVO
          </span>
        </div>
      </div>
    </div>
  );
};

export default memo(ZappingOSD);
