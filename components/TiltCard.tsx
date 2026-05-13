import React, { useRef } from 'react';
import { isTVBox } from '../utils/tvBoxDetector';

const useTiltEffect = (intensity = 15) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !cardRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateX = (rect.height / 2 - y) / intensity;
    const rotateY = (x - rect.width / 2) / intensity;

    cardRef.current.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
    containerRef.current.style.setProperty('--x', `${x}px`);
    containerRef.current.style.setProperty('--y', `${y}px`);
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = `rotateX(0deg) rotateY(0deg) scale(1)`;
  };

  return { containerRef, cardRef, handleMouseMove, handleMouseLeave };
};

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  intensity?: number;
}

export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  innerClassName = '',
  intensity = 15,
}) => {
  const { containerRef, cardRef, handleMouseMove, handleMouseLeave } = useTiltEffect(intensity);

  // TV Box: desabilitar efeito 3D tilt (mouse-only, causa jank em GPUs fracas)
  if (isTVBox()) {
    return (
      <div className={`relative ${className}`}>
        <div className={`relative h-full ${innerClassName}`}>{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`tilt-container relative ${className}`}
    >
      <div
        ref={cardRef}
        className={`tilt-card relative h-full transition-transform duration-300 ease-out ${innerClassName}`}
      >
        <div className="tilt-shine"></div>
        {children}
      </div>
    </div>
  );
};
