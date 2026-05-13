import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNumericInput } from '../useNumericInput';

describe('useNumericInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicia com valor vazio', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useNumericInput({ onComplete, maxLength: 3 }));

    expect(result.current.inputValue).toBe('');
    expect(result.current.isActive).toBe(false);
    expect(result.current.displayValue).toBe('   ');
  });

  it('aceita entrada numérica', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useNumericInput({ onComplete, maxLength: 3, timeoutMs: 1000 })
    );

    act(() => {
      result.current.handleKeyPress('1');
    });

    expect(result.current.inputValue).toBe('1');
    expect(result.current.isActive).toBe(true);
  });

  it('chama onComplete após timeout', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useNumericInput({ onComplete, maxLength: 3, timeoutMs: 500 })
    );

    act(() => {
      result.current.handleKeyPress('1');
      result.current.handleKeyPress('2');
    });

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onComplete).toHaveBeenCalledWith('12');
    expect(result.current.inputValue).toBe('');
  });

  it('ignora teclas não-numéricas', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useNumericInput({ onComplete }));

    act(() => {
      result.current.handleKeyPress('a');
    });

    expect(result.current.inputValue).toBe('');
  });

  it('bloqueia entrada após maxLength', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useNumericInput({ onComplete, maxLength: 2 }));

    act(() => {
      result.current.handleKeyPress('1');
      result.current.handleKeyPress('2');
      result.current.handleKeyPress('3');
    });

    expect(result.current.inputValue).toBe('12');
  });

  it('limpa entrada após timeout', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useNumericInput({ onComplete, maxLength: 3, timeoutMs: 500 })
    );

    act(() => {
      result.current.handleKeyPress('1');
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onComplete).toHaveBeenCalledWith('1');
    expect(result.current.inputValue).toBe('');
    expect(result.current.isActive).toBe(false);
  });

  it('cancela entrada corretamente', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() =>
      useNumericInput({ onComplete, onCancel, maxLength: 3, timeoutMs: 500 })
    );

    act(() => {
      result.current.handleKeyPress('1');
      result.current.handleKeyPress('2');
    });

    act(() => {
      result.current.cancel();
    });

    expect(onCancel).toHaveBeenCalled();
    expect(result.current.inputValue).toBe('');
    expect(result.current.isActive).toBe(false);
  });
});
