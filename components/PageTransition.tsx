import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

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

export const addPageTransitionStyles = (): void => {
  if (typeof document === 'undefined') return;

  const styleId = 'page-transition-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .page-transition-wrapper {
      width: 100%;
      height: 100%;
    }
    
    .page-exit {
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 0.15s ease-out, transform 0.15s ease-out;
    }
    
    .page-enter {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.15s ease-in, transform 0.15s ease-in;
    }
  `;

  document.head.appendChild(style);
};
