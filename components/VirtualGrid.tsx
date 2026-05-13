import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Media } from '../types';
import VideoCard, { VideoCardSkeleton } from './VideoCard';
import { isTVBox } from '../utils/tvBoxDetector';
import { Film } from 'lucide-react';

/**
 * VirtualGrid — Grid responsivo virtualizado para TV Box
 * ════════════════════════════════════════════════════════
 * - Virtual scrolling com windowing manual (sem react-window dep)
 * - Responsivo: 4-5 colunas em 1080p, 6+ em 4K
 * - Gap: 24px horizontal, 32px vertical
 * - Infinite scroll com paginação
 * - Loading skeletons
 * - Empty state
 * - D-pad: auto-scroll ao navegar
 * - Limite de ~50 elementos no DOM
 *
 * Substitui react-window com implementação leve e integrada
 * ao sistema de navegação espacial do projeto.
 */

// ═══════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════

const GAP_H = 24; // horizontal gap (px)
const GAP_V = 32; // vertical gap (px)
const OVERSCAN = 0; // Audit fix: overscan=0 — menos elementos no DOM, sem jank

/** Calcula colunas com base na largura disponível e tamanho do card */
function computeColumns(containerWidth: number, cardWidth: number, gap: number): number {
  if (containerWidth <= 0) return 4;
  const cols = Math.floor((containerWidth + gap) / (cardWidth + gap));
  return Math.max(1, Math.min(cols, 10)); // 1..10
}

// ═══════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════

type CardLayout = 'portrait' | 'landscape';

interface VirtualGridProps {
  /** Itens a exibir */
  items: Media[];
  /** Callback ao clicar em um item */
  onSelect: (media: Media) => void;
  /** Callback ao reproduzir */
  onPlay?: (media: Media) => void;
  /** Layout dos cards */
  layout?: CardLayout;
  /** Título da seção (opcional) */
  title?: string;
  /** Mostrar progresso nos cards */
  showProgress?: boolean;
  /** Função que retorna progresso [0..1] por tmdb_id */
  getProgress?: (media: Media) => number | undefined;
  /** Número de itens por página para infinite scroll */
  pageSize?: number;
  /** Callback para carregar mais itens */
  onLoadMore?: () => void;
  /** Indica se está carregando mais dados */
  isLoadingMore?: boolean;
  /** Indica se existem mais itens */
  hasMore?: boolean;
  /** Índice de linha base para navegação D-pad */
  baseRowIndex?: number;
  /** Forçar número de colunas */
  columns?: number;
  /** Largura forçada do card */
  cardWidth?: number;
  /** Altura forçada do card */
  cardHeight?: number;
  /** Mostrar estado vazio personalizado */
  emptyMessage?: string;
  /** Loading state global */
  isLoading?: boolean;
  /** Quantidade de skeletons a mostrar */
  skeletonCount?: number;
}

const CARD_DEFAULTS = {
  portrait: { width: 240, height: 360 },
  landscape: { width: 400, height: 225 },
};

