import fs from 'fs';

const file = 'c:/Users/Fabricio/Desktop/tv-moderno-limpo/pages/Home.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
content = content.replace(
  "import { getProviderTmdbIds, fetchMoviesByTrending, fetchSeriesByTrending } from '../services/tmdb';",
  "import { getProviderTmdbIds, fetchTop100PopularIds, fetchTop100TopRatedIds, fetchTop100NewestIds } from '../services/tmdb';"
);

// 2. State variables
content = content.replace(
  "  const [tmdbPopularMovies, setTmdbPopularMovies] = useState<Media[]>([]);\n  const [tmdbPopularSeries, setTmdbPopularSeries] = useState<Media[]>([]);",
  "  const [tmdbPopularIds, setTmdbPopularIds] = useState<number[]>([]);\n  const [tmdbTopRatedIds, setTmdbTopRatedIds] = useState<number[]>([]);\n  const [tmdbNewestIds, setTmdbNewestIds] = useState<number[]>([]);"
);

// 3. Remove !isKidsContent logic from homeMovies / homeSeries
content = content.replace(
  "const homeMovies = useMemo(() => (movies || []).filter((item) => !isKidsContent(item)), [movies]);",
  "const homeMovies = useMemo(() => movies || [], [movies]);"
);
content = content.replace(
  "const homeSeries = useMemo(() => (series || []).filter((item) => !isKidsContent(item)), [series]);",
  "const homeSeries = useMemo(() => series || [], [series]);"
);
content = content.replace(
  "const homeTrendingMovies = useMemo(\n    () => (trendingMovies || []).filter((item) => !isKidsContent(item)),\n    [trendingMovies]\n  );",
  "const homeTrendingMovies = useMemo(() => trendingMovies || [], [trendingMovies]);"
);
content = content.replace(
  "const homeTrendingSeries = useMemo(\n    () => (trendingSeries || []).filter((item) => !isKidsContent(item)),\n    [trendingSeries]\n  );",
  "const homeTrendingSeries = useMemo(() => trendingSeries || [], [trendingSeries]);"
);

// 4. Change orderPlayableCatalogByTmdb to orderPlayableCatalogByIds
content = content.replace(
  "function orderPlayableCatalogByTmdb(trending: Media[], catalog: Media[]): Media[] {\n  const byTmdb = new Map<number, Media>();\n  for (const item of catalog) {\n    if (!hasPosterAndVideo(item)) continue;\n    const id = Number(item.tmdb_id);\n    if (Number.isFinite(id) && id > 0 && !byTmdb.has(id)) byTmdb.set(id, item);\n  }\n  return trending\n    .map((item) => byTmdb.get(Number(item.tmdb_id)))\n    .filter((item): item is Media => Boolean(item));\n}",
  "function orderPlayableCatalogByIds(ids: number[], catalog: Media[]): Media[] {\n  const byTmdb = new Map<number, Media>();\n  for (const item of catalog) {\n    if (!hasPosterAndVideo(item)) continue;\n    const id = Number(item.tmdb_id);\n    if (Number.isFinite(id) && id > 0 && !byTmdb.has(id)) byTmdb.set(id, item);\n  }\n  return ids\n    .map((id) => byTmdb.get(id))\n    .filter((item): item is Media => Boolean(item));\n}"
);

// 5. Replace the massive sorting block (playablePopularMovies -> newestSeries)
const startSearch = "  const playablePopularMovies = useMemo(";
const endSearch = "  // ─── Linhas personalizadas: \"Porque você assistiu X\" ────────────────────";
const startIndex = content.indexOf(startSearch);
const endIndex = content.indexOf(endSearch);

if (startIndex !== -1 && endIndex !== -1) {
  const newBlock = `  const playablePopular = useMemo(
    () => orderPlayableCatalogByIds(tmdbPopularIds, homeAllMedia),
    [tmdbPopularIds, homeAllMedia]
  );

  const playableTopRated = useMemo(
    () => orderPlayableCatalogByIds(tmdbTopRatedIds, homeAllMedia),
    [tmdbTopRatedIds, homeAllMedia]
  );

  const playableNewest = useMemo(
    () => orderPlayableCatalogByIds(tmdbNewestIds, homeAllMedia),
    [tmdbNewestIds, homeAllMedia]
  );

  const platformLabel = selectedPlatform || '';

`;
  content = content.substring(0, startIndex) + newBlock + content.substring(endIndex);
}

