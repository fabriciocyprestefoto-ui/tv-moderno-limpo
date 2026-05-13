import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Media } from '../types';
import { logger } from '../utils/logger';
import { supabase } from '../services/supabaseService';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import MediaCard from '../components/MediaCard';
import { Search as SearchIcon, X, Film, Tv, Delete } from 'lucide-react';
import { playSelectSound, playNavigateSound } from '../utils/soundEffects';
import { hasPosterAndVideo } from '../utils/mediaUtils';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '-', '⌫'],
  ['ESPAÇO'],
];

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_TYPE = 20;
const CACHE_LIMIT = 30;
const RESULTS_MIN_CARD_PX = 165;
const RESULTS_GAP_PX = 32;

interface SearchProps {
  onSelectMedia: (media: Media) => void;
  onPlayMedia: (media: Media) => void;
}

const normalizeMedia = (item: any, type: 'movie' | 'series'): Media => ({
  ...item,
  type,
  rating: item.rating || 'N/A',
  year: item.year || undefined,
  duration: item.duration || '',
  genre: Array.isArray(item.genre) ? item.genre : [],
  backdrop: item.backdrop || '',
  poster: item.poster || '',
  logo_url: item.logo_url || '',
  stream_url: item.stream_url || item.video_url || item.source_url || item.url || item.link || '',
  video_url: item.video_url || '',
  source_url: item.source_url || '',
  trailer_url: item.trailer_url || '',
  use_trailer: item.use_trailer || false,
  platform: item.platform || '',
  status: item.status || 'published',
  stars: Array.isArray(item.stars) ? item.stars : [],
  director: item.director || '',
  seasons: item.seasons || 0,
  trailer_key: item.trailer_key || '',
  group_title: item.group_title || '',
});

