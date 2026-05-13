// Indexa imagens locais em src_clean/fut e expõe utilitários para encontrá-las
// IMPORTANT: não adiciona comentários extras no código-base

import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';

function slugify(input: string): string {
  return stripDiacriticsSafe(String(input || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const files = import.meta.glob('../fut/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

type ImageRecord = { path: string; url: string; base: string };

const ALL: ImageRecord[] = Object.entries(files).map(([path, mod]) => {
  const url = String(mod);
  const base = path.split('/').pop() || path;
  return { path, url, base: base.toLowerCase() };
});

function includesAll(hay: string, needles: string[]) {
  return needles.every((n) => hay.includes(n));
}

export function getMatchImage(home: string, away: string): string | null {
  const h = slugify(home);
  const a = slugify(away);
  const preferred = ALL.find(
    (f) => f.base.startsWith(`hero_${h}-${a}`) || f.base.startsWith(`thumb_${h}-${a}`)
  );
  if (preferred) return preferred.url;
  const containsBoth = ALL.find((f) => includesAll(f.base, [h, a]));
  return containsBoth ? containsBoth.url : null;
}

export function getTeamHero(team: string): string | null {
  const s = slugify(team);
  const exact = ALL.find(
    (f) =>
      f.base.startsWith(`hero_${s}`) || f.base.startsWith(`banner_${s}`) || f.base === `${s}.webp`
  );
  if (exact) return exact.url;
  const contains = ALL.find((f) => f.base.includes(s));
  return contains ? contains.url : null;
}

export function listLocalImages(): string[] {
  return ALL.map((f) => f.url);
}

export function listMatchImages(): Array<{ url: string; base: string }> {
  const filtered = ALL.filter((f) => /\.(png|jpg|jpeg|webp)$/.test(f.base));
  return filtered.map((f) => ({ url: f.url, base: f.base.replace(/\.(png|jpg|jpeg|webp)$/i, '') }));
}

export function friendlyTitle(base: string): string {
  const name = base
    .replace(/^hero[_-]/i, '')
    .replace(/^thumb[_-]/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function getNovaPastaImages(max = 30): Promise<string[]> {
  const folder = '/Nova%20pasta/';
  const pad = (n: number) => String(n).padStart(3, '0');
  const names: string[] = [];
  for (let i = 1; i <= max; i++) {
    names.push(`Prime_Video_${pad(i)}.png`);
    names.push(`Prime_Video_${pad(i)} (1).png`);
  }
  const urls = names.map((n) => `${folder}${encodeURI(n).replace(/%20/g, ' ')}`);
  const checks = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u, { method: 'GET' });
        return res.ok ? u : null;
      } catch {
        return null;
      }
    })
  );
  return checks.filter((u): u is string => Boolean(u));
}

async function readFolderIndex(folder: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${folder}index.json`, { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((x) => String(x)).filter((x) => x && typeof x === 'string');
    }
  } catch {}
  return null;
}

export async function getBannertImages(max = 60): Promise<string[]> {
  const folder = '/bannert/';
  const manifest = await readFolderIndex(folder);
  if (manifest && manifest.length > 0) {
    return manifest.map((f) => `${folder}${f}`);
  }
  const pad = (n: number) => String(n).padStart(3, '0');
  const names: string[] = [];
  for (let i = 1; i <= max; i++) {
    names.push(`Prime_Video_${pad(i)}.jpg`);
    names.push(`Prime_Video_${pad(i)}.png`);
  }
  return names.map((n) => `${folder}${encodeURI(n).replace(/%20/g, ' ')}`);
}

export async function getFutPublicImages(max = 300): Promise<string[]> {
  const folder = '/fut/';
  const manifest = await readFolderIndex(folder);
  if (manifest && manifest.length > 0) {
    return manifest.map((f) => `${folder}${f}`);
  }
  const pad = (n: number) => String(n).padStart(3, '0');
  const names: string[] = [];
  for (let i = 1; i <= max; i++) {
    names.push(`Prime_Video_${pad(i)}.jpg`);
    names.push(`Prime_Video_${pad(i)}.png`);
  }
  return names.map((n) => `${folder}${encodeURI(n).replace(/%20/g, ' ')}`);
}
