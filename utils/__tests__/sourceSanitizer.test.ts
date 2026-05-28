import { describe, expect, it } from 'vitest';

import {
  isFontezContentUrl,
  removeOldDeadSources,
  sanitizeFontezChannels,
} from '../sourceSanitizer';

const deadUrl = (path: string) => `https://newoneblue${'.site'}${path}`;

describe('sourceSanitizer', () => {
  it('aceita apenas streams de fontez.cc:80', () => {
    expect(isFontezContentUrl('http://fontez.cc:80/live/abc.m3u8')).toBe(true);
    expect(isFontezContentUrl('http://fontez.cc/live/abc.m3u8')).toBe(true);
    expect(isFontezContentUrl(deadUrl('/live/abc.m3u8'))).toBe(false);
    expect(isFontezContentUrl('https://cdn.example.net/live/abc.m3u8')).toBe(false);
  });

  it('remove logo antiga newoneblue sem descartar stream valido', () => {
    const channel = removeOldDeadSources({
      name: 'Canal',
      logo: deadUrl('/images/logo.png'),
      stream_url: 'http://fontez.cc:80/live/canal.m3u8',
    });

    expect(channel).toMatchObject({
      name: 'Canal',
      logo: '',
      stream_url: 'http://fontez.cc:80/live/canal.m3u8',
    });
  });

  it('permite URL final por IP/CDN e descarta apenas stream morto', () => {
    const channels = sanitizeFontezChannels(
      [
        {
          name: 'Valido',
          logo: deadUrl('/images/logo.png'),
          stream_url: 'http://fontez.cc:80/live/ok.m3u8',
        },
        {
          name: 'Redirect IP final',
          stream_url: 'http://205.237.106.34/auth/7142443.m3u8?token=abc',
        },
        {
          name: 'Antigo',
          logo: deadUrl('/images/old.png'),
          stream_url: deadUrl('/live/old.m3u8'),
        },
      ],
      'test'
    );

    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ name: 'Valido', logo: '' });
    expect(channels[1]).toMatchObject({ name: 'Redirect IP final' });
  });
});
