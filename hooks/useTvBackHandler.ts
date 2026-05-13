import { useEffect, useRef } from 'react';

/**
 * BACK unificado para TV Box / Capacitor:
 * - `redx-native-back` (hardware BACK via MainActivity → __dispatchTVKey__ → goBackInsideApp)
 * - Opcionalmente keydown Escape / Backspace / Back no window (fallback explícito)
 *
 * Sempre chama `preventDefault` em `redx-native-back` cancelável para o
 * GlobalRemoteHandler não cair em fallback perigoso do histórico.
 *
 * `includeKeydown` padrão é **false**: componentes recebem o BACK via evento
 * `redx-native-back` (disparado por useRemoteNavigation), evitando duplo disparo
 * quando ambos os hooks estão ativos na mesma página. Passe `true` apenas em
 * contextos onde useRemoteNavigation não está presente (ex: iframes, micro-frontends).
 */
export function useTvBackHandler(onBack: () => void, options?: { includeKeydown?: boolean }) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const includeKeydown = options?.includeKeydown === true;

  useEffect(() => {
    const onNativeBack = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      onBackRef.current();
    };
    window.addEventListener('redx-native-back', onNativeBack);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = e.key;
      if (k !== 'Escape' && k !== 'Backspace' && k !== 'Back') return;
      const t = (e.target as HTMLElement)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      onBackRef.current();
    };

    if (includeKeydown) {
      window.addEventListener('keydown', onKeyDown, { capture: true });
    }
    return () => {
      window.removeEventListener('redx-native-back', onNativeBack);
      if (includeKeydown) {
        window.removeEventListener('keydown', onKeyDown, { capture: true });
      }
    };
  }, [includeKeydown]);
}
