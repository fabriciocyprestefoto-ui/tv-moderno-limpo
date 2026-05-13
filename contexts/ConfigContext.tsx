import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { getAppConfig, updateAppConfig, AppConfigDB } from '../services/supabaseService';
import { logger } from '../utils/logger';

type AppConfig = AppConfigDB;

interface ConfigContextType {
  config: AppConfig;
  updateConfig: (newConfig: Partial<AppConfig>) => Promise<void>;
  isLoading: boolean;
}

const defaultConfig: AppConfig = {
  id: 'default',
  logo_url: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
  primary_color: '#A855F7',
  secondary_color: '#ffffff',
  background_color: '#0a0a0a',
};

const ConfigContext = createContext<ConfigContextType>({
  config: defaultConfig,
  updateConfig: async () => {},
  isLoading: false,
});

const applyTheme = (cfg: AppConfig) => {
  const root = document.documentElement;
  root.style.setProperty('--primary-color', cfg.primary_color);
  root.style.setProperty('--background-color', cfg.background_color);
};

export const ConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(false); // Não bloquear — default já aplicado

  useEffect(() => {
    applyTheme(defaultConfig); // Tema default imediato
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    // ⚡ PERFORMANCE: Carregar config em background (não bloqueia primeira pintura)
    const loadConfig = async () => {
      try {
        const data = await getAppConfig();
        if (cancelled) return; // S5: previne setState após unmount
        if (data) {
          setConfig(data);
          applyTheme(data);
        }
      } catch (error) {
        logger.error('Erro ao carregar config:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(() => void loadConfig(), { timeout: 500 });
    } else {
      timeoutId = setTimeout(() => void loadConfig(), 100);
    }
    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const updateConfigLocal = useCallback(
    async (newConfig: Partial<AppConfig>) => {
      const updated = { ...config, ...newConfig };
      setConfig(updated);
      applyTheme(updated);
      try {
        await updateAppConfig(updated);
      } catch (error) {
        logger.error('Erro ao persistir config:', error);
      }
    },
    [config]
  );

  const contextValue = useMemo(
    () => ({
      config,
      updateConfig: updateConfigLocal,
      isLoading,
    }),
    [config, updateConfigLocal, isLoading]
  );

  return <ConfigContext.Provider value={contextValue}>{children}</ConfigContext.Provider>;
};

export const useConfig = () => useContext(ConfigContext);
