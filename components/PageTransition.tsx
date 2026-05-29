import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
// Re-export para compatibilidade — a impl vive em utils/ (evita aresta hooks→components).
export { addPageTransitionStyles } from '../utils/pageTransitionStyles';

interface PageTransitionProps {
  children: React.ReactNode;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const transitionRef = React.useRef<HTMLDivElement>(null);
  const isPlaybackRoute =
    location.pathname.startsWith('/watch/') ||
    location.pathname.startsWith('/canais') ||
    // /adulto usa VinhetaGate com position:fixed — page-exit aplica opacity:0 e transform
    // no wrapper, o que cria novo containing block e torna o overlay invisível.
    location.pathname.startsWith('/adulto');

  useEffect(() => {
    if (prevPathRef.current === location.pathname || !transitionRef.current) {
      return undefined;
    }

    transitionRef.current.classList.add('page-exit');

    const timer = setTimeout(() => {
      if (transitionRef.current) {
        transitionRef.current.classList.remove('page-exit');
        transitionRef.current.classList.add('page-enter');
      }
    }, 150);

    const cleanupTimer = setTimeout(() => {
      if (transitionRef.current) {
        transitionRef.current.classList.remove('page-enter');
      }
    }, 300);

    prevPathRef.current = location.pathname;

    return () => {
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
    };
  }, [location.pathname]);

  if (isPlaybackRoute) {
    return <>{children}</>;
  }

  return (
    <div ref={transitionRef} className="page-transition-wrapper">
      {children}
    </div>
  );
};

