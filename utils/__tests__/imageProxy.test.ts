import { describe, it, expect } from 'vitest';
import { toWebP, getResponsiveImageSrcSet, isProxyUrl, extractOriginalUrl } from '../imageProxy';

describe('toWebP — TMDB direto (sem wsrv)', () => {
  it('poster TMDB https → CDN direta no w342', () => {
    const out = toWebP('https://image.tmdb.org/t/p/original/abc.jpg', 'poster');
    expect(out).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    expect(out).not.toContain('wsrv.nl');
  });

  it('backdrop TMDB https → CDN direta no w1280', () => {
    const out = toWebP('https://image.tmdb.org/t/p/w780/bg.jpg', 'backdrop');
    expect(out).toBe('https://image.tmdb.org/t/p/w1280/bg.jpg');
    expect(out).not.toContain('wsrv.nl');
  });

  it('logo TMDB → inalterada (mantém PNG/SVG transparente)', () => {
    const url = 'https://image.tmdb.org/t/p/w500/logo.png';
    expect(toWebP(url, 'logo')).toBe(url);
  });

  it('origem http insegura → wsrv (evita mixed content)', () => {
    const out = toWebP('http://file.example.com/p.jpg', 'poster');
    expect(out).toContain('wsrv.nl');
    expect(out.startsWith('https://')).toBe(true);
  });

  it('URL já proxy/local/data → inalterada', () => {
    expect(toWebP('https://wsrv.nl/?url=x', 'poster')).toBe('https://wsrv.nl/?url=x');
    expect(toWebP('data:image/png;base64,AAAA', 'poster')).toBe('data:image/png;base64,AAAA');
  });

  it('vazio → vazio', () => {
    expect(toWebP('', 'poster')).toBe('');
    expect(toWebP(null, 'poster')).toBe('');
  });
});

describe('getResponsiveImageSrcSet — TMDB direto', () => {
  it('poster gera srcset TMDB direto (185w/342w), sem wsrv', () => {
    const set = getResponsiveImageSrcSet('https://image.tmdb.org/t/p/original/p.jpg', 'poster');
    expect(set).toBe(
      'https://image.tmdb.org/t/p/w185/p.jpg 185w, https://image.tmdb.org/t/p/w342/p.jpg 342w'
    );
    expect(set).not.toContain('wsrv.nl');
  });

  it('não-TMDB → undefined', () => {
    expect(getResponsiveImageSrcSet('https://outro.com/x.jpg', 'poster')).toBeUndefined();
  });
});

describe('isProxyUrl / extractOriginalUrl', () => {
  it('detecta proxy', () => {
    expect(isProxyUrl('https://wsrv.nl/?url=x')).toBe(true);
    expect(isProxyUrl('https://image.tmdb.org/t/p/w500/x.jpg')).toBe(false);
  });

  it('extrai original de wsrv', () => {
    const proxy = 'https://wsrv.nl/?url=' + encodeURIComponent('image.tmdb.org/t/p/w500/x.jpg');
    expect(extractOriginalUrl(proxy)).toBe('https://image.tmdb.org/t/p/w500/x.jpg');
  });

  it('url não-proxy retorna ela mesma', () => {
    expect(extractOriginalUrl('https://image.tmdb.org/t/p/w500/x.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/x.jpg'
    );
  });
});
