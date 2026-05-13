import React, { memo, useRef, useEffect } from 'react';
import LiveTVVideo from '@/components/LiveTVVideo';
import { Channel } from '@/types';

interface LivePlayerAreaProps {
  selectedChannel: Channel | null;
  isMenuOpen: boolean;
  showVinheta?: boolean;
  onVinhetaEnd?: () => void;
}

const LivePlayerArea: React.FC<LivePlayerAreaProps> = ({
  selectedChannel,
  isMenuOpen: _isMenuOpen,
  onVinhetaEnd,
}) => {
  const playerRef = useRef<HTMLDivElement>(null);
  // Removido: inert attribute pode estar causando problemas no WebView Android
  // useEffect(() => {
  //     const el = playerRef.current;
  //     if (!el) return;
  //     if (isMenuOpen) el.setAttribute('inert', '');
  //     else el.removeAttribute('inert');
  // }, [isMenuOpen]);

  useEffect(() => {
    if (!selectedChannel?.stream_url) return undefined;
    try {
      const u = new URL(selectedChannel.stream_url);
      const origin = `${u.protocol}//${u.host}`;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      const timer = setTimeout(() => {
        try {
          document.head.removeChild(link);
        } catch {
          /* no-op */
        }
      }, 8000);
      return () => {
        clearTimeout(timer);
        try {
          document.head.removeChild(link);
        } catch {
          /* no-op */
        }
      };
    } catch {
      return undefined;
    }
  }, [selectedChannel?.stream_url]);

  const PlayerContent = React.useMemo(() => {
    if (!selectedChannel) {
      return <div className="w-full h-full" style={{ background: 'transparent' }} />;
    }

    const streamUrl = selectedChannel.stream_url ?? '';

    return (
      <LiveTVVideo
        streamUrl={streamUrl}
        channelName={selectedChannel.name}
        onStreamReady={onVinhetaEnd}
      />
    );
  }, [selectedChannel?.stream_url, selectedChannel?.name, onVinhetaEnd]);

  return (
    <div ref={playerRef} className="live-player-area absolute inset-0 w-full h-full">
      {PlayerContent}
    </div>
  );
};

export default memo(LivePlayerArea);
