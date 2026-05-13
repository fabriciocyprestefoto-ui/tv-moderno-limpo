import { describe, it, expect } from 'vitest';
import { normalizeRemoteKey } from '../../hooks/useRemoteControl';

/** Cria um mock de KeyboardEvent com key e/ou keyCode */
function makeEvent(key: string, keyCode = 0): KeyboardEvent {
  return { key, keyCode, which: keyCode } as unknown as KeyboardEvent;
}

describe('normalizeRemoteKey', () => {
  // ── Strings nomeadas (controles com e.key semântico) ──────────────
  it('OK → Enter', () => expect(normalizeRemoteKey(makeEvent('OK'))).toBe('Enter'));
  it('Select → Enter', () => expect(normalizeRemoteKey(makeEvent('Select'))).toBe('Enter'));
  it('Return → Enter', () => expect(normalizeRemoteKey(makeEvent('Return'))).toBe('Enter'));
  it('NumpadEnter → Enter', () =>
    expect(normalizeRemoteKey(makeEvent('NumpadEnter'))).toBe('Enter'));

  it('Up → ArrowUp', () => expect(normalizeRemoteKey(makeEvent('Up'))).toBe('ArrowUp'));
  it('DPAD_UP → ArrowUp', () => expect(normalizeRemoteKey(makeEvent('DPAD_UP'))).toBe('ArrowUp'));
  it('Down → ArrowDown', () => expect(normalizeRemoteKey(makeEvent('Down'))).toBe('ArrowDown'));
  it('DPAD_DOWN → ArrowDown', () =>
    expect(normalizeRemoteKey(makeEvent('DPAD_DOWN'))).toBe('ArrowDown'));
  it('Left → ArrowLeft', () => expect(normalizeRemoteKey(makeEvent('Left'))).toBe('ArrowLeft'));
  it('DPAD_LEFT → ArrowLeft', () =>
    expect(normalizeRemoteKey(makeEvent('DPAD_LEFT'))).toBe('ArrowLeft'));
  it('Right → ArrowRight', () => expect(normalizeRemoteKey(makeEvent('Right'))).toBe('ArrowRight'));
  it('DPAD_RIGHT → ArrowRight', () =>
    expect(normalizeRemoteKey(makeEvent('DPAD_RIGHT'))).toBe('ArrowRight'));

  it('Back → Backspace', () => expect(normalizeRemoteKey(makeEvent('Back'))).toBe('Backspace'));
  it('GoBack → Backspace', () => expect(normalizeRemoteKey(makeEvent('GoBack'))).toBe('Backspace'));
  it('BrowserBack → Backspace', () =>
    expect(normalizeRemoteKey(makeEvent('BrowserBack'))).toBe('Backspace'));

  // ── Keycodes legados (Android TV WebView envia keyCode sem e.key) ─
  it('keyCode 23 → Enter  (DPAD_CENTER)', () =>
    expect(normalizeRemoteKey(makeEvent('', 23))).toBe('Enter'));
  it('keyCode 66 → Enter  (ENTER)', () =>
    expect(normalizeRemoteKey(makeEvent('', 66))).toBe('Enter'));
  it('keyCode 19 → ArrowUp', () => expect(normalizeRemoteKey(makeEvent('', 19))).toBe('ArrowUp'));
  it('keyCode 20 → ArrowDown', () =>
    expect(normalizeRemoteKey(makeEvent('', 20))).toBe('ArrowDown'));
  it('keyCode 21 → ArrowLeft', () =>
    expect(normalizeRemoteKey(makeEvent('', 21))).toBe('ArrowLeft'));
  it('keyCode 22 → ArrowRight', () =>
    expect(normalizeRemoteKey(makeEvent('', 22))).toBe('ArrowRight'));
  it('keyCode 4  → Backspace (KEYCODE_BACK)', () =>
    expect(normalizeRemoteKey(makeEvent('', 4))).toBe('Backspace'));
  it('keyCode 67 → Backspace (KEYCODE_DEL)', () =>
    expect(normalizeRemoteKey(makeEvent('', 67))).toBe('Backspace'));
  it('keyCode 27 → Escape', () => expect(normalizeRemoteKey(makeEvent('', 27))).toBe('Escape'));
  it('keyCode 82 → ContextMenu', () =>
    expect(normalizeRemoteKey(makeEvent('', 82))).toBe('ContextMenu'));

  // ── Passthrough — teclas padrão não devem ser alteradas ──────────
  it('ArrowUp passthrough', () => expect(normalizeRemoteKey(makeEvent('ArrowUp'))).toBe('ArrowUp'));
  it('Enter passthrough', () => expect(normalizeRemoteKey(makeEvent('Enter'))).toBe('Enter'));
  it('Escape passthrough', () => expect(normalizeRemoteKey(makeEvent('Escape'))).toBe('Escape'));
  it('a passthrough', () => expect(normalizeRemoteKey(makeEvent('a'))).toBe('a'));
});
