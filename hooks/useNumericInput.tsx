import { useState, useCallback, useEffect, useRef } from 'react';

interface UseNumericInputOptions {
  maxLength?: number;
  timeoutMs?: number;
  onComplete: (value: string) => void;
  onCancel?: () => void;
}

interface UseNumericInputReturn {
  inputValue: string;
  isActive: boolean;
  displayValue: string;
  handleKeyPress: (key: string) => void;
  cancel: () => void;
  clear: () => void;
}

export function useNumericInput({
  maxLength = 3,
  timeoutMs = 1000,
  onComplete,
  onCancel,
}: UseNumericInputOptions): UseNumericInputReturn {
  // useRef como fonte de verdade síncrona — evita stale closure quando múltiplas
  // teclas chegam no mesmo batch do React (ex.: act() em testes ou repeat-rate de controles TV)
  const inputValueRef = useRef('');
  const [inputValue, setInputValueState] = useState('');
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Mantém ref e state sempre sincronizados
  const setInputValue = useCallback((val: string) => {
    inputValueRef.current = val;
    setInputValueState(val);
  }, []);

  const clearTimeoutFn = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyPress = useCallback(
    (key: string) => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;

      // Reset se passou mais tempo que o timeout entre teclas
      if (timeSinceLastKey > timeoutMs && inputValueRef.current.length > 0) {
        setInputValue('');
      }

      lastKeyTimeRef.current = now;
      setIsActive(true);

      if (!/^\d$/.test(key)) return;

      // Lê do ref — sempre o valor mais atual, mesmo dentro de batch de renders
      const currentValue = inputValueRef.current;
      if (currentValue.length >= maxLength) return;

      const newValue = currentValue + key;
      setInputValue(newValue);
      clearTimeoutFn();

      timeoutRef.current = setTimeout(() => {
        // Lê do ref no momento do disparo — captura o valor final acumulado
        const finalValue = inputValueRef.current;
        if (finalValue.length > 0) {
          onCompleteRef.current(finalValue);
          setInputValue('');
          setIsActive(false);
        }
      }, timeoutMs);
    },
    // inputValue removido das deps — lemos do ref diretamente (sem stale closure)
    [maxLength, timeoutMs, clearTimeoutFn, setInputValue]
  );

  const cancel = useCallback(() => {
    clearTimeoutFn();
    setInputValue('');
    setIsActive(false);
    onCancel?.();
  }, [clearTimeoutFn, setInputValue, onCancel]);

  const clear = useCallback(() => {
    clearTimeoutFn();
    setInputValue('');
    setIsActive(false);
  }, [clearTimeoutFn, setInputValue]);

  useEffect(() => {
    return () => clearTimeoutFn();
  }, [clearTimeoutFn]);

  const displayValue = inputValue.padEnd(maxLength, ' ');

  return { inputValue, isActive, displayValue, handleKeyPress, cancel, clear };
}

export function useDpadNumericInput(options: UseNumericInputOptions): UseNumericInputReturn {
  const numericInput = useNumericInput(options);

  const handleKeyEvent = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key;

      if (key === 'Escape' || key === 'Backspace') {
        numericInput.cancel();
        return;
      }

      if (/^\d$/.test(key)) {
        numericInput.handleKeyPress(key);
      }
    },
    [numericInput]
  );

  useEffect(() => {
    if (!numericInput.isActive) return undefined;
    window.addEventListener('keydown', handleKeyEvent, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyEvent, { capture: true });
  }, [numericInput.isActive, handleKeyEvent]);

  return numericInput;
}

interface NumericInputOverlayProps {
  displayValue: string;
  isActive: boolean;
  label?: string;
}

export function NumericInputOverlay({
  displayValue,
  isActive,
  label = 'Canal',
}: NumericInputOverlayProps): React.ReactElement | null {
  if (!isActive || !displayValue.trim()) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        padding: '20px 40px',
        borderRadius: '12px',
        border: '2px solid #8b5cf6',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          color: '#a78bfa',
          fontSize: '14px',
          marginBottom: '8px',
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: '#fff',
          fontSize: '48px',
          fontWeight: 'bold',
          letterSpacing: '8px',
          textAlign: 'center',
          fontFamily: 'monospace',
        }}
      >
        {displayValue}
      </div>
    </div>
  );
}
