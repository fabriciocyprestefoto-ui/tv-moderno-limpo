import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Media, UserProfile } from '../../types';
import { useWatchDeepLink } from '../useWatchDeepLink';

vi.mock('../../services/tmdb', () => ({
  fetchMovieById: vi.fn(),
  fetchSeriesById: vi.fn(),
}));

function HookHarness(props: Parameters<typeof useWatchDeepLink>[0]) {
  useWatchDeepLink(props);
  return null;
}

const baseProfile: UserProfile = {
  id: 'profile-1',
  name: 'Teste',
  avatar: '',
  isKids: false,
};

const baseSeries: Media = {
  id: 'series-10',
  tmdb_id: 10,
  title: 'Serie Teste',
  type: 'series',
};

describe('useWatchDeepLink', () => {
  it('propaga season e episode do link para series', async () => {
    const handlePlayMedia = vi.fn();
    const watchConsumedRef = { current: null as string | null };

    render(
      <HookHarness
        pathname="/watch/10"
        searchParams={new URLSearchParams('type=series&season=2&episode=3')}
        authLoading={false}
        user={{ id: 'user-1' } as any}
        activeProfile={baseProfile}
        isProfileSelected
        loading={false}
        movies={[]}
        series={[baseSeries]}
        handlePlayMedia={handlePlayMedia}
        routeNavigate={vi.fn()}
        showToast={vi.fn()}
        watchConsumedRef={watchConsumedRef}
      />
    );

    await waitFor(() => expect(handlePlayMedia).toHaveBeenCalledTimes(1));
    expect(handlePlayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'series-10',
        season_number: 2,
        episode_number: 3,
      })
    );
    expect(watchConsumedRef.current).toBe('/watch/10?type=series&season=2&episode=3');
  });

  it('não reexecuta quando o caminho completo já foi consumido', async () => {
    const handlePlayMedia = vi.fn();

    render(
      <HookHarness
        pathname="/watch/10"
        searchParams={new URLSearchParams('type=series&season=2&episode=3')}
        authLoading={false}
        user={{ id: 'user-1' } as any}
        activeProfile={baseProfile}
        isProfileSelected
        loading={false}
        movies={[]}
        series={[baseSeries]}
        handlePlayMedia={handlePlayMedia}
        routeNavigate={vi.fn()}
        showToast={vi.fn()}
        watchConsumedRef={{ current: '/watch/10?type=series&season=2&episode=3' }}
      />
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handlePlayMedia).not.toHaveBeenCalled();
  });
});
