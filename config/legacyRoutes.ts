import { Page, Media } from '../types';

export const PATH_TO_PAGE: Record<string, Page> = {
  '/': Page.HOME,
  '/generos': Page.GENRES,
  '/login': Page.LOGIN,
  '/profiles': Page.PROFILES,
  '/filmes': Page.MOVIES,
  '/series': Page.SERIES,
  '/kids': Page.KIDS,
  '/lista': Page.MY_LIST,
  '/busca': Page.SEARCH,
  '/search': Page.SEARCH,
  '/canais': Page.LIVE,
  '/futebol': Page.FUTEBOL,
  '/adulto': Page.ADULTO,
};

export const PAGE_TO_PATH: Partial<Record<Page, string>> = {
  [Page.HOME]: '/',
  [Page.GENRES]: '/generos',
  [Page.MOVIES]: '/filmes',
  [Page.SERIES]: '/series',
  [Page.KIDS]: '/kids',
  [Page.MY_LIST]: '/lista',
  [Page.SEARCH]: '/search',
  [Page.LIVE]: '/canais',
  [Page.FUTEBOL]: '/futebol',
  [Page.ADULTO]: '/adulto',
};

export function pathToLegacyPage(pathname: string): Page | null {
  const path = pathname.replace(/\/$/, '') || '/';
  if (/^\/watch\/[^/]+$/.test(path)) return Page.PLAYER;
  return PATH_TO_PAGE[path] ?? null;
}

export function buildWatchPathForMedia(media: Media): string {
  const tid = Number(media.tmdb_id);
  const slug = Number.isFinite(tid) && tid > 0 ? String(tid) : encodeURIComponent(String(media.id));
  const params = new URLSearchParams();
  params.set('type', media.type === 'series' ? 'series' : 'movie');
  if (media.type === 'series') {
    const sn = Number((media as { season_number?: number }).season_number);
    const en = Number((media as { episode_number?: number }).episode_number);
    if (Number.isFinite(sn) && sn > 0) params.set('season', String(sn));
    if (Number.isFinite(en) && en > 0) params.set('episode', String(en));
  }
  const q = params.toString();
  return `/watch/${slug}${q ? `?${q}` : ''}`;
}
