/**
 * Testes para useRemoteControl e normalizeRemoteKey.
 *
 * normalizeRemoteKey já é testado em utils/__tests__/remoteKeyUtils.test.ts
 * para keycodes Android. Aqui validamos o comportamento do HOOK em si:
 * que o handler chama o callback com a tecla já normalizada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import useRemoteControl, { normalizeRemoteKey } from '../useRemoteControl';

// Componente auxiliar que usa o hook e exibe a última tecla normalizada
function TestComponent({ onKey }: { onKey: (key: string) => void }) {
  const { handleKeyDown } = useRemoteControl(onKey);
  return <div data-testid="target" tabIndex={0} onKeyDown={handleKeyDown} />;
}

describe('useRemoteControl hook', () => {
  it('passa teclas DOM padrão sem alteração', () => {
    const onKey = vi.fn();
    const { getByTestId } = render(<TestComponent onKey={onKey} />);
    const el = getByTestId('target');

    fireEvent.keyDown(el, { key: 'ArrowRight' });
    expect(onKey).toHaveBeenCalledWith('ArrowRight', expect.anything());
  });

  it('normaliza "OK" → "Enter"', () => {
    const onKey = vi.fn();
    const { getByTestId } = render(<TestComponent onKey={onKey} />);

    fireEvent.keyDown(getByTestId('target'), { key: 'OK' });
    expect(onKey).toHaveBeenCalledWith('Enter', expect.anything());
  });

  it('normaliza "OS_OK" → "Enter"', () => {
    const event = new KeyboardEvent('keydown', { key: 'OS_OK' });

    expect(normalizeRemoteKey(event)).toBe('Enter');
  });

  it('normaliza keyCode legado DPAD_CENTER → "Enter"', () => {
    const event = new KeyboardEvent('keydown');
    Object.defineProperty(event, 'keyCode', { value: 23 });
    Object.defineProperty(event, 'which', { value: 23 });

    expect(normalizeRemoteKey(event)).toBe('Enter');
  });

  it('normaliza "Back" → "Backspace"', () => {
    const onKey = vi.fn();
    const { getByTestId } = render(<TestComponent onKey={onKey} />);

    fireEvent.keyDown(getByTestId('target'), { key: 'Back' });
    expect(onKey).toHaveBeenCalledWith('Backspace', expect.anything());
  });

  it('normaliza "Up" → "ArrowUp"', () => {
    const onKey = vi.fn();
    const { getByTestId } = render(<TestComponent onKey={onKey} />);

    fireEvent.keyDown(getByTestId('target'), { key: 'Up' });
    expect(onKey).toHaveBeenCalledWith('ArrowUp', expect.anything());
  });

  it('chama onKey a cada tecla pressionada', () => {
    const onKey = vi.fn();
    const { getByTestId } = render(<TestComponent onKey={onKey} />);
    const el = getByTestId('target');

    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    fireEvent.keyDown(el, { key: 'Enter' });

    expect(onKey).toHaveBeenCalledTimes(3);
  });
});
