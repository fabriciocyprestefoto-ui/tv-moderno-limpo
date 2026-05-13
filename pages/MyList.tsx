import React, { useState, useEffect, useCallback } from 'react';
import { Media } from '../types';
import MediaCard from '../components/MediaCard';
import ContinueWatchingRow from '../components/ContinueWatchingRow';
import { Trash2, PlusCircle, Loader2, BookmarkCheck, Clock, History, Play } from 'lucide-react';
import { userService } from '../services/userService';
import { getMoviesByTmdbIds, getSeriesByTmdbIds } from '../services/supabaseService';
import { hasPosterAndVideo } from '../utils/mediaUtils';
import { playSelectSound } from '../utils/soundEffects';
import { logger } from '../utils/logger';
import { useContinueWatching } from '../hooks/useContinueWatching';

interface MyListProps {
  onSelectMedia: (media: Media) => void;
  onPlayMedia?: (media: Media) => void;
  allMedia?: Media[];
}

type ListTab = 'watchlist' | 'watch_later' | 'history' | 'continue_watching';

const COLS_PER_ROW = 6;

const MyList: React.FC<MyListProps> = ({ onSelectMedia, onPlayMedia, allMedia = [] }) => {
  const { items: continueWatchingItems } = useContinueWatching(allMedia);
  const [myList, setMyList] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ListTab>('watchlist');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      // F8: Aba Histórico — buscar do watch_progress
      if (activeTab === 'history') {
        const progressList = await userService.getContinueWatching();
        if (progressList.length === 0) {
          setMyList([]);
          return;
        }

        const allIds = progressList
          .map((p) => Number(p.tmdb_id))
          .filter((id) => Number.isFinite(id) && id > 0);
        const movieIds = progressList
          .filter((p) => p.media_type === 'movie')
          .map((p) => Number(p.tmdb_id))
          .filter((id) => id > 0);
        const seriesIds = progressList
          .filter((p) => p.media_type !== 'movie')
          .map((p) => Number(p.tmdb_id))
          .filter((id) => id > 0);
        // Buscar ambos para IDs sem media_type definido
        const unknownIds = allIds.filter((id) => !movieIds.includes(id) && !seriesIds.includes(id));

        const [moviesResult, seriesResult] = await Promise.all([
          [...movieIds, ...unknownIds].length > 0
            ? getMoviesByTmdbIds([...movieIds, ...unknownIds])
            : Promise.resolve([]),
          [...seriesIds, ...unknownIds].length > 0
            ? getSeriesByTmdbIds([...seriesIds, ...unknownIds])
            : Promise.resolve([]),
        ]);

        const mediaMap = new Map<number, Media>();
        moviesResult
          .filter((m) => Number.isFinite(Number(m.tmdb_id)))
          .forEach((m) =>
            mediaMap.set(Number(m.tmdb_id), { ...(m as any), type: 'movie' as const })
          );
        seriesResult
          .filter((s) => Number.isFinite(Number(s.tmdb_id)))
          .forEach((s) =>
            mediaMap.set(Number(s.tmdb_id), { ...(s as any), type: 'series' as const })
          );

        const seen = new Set<number>();
        const ordered: Media[] = [];
        for (const p of progressList) {
          const id = Number(p.tmdb_id);
          if (seen.has(id) || !mediaMap.has(id)) continue;
          seen.add(id);
          const media = mediaMap.get(id)!;
          if (hasPosterAndVideo(media)) ordered.push(media);
        }
        setMyList(ordered);
        return;
      }

      if (activeTab === 'continue_watching') {
        setMyList([]);
        return;
      }

      const libraryItems = await userService.getLibraryItems(activeTab);
      if (libraryItems.length === 0) {
        setMyList([]);
        return;
      }

      const movieIds: number[] = [];
      const seriesIds: number[] = [];

      libraryItems.forEach((item) => {
        const tmdbId = Number(item.tmdb_id);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;
        if (item.media_type === 'movie') movieIds.push(tmdbId);
        else if (item.media_type === 'tv' || item.media_type === 'series') seriesIds.push(tmdbId);
        else {
          movieIds.push(tmdbId);
          seriesIds.push(tmdbId);
        }
      });

      const [movies, series] = await Promise.all([
        movieIds.length > 0 ? getMoviesByTmdbIds(movieIds) : Promise.resolve([]),
        seriesIds.length > 0 ? getSeriesByTmdbIds(seriesIds) : Promise.resolve([]),
      ]);

      const movieMap = new Map<number, Media>(
        movies
          .filter((m) => Number.isFinite(Number(m.tmdb_id)))
          .map((m) => [Number(m.tmdb_id), { ...(m as any), type: 'movie' as const }])
      );
      const seriesMap = new Map<number, Media>(
        series
          .filter((s) => Number.isFinite(Number(s.tmdb_id)))
          .map((s) => [Number(s.tmdb_id), { ...(s as any), type: 'series' as const }])
      );

      const seen = new Set<string>();
      const ordered: Media[] = [];

      for (const item of libraryItems) {
        const tmdbId = Number(item.tmdb_id);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;

        const preferSeries = item.media_type === 'tv' || item.media_type === 'series';
        const media = preferSeries
          ? seriesMap.get(tmdbId) || movieMap.get(tmdbId)
          : movieMap.get(tmdbId) || seriesMap.get(tmdbId);

        if (!media) continue;

        const dedupeKey = `${media.type}:${media.tmdb_id || media.id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        // REGRA: só exibe se tiver poster E URL de vídeo no Supabase
        if (!hasPosterAndVideo(media)) continue;
        ordered.push(media);
      }

      setMyList(ordered);
    } catch (err) {
      logger.error('[MyList] Erro ao carregar lista:', err);
      setMyList([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleRemove = async (media: Media) => {
    if (activeTab === 'history') return; // Histórico não permite remoção
    setRemovingId(media.id);
    try {
      await userService.toggleLibraryItem(
        Number(media.tmdb_id),
        media.type,
        activeTab as 'watchlist' | 'watch_later'
      );
      setMyList((prev) => prev.filter((m) => m.id !== media.id));
    } catch (err) {
      logger.error('[MyList] Erro ao remover:', err);
    } finally {
      setRemovingId(null);
    }
  };

  const tabs: { id: ListTab; label: string; icon: typeof BookmarkCheck }[] = [
    { id: 'watchlist', label: 'Watchlist', icon: BookmarkCheck },
    { id: 'watch_later', label: 'Assistir Depois', icon: Clock },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'continue_watching', label: 'Continuar Assistindo', icon: Play },
  ];

  const handleTabSelect = (tab: ListTab) => {
    playSelectSound();
    setActiveTab(tab);
  };

  return (
    <>
      <div
        className="relative z-10 w-full max-w-7xl mx-auto space-y-8 pb-20 animate-fade-in px-12"
        style={{ paddingTop: '5cm' }}
      >
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-black">Minha Lista</h1>
          <div className="text-white/40 text-sm font-medium uppercase tracking-[0.2em]">
            {myList.length} {myList.length === 1 ? 'Item Salvo' : 'Itens Salvos'}
          </div>
        </div>

        {/* Tabs — D-Pad navigable */}
        <div className="flex gap-4" data-nav-row={0}>
          {tabs.map((tab, idx) => (
            <button
              key={tab.id}
              data-nav-item
              data-nav-col={idx}
              tabIndex={0}
              onClick={() => handleTabSelect(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleTabSelect(tab.id);
                }
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider transition-all outline-none focus:ring-2 focus:ring-white/35 focus:scale-105 ${
                activeTab === tab.id
                  ? 'bg-white text-black'
                  : 'glass text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Loading — não mostrar no tab continue_watching (tem hook próprio) */}
        {loading && activeTab !== 'continue_watching' && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-white/40" />
          </div>
        )}

        {/* Empty State — não mostrar no tab continue_watching */}
        {!loading && myList.length === 0 && activeTab !== 'continue_watching' && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-white/30">
            <PlusCircle className="w-16 h-16" />
            <p className="text-xl font-bold">
              {activeTab === 'watchlist'
                ? 'Nenhum item na Watchlist'
                : activeTab === 'watch_later'
                  ? 'Nenhum item em Assistir Depois'
                  : 'Nenhum histórico de reprodução'}
            </p>
            <p className="text-sm">
              {activeTab === 'history'
                ? 'Assista filmes e séries para vê-los aqui'
                : 'Adicione filmes e séries usando o botão + nos cards'}
            </p>
          </div>
        )}

        {/* Continuar Assistindo — usa ContinueWatchingRow com progress bars */}
        {activeTab === 'continue_watching' &&
          (continueWatchingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-white/30">
              <Play className="w-16 h-16" />
              <p className="text-xl font-bold">Nada em andamento</p>
              <p className="text-sm">Assista filmes e séries para continuar de onde parou</p>
            </div>
          ) : (
            <ContinueWatchingRow
              items={continueWatchingItems}
              onPlay={(item) => onPlayMedia?.(item)}
              onSelect={(item) => onSelectMedia(item)}
              rowIndex={2}
            />
          ))}

        {/* Grid — each card is D-Pad navigable */}
        {!loading && myList.length > 0 && activeTab !== 'continue_watching' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
            {myList.map((m, idx) => {
              const visualRow = Math.floor(idx / COLS_PER_ROW);
              const colInRow = idx % COLS_PER_ROW;
              return (
                <div
                  key={m.id}
                  className="relative group"
                  data-nav-row={1 + visualRow}
                  data-nav-item
                  data-nav-col={colInRow}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      playSelectSound();
                      onSelectMedia(m);
                    }
                  }}
                >
                  <MediaCard
                    media={m}
                    onClick={() => onSelectMedia(m)}
                    onPlay={onPlayMedia ? () => onPlayMedia(m) : undefined}
                    size="md"
                    disableHover
                  />
                  {activeTab !== 'history' && (
                    <button
                      disabled={removingId === m.id}
                      onClick={() => handleRemove(m)}
                      tabIndex={-1}
                      className="absolute -top-3 -right-3 w-9 h-9 rounded-full glass border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all hover:bg-red-500/30 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50"
                    >
                      {removingId === m.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default MyList;