// 6. Update useEffect fetching
const fetchSearch = `Promise.all([fetchMoviesByTrending(), fetchSeriesByTrending()])
        .then(([moviesData, seriesData]) => {
          if (!cancelled) {
            if (moviesData?.results) {
              setTmdbPopularMovies(moviesData.results.map((m: any) => transformTMDBItem(m, 'movie')));
            }
            if (seriesData?.results) {
              setTmdbPopularSeries(seriesData.results.map((s: any) => transformTMDBItem(s, 'series')));
            }
          }
        })`;

const newFetch = `Promise.all([
        fetchTop100PopularIds(),
        fetchTop100TopRatedIds(),
        fetchTop100NewestIds()
      ])
        .then(([popular, topRated, newest]) => {
          if (!cancelled) {
            setTmdbPopularIds(popular);
            setTmdbTopRatedIds(topRated);
            setTmdbNewestIds(newest);
          }
        })`;

if (content.includes(fetchSearch)) {
    content = content.replace(fetchSearch, newFetch);
} else {
    console.warn("Could not find fetch block to replace!");
}

// 7. Remove isKidsContent from personalized rows
content = content.replace(
  "const seedItems = continueWatchingItems.filter((item) => !isKidsContent(item)).slice(0, 3);",
  "const seedItems = continueWatchingItems.slice(0, 3);"
);

// 8. Update boolean conditions for isHomeEmpty
content = content.replace(
  "tmdbPopularMovies.length === 0 &&\n      tmdbPopularSeries.length === 0",
  "playablePopular.length === 0 &&\n      playableTopRated.length === 0"
);
content = content.replace(
  "tmdbPopularMovies.length,\n      tmdbPopularSeries.length",
  "playablePopular.length,\n      playableTopRated.length"
);

// 9. Update JSX Rendering
content = content.replace(
    /\{\s*playablePopularMovies\.length > 0 && \(\s*<LazyRow estimatedHeight=\{220\}>\s*<MovieRow\s*title=\{`(.*?) Em Alta`\}\s*items=\{playablePopularMovies\}\s*\/>\s*<\/LazyRow>\s*\)\s*\}/,
    "{playablePopular.length > 0 && (<LazyRow estimatedHeight={220}><MovieRow title={`🔥 Top 100 Populares`} items={playablePopular}/></LazyRow>)}"
);

content = content.replace(
    /\{\s*playablePopularSeries\.length > 0 && \(\s*<LazyRow estimatedHeight=\{220\}>\s*<MovieRow\s*title=\{`(.*?) Em Alta`\}\s*items=\{playablePopularSeries\}\s*\/>\s*<\/LazyRow>\s*\)\s*\}/,
    ""
);

content = content.replace(
    /\{\s*topRatedMovies\.length > 0 && \(\s*<LazyRow estimatedHeight=\{220\}>\s*<MovieRow\s*title=\{`(.*?) Filmes Aclamados`\}\s*items=\{topRatedMovies\}\s*\/>\s*<\/LazyRow>\s*\)\s*\}/,
    "{playableTopRated.length > 0 && (<LazyRow estimatedHeight={220}><MovieRow title={`⭐ Top 100 Mais Bem Avaliados`} items={playableTopRated}/></LazyRow>)}"
);

content = content.replace(
    /\{\s*topRatedSeries\.length > 0 && \(\s*<LazyRow estimatedHeight=\{220\}>\s*<MovieRow\s*title=\{`(.*?) Séries Imperdíveis`\}\s*items=\{topRatedSeries\}\s*\/>\s*<\/LazyRow>\s*\)\s*\}/,
    ""
);

content = content.replace(
    /\{\s*newestMovies\.length > 0 && \(\s*<LazyRow estimatedHeight=\{220\}>\s*<MovieRow\s*title=\{`(.*?) Filmes Lançamentos`\}\s*items=\{newestMovies\}\s*\/>\s*<\/LazyRow>\s*\)\s*\}/,
    "{playableNewest.length > 0 && (<LazyRow estimatedHeight={220}><MovieRow title={`🆕 Lançamentos`} items={playableNewest}/></LazyRow>)}"
);

content = content.replace(
    /\{\s*newestSeries\.length > 0 && \(\s*<LazyRow estimatedHeight=\{220\}>\s*<MovieRow\s*title=\{`(.*?) Séries Lançamentos`\}\s*items=\{newestSeries\}\s*\/>\s*<\/LazyRow>\s*\)\s*\}/,
    ""
);


fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated Home.tsx!');
