import { useRef, useCallback } from 'react';
import { useVirtualizer, type Virtualizer, type VirtualItem } from '@tanstack/react-virtual';

interface UseHorizontalVirtualListOptions {
  count: number;
  estimateSize?: number;
  overscan?: number;
}

interface UseHorizontalVirtualListReturn {
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  listRef: React.RefObject<HTMLDivElement | null>;
  scrollToIndex: (index: number) => void;
}

export function useHorizontalVirtualList({
  count,
  estimateSize = 180,
  overscan = 3,
}: UseHorizontalVirtualListOptions): UseHorizontalVirtualListReturn {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    horizontal: true,
    overscan,
  });

  const scrollToIndex = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: 'center' });
    },
    [virtualizer]
  );

  return { virtualizer, listRef: parentRef, scrollToIndex };
}

interface VirtualRowProps<T> {
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
}

export function VirtualRow<T>({
  virtualizer,
  items,
  renderItem,
  keyExtractor,
}: VirtualRowProps<T>): React.ReactElement {
  const virtualItems: VirtualItem[] = virtualizer.getVirtualItems();

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualItems.map((virtualItem: VirtualItem) => {
        const item = items[virtualItem.index];
        return (
          <div
            key={keyExtractor(item, virtualItem.index)}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              left: 0,
              transform: `translateX(${virtualItem.start}px)`,
              width: `${virtualItem.size}px`,
            }}
          >
            {renderItem(item, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}

export function useMediaRowVirtualizer<T>(
  items: T[],
  options?: Partial<UseHorizontalVirtualListOptions>
): UseHorizontalVirtualListReturn {
  return useHorizontalVirtualList({
    count: items.length,
    ...options,
  });
}
