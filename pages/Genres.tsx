import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTVBox } from '../utils/tvBoxDetector';
import {
  Badge,
  BookOpen,
  Compass,
  Eye,
  Film,
  Ghost,
  Heart,
  Rocket,
  Shield,
  Smile,
  Sparkles,
  Sword,
  Theater,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Media } from '../types';
import MediaCard from '../components/MediaCard';
import StreamingPlatforms from '../components/StreamingPlatforms';
import {
  buildGenresPageBuckets,
  type GenresPageBucket,
  type HomeGenreLabel,
} from '../config/homeCatalog';
import { hasPosterAndVideo } from '../utils/mediaUtils';
import { playSelectSound } from '../utils/soundEffects';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';
import { matchesPlatform } from '../config/platformConfig';

interface GenresProps {
  movies: Media[];
  series: Media[];
  onSelectMedia: (media: Media) => void;
  onPlayMedia?: (media: Media) => void;
}

type GenreTheme = {
  title: string;
  icon: LucideIcon;
  gradient: string;
};

const GENRE_STYLES = {
  acao: {
    title: 'Ação e aventura',
    icon: Sword,
    gradient: 'from-red-500/20 to-orange-500/10',
  },
  comedia: {
    title: 'Comédia',
    icon: Smile,
    gradient: 'from-yellow-400/20 to-orange-300/10',
  },
  romance: {
    title: 'Romance',
    icon: Heart,
    gradient: 'from-pink-500/20 to-rose-400/10',
  },
  terror: {
    title: 'Terror',
    icon: Ghost,
    gradient: 'from-purple-800/30 to-black/40',
  },
  suspense: {
    title: 'Suspense',
    icon: Eye,
    gradient: 'from-indigo-500/20 to-purple-500/10',
  },
  superherois: {
    title: 'Super-heróis',
    icon: Shield,
    gradient: 'from-blue-500/20 to-cyan-400/10',
  },
  drama: {
    title: 'Drama',
    icon: Theater,
    gradient: 'from-violet-500/20 to-indigo-400/10',
  },
  policial: {
    title: 'Policial',
    icon: Badge,
    gradient: 'from-blue-900/30 to-slate-700/20',
  },
  ficcao: {
    title: 'Ficção científica',
    icon: Rocket,
    gradient: 'from-cyan-400/20 to-blue-500/10',
  },
  anime: {
    title: 'Anime & animação',
    icon: Sparkles,
    gradient: 'from-fuchsia-500/20 to-pink-400/10',
  },
  documental: {
    title: 'Documentário',
    icon: BookOpen,
    gradient: 'from-emerald-500/20 to-green-400/10',
  },
  familia: {
    title: 'Família',
    icon: Users,
    gradient: 'from-amber-300/20 to-yellow-200/10',
  },
  aventura: {
    title: 'Aventura',
    icon: Compass,
    gradient: 'from-orange-500/20 to-red-400/10',
  },
  cinema: {
    title: 'Cinema',
    icon: Film,
    gradient: 'from-gray-500/20 to-zinc-700/20',
  },
  k4: {
    title: '4K',
    icon: Tv,
    gradient: 'from-sky-400/20 to-blue-300/10',
  },
} satisfies Record<string, GenreTheme>;

type GenreStyleKey = keyof typeof GENRE_STYLES;

const HOME_STYLE_KEYS: Record<HomeGenreLabel, GenreStyleKey> = {
  Ação: 'acao',
  Comédia: 'comedia',
  Romance: 'romance',
  Terror: 'terror',
  Suspense: 'suspense',
  'Super-heróis': 'superherois',
  Drama: 'drama',
  Policial: 'policial',
  'Ficção Científica': 'ficcao',
  Animação: 'anime',
};

