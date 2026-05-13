/**
 * features/livetv/hooks/useLiveTVFocus.ts
 * Hook React para gerenciar o estado de foco D-Pad na LiveTV
 */

import { useState, useCallback } from 'react';
import type { LiveTVFocusState, LiveTVFocusArea } from '../tv/liveTVFocusEngine';

interface UseLiveTVFocusOptions {
  categoriesCount: number;
  headerCount: number;
  channelsCount: number;
  epgItemsCount: number;
}

export function useLiveTVFocus(_opts: UseLiveTVFocusOptions) {
  const [focusState, setFocusState] = useState<LiveTVFocusState>({
    area: 'channels',
    sidebarIndex: 0,
    headerIndex: 0,
    channelIndex: 0,
    epgIndex: 0,
  });

  const applyFocus = useCallback((next: LiveTVFocusState) => {
    setFocusState(next);
  }, []);

  const setArea = useCallback((area: LiveTVFocusArea) => {
    setFocusState((prev) => ({ ...prev, area }));
  }, []);

  const setSidebarIndex = useCallback((index: number | ((prev: number) => number)) => {
    setFocusState((prev) => ({
      ...prev,
      sidebarIndex: typeof index === 'function' ? index(prev.sidebarIndex) : index,
    }));
  }, []);

  const setHeaderIndex = useCallback((index: number | ((prev: number) => number)) => {
    setFocusState((prev) => ({
      ...prev,
      headerIndex: typeof index === 'function' ? index(prev.headerIndex) : index,
    }));
  }, []);

  const setChannelIndex = useCallback((index: number | ((prev: number) => number)) => {
    setFocusState((prev) => ({
      ...prev,
      channelIndex: typeof index === 'function' ? index(prev.channelIndex) : index,
    }));
  }, []);

  const setEpgIndex = useCallback((index: number | ((prev: number) => number)) => {
    setFocusState((prev) => ({
      ...prev,
      epgIndex: typeof index === 'function' ? index(prev.epgIndex) : index,
    }));
  }, []);

  return {
    focusState,
    applyFocus,
    setArea,
    setSidebarIndex,
    setHeaderIndex,
    setChannelIndex,
    setEpgIndex,
  };
}
