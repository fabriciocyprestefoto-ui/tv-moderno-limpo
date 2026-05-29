import { describe, it, expect } from 'vitest';
import {
  isValidImageUrl,
  isValidMedia,
  getMediaDuration,
  isRecentMedia,
  filterOutSeasons,
  detectPlatformFromUrl,
  deduplicateMedia,
  sanitizeTMDBItem,
} from '../mediaUtils';
import type { Media } from '../../types';

const media = (partial: Record<string, unknown>): Media => partial as unknown as Media;

describe('isValidImageUrl', () => {
  it('aceita URLs válidas', () => {
    expect(isValidImageUrl('https://image.tmdb.org/x.jpg')).toBe(true);
    expect(isValidImageUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isValidImageUrl('/img-proxy/poster.jpg')).toBe(true);
  });

  it('rejeita vazias, curtas e com undefined/null', () => {
    expect(isValidImageUrl('')).toBe(false);
    expect(isValidImageUrl(null)).toBe(false);
    expect(isValidImageUrl(undefined)).toBe(false);
    expect(isValidImageUrl('abc')).toBe(false); // < 5 chars
    expect(isValidImageUrl('https://x/undefined.jpg')).toBe(false);
    expect(isValidImageUrl('https://x/null.jpg')).toBe(false);
  });

  it('rejeita esquemas não suportados', () => {
    expect(isValidImageUrl('ftp://x/p.jpg')).toBe(false);
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('isValidMedia', () => {
  it('exige id, title e type válido', () => {
    expect(isValidMedia(media({ id: '1', title: 'X', type: 'movie' }))).toBe(true);
    expect(isValidMedia(media({ id: '1', title: 'X', type: 'series' }))).toBe(true);
  });

  it('rejeita faltando campos ou type inválido', () => {
    expect(isValidMedia(media({ title: 'X', type: 'movie' }))).toBe(false); // sem id
    expect(isValidMedia(media({ id: '1', title: '  ', type: 'movie' }))).toBe(false); // title vazio
    expect(isValidMedia(media({ id: '1', title: 'X', type: 'kids' }))).toBe(false);
  });
});

describe('getMediaDuration', () => {
  it('prioriza duration explícita', () => {
    expect(getMediaDuration(media({ duration: '2h 10m', type: 'movie' }))).toBe('2h 10m');
  });

  it('série com seasons → "N Temp."', () => {
    expect(getMediaDuration(media({ type: 'series', seasons: 3 }))).toBe('3 Temp.');
  });

  it('fallback por tipo', () => {
    expect(getMediaDuration(media({ type: 'movie' }))).toBe('Filme');
    expect(getMediaDuration(media({ type: 'series' }))).toBe('Série');
  });
});

describe('isRecentMedia', () => {
  it('usa year numérico', () => {
    expect(isRecentMedia(media({ year: 2024 }), 2020)).toBe(true);
    expect(isRecentMedia(media({ year: 2019 }), 2020)).toBe(false);
  });

  it('cai para release_date quando year ausente', () => {
    expect(isRecentMedia(media({ release_date: '2023-05-01' }), 2020)).toBe(true);
    expect(isRecentMedia(media({ release_date: '2010-01-01' }), 2020)).toBe(false);
  });

  it('sem dados → false', () => {
    expect(isRecentMedia(media({}), 2020)).toBe(false);
  });
});

describe('filterOutSeasons', () => {
  it('remove entradas de temporada/episódio', () => {
    const list = [
      media({ title: 'Vingadores' }),
      media({ title: 'Temporada 1' }),
      media({ title: 'Season 2' }),
      media({ title: 'S01E05' }),
      media({ title: '2ª Temporada' }),
    ];
    expect(filterOutSeasons(list).map((m) => m.title)).toEqual(['Vingadores']);
  });

  it('remove títulos vazios', () => {
    expect(filterOutSeasons([media({ title: '   ' })])).toEqual([]);
  });
});

describe('detectPlatformFromUrl', () => {
  it('identifica provedores por hostname', () => {
    expect(detectPlatformFromUrl('https://cdn.app/x.m3u8')).toBe('CDN App');
    expect(detectPlatformFromUrl('https://abc.supabase.co/v/x.mp4')).toBe('Supabase');
    expect(detectPlatformFromUrl('https://x.iptv.tv/live')).toBe('IPTV');
  });

  it('null para vazio/ inválido', () => {
    expect(detectPlatformFromUrl(null)).toBeNull();
    expect(detectPlatformFromUrl('')).toBeNull();
    expect(detectPlatformFromUrl('not a url')).toBeNull();
  });
});

describe('deduplicateMedia', () => {
  it('remove duplicados por tmdb_id', () => {
    const list = [
      media({ id: '1', tmdb_id: 100, type: 'movie', title: 'A' }),
      media({ id: '2', tmdb_id: 100, type: 'movie', title: 'A dup' }),
      media({ id: '3', tmdb_id: 200, type: 'movie', title: 'B' }),
    ];
    const out = deduplicateMedia(list);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('A'); // mantém o primeiro
  });
});

describe('sanitizeTMDBItem', () => {
  it('retorna null para item inválido', () => {
    expect(sanitizeTMDBItem(null, 'movie')).toBeNull();
    expect(sanitizeTMDBItem({ id: 1 }, 'movie')).toBeNull(); // sem title
    expect(sanitizeTMDBItem({ title: 'X' }, 'movie')).toBeNull(); // sem id
  });

  it('normaliza campos default', () => {
    const out = sanitizeTMDBItem({ id: 5, title: 'X' }, 'movie');
    expect(out).toMatchObject({ id: 5, poster_path: null, overview: '', vote_average: 0 });
  });

  it('série aceita name no lugar de title', () => {
    expect(sanitizeTMDBItem({ id: 9, name: 'Serie X' }, 'series')).not.toBeNull();
  });
});
