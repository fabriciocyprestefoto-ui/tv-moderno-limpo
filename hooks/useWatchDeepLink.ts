import { useEffect, useRef, MutableRefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import type { UserProfile, Media } from '../types';
import { fetchMovieById, fetchSeriesById } from '../services/tmdb';

interface UseWatchDeepLinkParams {
  pathname: string;
  /** Só para leitura estável; use `searchKey` internamente no efeito. */
  searchParams: URLSearchParams;
  authLoading: boolean;
  user: User | null;
  activeProfile: UserProfile | null;
  isProfileSelected: boolean;
  loading: boolean;
  movies: Media[];
  series: Media[];
  handlePlayMedia: (media: Media) => void | Promise<void>;
  routeNavigate: (to: string, opts?: { replace?: boolean }) => void;
  showToast: (
    msg: string,
    type?: 'info' | 'warning' | 'error' | 'success',
    duration?: number
  ) => void;
  watchConsumedRef: MutableRefObject<string | null>;
}

/**
 * Deep link /watch/:slug — resolve mídia e chama handlePlayMedia (URL permanece em /watch).
 */
export function useWatchDeepLink({
  pathname,
  searchParams,
  authLoading,
  user,
  activeProfile,
  isProfileSelected,
  loading,
  movies,
  series,
  handlePlayMedia,
  routeNavigate,
  showToast,
  watchConsumedRef,
}: UseWatchDeepLinkParams): void {
  const playRef = useRef(handlePlayMedia);
  playRef.current = handlePlayMedia;
  const searchKey = searchParams.toString();

  useEffect(() => {
    const match = pathname.match(/^\/watch\/([^/]+)$/);
    if (!match) {
      watchConsumedRef.current = null;
      return;
    }
    const query = new URLSearchParams(searchKey);
    const pathKey = searchKey ? `${pathname}?${searchKey}` : pathname;
    if (watchConsumedRef.current === pathKey) return;
    if (authLoading || !user || !activeProfile || !isProfileSelected || loading) return;

    const rawSlug = match[1];
    const idNum = parseInt(rawSlug, 10);
    const hasNumericTmdb = Number.isFinite(idNum) && idNum > 0;
    const typeHint = query.get('type');
    const seasonNumber = Number(query.get('season'));
    const episodeNumber = Number(query.get('episode'));
    let cancelled = false;

    void (async () => {
      try {
        let media: Media | null = null;
        const findMovie = () => movies.find((x) => Number(x.tmdb_id) === idNum) ?? null;
        const findSeries = () => series.find((x) => Number(x.tmdb_id) === idNum) ?? null;
        const findByLocalId = () => {
          const decoded = decodeURIComponent(rawSlug);
          return (
            movies.find((x) => String(x.id) === decoded) ||
            series.find((x) => String(x.id) === decoded) ||
            null
          );
        };

        if (hasNumericTmdb) {
          if (typeHint === 'series') media = findSeries();
          else if (typeHint === 'movie') media = findMovie();
          else media = findMovie() || findSeries();

          if (!media) {
            if (typeHint === 'series') {
              try {
                media = await fetchSeriesById(idNum);
              } catch {
                media = null;
              }
            } else if (typeHint === 'movie') {
              try {
                media = await fetchMovieById(idNum);
              } catch {
                media = null;
              }
            } else {
              try {
                media = await fetchMovieById(idNum);
              } catch {
                try {
                  media = await fetchSeriesById(idNum);
                } catch {
                  media = null;
                }
              }
            }
          }
        } else {
          media = findByLocalId();
        }

        if (cancelled) return;
        if (!media) {
          showToast('Conteúdo não encontrado para este link.', 'error');
          routeNavigate('/', { replace: true });
          return;
        }

        if (
          (typeHint === 'series' || media.type === 'series') &&
          Number.isFinite(seasonNumber) &&
          seasonNumber > 0
        ) {
          media = { ...media, season_number: seasonNumber } as Media;
        }
        if (
          (typeHint === 'series' || media.type === 'series') &&
          Number.isFinite(episodeNumber) &&
          episodeNumber > 0
        ) {
          media = { ...media, episode_number: episodeNumber } as Media;
        }

        watchConsumedRef.current = pathKey;
        void playRef.current(media);
      } catch {
        if (!cancelled) {
          showToast('Não foi possível abrir o link.', 'error');
          routeNavigate('/', { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pathname,
    searchKey,
    authLoading,
    user,
    activeProfile,
    isProfileSelected,
    loading,
    movies,
    series,
    routeNavigate,
    showToast,
    watchConsumedRef,
  ]);
}