const FALLBACK_STYLE_KEYS: GenreStyleKey[] = [
  'acao',
  'comedia',
  'romance',
  'terror',
  'suspense',
  'superherois',
  'drama',
  'policial',
  'ficcao',
  'anime',
  'documental',
  'familia',
  'aventura',
  'cinema',
  'k4',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function normalizeThemeKey(value: string): string {
  return stripDiacriticsSafe(String(value || ''))
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function styleKeyForBucket(b: GenresPageBucket): GenreStyleKey {
  if (b.kind === 'home' && b.homeLabel) return HOME_STYLE_KEYS[b.homeLabel];

  const n = normalizeThemeKey(b.displayTitle);
  if (n.includes('4k') || n.includes('uhd')) return 'k4';
  if (n.includes('document')) return 'documental';
  if (n.includes('famil') || n.includes('kids')) return 'familia';
  if (n.includes('cinema') || n.includes('movie') || n.includes('film')) return 'cinema';
  if (n.includes('aventura') || n.includes('adventure')) return 'aventura';
  if (
    n.includes('super heroi') ||
    n.includes('superhero') ||
    n.includes('marvel') ||
    n.includes('dc')
  )
    return 'superherois';
  if (n.includes('ficcao') || n.includes('sci fi') || n.includes('science fiction'))
    return 'ficcao';
  if (n.includes('anime') || n.includes('animacao') || n.includes('animation')) return 'anime';
  if (n.includes('policial') || n.includes('crime') || n.includes('investig')) return 'policial';
  if (n.includes('suspense') || n.includes('thriller') || n.includes('mist')) return 'suspense';
  if (n.includes('terror') || n.includes('horror')) return 'terror';
  if (n.includes('romance')) return 'romance';
  if (n.includes('comedia') || n.includes('comedy')) return 'comedia';
  if (n.includes('drama')) return 'drama';
  if (n.includes('acao') || n.includes('action')) return 'acao';

  return FALLBACK_STYLE_KEYS[hashString(b.key) % FALLBACK_STYLE_KEYS.length];
}

function themeForBucket(b: GenresPageBucket): GenreTheme {
  return GENRE_STYLES[styleKeyForBucket(b)];
}

function cardTitleForBucket(b: GenresPageBucket): string {
  if (b.kind === 'home' && b.homeLabel) return themeForBucket(b).title;
  return b.displayTitle;
}

const RESULT_BATCH = isTVBox() ? 36 : 60;
const RESULTS_MIN_CARD_PX = 165;
const RESULTS_GAP_PX = 32;
const RESULTS_BASE_ROW = 20;
const GENRE_GRID_BASE_ROW = 3;
const GENRE_RESULT_ACTION_ROW = 19;

function getGenreGridCols(): number {
  if (typeof window === 'undefined') return 4;
  if (window.matchMedia('(min-width: 1280px)').matches) return 4;
  if (window.matchMedia('(min-width: 768px)').matches) return 3;
  return 2;
}

const Genres: React.FC<GenresProps> = ({ movies, series, onSelectMedia, onPlayMedia }) => {
  const navigate = useNavigate();
  const { setPosition } = useSpatialNav();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [visibleResults, setVisibleResults] = useState(RESULT_BATCH);
  const [genreGridCols, setGenreGridCols] = useState(getGenreGridCols);
  const [resultsCols, setResultsCols] = useState(3);
  const resultsSentinelRef = useRef<HTMLDivElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const resultsGridRef = useRef<HTMLDivElement | null>(null);

  const catalogForGenres = useMemo(() => {
    const merged = [...(movies || []), ...(series || [])].filter((m) => hasPosterAndVideo(m));
    if (!selectedPlatform) return merged;
    return merged.filter((m) => Boolean(m.platform && matchesPlatform(m.platform, selectedPlatform)));
  }, [movies, series, selectedPlatform]);

  const buckets = useMemo(() => buildGenresPageBuckets(catalogForGenres), [catalogForGenres]);

  const rows = useMemo(() => {
    return buckets.map((b) => {
      const theme = themeForBucket(b);
      const title = cardTitleForBucket(b);
      return { bucket: b, key: b.key, ...theme, title };
    });
  }, [buckets]);

  const selectedBucket = useMemo(
    () => (selectedKey ? (buckets.find((b) => b.key === selectedKey) ?? null) : null),
    [buckets, selectedKey]
  );

  const selectedItems = selectedBucket?.items ?? [];

  const visibleSelected = useMemo(
    () => selectedItems.slice(0, visibleResults),
    [selectedItems, visibleResults]
  );

  useEffect(() => {
    setVisibleResults(RESULT_BATCH);
  }, [selectedKey]);

  useEffect(() => {
    const updateCols = () => setGenreGridCols(getGenreGridCols());
    updateCols();
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPosition(rows.length > 0 ? GENRE_GRID_BASE_ROW : GENRE_GRID_BASE_ROW, 0);
    }, 250);
    return () => window.clearTimeout(t);
    // Foco inicial apenas ao montar a página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPosition]);

  useEffect(() => {
    if (!selectedKey) return;
    const el = resultsSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisibleResults((n) => n + RESULT_BATCH);
      },
      { rootMargin: '320px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedKey, visibleSelected.length]);

  useEffect(() => {
    if (!selectedKey) return;
    requestAnimationFrame(() => {
      resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [selectedKey]);

  // Foca primeiro item dos resultados ao selecionar gênero
  useEffect(() => {
    if (!selectedKey) return;
    const t = window.setTimeout(() => {
      setPosition(RESULTS_BASE_ROW, 0);
    }, 150);
    return () => window.clearTimeout(t);
  }, [selectedKey, setPosition]);

  useEffect(() => {
    if (!selectedKey) return;
    const el = resultsGridRef.current;
    if (!el) return;
    const computeCols = () => {
      const w = el.getBoundingClientRect().width;
      setResultsCols(
        Math.max(1, Math.floor((w + RESULTS_GAP_PX) / (RESULTS_MIN_CARD_PX + RESULTS_GAP_PX)))
      );
    };
    computeCols();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(computeCols);
      ro.observe(el);
    } else {
      window.addEventListener('resize', computeCols);
    }
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', computeCols);
    };
  }, [selectedKey]);

  const selectGenre = useCallback((key: string) => {
    playSelectSound();
    setSelectedKey((prev) => (prev === key ? null : key));
  }, []);

  const selectPlatform = useCallback((platformName: string) => {
    playSelectSound();
    setSelectedKey(null);
    setSelectedPlatform((prev) => (prev === platformName ? null : platformName));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = normalizeRemoteKey(e);
      if (k === 'Escape' || k === 'Backspace') {
        if (selectedKey) {
          e.preventDefault();
          setSelectedKey(null);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedKey]);

  return (
    <div className="w-full min-h-screen redx-background text-white pb-24 px-5 md:px-10 lg:px-14 pt-8 md:pt-10 antialiased">
      <header className="max-w-6xl mx-auto mb-6 md:mb-8">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-1">
          Categorias
        </h1>
        <p className="text-sm md:text-base font-bold text-white/45 uppercase tracking-[0.2em] mb-6">
          Gêneros {selectedPlatform ? `· ${selectedPlatform}` : ''}
        </p>
        <div className="rounded-3xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl px-3 py-2">
          <StreamingPlatforms onSelectPlatform={selectPlatform} />
        </div>
        {selectedPlatform && (
          <button
            type="button"
            onClick={() => {
              playSelectSound();
              setSelectedPlatform(null);
              setSelectedKey(null);
            }}
            data-nav-item
            data-nav-row={2}
            data-nav-col={0}
            className="mt-3 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-white/15 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Limpar plataforma
          </button>
        )}
      </header>

      <section className="max-w-6xl mx-auto" aria-labelledby="genres-grid-title">
        <h2 id="genres-grid-title" className="sr-only">
          Lista de gêneros
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
          {rows.map((g, index) => {
            const isActive = selectedKey === g.key;
            const Icon = g.icon;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => selectGenre(g.key)}
                tabIndex={0}
                data-nav-item
                data-nav-row={GENRE_GRID_BASE_ROW + Math.floor(index / genreGridCols)}
                data-nav-col={index % genreGridCols}
                className="group relative rounded-2xl min-h-[132px] md:min-h-[152px] p-6 flex flex-col items-center justify-center overflow-hidden outline-none backdrop-blur-[20px] transition-all duration-300 hover:scale-105 hover:brightness-125 focus-visible:scale-105 focus-visible:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/20"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  boxShadow: isActive
                    ? '0 28px 46px rgba(0,0,0,0.42), 0 0 20px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.25)'
                    : '0 22px 38px rgba(0,0,0,0.32), 0 3px 0 rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.22)',
                }}
              >
                <div
                  className={`absolute inset-0 rounded-2xl opacity-40 blur-xl bg-gradient-to-br ${g.gradient}`}
                  aria-hidden
                />
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${g.gradient} opacity-70 transition-opacity duration-300 group-hover:opacity-95 group-focus-visible:opacity-95`}
                  aria-hidden
                />
                <div
                  className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.08), transparent)',
                  }}
                  aria-hidden
                />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center justify-center text-center">
                  <Icon
                    className="w-10 h-10 md:w-12 md:h-12 text-white mb-3 drop-shadow-[0_0_18px_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110"
                    aria-hidden
                  />
                  <span className="text-white text-sm md:text-base font-medium leading-snug drop-shadow-sm">
                    {g.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {rows.length === 0 && (
          <p className="text-center text-white/40 font-bold uppercase tracking-widest text-xs mt-16">
            Nenhum gênero disponível
          </p>
        )}
      </section>

      {selectedBucket && (
        <section
          ref={resultsTopRef}
          className="max-w-[1400px] mx-auto mt-12 md:mt-16 px-2 md:px-4"
          aria-live="polite"
        >
          <div className="rounded-3xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl p-5 md:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  {cardTitleForBucket(selectedBucket)}
                </h3>
                <p className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mt-1">
                  Filmes e séries
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  tabIndex={0}
                  data-nav-item
                  data-nav-row={GENRE_RESULT_ACTION_ROW}
                  data-nav-col={0}
                  onClick={() => {
                    playSelectSound();
                    const param = selectedBucket.homeLabel ?? selectedBucket.displayTitle;
                    navigate(`/filmes?genre=${encodeURIComponent(param)}`);
                  }}
                  className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Só filmes
                </button>
                <button
                  type="button"
                  tabIndex={0}
                  data-nav-item
                  data-nav-row={GENRE_RESULT_ACTION_ROW}
                  data-nav-col={1}
                  onClick={() => {
                    playSelectSound();
                    const param = selectedBucket.homeLabel ?? selectedBucket.displayTitle;
                    navigate(`/series?genre=${encodeURIComponent(param)}`);
                  }}
                  className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-violet-400/35 bg-violet-500/15 hover:bg-violet-500/25 transition-colors"
                >
                  Só séries
                </button>
                <button
                  type="button"
                  tabIndex={0}
                  data-nav-item
                  data-nav-row={GENRE_RESULT_ACTION_ROW}
                  data-nav-col={2}
                  onClick={() => {
                    playSelectSound();
                    setSelectedKey(null);
                  }}
                  className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider text-white/50 hover:text-white border border-transparent hover:border-white/15 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>

            {visibleSelected.length === 0 ? (
              <p className="text-center py-16 text-white/35 font-bold uppercase tracking-widest text-sm">
                Nenhum título com vídeo e pôster neste gênero
              </p>
            ) : (
              <div
                ref={resultsGridRef}
                className="grid gap-8 items-start"
                style={{
                  gridTemplateColumns: `repeat(${resultsCols}, minmax(${RESULTS_MIN_CARD_PX}px, 1fr))`,
                }}
              >
                {visibleSelected.map((m, idx) => {
                  const row = Math.floor(idx / resultsCols);
                  const col = idx % resultsCols;
                  return (
                    <div
                      key={`${m.type}-${m.tmdb_id || m.id}-${idx}`}
                      data-nav-row={RESULTS_BASE_ROW + row}
                      className="rounded-xl outline-none"
                      data-nav-media-card
                    >
                      <MediaCard
                        media={m}
                        onClick={() => {
                          playSelectSound();
                          onSelectMedia(m);
                        }}
                        onPlay={onPlayMedia ? () => onPlayMedia(m) : undefined}
                        colIndex={col}
                        disableHover
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {selectedItems.length > visibleResults && (
              <div
                ref={resultsSentinelRef}
                className="w-full py-10 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white/35"
              >
                Carregando mais…
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="max-w-6xl mx-auto mt-14 md:mt-20">
        <h3 className="text-lg md:text-xl font-black text-white/90 tracking-tight">
          Coleções em destaque
        </h3>
        <p className="text-xs font-bold text-white/35 uppercase tracking-[0.22em] mt-2">
          Na página inicial há fileiras temáticas e recomendações
        </p>
      </footer>
    </div>
  );
};

export default Genres;
