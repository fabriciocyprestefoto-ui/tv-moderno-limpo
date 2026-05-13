/**
 * components/__tests__/MediaCard.test.tsx
 *
 * Testa o componente MediaCard:
 *  - Renderiza poster no estado padrão (não ativo)
 *  - Enter no modo normal abre modo botões
 *  - ArrowLeft/ArrowRight navegam entre botões no modo botões
 *  - Escape/Backspace saem do modo botões
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// LazyImage: renderiza um img simples para evitar lógica de IntersectionObserver
vi.mock('../LazyImage', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
  ERROR_SVG: 'data:image/svg+xml,<svg/>',
}));

// userService.checkStatus: retorna bibliotecas vazias
vi.mock('@/services/userService', () => ({
  userService: {
    checkStatus: vi.fn().mockResolvedValue({ inWatchlist: false, inWatchLater: false }),
    toggleLibraryItem: vi.fn().mockResolvedValue('ok'),
  },
}));

// tmdb e tmdbSync: não precisamos de dados reais
vi.mock('@/services/tmdb', () => ({
  getMediaDetailsByID: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/tmdbSync', () => ({
  default: {
    getOrFixDetails: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/services/tmdbKeys', () => ({
  getFetchOptions: vi.fn().mockReturnValue({}),
}));

// Sem fetch real
vi.mock('@/utils/fetchUtils', () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({ json: async () => ({ results: [] }) }),
  fetchDedup: vi.fn().mockImplementation((_key: string, fn: () => unknown) => fn()),
}));

// Cache de status: nunca tem cache
vi.mock('@/utils/mediaCardCaches', () => ({
  cacheStatusGet: vi.fn().mockReturnValue(null),
  cacheStatusSet: vi.fn(),
  cacheStatusUpdate: vi.fn(),
  hasPrefetchedDetails: vi.fn().mockReturnValue(false),
  setPrefetchedDetails: vi.fn(),
}));

// Progresso de watch
vi.mock('@/utils/continueWatchingProgress', () => ({
  getWatchProgress: vi.fn().mockReturnValue(0),
}));

// Sound effects
vi.mock('@/utils/soundEffects', () => ({
  playNavigateSound: vi.fn(),
  playSelectSound: vi.fn(),
}));

import { playNavigateSound } from '@/utils/soundEffects';

// mediaUtils
vi.mock('@/utils/mediaUtils', () => ({
  getMediaPoster: vi.fn().mockReturnValue('https://example.com/poster.jpg'),
  getMediaBackdrop: vi.fn().mockReturnValue(null),
  getMediaLogo: vi.fn().mockReturnValue(null),
}));

// ToastContext
vi.mock('@/contexts/ToastContext', () => ({
  useToast: vi.fn().mockReturnValue({ showToast: vi.fn() }),
}));

// playerDefaults
vi.mock('@/config/playerDefaults', () => ({
  getDetailsVinhetaSrc: vi.fn().mockReturnValue(''),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import MediaCard from '../MediaCard';
import type { Media } from '../../types';

const baseMedia: Media = {
  id: 1,
  tmdb_id: 27205,
  title: 'Inception',
  type: 'movie',
  poster: 'https://example.com/poster.jpg',
  poster_path: '/poster.jpg',
  backdrop: null,
  backdrop_path: null,
  overview: 'A thief who steals corporate secrets.',
  release_date: '2010-07-16',
  rating: 8.8,
  stream_url: 'https://cdn.example.com/movie.m3u8',
} as unknown as Media;

function renderCard(props: Partial<React.ComponentProps<typeof MediaCard>> = {}) {
  const onClick = vi.fn();
  const utils = render(<MediaCard media={baseMedia} onClick={onClick} {...props} />);
  return { ...utils, onClick };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('MediaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza o card com data-testid correto', () => {
    renderCard();
    expect(screen.getByTestId('media-card')).toBeDefined();
  });

  it('renderiza poster (LazyImage) quando não está ativo', () => {
    renderCard();
    // LazyImage mockado renderiza <img>
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.src).toContain('poster.jpg');
  });

  it('possui role="button" e aria-label descritivos', () => {
    renderCard();
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-label')).toContain('Inception');
  });

  it('Enter no modo normal coloca o card em modo botões (window.__modalKeyTrap = true)', () => {
    renderCard();
    const card = screen.getByTestId('media-card');

    // Garantir foco
    card.focus();

    fireEvent.keyDown(card, { key: 'Enter' });

    // Após Enter, __modalKeyTrap deve ser true (sinal do modo botões)
    expect((window as any).__modalKeyTrap).toBe(true);
  });

  it('ArrowLeft no modo botões decrementa o botão ativo (não vai abaixo de 0)', () => {
    renderCard();
    const card = screen.getByTestId('media-card');
    card.focus();

    // Entrar no modo botões
    fireEvent.keyDown(card, { key: 'Enter' });
    // Tentar decrementar (já está em 0)
    fireEvent.keyDown(card, { key: 'ArrowLeft' });

    // Não deve lançar e window.__modalKeyTrap ainda deve ser true
    expect((window as any).__modalKeyTrap).toBe(true);
  });

  it('ArrowRight no modo botões avança para o próximo botão', () => {
    const mockPlayNav = vi.mocked(playNavigateSound);
    renderCard();
    const card = screen.getByTestId('media-card');
    card.focus();

    fireEvent.keyDown(card, { key: 'Enter' }); // entra modo botões
    fireEvent.keyDown(card, { key: 'ArrowRight' }); // avança para botão 1

    // playNavigateSound deve ter sido chamado
    expect(mockPlayNav).toHaveBeenCalled();
  });

  it('Escape sai do modo botões (window.__modalKeyTrap = false)', () => {
    renderCard();
    const card = screen.getByTestId('media-card');
    card.focus();

    fireEvent.keyDown(card, { key: 'Enter' }); // entra modo botões
    expect((window as any).__modalKeyTrap).toBe(true);

    fireEvent.keyDown(card, { key: 'Escape' }); // sai do modo botões
    expect((window as any).__modalKeyTrap).toBe(false);
  });

  it('Backspace sai do modo botões', () => {
    renderCard();
    const card = screen.getByTestId('media-card');
    card.focus();

    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: 'Backspace' });

    expect((window as any).__modalKeyTrap).toBe(false);
  });

  it('clique no card chama onClick', () => {
    const { onClick } = renderCard();
    const card = screen.getByTestId('media-card');

    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disableHover=true não expande no hover', () => {
    renderCard({ disableHover: true });
    const card = screen.getByTestId('media-card');

    fireEvent.mouseEnter(card);

    // Não deve estar expandido (z-50 só aparece quando isActive=true)
    expect(card.className).not.toContain('z-50');
  });
});
