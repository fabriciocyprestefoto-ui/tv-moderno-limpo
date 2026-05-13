/**
 * Home — géneros fixos e etiquetas para filtro Supabase (.overlaps em genre[]).
 * Imagens: sempre derivadas de poster_path/backdrop_path TMDB após enrichWithTMDB.
 */

import { Media } from '../types';
import { removeDuplicates, sortByRating, normalizeGenreKey } from '../utils/catalogUtils';
import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';

/** Ordem de exibição na Home (títulos em PT-BR). */
export const HOME_GENRE_DISPLAY_ORDER = [
  'Ação',
  'Comédia',
  'Romance',
  'Terror',
  'Suspense',
  'Super-heróis',
  'Drama',
  'Policial',
  'Ficção Científica',
  'Animação',
] as const;

export type HomeGenreLabel = (typeof HOME_GENRE_DISPLAY_ORDER)[number];

/** Chave normalizada → rótulo canónico da Home */
const NORMALIZED_TO_HOME = new Map<string, HomeGenreLabel>();

function registerSynonyms(label: HomeGenreLabel, synonyms: string[]): void {
  const keys = new Set<string>([normalizeGenreKey(label), ...synonyms.map(normalizeGenreKey)]);
  keys.forEach((k) => {
    if (k) NORMALIZED_TO_HOME.set(k, label);
  });
}

registerSynonyms('Drama', ['drama']);
registerSynonyms('Ação', ['acao', 'action']);
registerSynonyms('Comédia', ['comedia', 'comedy']);
registerSynonyms('Suspense', ['suspense', 'thriller']);
registerSynonyms('Terror', ['terror', 'horror', 'terror/suspense']);
registerSynonyms('Romance', ['romance']);
registerSynonyms('Ficção Científica', [
  'ficcao cientifica',
  'ficcao científica',
  'science fiction',
  'sci fi',
  'sci-fi',
]);
registerSynonyms('Animação', ['animacao', 'animation', 'desenho', 'desenhos']);
registerSynonyms('Policial', ['policial', 'crime', 'investigação', 'investigacao']);
registerSynonyms('Super-heróis', [
  'super-herois',
  'super-heroi',
  'marvel',
  'dc',
  'super hero',
  'hero',
]);

/**
 * Valores para filtro Supabase `overlaps('genre', ...)` (ex.: painel admin ou scripts).
 * A Home filtra géneros no cliente a partir do catálogo completo.
 */
export const HOME_GENRE_SUPABASE_TAGS: string[] = Array.from(
  new Set<string>([
    ...HOME_GENRE_DISPLAY_ORDER,
    'drama',
    'acao',
    'açao',
    'comédia',
    'comedia',
    'suspense',
    'terror',
    'romance',
    'aventura',
    'animação',
    'animacao',
    'fantasia',
    'Action',
    'Adventure',
    'Animation',
    'Comedy',
    'Drama',
    'Fantasy',
    'Horror',
    'Romance',
    'Science Fiction',
    'Thriller',
    'Sci-Fi',
    'Ficção científica',
    'Ficção Científica',
  ])
);

export function mapRawGenreToHomeLabel(raw: string): HomeGenreLabel | null {
  const k = normalizeGenreKey(raw);
  return NORMALIZED_TO_HOME.get(k) ?? null;
}

/**
 * Converte `?genre=` da URL (encoded, sinónimos EN/PT) no rótulo canónico da Home.
 */
export function resolveGenreQueryParam(raw: string): HomeGenreLabel | null {
  let decoded = String(raw || '').trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    /* manter string */
  }
  if (!decoded) return null;
  for (const label of HOME_GENRE_DISPLAY_ORDER) {
    if (label === decoded) return label;
  }
  const viaSynonym = mapRawGenreToHomeLabel(decoded);
  if (viaSynonym) return viaSynonym;
  const n = normalizeGenreKey(decoded);
  for (const label of HOME_GENRE_DISPLAY_ORDER) {
    if (normalizeGenreKey(label) === n) return label;
  }
  return null;
}

/** Mínimo de títulos na fileira da Home (filmes ou séries) por gênero. */
export const HOME_GENRE_ROW_MIN = 5;

/**
 * IDs oficiais da API TMDB (filme e TV partilham a maior parte) → rótulos canónicos da Home.
 * Géneros compostos (ex.: Ação e Aventura) podem mapear para mais de um rótulo.
 * @see https://developer.themoviedb.org/reference/genre-movie-list
 */
