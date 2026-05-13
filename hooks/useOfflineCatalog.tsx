import { useEffect, useState, useCallback } from 'react';
import { logger } from './logger';

const OFFLINE_CATALOG_KEY = 'redx-offline-catalog';
const OFFLINE_TIMESTAMP_KEY = 'redx-offline-timestamp';
const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

interface OfflineCatalog {
  movies: unknown[];
  series: unknown[];
  lastUpdated: number;
}

export const useOfflineCatalog = () => {
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [catalog, setCatalog] = useState<OfflineCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  const saveCatalog = useCallback((data: { movies: unknown[]; series: unknown[] }) => {
    try {
      const offlineData: OfflineCatalog = {
        movies: data.movies || [],
        series: data.series || [],
        lastUpdated: Date.now(),
      };
      localStorage.setItem(OFFLINE_CATALOG_KEY, JSON.stringify(offlineData));
      localStorage.setItem(OFFLINE_TIMESTAMP_KEY, String(Date.now()));
      logger.info('[OfflineCatalog]', 'Catálogo salvo para uso offline');
    } catch (error) {
      logger.warn('[OfflineCatalog]', 'Erro ao salvar catálogo:', error);
    }
  }, []);

  const loadCatalog = useCallback((): OfflineCatalog | null => {
    try {
      const stored = localStorage.getItem(OFFLINE_CATALOG_KEY);
      if (!stored) return null;

      const data: OfflineCatalog = JSON.parse(stored);

      if (Date.now() - data.lastUpdated > OFFLINE_MAX_AGE_MS) {
        logger.info('[OfflineCatalog]', 'Catálogo offline expirado');
        localStorage.removeItem(OFFLINE_CATALOG_KEY);
        return null;
      }

      return data;
    } catch (error) {
      logger.warn('[OfflineCatalog]', 'Erro ao carregar catálogo:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const checkOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOfflineMode(!online);

      if (!online) {
        logger.info('[OfflineCatalog]', 'Modo offline detectado');
        const cached = loadCatalog();
        if (cached) {
          setCatalog(cached);
        }
      } else {
        setCatalog(null);
      }
      setLoading(false);
    };

    checkOnlineStatus();

    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);

    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
    };
  }, [loadCatalog]);

  const getOfflineContent = useCallback(() => {
    if (!catalog) return null;

    const stored = localStorage.getItem(OFFLINE_TIMESTAMP_KEY);
    const age = stored ? Date.now() - parseInt(stored, 10) : null;

    return {
      movies: catalog.movies,
      series: catalog.series,
      isStale: age ? age > OFFLINE_MAX_AGE_MS : false,
      lastUpdated: catalog.lastUpdated,
    };
  }, [catalog]);

  return {
    isOfflineMode,
    loading,
    saveCatalog,
    getOfflineContent,
    hasOfflineData: !!catalog,
  };
};

export const OfflineCatalogProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { isOfflineMode, getOfflineContent, hasOfflineData } = useOfflineCatalog();

  useEffect(() => {
    if (!isOfflineMode && hasOfflineData) {
      const offlineData = getOfflineContent();
      if (offlineData?.isStale) {
        localStorage.removeItem(OFFLINE_CATALOG_KEY);
        localStorage.removeItem(OFFLINE_TIMESTAMP_KEY);
      }
    }
  }, [isOfflineMode, hasOfflineData, getOfflineContent]);

  return <div data-offline={isOfflineMode ? 'true' : 'false'}>{children}</div>;
};
