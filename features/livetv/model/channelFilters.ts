/**
 * features/livetv/model/channelFilters.ts
 * Filtragem de canais por categoria, busca e controle adulto
 */

import { Channel } from '@/types';

interface CategoryDef {
  id: string;
  label: string;
}

/**
 * Filtra canais por categoria, busca textual e controle adulto.
 */
export function filterChannels(
  channels: Channel[],
  activeCategoryId: string,
  searchQuery: string,
  _categories: CategoryDef[],
  adultUnlocked: boolean,
  isAdultChannel: (ch: Channel) => boolean
): Channel[] {
  let filtered = channels;

  // Remapear BBB 2026 e 24hs para Variedades
  const REMAP_TO_VARIEDADES = ['BBB 2026', 'Canais - 24hs'];
  filtered = filtered.map((ch) =>
    REMAP_TO_VARIEDADES.includes(ch.category || '')
      ? { ...ch, category: 'Canais – Variedades' }
      : ch
  );

  // Filtro adulto
  if (!adultUnlocked) {
    filtered = filtered.filter((ch) => !isAdultChannel(ch));
  }

  // Filtro por categoria (ID = nome exato da categoria no Supabase)
  if (activeCategoryId && activeCategoryId !== 'all') {
    filtered = filtered.filter((ch) => {
      const cat = ch.category || '';
      return cat === activeCategoryId;
    });
  }

  // Filtro por busca
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (ch) =>
        (ch.name || '').toLowerCase().includes(q) || (ch.category || '').toLowerCase().includes(q)
    );
  }

  return filtered;
}

/**
 * Encontra o canal "Globo Vitória ES" (ou Globo mais próximo) na lista.
 */
export function findGloboVitoriaES(channels: Channel[]): Channel | null {
  if (!channels.length) return null;
  // Primeiro tenta Globo Vitória ES exato
  const exact = channels.find(
    (ch) =>
      (ch.name || '').toLowerCase().includes('globo') &&
      (ch.name || '').toLowerCase().includes('vit')
  );
  if (exact) return exact;
  // Fallback: qualquer Globo
  const globo = channels.find((ch) => (ch.name || '').toLowerCase().includes('globo'));
  return globo ?? null;
}