const Search: React.FC<SearchProps> = ({ onSelectMedia, onPlayMedia }) => {
  const { setEnabled } = useSpatialNav();

  useEffect(() => {
    setEnabled(false);
    window.__searchActive = true;
    return () => {
      window.__searchActive = false;
      setEnabled(true);
    };
  }, [setEnabled]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<'all' | 'movie' | 'series'>('all');
  const [hasSearched, setHasSearched] = useState(false);
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);
  const [focusArea, setFocusArea] = useState<'keyboard' | 'filters' | 'results'>('keyboard');
  const [focusedResultIdx, setFocusedResultIdx] = useState(0);
  const [focusedFilterIdx, setFocusedFilterIdx] = useState(0);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearchIdRef = useRef(0);
  const searchCacheRef = useRef<Map<string, Media[]>>(new Map());
  const resultsGridRef = useRef<HTMLDivElement>(null);

  const performSearch = useCallback(async (rawQuery: string, type: 'all' | 'movie' | 'series') => {
    const searchTerm = rawQuery.trim();
    if (searchTerm.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    const cacheKey = `${type}:${searchTerm.toLowerCase()}`;
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached) {
      // LRU: mover para o final ao acessar
      searchCacheRef.current.delete(cacheKey);
      searchCacheRef.current.set(cacheKey, cached);
      setResults(cached);
      setHasSearched(true);
      setLoading(false);
      return;
    }

    const searchId = ++activeSearchIdRef.current;
    setLoading(true);

    try {
      const safeTerm = searchTerm.replace(/[,%()]/g, ' ');
      const moviePromise =
        type === 'all' || type === 'movie'
          ? supabase
              .from('movies')
              .select('*')
              .or(`title.ilike.%${safeTerm}%,description.ilike.%${safeTerm}%`)
              .limit(MAX_RESULTS_PER_TYPE)
          : Promise.resolve({ data: null, error: null } as any);

      const seriesPromise =
        type === 'all' || type === 'series'
          ? supabase
              .from('series')
              .select('*')
              .or(`title.ilike.%${safeTerm}%,description.ilike.%${safeTerm}%`)
              .limit(MAX_RESULTS_PER_TYPE)
          : Promise.resolve({ data: null, error: null } as any);

      const [movieResp, seriesResp] = await Promise.all([moviePromise, seriesPromise]);

      if (searchId !== activeSearchIdRef.current) return;

      const movieResults: Media[] =
        !movieResp.error && Array.isArray(movieResp.data)
          ? movieResp.data.map((m: any) => normalizeMedia(m, 'movie'))
          : [];
      const seriesResults: Media[] =
        !seriesResp.error && Array.isArray(seriesResp.data)
          ? seriesResp.data.map((s: any) => normalizeMedia(s, 'series'))
          : [];

      const merged = [...movieResults, ...seriesResults];
      // Busca: exibe apenas conteúdo com poster oficial TMDB + link funcional (Supabase)
      const validMedia = merged.filter((m) => hasPosterAndVideo(m));
      setResults(validMedia);
      setHasSearched(true);

      // LRU: inserir no final; se exceder limite remover a entrada menos recente (front)
      searchCacheRef.current.set(cacheKey, validMedia);
      if (searchCacheRef.current.size > CACHE_LIMIT) {
        const lruKey = searchCacheRef.current.keys().next().value;
        if (lruKey !== undefined) searchCacheRef.current.delete(lruKey);
      }
    } catch (error) {
      if (searchId !== activeSearchIdRef.current) return;
      logger.error('[Search] Erro na busca:', error);
      setResults([]);
      setHasSearched(true);
    } finally {
      if (searchId === activeSearchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      activeSearchIdRef.current += 1;
      return;
    }

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      activeSearchIdRef.current += 1;
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      performSearch(trimmed, selectedType);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, selectedType, performSearch]);

  // normalizeRemoteKey importado de hooks/useRemoteControl — centralizado para todo o app

  const handleKeyPress = useCallback((key: string) => {
    playSelectSound();
    if (key === '⌫') {
      setQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (key === 'ESPAÇO') {
      setQuery((prev) => prev + ' ');
      return;
    }
    setQuery((prev) => prev + key.toLowerCase());
  }, []);

  const clearSearch = useCallback(() => {
    activeSearchIdRef.current += 1;
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setLoading(false);
    setFocusArea('keyboard');
    setFocusedRow(0);
    setFocusedCol(0);
    playSelectSound();
  }, []);

  const handleTypeChange = useCallback((type: 'all' | 'movie' | 'series') => {
    setSelectedType(type);
    playSelectSound();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const key = normalizeRemoteKey(e);

      // Bloquear propagação para o GlobalRemoteHandler do App.tsx não interferir
      e.stopImmediatePropagation();

      // Back/Escape: navegação reversa entre áreas → apagar texto → voltar página
      if (key === 'Backspace' || key === 'Escape') {
        e.preventDefault();
        if (focusArea === 'results') {
          // Resultados → volta para filtros
          setFocusArea('filters');
          setFocusedFilterIdx(0);
          playNavigateSound();
          return;
        }
        if (focusArea === 'filters') {
          // Filtros → volta para teclado
          setFocusArea('keyboard');
          setFocusedRow(KEYBOARD_ROWS.length - 1);
          setFocusedCol(0);
          playNavigateSound();
          return;
        }
        // Teclado: se tem texto, apaga última letra; se não, volta à página anterior
        if (query.length > 0) {
          setQuery((prev) => prev.slice(0, -1));
          playSelectSound();
        } else {
          // Sem texto: despacha evento customizado para LegacyApp tratar o back
          // (window.history.back() causava saída do app no TV Box)
          window.dispatchEvent(new CustomEvent('redx-native-back', { cancelable: true }));
        }
        return;
      }

      if (focusArea === 'keyboard') {
        const currentRow = KEYBOARD_ROWS[focusedRow];
        if (key === 'ArrowRight') {
          e.preventDefault();
          playNavigateSound();
          if (focusedCol < currentRow.length - 1) {
            setFocusedCol(focusedCol + 1);
          } else {
            // Circular: volta ao início da linha
            setFocusedCol(0);
          }
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          playNavigateSound();
          if (focusedCol > 0) {
            setFocusedCol(focusedCol - 1);
          } else {
            // Circular: vai ao fim da linha
            setFocusedCol(currentRow.length - 1);
          }
        } else if (key === 'ArrowDown') {
          e.preventDefault();
          playNavigateSound();
          if (focusedRow < KEYBOARD_ROWS.length - 1) {
            const nextRow = KEYBOARD_ROWS[focusedRow + 1];
            setFocusedRow(focusedRow + 1);
            setFocusedCol(Math.min(focusedCol, nextRow.length - 1));
          } else {
            setFocusArea('filters');
            setFocusedFilterIdx(0);
          }
        } else if (key === 'ArrowUp') {
          e.preventDefault();
          playNavigateSound();
          if (focusedRow > 0) {
            const prevRow = KEYBOARD_ROWS[focusedRow - 1];
            setFocusedRow(focusedRow - 1);
            setFocusedCol(Math.min(focusedCol, prevRow.length - 1));
          }
        } else if (key === 'Enter') {
          e.preventDefault();
          const pressedKey = KEYBOARD_ROWS[focusedRow][focusedCol];
          handleKeyPress(pressedKey);
        }
      } else if (focusArea === 'filters') {
        const maxFilterIdx = query ? 3 : 2;
        if (key === 'ArrowRight') {
          e.preventDefault();
          playNavigateSound();
          if (focusedFilterIdx < maxFilterIdx) {
            setFocusedFilterIdx(focusedFilterIdx + 1);
          }
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          playNavigateSound();
          if (focusedFilterIdx > 0) {
            setFocusedFilterIdx(focusedFilterIdx - 1);
          }
        } else if (key === 'ArrowDown') {
          e.preventDefault();
          playNavigateSound();
          if (results.length > 0) {
            setFocusArea('results');
            setFocusedResultIdx(0);
          }
        } else if (key === 'ArrowUp') {
          e.preventDefault();
          playNavigateSound();
          setFocusArea('keyboard');
          setFocusedRow(KEYBOARD_ROWS.length - 1);
          setFocusedCol(0);
        } else if (key === 'Enter') {
          e.preventDefault();
          if (focusedFilterIdx === 0) handleTypeChange('all');
          else if (focusedFilterIdx === 1) handleTypeChange('movie');
          else if (focusedFilterIdx === 2) handleTypeChange('series');
          else if (focusedFilterIdx === 3) clearSearch();
        }
      } else {
        const gridEl = resultsGridRef.current;
        const containerWidth = gridEl ? gridEl.offsetWidth : window.innerWidth * 0.65;
        const cols = Math.max(1, Math.floor(containerWidth / (RESULTS_MIN_CARD_PX + RESULTS_GAP_PX)));
        const totalResults = results.length;
        if (totalResults === 0) {
          setFocusArea('keyboard');
          return;
        }

        if (key === 'ArrowRight') {
          e.preventDefault();
          playNavigateSound();
          if (focusedResultIdx < totalResults - 1) {
            setFocusedResultIdx(focusedResultIdx + 1);
          }
        } else if (key === 'ArrowLeft') {
          e.preventDefault();
          playNavigateSound();
          if (focusedResultIdx > 0) {
            setFocusedResultIdx(focusedResultIdx - 1);
          }
        } else if (key === 'ArrowDown') {
          e.preventDefault();
          playNavigateSound();
          const next = focusedResultIdx + cols;
          if (next < totalResults) setFocusedResultIdx(next);
        } else if (key === 'ArrowUp') {
          e.preventDefault();
          playNavigateSound();
          const prev = focusedResultIdx - cols;
          if (prev >= 0) {
            setFocusedResultIdx(prev);
          } else {
            setFocusArea('filters');
            setFocusedFilterIdx(0);
          }
        } else if (key === 'Enter') {
          e.preventDefault();
          const media = results[focusedResultIdx];
          if (media) {
            playSelectSound();
            onSelectMedia(media);
          }
        }
      }
    };

    // Usar capture phase para garantir que pega o evento ANTES do GlobalRemoteHandler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    focusArea,
    focusedRow,
    focusedCol,
    focusedResultIdx,
    focusedFilterIdx,
    results,
    handleKeyPress,
    onSelectMedia,
    query,
    handleTypeChange,
    clearSearch,
  ]);

  useEffect(() => {
    if (focusArea !== 'results') return;
    const el = document.getElementById(`search-result-${focusedResultIdx}`);
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [focusArea, focusedResultIdx]);

  return (
    <div className="relative min-h-screen w-full text-white overflow-y-auto overflow-x-hidden animate-fade-in">
      {/* Background global herdado do CSS global */}

      <div
        className="relative z-10 w-full max-w-330 mx-auto px-4 md:px-6 py-8 flex flex-col gap-6"
        style={{ paddingTop: '120px' }}
      >
        <div className="text-center transition-opacity duration-300 opacity-100">
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">
            Buscar <span className="text-[rgba(196,164,255,0.95)]">Conteúdo</span>
          </h1>
          <p className="text-sm text-white/40 font-medium mt-1">
            {focusArea === 'keyboard'
              ? '▲▼◄► Navegar   OK Selecionar   ← Apagar'
              : focusArea === 'filters'
                ? '◄► Filtros   ▲ Teclado   ▼ Resultados'
                : '▲▼◄► Navegar   OK Abrir   ← Voltar'}
          </p>
        </div>

        <div className="w-full max-w-3xl mx-auto transition-transform duration-300">
          <div
            className="relative flex items-center gap-3 px-5 py-3.5 rounded-2xl border overflow-hidden backdrop-blur-xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)',
              borderColor: query ? 'rgba(196,164,255,0.65)' : 'rgba(255,255,255,0.14)',
              boxShadow: query
                ? '0 0 0 1px rgba(196,164,255,0.22), 0 10px 28px rgba(46,18,86,0.35)'
                : '0 6px 20px rgba(0,0,0,0.28)',
            }}
          >
            <SearchIcon className="text-[rgba(196,164,255,0.78)] text-base shrink-0" />
            <div className="flex-1 min-h-7 flex items-center">
              {query ? (
                <span className="text-lg font-semibold text-white tracking-wide">
                  {query}
                  <span className="animate-pulse text-[rgba(196,164,255,0.95)] ml-0.5">|</span>
                </span>
              ) : (
                <span className="text-lg text-white/25 italic">Buscar filmes e séries...</span>
              )}
            </div>
            {query && (
              <button
                onClick={clearSearch}
                className="p-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-colors"
              >
                <X className="text-sm text-white/50" />
              </button>
            )}
            {loading && (
              <div className="w-5 h-5 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin shrink-0" />
            )}
          </div>
          {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
            <p className="text-[11px] text-white/40 mt-2 px-1">
              Digite pelo menos {MIN_QUERY_LENGTH} caracteres.
            </p>
          )}
        </div>

        <div className="flex flex-row gap-6 items-stretch">
          <div className="shrink-0 w-155">
            <div
              data-testid="virtual-keyboard"
              className={`rounded-3xl border p-3 md:p-4 space-y-2 backdrop-blur-xl transition-all duration-200 ${focusArea === 'keyboard' ? 'ring-1 ring-[rgba(196,164,255,0.4)]' : ''}`}
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)',
                borderColor:
                  focusArea === 'keyboard' ? 'rgba(196,164,255,0.45)' : 'rgba(196,164,255,0.22)',
                boxShadow:
                  focusArea === 'keyboard'
                    ? '0 16px 44px rgba(12,6,24,0.45), inset 0 1px 0 rgba(255,255,255,0.14), 0 0 20px rgba(109,40,217,0.15)'
                    : '0 16px 44px rgba(12,6,24,0.45), inset 0 1px 0 rgba(255,255,255,0.14)',
              }}
            >
              {KEYBOARD_ROWS.map((row, rowIdx) => (
                <div key={rowIdx} className="flex justify-center gap-1.5 md:gap-2">
                  {row.map((key, colIdx) => {
                    const isFocused =
                      focusArea === 'keyboard' && focusedRow === rowIdx && focusedCol === colIdx;
                    const isSpace = key === 'ESPAÇO';
                    const isBackspace = key === '⌫';

                    return (
                      <button
                        key={`${rowIdx}-${colIdx}`}
                        onClick={() => handleKeyPress(key)}
                        tabIndex={-1}
                        className={`relative rounded-xl font-bold uppercase transition-all duration-150 select-none flex items-center justify-center border ${
                          isSpace
                            ? 'flex-1 h-10 md:h-11 text-[10px] tracking-[0.26em]'
                            : 'w-8.25 h-10 md:w-11.5 md:h-11 text-[11px] md:text-sm'
                        } ${
                          isFocused
                            ? 'scale-[1.05] z-20 text-white border-[rgba(196,164,255,0.75)] shadow-[0_0_0_1px_rgba(196,164,255,0.35),0_0_18px_rgba(109,40,217,0.25)]'
                            : 'text-white/70 border-white/8 hover:text-white hover:bg-white/8'
                        }`}
                        style={{
                          background: isFocused
                            ? 'linear-gradient(145deg, rgba(196,164,255,0.34), rgba(255,255,255,0.08))'
                            : 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))',
                        }}
                      >
                        {isBackspace ? <Delete className="text-base" /> : key}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="flex gap-2 pt-2 border-t border-white/6">
                {[
                  { key: 'all' as const, label: 'Tudo' },
                  { key: 'movie' as const, label: 'Filmes', icon: Film },
                  { key: 'series' as const, label: 'Séries', icon: Tv },
                ].map(({ key, label, icon: Icon }, idx) => {
                  const isFocused = focusArea === 'filters' && focusedFilterIdx === idx;
                  const isActive = selectedType === key;

                  return (
                    <button
                      key={key}
                      onClick={() => handleTypeChange(key)}
                      tabIndex={-1}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        isFocused
                          ? 'scale-[1.03] text-white border-[rgba(196,164,255,0.75)] bg-[rgba(109,40,217,0.4)] shadow-[0_0_15px_rgba(109,40,217,0.3)]'
                          : isActive
                            ? 'text-white border-[rgba(196,164,255,0.6)] bg-[rgba(109,40,217,0.34)]'
                            : 'text-white/40 border-white/6 hover:text-white/70 hover:bg-white/6'
                      }`}
                    >
                      {Icon && <Icon className="text-xs" />}
                      {label}
                    </button>
                  );
                })}
                {query && (
                  <button
                    onClick={clearSearch}
                    tabIndex={-1}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                      focusArea === 'filters' && focusedFilterIdx === 3
                        ? 'scale-[1.03] text-[rgba(196,164,255,0.95)] border-[rgba(196,164,255,0.75)] bg-[rgba(255,255,255,0.1)] shadow-[0_0_15px_rgba(196,164,255,0.2)]'
                        : 'text-white/40 border-white/6 hover:text-[rgba(196,164,255,0.95)] hover:border-[rgba(196,164,255,0.5)]'
                    }`}
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className="flex-1 min-w-0 rounded-3xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl p-5 overflow-y-auto"
          >
            {loading && !hasSearched ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-white/20">
                    Buscando...
                  </span>
                  <div className="h-px flex-1 bg-white/6" />
                </div>
                <div
                  ref={resultsGridRef}
                  className="grid gap-8 items-start"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${RESULTS_MIN_CARD_PX}px, 1fr))` }}
                >
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-2xl overflow-hidden bg-white/5 aspect-[2/3] animate-pulse"
                      style={{ animationDuration: '1.5s' }}
                    />
                  ))}
                </div>
              </div>
            ) : hasSearched && results.length === 0 ? (
              <div className="text-center py-16">
                <SearchIcon className="text-4xl text-white/10 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white/40 mb-1">Nenhum resultado</h3>
                <p className="text-xs text-white/20">Tente outras palavras-chave</p>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-white/30">
                    {results.length} resultado{results.length !== 1 ? 's' : ''}
                  </span>
                  <div className="h-px flex-1 bg-white/6" />
                </div>

                <div
                  ref={resultsGridRef}
                  className="grid gap-8 items-start"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${RESULTS_MIN_CARD_PX}px, 1fr))` }}
                >
                  {results.map((media, index) => {
                    const isResultFocused = focusArea === 'results' && focusedResultIdx === index;
                    return (
                      <div
                        key={`${media.type}-${media.id}`}
                        id={`search-result-${index}`}
                        className={`transition-all duration-150 rounded-2xl ${
                          isResultFocused ? 'scale-[1.03] ring-2 ring-white/35 z-10' : ''
                        }`}
                      >
                        <MediaCard
                          media={media}
                          onClick={() => {
                            playSelectSound();
                            onSelectMedia(media);
                          }}
                          onPlay={() => {
                            playSelectSound();
                            onPlayMedia(media);
                          }}
                          size="md"
                          disableHover
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <SearchIcon className="text-5xl text-white/6 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white/20 mb-1">Busque por conteúdo</h3>
                <p className="text-xs text-white/10">Use o teclado para digitar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Search;
