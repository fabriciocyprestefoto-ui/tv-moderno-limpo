import { useCallback, useEffect, useMemo, useState } from 'react';
import { FutebolEvento } from '@/features/futebol/services/futebolService';

const BROADCAST_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const BROADCAST_CACHE_KEY = 'redx_futebol_broadcast_lookup_v2';

export interface BroadcastMatch {
  channel: string;
  start: string;
  stop: string;
  title: string;
}

export type BroadcastLookup = Record<string, BroadcastMatch>;

interface CachedPayload {
  signature: string;
  timestamp: number;
  lookup: BroadcastLookup;
}

interface UseBroadcastersResult {
  lookup: BroadcastLookup;
  loading: boolean;
  error: string | null;
  sourceUrl: string | null;
  refresh: () => Promise<void>;
}

function buildGamesSignature(jogos: FutebolEvento[]): string {
  return jogos
    .slice(0, 20)
    .map((jogo) => `${jogo.idEvent}|${jogo.dateEvent || ''}|${jogo.strTime || ''}`)
    .join('~');
}

export function useBroadcasters(jogos: FutebolEvento[]): UseBroadcastersResult {
  const [lookup, setLookup] = useState<BroadcastLookup>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>('event-strTVStation');

  const effectiveGames = useMemo(() => jogos.slice(0, 20), [jogos]);
  const gamesSignature = useMemo(() => buildGamesSignature(effectiveGames), [effectiveGames]);

  const readCache = useCallback((signature: string): BroadcastLookup | null => {
    if (typeof window === 'undefined') return null;

    try {
      const raw = window.localStorage.getItem(BROADCAST_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedPayload;
      if (!parsed || typeof parsed.timestamp !== 'number') return null;
      if (Date.now() - parsed.timestamp > BROADCAST_CACHE_TTL_MS) return null;
      if (parsed.signature !== signature) return null;
      return parsed.lookup || null;
    } catch {
      return null;
    }
  }, []);

  const writeCache = useCallback((signature: string, payload: BroadcastLookup) => {
    if (typeof window === 'undefined') return;
    try {
      const cached: CachedPayload = {
        signature,
        timestamp: Date.now(),
        lookup: payload,
      };
      window.localStorage.setItem(BROADCAST_CACHE_KEY, JSON.stringify(cached));
    } catch {
      // best effort
    }
  }, []);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (effectiveGames.length === 0) {
        setLookup({});
        setSourceUrl('event-strTVStation');
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (!forceRefresh) {
          const cached = readCache(gamesSignature);
          if (cached) {
            setLookup(cached);
            setLoading(false);
            return;
          }
        }

        const mapped: BroadcastLookup = {};
        effectiveGames.forEach((jogo) => {
          const channel = (jogo.strTVStation || '').trim();
          if (!jogo.idEvent || !channel) return;
          mapped[jogo.idEvent] = {
            channel,
            start: '',
            stop: '',
            title: `${jogo.strHomeTeam || ''} x ${jogo.strAwayTeam || ''}`.trim(),
          };
        });

        setLookup(mapped);
        setSourceUrl('event-strTVStation');
        writeCache(gamesSignature, mapped);
      } catch {
        setLookup({});
        setSourceUrl('event-strTVStation');
        setError('Falha ao processar transmissões.');
      } finally {
        setLoading(false);
      }
    },
    [effectiveGames, gamesSignature, readCache, writeCache]
  );

  useEffect(() => {
    load(false);
  }, [gamesSignature, load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    lookup,
    loading,
    error,
    sourceUrl,
    refresh,
  };
}
