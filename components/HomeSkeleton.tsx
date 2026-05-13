import React from 'react';

/** Skeleton da Home — exibido enquanto o catálogo carrega (percepção de velocidade) */
const HomeSkeleton: React.FC = () => {
  const SkeletonCard = () => (
    <div className="flex-shrink-0 w-[220px] h-[330px] rounded-2xl bg-white/[0.04] overflow-hidden relative">
      {/* Netflix-style shimmer sweep */}
      <div className="absolute inset-0 skeleton-shimmer-netflix" />
      <div className="w-full h-[75%] bg-gradient-to-b from-white/[0.06] to-white/[0.02]" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-white/[0.06] rounded-full w-3/4 relative overflow-hidden">
          <div className="absolute inset-0 skeleton-shimmer-netflix" />
        </div>
        <div className="h-2 bg-white/[0.04] rounded-full w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 skeleton-shimmer-netflix" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-4 pb-20 animate-fade-in">
      {/* Hero placeholder */}
      <div
        className="mt-0 w-full relative overflow-hidden"
        style={{ height: '100vh', minHeight: '100vh' }}
      >
        {/* Backdrop shimmer */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent">
          <div
            className="absolute inset-0 skeleton-shimmer-netflix"
            style={{ animationDuration: '2.5s' }}
          />
        </div>
        {/* Gradiente inferior */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
          style={{
            height: '60%',
            background:
              'linear-gradient(to top, #080808 0%, rgba(10,10,10,0.9) 20%, transparent 100%)',
          }}
        />
        {/* Conteúdo esquerdo — logo + sinopse + botões */}
        <div
          className="absolute bottom-16 left-12 z-20 flex flex-col gap-4"
          style={{ maxWidth: 320 }}
        >
          {/* Logo placeholder */}
          <div
            className="h-10 w-44 rounded-xl relative overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <div className="absolute inset-0 skeleton-shimmer-netflix" />
          </div>
          {/* Sinopse placeholder */}
          <div className="flex flex-col gap-2">
            <div
              className="h-2.5 rounded-full relative overflow-hidden"
              style={{ width: '90%', background: 'rgba(255,255,255,0.05)' }}
            >
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
            <div
              className="h-2.5 rounded-full relative overflow-hidden"
              style={{ width: '75%', background: 'rgba(255,255,255,0.05)' }}
            >
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
            <div
              className="h-2.5 rounded-full relative overflow-hidden"
              style={{ width: '55%', background: 'rgba(255,255,255,0.04)' }}
            >
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
          </div>
          {/* Botões placeholder */}
          <div className="flex gap-3 mt-1">
            <div
              className="h-8 w-24 rounded-full relative overflow-hidden"
              style={{ background: 'rgba(124,58,237,0.3)' }}
            >
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
            <div
              className="h-8 w-24 rounded-full relative overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
          </div>
        </div>
        {/* Dots placeholder */}
        <div
          className="absolute bottom-4 left-1/2 z-20 flex flex-col items-center gap-3"
          style={{ transform: 'translateX(-50%)' }}
        >
          <div
            className="h-0.5 w-48 rounded-full"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-1.5 rounded-full animate-pulse"
                style={{
                  width: i === 1 ? 20 : 6,
                  background: i === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* C4: Skeleton rows com stagger progressivo — percepção de carregamento rápido */}
      <div className="px-12 space-y-10">
        {[1, 2, 3, 4, 5].map((row) => (
          <section
            key={row}
            className="mt-8"
            style={{
              opacity: 0,
              animation: `page-in 300ms ease-out ${100 * row}ms forwards`,
            }}
          >
            <div className="h-8 w-48 bg-white/[0.06] rounded-lg animate-pulse mb-6" />
            <div className="flex gap-5 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default React.memo(HomeSkeleton);
