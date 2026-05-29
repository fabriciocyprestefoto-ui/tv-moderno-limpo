import { describe, it, expect } from 'vitest';
import {
  removeDuplicates,
  normalizeGenreKey,
  organizeByGenre,
  sortByRating,
} from '../catalogUtils';
import type { Media } from '../../types';

const media = (partial: Partial<Media>): Media => partial as Media;

describe('removeDuplicates', () => {
  it('remove duplicados por tmdb_id (mantém o primeiro)', () => {
    const list = [
      media({ id: '1', tmdb_id: 10, type: 'movie', title: 'A' }),
      media({ id: '2', tmdb_id: 10, type: 'movie', title: 'A dup' }),
      media({ id: '3', tmdb_id: 20, type: 'movie', title: 'B' }),
    ];
    const out = removeDuplicates(list);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.title)).toEqual(['A', 'B']);
  });

  it('dedup por título+tipo+ano quando sem tmdb_id', () => {
    const list = [
      media({ id: '1', type: 'movie', title: 'Filme X', year: 2020 }),
      media({ id: '2', type: 'movie', title: 'filme x', year: 2020 }),
      media({ id: '3', type: 'series', title: 'Filme X', year: 2020 }),
    ];
    const out = removeDuplicates(list);
    // mesmo título+ano+tipo (movie) colapsa; série é tipo diferente → mantém
    expect(out).toHaveLength(2);
  });

  it('preserva itens distintos (só deduplica, não valida)', () => {
    const list = [
      media({ id: '1', type: 'movie', title: 'X', year: 2020 }),
      media({ id: '2', type: 'movie', title: 'Y', year: 2021 }),
    ];
    expect(removeDuplicates(list)).toHaveLength(2);
  });
});

describe('normalizeGenreKey', () => {
  it('normaliza acentos, caixa e separadores', () => {
    expect(normalizeGenreKey('Ação')).toBe('acao');
    expect(normalizeGenreKey('Sci-Fi')).toBe('sci fi');
    expect(normalizeGenreKey('Action & Adventure')).toBe('action e adventure');
    expect(normalizeGenreKey('Drama/Romance')).toBe('drama romance');
  });

  it('"and" vira "e"', () => {
    expect(normalizeGenreKey('Action and Drama')).toBe('action e drama');
  });
});

describe('sortByRating', () => {
  it('ordena decrescente por rating', () => {
    const list = [
      media({ title: 'low', rating: 5 }),
      media({ title: 'high', rating: 9 }),
      media({ title: 'mid', rating: 7 }),
    ];
    expect([...list].sort(sortByRating).map((m) => m.title)).toEqual(['high', 'mid', 'low']);
  });

  it('rating ausente conta como 0', () => {
    const list = [media({ title: 'none' }), media({ title: 'has', rating: 8 })];
    expect([...list].sort(sortByRating).map((m) => m.title)).toEqual(['has', 'none']);
  });
});

describe('organizeByGenre', () => {
  it('agrupa por gênero, ignora gêneros com <2 itens, ordena por quantidade', () => {
    const list = [
      media({ id: '1', tmdb_id: 1, type: 'movie', title: 'A', genre: ['Ação', 'Drama'] }),
      media({ id: '2', tmdb_id: 2, type: 'movie', title: 'B', genre: ['Ação'] }),
      media({ id: '3', tmdb_id: 3, type: 'movie', title: 'C', genre: ['Ação', 'Comédia'] }),
      media({ id: '4', tmdb_id: 4, type: 'movie', title: 'D', genre: ['Drama'] }),
    ];
    const map = organizeByGenre(list);
    // Ação: 3 itens, Drama: 2 itens, Comédia: 1 (ignorado <2)
    const keys = [...map.keys()];
    expect(keys[0]).toBe('Ação'); // maior quantidade primeiro
    expect(map.get('Ação')).toHaveLength(3);
    expect(map.get('Drama')).toHaveLength(2);
    expect(map.has('Comédia')).toBe(false);
  });

  it('unifica variações de caixa/acento do mesmo gênero', () => {
    const list = [
      media({ id: '1', tmdb_id: 1, type: 'movie', title: 'A', genre: ['Ação'] }),
      media({ id: '2', tmdb_id: 2, type: 'movie', title: 'B', genre: ['acao'] }),
    ];
    const map = organizeByGenre(list);
    // ambos colapsam no mesmo bucket normalizado
    expect(map.size).toBe(1);
    expect([...map.values()][0]).toHaveLength(2);
  });
});
