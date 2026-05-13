/**
 * useVODFilters.ts — Filter/search state and derived filter lists for VOD admin page.
 *
 * Extraído de pages/admin/VOD.tsx para separar lógica de filtros da UI.
 */

import { useState, useMemo } from 'react';
import { Media } from '../../types';
import { detectPlatformFromUrl } from '../../utils/mediaUtils';

export function useVODFilters(items: Media[]) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'Todos' | 'movie' | 'series'>('Todos');
  const [filterYear, setFilterYear] = useState('Todos');
  const [filterPlatform, setFilterPlatform] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'published' | 'draft'>('Todos');
  const [filterGenre, setFilterGenre] = useState('Todos');

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterType !== 'Todos') result = result.filter((i) => i.type === filterType);
    if (filterYear !== 'Todos') result = result.filter((i) => String(i.year) === filterYear);
    if (filterPlatform !== 'Todos')
      result = result.filter(
        (i) => (i.platform || detectPlatformFromUrl(i.stream_url)) === filterPlatform
      );
    if (filterStatus !== 'Todos')
      result = result.filter((i) => (i.status || 'published') === filterStatus);
    if (filterGenre !== 'Todos') result = result.filter((i) => i.genre?.includes(filterGenre));
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }
    return result;
  }, [items, filterType, filterYear, filterPlatform, filterStatus, filterGenre, searchTerm]);

  const years = useMemo(() => {
    const set = new Set<number>();
    items.forEach((i) => {
      if (i.year) set.add(i.year);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [items]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      const p = i.platform || detectPlatformFromUrl(i.stream_url);
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [items]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.genre?.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [items]);

  return {
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    filterYear,
    setFilterYear,
    filterPlatform,
    setFilterPlatform,
    filterStatus,
    setFilterStatus,
    filterGenre,
    setFilterGenre,
    filteredItems,
    years,
    platforms,
    genres,
  };
}