const VirtualGrid: React.FC<VirtualGridProps> = ({
  items,
  onSelect,
  onPlay,
  layout = 'portrait',
  title,
  showProgress: _showProgress = false,
  getProgress,
  pageSize: _pageSize = 40,
  onLoadMore,
  isLoadingMore = false,
  hasMore = false,
  baseRowIndex = 0,
  columns: forcedColumns,
  cardWidth: forcedCardWidth,
  cardHeight: forcedCardHeight,
  emptyMessage = 'Nenhum conteúdo encontrado',
  isLoading = false,
  skeletonCount = 20,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Audit fix: cache offsetTop para evitar browser reflow em cada scroll
  const cachedOffsetTopRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const cw = forcedCardWidth || CARD_DEFAULTS[layout].width;
  const ch = forcedCardHeight || CARD_DEFAULTS[layout].height;

  // ── Medir container via ResizeObserver ──
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Colunas calculadas
  const cols = useMemo(
    () => forcedColumns || computeColumns(containerWidth, cw, GAP_H),
    [containerWidth, cw, forcedColumns]
  );

  // Total de linhas
  const totalRows = useMemo(() => Math.ceil(items.length / cols), [items.length, cols]);

  // Altura de cada linha (card + gap vertical)
  const rowHeight = ch + GAP_V;

  // Altura total do grid (content height — referência para virtualization futura)
  const _totalHeight = totalRows * rowHeight;
  void _totalHeight;

  // Audit fix: atualizar cache de offsetTop quando container muda de posição
  useEffect(() => {
    if (containerRef.current) {
      cachedOffsetTopRef.current = containerRef.current.offsetTop;
    }
  }, [containerWidth]); // recalcula só quando o layout muda, não a cada scroll

  // ── Scroll tracking — debounce com requestAnimationFrame ──
  useEffect(() => {
    const handleScroll = () => {
      // Audit fix: cancelar RAF pendente antes de agendar novo
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setScrollTop(window.scrollY);
        setViewportHeight(window.innerHeight);
        rafRef.current = null;
      });
    };

    handleScroll(); // inicializar
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Calcular range visível de linhas ──
  const { startRow, endRow } = useMemo(() => {
    if (!containerRef.current) return { startRow: 0, endRow: Math.min(totalRows, 6) };

    // Audit fix: usar offsetTop cacheado — evita reflow por scroll
    const containerTop = cachedOffsetTopRef.current;
    const relativeScrollTop = scrollTop - containerTop;

    // Primeira linha visível (com overscan)
    const firstVisibleRow = Math.floor(relativeScrollTop / rowHeight);
    const start = Math.max(0, firstVisibleRow - OVERSCAN);

    // Última linha visível (com overscan)
    const visibleRows = Math.ceil(viewportHeight / rowHeight);
    const end = Math.min(totalRows, firstVisibleRow + visibleRows + OVERSCAN + 1);

    return { startRow: start, endRow: end };
  }, [scrollTop, viewportHeight, rowHeight, totalRows]);

  // ── Itens virtualizados — só ~50 elementos no DOM ──
  const visibleItems = useMemo(() => {
    const result: { media: Media; row: number; col: number; index: number }[] = [];
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (idx < items.length) {
          result.push({ media: items[idx], row, col, index: idx });
        }
      }
    }
    return result;
  }, [items, startRow, endRow, cols]);

  // ── Infinite scroll via IntersectionObserver ──
  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '600px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  // ── Auto-scroll quando foco D-pad muda de linha ──
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target?.hasAttribute('data-nav-item')) return;
      if (!containerRef.current?.contains(target)) return;

      // TV Box: scroll instantâneo evita jank; desktop mantém smooth
      target.scrollIntoView({
        behavior: isTVBox() ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    };

    document.addEventListener('focusin', handler, { passive: true });
    return () => document.removeEventListener('focusin', handler);
  }, []);

  // Largura real de cada card no grid (preencher espaço)
  const actualCardWidth = useMemo(() => {
    if (containerWidth <= 0) return cw;
    const totalGaps = (cols - 1) * GAP_H;
    const available = containerWidth - totalGaps;
    return Math.floor(available / cols);
  }, [containerWidth, cols, cw]);

  const actualCardHeight = useMemo(() => {
    if (layout === 'portrait') return Math.round(actualCardWidth * 1.5);
    return Math.round((actualCardWidth * 9) / 16);
  }, [actualCardWidth, layout]);

  const actualRowHeight = actualCardHeight + GAP_V;
  const actualTotalHeight = totalRows * actualRowHeight;

  // ═══════════════════════════════════════════════════════
  // RENDER — LOADING STATE
  // ═══════════════════════════════════════════════════════
  if (isLoading) {
    return (
      <div ref={containerRef} className="px-8 md:px-12">
        {title && (
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-4">
            {title}
            <div className="h-px flex-1 bg-linear-to-r from-white/20 to-transparent" />
          </h2>
        )}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${forcedColumns || 5}, 1fr)`,
            gap: `${GAP_V}px ${GAP_H}px`,
          }}
        >
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <VideoCardSkeleton key={i} layout={layout} />
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER — EMPTY STATE
  // ═══════════════════════════════════════════════════════
  if (!isLoading && items.length === 0) {
    return (
      <div ref={containerRef} className="px-8 md:px-12">
        {title && (
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-4">
            {title}
            <div className="h-px flex-1 bg-linear-to-r from-white/20 to-transparent" />
          </h2>
        )}
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-20 h-20 rounded-full bg-white/3 border border-white/6 flex items-center justify-center">
            <Film className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/30 text-sm font-medium">{emptyMessage}</p>
          <p className="text-white/15 text-xs">
            Tente ajustar os filtros ou navegue por outra categoria
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER — VIRTUAL GRID
  // ═══════════════════════════════════════════════════════
  return (
    <div ref={containerRef} className="px-8 md:px-12">
      {/* Título */}
      {title && (
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-4">
          {title}
          <span className="text-xs text-white/20 font-normal">{items.length} itens</span>
          <div className="h-px flex-1 bg-linear-to-r from-white/20 to-transparent" />
        </h2>
      )}

      {/* Container virtual com placeholder para altura total */}
      <div className="relative" style={{ height: `${actualTotalHeight}px` }}>
        {/* Cards visíveis (virtualizados) */}
        {visibleItems.map(({ media, row, col, index }) => {
          const top = row * actualRowHeight;
          const left = col * (actualCardWidth + GAP_H);
          const progress = getProgress?.(media);

          return (
            <div
              key={`${media.type}-${media.tmdb_id || media.id}-${index}`}
              className="absolute"
              style={{
                top: `${top}px`,
                left: `${left}px`,
                width: `${actualCardWidth}px`,
                height: `${actualCardHeight}px`,
              }}
            >
              <VideoCard
                media={media}
                onClick={() => onSelect(media)}
                onPlay={onPlay ? () => onPlay(media) : undefined}
                layout={layout}
                colIndex={col}
                rowIndex={baseRowIndex + row}
                progress={progress}
                width={actualCardWidth}
                height={actualCardHeight}
                index={index}
              />
            </div>
          );
        })}
      </div>

      {/* ── Sentinel para infinite scroll ── */}
      {hasMore && <div ref={sentinelRef} className="w-full h-4 mt-4" />}

      {/* ── Loading more indicator ── */}
      {isLoadingMore && (
        <div className="flex items-center justify-center py-8 gap-3">
          <div className="w-6 h-6 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin" />
          <span className="text-white/30 text-xs uppercase tracking-widest font-bold">
            Carregando...
          </span>
        </div>
      )}
    </div>
  );
};

export default React.memo(VirtualGrid);
