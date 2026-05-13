/**
 * platformStorage — abstração de armazenamento persistente.
 *
 * Prioridade:
 * 1. @capacitor/preferences (Capacitor nativo): usa SharedPreferences no Android e
 *    NSUserDefaults no iOS — isolado do WebView localStorage, não exposto via ADB backup
 *    em builds de produção com allowBackup=false.
 * 2. localStorage (fallback web): funciona em browser e Electron.
 *
 * A API é async para ser compatível com ambas as camadas.
 */

type CapacitorStorage = {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
};

let _cap: CapacitorStorage | null = null;
let _capChecked = false;

async function getCapacitorStorage(): Promise<{ plugin: CapacitorStorage } | null> {
  if (_capChecked) return _cap ? { plugin: _cap } : null;
  _capChecked = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      _cap = null;
      return null;
    }

    // Dynamic import — carrega Preferences só no shell nativo.
    const { Preferences } = await import('@capacitor/preferences');
    _cap = Preferences;
  } catch {
    _cap = null;
  }
  return _cap ? { plugin: _cap } : null;
}

export async function storageGet(key: string): Promise<string | null> {
  const cap = await getCapacitorStorage();
  if (cap) {
    const { value } = await cap.plugin.get({ key });
    return value;
  }
  return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
}

export async function storageSet(key: string, value: string): Promise<void> {
  const cap = await getCapacitorStorage();
  if (cap) {
    await cap.plugin.set({ key, value });
    return;
  }
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}

export async function storageRemove(key: string): Promise<void> {
  const cap = await getCapacitorStorage();
  if (cap) {
    await cap.plugin.remove({ key });
    return;
  }
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
}
