import { useEffect } from 'react';
import { Page } from '../types';
import { PATH_TO_PAGE, pathToLegacyPage } from '../config/legacyRoutes';

/**
 * Sincroniza React Router pathname → `currentPage` interno do LegacyApp.
 */
export function useLegacyUrlSync(
  pathname: string,
  authLoading: boolean,
  hasSession: boolean,
  setCurrentPage: (p: Page) => void
): void {
  useEffect(() => {
    if (authLoading || !hasSession) return;
    const path = pathname.replace(/\/$/, '') || '/';
    const mapped = pathToLegacyPage(path);
    if (mapped === Page.PLAYER) {
      setCurrentPage(Page.PLAYER);
      return;
    }
    const pageFromUrl = PATH_TO_PAGE[path];
    if (pageFromUrl) setCurrentPage(pageFromUrl);
  }, [pathname, authLoading, hasSession, setCurrentPage]);
}
