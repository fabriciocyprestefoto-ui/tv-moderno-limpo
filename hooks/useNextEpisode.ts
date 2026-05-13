/**
 * useNextEpisode.ts — Hook that fetches data for the next episode when a series is playing.
 *
 * Extraído de LegacyApp.tsx para isolar a lógica de episódios da UI.
 */

import { useState, useEffect } from 'react';
import { Media, Page } from '../types';
import { getEpisodeStreamUrl, getNextEpisode } from '../services/streamService';

interface NextEpisodeData {
  title: string;
  season: number;
  episode: number;
  stream_url?: string;
}

interface UseNextEpisodeOptions {
  currentPage: Page;
  selectedMedia: Media | null;
  userId: string | undefined;
}

export function useNextEpisode({ currentPage, selectedMedia, userId }: UseNextEpisodeOptions) {
  const [nextEpisodeData, setNextEpisodeData] = useState<NextEpisodeData | null>(null);

  useEffect(() => {
    if (currentPage !== Page.PLAYER || !selectedMedia || selectedMedia.type !== 'series') {
      setNextEpisodeData(null);
      return;
    }

    const season = Number((selectedMedia as any).season_number || 0);
    const episode = Number((selectedMedia as any).episode_number || 0);
    if (!(season > 0 && episode > 0)) {
      setNextEpisodeData(null);
      return;
    }

    let cancelled = false;

    const fetchNext = async () => {
      if (selectedMedia.tmdb_id) {
        const result = await getNextEpisode(selectedMedia.tmdb_id, season, episode, userId);
        if (!cancelled && result) {
          setNextEpisodeData({
            title: result.title,
            season: result.season,
            episode: result.episode,
            stream_url: result.stream_url,
          });
          return;
        }
      }

      const nextUrl = await getEpisodeStreamUrl(
        selectedMedia.title,
        season,
        episode + 1,
        selectedMedia.tmdb_id
      );
      if (!cancelled) {
        setNextEpisodeData(
          nextUrl
            ? {
                title: `Episódio ${episode + 1}`,
                season,
                episode: episode + 1,
                stream_url: nextUrl,
              }
            : null
        );
      }
    };

    fetchNext();
    return () => {
      cancelled = true;
    };
  }, [currentPage, selectedMedia, userId]);

  return { nextEpisodeData, setNextEpisodeData };
}
