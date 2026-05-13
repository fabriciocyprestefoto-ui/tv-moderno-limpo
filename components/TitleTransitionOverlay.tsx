/**
 * TitleTransitionOverlay — sem animação visual.
 * Apenas repassa onComplete imediatamente para não bloquear a navegação.
 * A vinheta (vinheta.mp4) é exibida apenas dentro do Player, antes do stream iniciar.
 */
import React, { useEffect, useRef } from 'react';
import type { Media } from '../types';

interface TitleTransitionOverlayProps {
  title: string | null;
  media: Media | null;
  visible: boolean;
  onComplete?: () => void;
}

const TitleTransitionOverlay: React.FC<TitleTransitionOverlayProps> = ({ visible, onComplete }) => {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (visible) {
      onCompleteRef.current?.();
    }
  }, [visible]);

  return null;
};

export default TitleTransitionOverlay;