const TMDB_GENRE_ID_TO_HOME: Partial<Record<number, HomeGenreLabel[]>> = {
  18: ['Drama'],
  28: ['Ação'],
  12: ['Ação'],
  35: ['Comédia'],
  53: ['Suspense'],
  9648: ['Suspense'],
  27: ['Terror'],
  10749: ['Romance'],
  878: ['Ficção Científica'],
  16: ['Animação'],
  14: ['Ficção Científica'],
  /** TV: Action & Adventure */
  10759: ['Ação'],
  /** TV: Sci-Fi & Fantasy */
  10765: ['Ficção Científica'],
  /** Crime / Policial */
  80: ['Policial'],
  /** Super-heróis mapping (often 28 action + 878 sci-fi or similar, but some specific labels exist in catalog) */
};

/**
 * Resolve gêneros da Home: união de `genre_ids` (TMDB) + strings do catálogo.
 * Assim itens com IDs parciais ou rótulos só no Supabase ainda entram nos buckets certos.
 */
export function getHomeLabelsForMedia(item: Media): HomeGenreLabel[] {
  const labels = new Set<HomeGenreLabel>();
  const ids = item.genre_ids;
  if (Array.isArray(ids) && ids.length > 0) {
    for (const raw of ids) {
      const id = Number(raw);
      if (!Number.isFinite(id)) continue;
      const mapped = TMDB_GENRE_ID_TO_HOME[id];
      if (mapped) {
        for (const l of mapped) labels.add(l);
      }
    }
  }
  if (Array.isArray(item.genre)) {
    for (const g of item.genre) {
      if (!g) continue;
      // Suporte para gêneros compostos do catálogo Supabase: "Filmes | Ação", "Séries / Drama"
      const parts = String(g)
        .split(/[|/]/)
        .map((p) => p.trim())
        .filter(Boolean);
      for (const part of parts) {
        const label = mapRawGenreToHomeLabel(part);
        if (label) labels.add(label);
      }
    }
  }
  return Array.from(labels);
}

/**
 * Agrupa itens pelos géneros da Home (cada item pode aparecer em vários géneros).
 * Classificação: API TMDB (`genre_ids` após enrich) com fallback às strings do catálogo.
 */
export function buildHomeGenreMap(items: Media[]): Map<HomeGenreLabel, Media[]> {
  const map = new Map<HomeGenreLabel, Media[]>();
  for (const label of HOME_GENRE_DISPLAY_ORDER) {
    map.set(label, []);
  }

  for (const item of items) {
    const homeLabels = getHomeLabelsForMedia(item);
    const seenLabels = new Set<HomeGenreLabel>();
    for (const label of homeLabels) {
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      map.get(label)!.push(item);
    }
  }

  for (const label of HOME_GENRE_DISPLAY_ORDER) {
    map.set(label, removeDuplicates(map.get(label)!).sort(sortByRating));
  }

  return map;
}

/** Uma linha na página Gêneros: bucket da Home ou gênero textual do catálogo sem mapeamento Home. */
export type GenresPageBucket = {
  /** `h:Ação` | `r:<chave normalizada>` */
  key: string;
  /** Título na UI (URL `?genre=` para buckets `raw`) */
  displayTitle: string;
  items: Media[];
  kind: 'home' | 'raw';
  homeLabel: HomeGenreLabel | null;
};

/**
 * Lista todos os gêneros com pelo menos um título: buckets da Home (ordem fixa) +
 * strings do campo `genre[]` que não mapeiam para um rótulo Home (A–Z por título).
 */
export function buildGenresPageBuckets(items: Media[]): GenresPageBucket[] {
  const homeMap = buildHomeGenreMap(items);
  const rawBuckets = new Map<string, { display: string; list: Media[] }>();

  for (const item of items) {
    if (!Array.isArray(item.genre)) continue;
    for (const g of item.genre) {
      if (!g) continue;
      const parts = String(g)
        .split(/[|/]/)
        .map((p) => p.trim())
        .filter(Boolean);
      for (const part of parts) {
        if (mapRawGenreToHomeLabel(part)) continue;
        const nk = normalizeGenreKey(part);
        if (!nk) continue;
        let b = rawBuckets.get(nk);
        if (!b) {
          b = { display: part.trim(), list: [] };
          rawBuckets.set(nk, b);
        }
        b.list.push(item);
      }
    }
  }

  for (const [, b] of rawBuckets) {
    b.list = removeDuplicates(b.list).sort(sortByRating);
  }

  const rows: GenresPageBucket[] = [];

  // Sempre listar os 10 gêneros da Home (mesmo com 0 títulos), para a página Gêneros nunca ficar sem cartões.
  for (const label of HOME_GENRE_DISPLAY_ORDER) {
    const list = homeMap.get(label)!;
    rows.push({
      key: `h:${label}`,
      displayTitle: label,
      items: list,
      kind: 'home',
      homeLabel: label,
    });
  }

  const rawSorted = Array.from(rawBuckets.entries()).sort((a, b) =>
    a[1].display.localeCompare(b[1].display, 'pt', { sensitivity: 'base' })
  );
  for (const [nk, b] of rawSorted) {
    if (b.list.length === 0) continue;
    rows.push({
      key: `r:${nk}`,
      displayTitle: b.display,
      items: b.list,
      kind: 'raw',
      homeLabel: null,
    });
  }

  return rows;
}

