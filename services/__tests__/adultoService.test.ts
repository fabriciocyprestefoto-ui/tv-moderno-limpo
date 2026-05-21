import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getAdultGroupsFromStreams, parseAdultoTxt } from '@/services/adultoService';

describe('parseAdultoTxt', () => {
  it('parses adulto-data.m3u with titles, logos, groups and stream URLs', () => {
    const raw = readFileSync(resolve(process.cwd(), 'adulto-data.m3u'), 'utf8');
    const streams = parseAdultoTxt(raw);

    expect(streams.length).toBeGreaterThan(0);
    expect(streams[0]).toMatchObject({
      title: expect.any(String),
      stream_url: expect.stringMatching(/^https?:\/\//),
    });

    const groups = getAdultGroupsFromStreams(streams);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some((g) => g.includes('ONLYFANS') || g.includes('ADULTOS'))).toBe(true);
  });
});
