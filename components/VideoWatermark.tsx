/**
 * Video Watermark - Marca d'água visual no player
 * Ajuda a identificar origem de vazamentos
 */

import React, { useEffect, useState } from 'react';

interface VideoWatermarkProps {
  userId: string;
  code?: string;
  opacity?: number;
}

const VideoWatermark: React.FC<VideoWatermarkProps> = ({ userId, code, opacity = 0.3 }) => {
  const [position, setPosition] = useState({ top: '10%', left: '10%' });

  useEffect(() => {
    // Mudar posição aleatoriamente a cada 30 segundos
    const interval = setInterval(() => {
      const positions = [
        { top: '10%', left: '10%' },
        { top: '10%', right: '10%', left: 'auto' },
        { bottom: '10%', left: '10%', top: 'auto' },
        { bottom: '10%', right: '10%', top: 'auto', left: 'auto' },
        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
      ];

      const randomPosition = positions[Math.floor(Math.random() * positions.length)];
      setPosition(randomPosition);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const displayText = code || userId.substring(0, 8).toUpperCase();

  return (
    <div
      style={{
        position: 'absolute',
        ...position,
        color: 'white',
        fontSize: '12px',
        fontFamily: 'monospace',
        opacity,
        pointerEvents: 'none',
        zIndex: 1000,
        textShadow: '0 0 4px rgba(0,0,0,0.8)',
        userSelect: 'none',
        transition: 'all 1s ease-in-out',
      }}
    >
      {displayText}
    </div>
  );
};

export default VideoWatermark;
