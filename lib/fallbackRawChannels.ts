import type { Channel } from '@/types';
import { FALLBACK_CHANNEL_CATEGORIES } from '@/data/channelsCatalog';

export function flatFallbackToChannels(): Channel[] {
  const out: Channel[] = [];

  for (const cat of FALLBACK_CHANNEL_CATEGORIES) {
    const category = cat.name.replace(/\s+/g, ' ').trim();
    for (const ch of cat.channels) {
      const number = parseInt(String(ch.number), 10);
      out.push({
        id: ch.id,
        name: ch.name,
        logo: ch.logo,
        category,
        stream_url: ch.video,
        number: Number.isFinite(number) ? number : undefined,
        program: ch.program,
      });
    }
  }

  return out;
}
