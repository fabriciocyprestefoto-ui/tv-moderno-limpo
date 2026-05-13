/**
 * features/livetv/constants.ts
 * Categorias de canais para LiveTV — mapeadas para as categorias reais do Supabase
 */
import React from 'react';
import {
  Tv,
  Radio,
  Film,
  Newspaper,
  Baby,
  Sparkles,
  BookOpen,
  Music,
  ShieldAlert,
  LayoutGrid,
  Globe,
  Trophy,
  Church,
} from 'lucide-react';

export interface LiveTVCategory {
  id: string;
  label: string;
  name: string;
  icon: React.ReactNode;
}

export const CATEGORIES: LiveTVCategory[] = [
  { id: 'all', label: 'Todos', name: 'Todos', icon: React.createElement(LayoutGrid, { size: 16 }) },
  {
    id: 'Canais – Globo',
    label: 'Globo',
    name: 'Globo',
    icon: React.createElement(Globe, { size: 16 }),
  },
  {
    id: 'Canais - Abertos',
    label: 'Abertos',
    name: 'Abertos',
    icon: React.createElement(Tv, { size: 16 }),
  },
  {
    id: 'Canais – Esportes',
    label: 'Esportes',
    name: 'Esportes',
    icon: React.createElement(Radio, { size: 16 }),
  },
  {
    id: 'Canais – Esportes Ppv',
    label: 'Esportes PPV',
    name: 'Esportes PPV',
    icon: React.createElement(Trophy, { size: 16 }),
  },
  {
    id: 'Canais - Premiere',
    label: 'Premiere',
    name: 'Premiere',
    icon: React.createElement(Trophy, { size: 16 }),
  },
  {
    id: 'Canais – Filmes e Séries',
    label: 'Filmes e Séries',
    name: 'Filmes e Séries',
    icon: React.createElement(Film, { size: 16 }),
  },
  {
    id: 'Canais – Notícias',
    label: 'Notícias',
    name: 'Notícias',
    icon: React.createElement(Newspaper, { size: 16 }),
  },
  {
    id: 'Canais – Infantis',
    label: 'Infantil',
    name: 'Infantil',
    icon: React.createElement(Baby, { size: 16 }),
  },
  {
    id: 'Canais – Variedades',
    label: 'Variedades',
    name: 'Variedades',
    icon: React.createElement(Sparkles, { size: 16 }),
  },
  {
    id: 'Canais – Documentários',
    label: 'Documentários',
    name: 'Documentários',
    icon: React.createElement(BookOpen, { size: 16 }),
  },
  {
    id: 'Canais – Música',
    label: 'Música',
    name: 'Música',
    icon: React.createElement(Music, { size: 16 }),
  },
  {
    id: 'Canais – Religiosos',
    label: 'Religiosos',
    name: 'Religiosos',
    icon: React.createElement(Church, { size: 16 }),
  },
  {
    id: 'Canais – Adultos',
    label: 'Adulto XXX',
    name: 'Adulto XXX',
    icon: React.createElement(ShieldAlert, { size: 16 }),
  },
];
