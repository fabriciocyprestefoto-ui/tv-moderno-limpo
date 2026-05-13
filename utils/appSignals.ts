/**
 * appSignals — estado global de baixo nível para coordenação cross-componente.
 *
 * Substitui acesso direto a `window.__X` por funções tipadas.
 * O backing store ainda é window para compatibilidade com Cypress e Android bridge.
 *
 * Uso:
 *   import { setSignal, getSignal } from '@/utils/appSignals';
 *   setSignal('playerActive', true);
 *   if (getSignal('livetvActive')) { ... }
 */

type AppSignals = {
  playerActive: boolean;
  livetvActive: boolean;
  detailsActive: boolean;
  modalKeyTrap: boolean;
  canExitApp: boolean;
  homeReady: boolean;
};

type AppSignalKey = keyof AppSignals;

const WINDOW_KEY_MAP: Record<AppSignalKey, string> = {
  playerActive: '__playerActive',
  livetvActive: '__livetvActive',
  detailsActive: '__detailsActive',
  modalKeyTrap: '__modalKeyTrap',
  canExitApp: '__canExitApp',
  homeReady: '__REDX_HOME_READY',
};

export function setSignal<K extends AppSignalKey>(key: K, value: AppSignals[K]): void {
  (window as unknown as Record<string, unknown>)[WINDOW_KEY_MAP[key]] = value;
}

export function getSignal<K extends AppSignalKey>(key: K): AppSignals[K] {
  return Boolean(
    (window as unknown as Record<string, unknown>)[WINDOW_KEY_MAP[key]]
  ) as AppSignals[K];
}

export function resetSignals(): void {
  for (const wKey of Object.values(WINDOW_KEY_MAP)) {
    (window as unknown as Record<string, unknown>)[wKey] = false;
  }
}