// ─── Chave de identidade canônica (usada para deduplicação cross-row) ─────────
export function mediaKey(item: Media): string {
  return item.tmdb_id
    ? `tmdb:${item.type}:${item.tmdb_id}`
    : `fallback:${item.type}:${stripDiacriticsSafe(String(item.title || ''))
        .toLowerCase()
        .trim()}:${item.year || 0}`;
}

/**
 * Score composto para ordenar itens dentro de um gênero.
 * 65% rating TMDB (0–10) + 35% recência normalizada (1990–hoje).
 */
function compositeScore(item: Media): number {
  const rating = Math.min(Math.max(parseFloat(String(item.rating || '0')), 0), 10);
  const currentYear = new Date().getFullYear();
  const year = Math.min(item.year || 2000, currentYear + 1);
  const recency = Math.max(0, (year - 1990) / Math.max(currentYear - 1990, 1));
  return rating * 0.65 + recency * 10 * 0.35;
}

/**
 * Distribui itens de forma EXCLUSIVA entre gêneros:
 * cada item aparece em **no máximo 1** linha de gênero (evita repetição entre linhas).
 *
 * Algoritmo:
 * 1. Ordena todos os candidatos por score (rating × 0.65 + recência × 0.35)
 * 2. Para cada item (do mais pontuado ao menos): atribui ao gênero que o aceita
 *    e que tem MENOS itens no momento (load-balancing)
 * 3. Itens já exibidos nas linhas "Em Alta / Aclamados / Novidades" (passados em
 *    `excludedKeys`) são pulados na primeira passagem
 * 4. Segunda passagem: gêneros com < MIN_ITEMS são completados com os itens
 *    restantes mais bem pontuados (aceita overlap com outras linhas se necessário)
 *
 * @param items     Filmes + séries já filtrados (poster + URL válidos)
 * @param excludedKeys Chaves de itens já exibidos em linhas superiores
 */
export function buildExclusiveHomeGenreMap(
  items: Media[],
  excludedKeys: Set<string> = new Set()
): Map<HomeGenreLabel, Media[]> {
  const MIN_ITEMS = 5; // mínimo por linha de gênero

  const map = new Map<HomeGenreLabel, Media[]>();
  for (const label of HOME_GENRE_DISPLAY_ORDER) map.set(label, []);

  // Ordena por score desc; mantém lista estável para segunda passagem
  const candidates = removeDuplicates(items)
    .map((item) => ({
      item,
      key: mediaKey(item),
      labels: getHomeLabelsForMedia(item),
      score: compositeScore(item),
    }))
    .filter((c) => c.labels.length > 0)
    .sort((a, b) => b.score - a.score);

  const assigned = new Set<string>();

  // ── Passagem 1: distribuição exclusiva ──────────────────────────────────
  for (const { item, key, labels } of candidates) {
    if (assigned.has(key) || excludedKeys.has(key)) continue;

    // Escolhe o gênero desta item com MENOS itens (load-balancing)
    let bestLabel: HomeGenreLabel | null = null;
    let minCount = Infinity;
    for (const label of labels) {
      const count = map.get(label)!.length;
      if (count < minCount) {
        minCount = count;
        bestLabel = label;
      }
    }
    if (bestLabel) {
      map.get(bestLabel)!.push(item);
      assigned.add(key);
    }
  }

  // ── Passagem 2: preenche gêneros abaixo do mínimo ──────────────────────
  for (const label of HOME_GENRE_DISPLAY_ORDER) {
    const bucket = map.get(label)!;
    if (bucket.length >= MIN_ITEMS) continue;

    const needed = MIN_ITEMS - bucket.length;
    const bucketKeys = new Set(bucket.map((b) => mediaKey(b)));

    // Candidatos que pertencem a este gênero e ainda não estão no bucket
    const fillers = candidates
      .filter((c) => c.labels.includes(label) && !bucketKeys.has(c.key))
      .slice(0, needed);

    for (const { item } of fillers) bucket.push(item);
  }

  // ── Ordena cada bucket por score (melhor avaliado + mais recente em cima) ──
  for (const [label, bucket] of map.entries()) {
    map.set(
      label,
      bucket.sort((a, b) => compositeScore(b) - compositeScore(a))
    );
  }

  return map;
}

/** Mínimos para páginas dedicadas (/filmes, /series) — dispara ampliação de catálogo no loader. */
export const PAGE_MIN_MOVIES = 100;
export const PAGE_MIN_SERIES = 100;
export const PAGE_MIN_KIDS = 100;

export function countWithTmdbId(items: Media[]): number {
  return items.filter((m) => Number((m as any).tmdb_id) > 0).length;
}
