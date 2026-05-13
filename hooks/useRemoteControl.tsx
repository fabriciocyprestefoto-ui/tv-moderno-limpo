/**
 * useRemoteControl — Centraliza mapeamento de keycodes de controle remoto Android TV.
 *
 * Keycodes relevantes (Android KeyEvent):
 *   23 = KEYCODE_DPAD_CENTER / OK
 *   66 = KEYCODE_ENTER
 *   21 = KEYCODE_DPAD_LEFT
 *   22 = KEYCODE_DPAD_RIGHT
 *   19 = KEYCODE_DPAD_UP
 *   20 = KEYCODE_DPAD_DOWN
 *    4 = KEYCODE_BACK
 *   67 = KEYCODE_DEL (Back em alguns fabricantes)
 *
 * Problema resolvido: cada componente que registrava `onKeyDown` nativo recebia
 * `e.key === 'OK'` ou numérico do TV Box, ficando "surdo" a eventos padronizados.
 * Com `normalizeRemoteKey`, todos recebem 'Enter', 'ArrowLeft', etc. — compatível
 * com teclado físico e controle remoto ao mesmo tempo.
 */

/**
 * Extrai o keyCode legado de um evento de teclado — compatível com
 * KeyboardEvent nativo e React.KeyboardEvent (via nativeEvent).
 *
 * keyCode/which são depreciados mas Android TV WebViews os enviam sem e.key.
 */
function extractKeyCode(e: KeyboardEvent | React.KeyboardEvent): number {
  // React.KeyboardEvent expõe o evento DOM original via nativeEvent
  const native = 'nativeEvent' in e ? e.nativeEvent : (e as KeyboardEvent);
  return native.keyCode || native.which || 0;
}

/** Normaliza um KeyboardEvent de controle remoto/TV Box para teclas DOM padrão. */
export function normalizeRemoteKey(e: KeyboardEvent | React.KeyboardEvent): string {
  const code = extractKeyCode(e);
  const key = e.key || '';

  // OK / Select / Enter do controle remoto (strings e keycodes)
  if (
    key === 'OK' ||
    key === 'OS_OK' ||
    key === 'Select' ||
    key === 'Return' ||
    key === 'NumpadEnter' ||
    code === 23 ||
    code === 66
  )
    return 'Enter';

  // D-Pad direcional — strings nomeadas (alguns fabricantes/WebViews) e keycodes
  if (key === 'Left' || key === 'DPAD_LEFT' || code === 21) return 'ArrowLeft';
  if (key === 'Right' || key === 'DPAD_RIGHT' || code === 22) return 'ArrowRight';
  if (key === 'Up' || key === 'DPAD_UP' || code === 19) return 'ArrowUp';
  if (key === 'Down' || key === 'DPAD_DOWN' || code === 20) return 'ArrowDown';

  // Back / tecla voltar (strings e keycodes)
  if (key === 'Back' || key === 'GoBack' || key === 'BrowserBack' || code === 4 || code === 67)
    return 'Backspace';

  // Escape / keyCode 27
  if (code === 27) return 'Escape';

  // Menu button (alguns fabricantes)
  if (code === 82) return 'ContextMenu';

  return key;
}

/**
 * Hook que retorna um handler `onKeyDown` já normalizado.
 * Uso:
 *   const { handleKeyDown } = useRemoteControl((key, e) => { ... });
 */
export function useRemoteControl(onKey: (key: string, e: React.KeyboardEvent) => void) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const normalized = normalizeRemoteKey(e);
    onKey(normalized, e);
  };

  return { handleKeyDown, normalizeRemoteKey };
}

export default useRemoteControl;
