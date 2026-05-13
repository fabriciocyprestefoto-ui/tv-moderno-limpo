/**
 * exitConfirmManager — estado global do modal de confirmação de saída
 * Permite que qualquer ponto do app (App.tsx, LegacyApp.tsx, Player.tsx)
 * dispare o modal de confirmação de saída via teclado/receptor D-pad.
 *
 * Fluxo:
 *  1. App.tsx escuta botão Voltar do Android (Capacitor App plugin)
 *  2. App.tsx chama window.__requestExitApp()
 *  3. LegacyApp (que contém useExitConfirm) responde expondo window.__showExitConfirmModal()
 *  4. App.tsx renderiza ExitConfirmModal overlay
 */

import { setSignal } from './appSignals';

type ExitConfirmState = {
  visible: boolean;
  setVisible: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

let _state: ExitConfirmState | null = null;

export function registerExitConfirmManager(state: ExitConfirmState) {
  _state = state;

  // Cleanup on app unmount
  window.__unregisterExitConfirm?.();
  window.__unregisterExitConfirm = () => {
    _state = null;
  };
}

/** App.tsx (Capacitor listener) chama isto para pedir confirmação */
export function requestExitApp() {
  if (_state) {
    _state.setVisible(true);
  }
  // Disparar evento para o modal global que App.tsx renderiza
  window.dispatchEvent(new CustomEvent('redx-request-exit'));
}

/** LegacyApp confirma → sai do app */
export function confirmExitApp() {
  if (_state) _state.setVisible(false);
  setSignal('canExitApp', true);
  window.dispatchEvent(new CustomEvent('redx-confirm-exit'));
}

/** LegacyApp cancela */
export function cancelExitApp() {
  if (_state) _state.setVisible(false);
}

// Globals para bridge entre módulos
declare global {
  interface Window {
    __canExitApp?: boolean;
    __requestExitApp?: () => void;
    __showExitConfirmModal?: () => void;
    __unregisterExitConfirm?: () => void;
  }
}

window.__requestExitApp = requestExitApp;
