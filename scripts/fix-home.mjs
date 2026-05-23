import fs from 'fs';
import path from 'path';

const file = 'c:/Users/Fabricio/Desktop/tv-moderno-limpo/pages/Home.tsx';
let content = fs.readFileSync(file, 'utf8');

// The problematic block to remove:
const regex = /  const playablePopularMovies = useMemo\([\s\S]*?\} \|\| \[\];\r?\n/g;
// Actually I'll just use split and join.

const toRemove = `  const playablePopularMovies = useMemo(
    () => orderPlayableCatalogByTmdb(tmdbPopularMovies, effectiveMovies),
    [tmdbPopularMovies, effectiveMovies]
  );

  const playablePopularSeries = useMemo(
    () => orderPlayableCatalogByTmdb(tmdbPopularSeries, effectiveSeries),
    [tmdbPopularSeries, effectiveSeries]
  );`;

content = content.replace(toRemove, '');

const toRemove2 = `      const watchedGenres: string[] = Array.isArray(watched.genre)`;

// Let's reconstruct the personalizedRows block perfectly.
const toReplace = `  // ─── Linhas personalizadas: "Porque você assistiu X" ────────────────────
  const personalizedRows = useMemo(() => {
    if (continueWatchingItems.length === 0) return [];
    const rows: { title: string; items: Media[] }[] = [];
    const usedKeys = new Set<string>();
    const seedItems = continueWatchingItems.slice(0, 3);
    for (const watched of seedItems) {
      const watchedGenres: string[] = Array.isArray(watched.genre)`;

// We'll just search for the broken part and fix it.
// Right now the file has `[tmdbPopularSeries, effectiveSeries]\n  );` followed directly by `      const watchedGenres`

content = content.replace(/  const playablePopularMovies = useMemo\([\s\S]*?const watchedGenres: string\[\] = Array\.isArray\(watched\.genre\)/, 
`  // ─── Linhas personalizadas: "Porque você assistiu X" ────────────────────
  const personalizedRows = useMemo(() => {
    if (continueWatchingItems.length === 0) return [];
    const rows: { title: string; items: Media[] }[] = [];
    const usedKeys = new Set<string>();
    const seedItems = continueWatchingItems.slice(0, 3);
    for (const watched of seedItems) {
      const watchedGenres: string[] = Array.isArray(watched.genre)`);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed Home.tsx');
