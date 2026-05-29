import { describe, it, expect } from 'vitest';
import { genreToPtBr, isKidsContent, filterKidsContent } from '../genreUtils';
import type { Media } from '../../types';

/** Constrói um Media mínimo só com os campos lidos por isKidsContent. */
const media = (partial: Partial<Media>): Media => partial as Media;

describe('genreToPtBr', () => {
  it('mapeia gêneros conhecidos en→pt-BR', () => {
    expect(genreToPtBr('Animation')).toBe('Animação');
    expect(genreToPtBr('Family')).toBe('Família');
    expect(genreToPtBr('Horror')).toBe('Terror');
    expect(genreToPtBr('Science Fiction')).toBe('Ficção Científica');
  });

  it('mantém gênero desconhecido inalterado', () => {
    expect(genreToPtBr('Western')).toBe('Western');
  });

  it('trata vazio/espaços', () => {
    expect(genreToPtBr('')).toBe('');
    expect(genreToPtBr('   ')).toBe('');
    expect(genreToPtBr('  Animation  ')).toBe('Animação');
  });
});

describe('isKidsContent', () => {
  it('flag kids=true tem prioridade máxima', () => {
    expect(isKidsContent(media({ kids: true }))).toBe(true);
    // Mesmo com gênero adulto, a flag manual vence
    expect(isKidsContent(media({ kids: true, genre: ['Terror'] }))).toBe(true);
  });

  it('bloqueia rating 18+ ou adult', () => {
    expect(isKidsContent(media({ rating: '18', genre: ['Animação'] }))).toBe(false);
    expect(isKidsContent(media({ rating: 'L18', genre: ['Animation'] }))).toBe(false);
    expect(isKidsContent(media({ adult: true, genre: ['Family'] } as Partial<Media>))).toBe(false);
  });

  it('genre_ids: ID bloqueante (27 terror) → false mesmo com ID kids', () => {
    // 16 = Animation (kids), 27 = Horror (bloqueante) → exclusão tem prioridade
    expect(isKidsContent(media({ genre_ids: [16, 27] }))).toBe(false);
    expect(isKidsContent(media({ genre_ids: [80] }))).toBe(false); // Crime
  });

  it('genre_ids: ID kids (16/10751/10762) → true', () => {
    expect(isKidsContent(media({ genre_ids: [16] }))).toBe(true);
    expect(isKidsContent(media({ genre_ids: [10751] }))).toBe(true); // Family
    expect(isKidsContent(media({ genre_ids: [10762] }))).toBe(true); // Kids
  });

  it('genre texto: adulto bloqueia, kids-safe aceita', () => {
    expect(isKidsContent(media({ genre: ['Terror'] }))).toBe(false);
    expect(isKidsContent(media({ genre: ['Crime', 'Animação'] }))).toBe(false); // adulto prioriza
    expect(isKidsContent(media({ genre: ['Animação'] }))).toBe(true);
    expect(isKidsContent(media({ genre: ['Family'] }))).toBe(true);
  });

  it('genre texto normalizado (acento/caixa)', () => {
    expect(isKidsContent(media({ genre: ['animacao'] }))).toBe(true);
    expect(isKidsContent(media({ genre: ['ANIMAÇÃO'] }))).toBe(true);
  });

  it('sem gêneros nem flag → false (seguro)', () => {
    expect(isKidsContent(media({}))).toBe(false);
    expect(isKidsContent(media({ genre: [], genre_ids: [] }))).toBe(false);
  });
});

describe('filterKidsContent', () => {
  it('mantém só conteúdo kids', () => {
    const list = [
      media({ title: 'A', genre: ['Animação'] }),
      media({ title: 'B', genre: ['Terror'] }),
      media({ title: 'C', kids: true }),
      media({ title: 'D', genre_ids: [16] }),
      media({ title: 'E', genre_ids: [27] }),
    ];
    const kids = filterKidsContent(list).map((m) => m.title);
    expect(kids).toEqual(['A', 'C', 'D']);
  });

  it('lista vazia → vazia', () => {
    expect(filterKidsContent([])).toEqual([]);
  });
});
