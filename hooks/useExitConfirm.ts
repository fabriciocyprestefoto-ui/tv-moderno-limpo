/**
 * useExitConfirm.ts — Hook that manages the TV exit-confirmation dialog.
 *
 * Extraído de LegacyApp.tsx para isolar a lógica de confirmação de saída da TV.
 */

import { useState, useEffect, useRef } from 'react';
import { setSignal } from '../utils/appSignals';
import { Page } from '../types';
import { useSpatialNav } from './useSpatialNavigation';
import { playSelectSound } from '../utils/soundEffects';

interface UseExitConfirmOptions {
  currentPage: Page;
  onBack: () => void;
}

export function useExitConfirm({ currentPage, onBack: _onBack }: UseExitConfirmOptions) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const { pushFocusTrap, popFocusTrap } = useSpatialNav();

  // MOD-02 fix: refs estáveis para não re-executar effect quando functions mudam
  const pushRef = useRef(pushFocusTrap);
  const popRef = useRef(popFocusTrap);
  useEffect(() => {
    pushRef.current = pushFocusTrap;
  }, [pushFocusTrap]);
  useEffect(() => {
    popRef.current = popFocusTrap;
  }, [popFocusTrap]);

  // Clear confirm when navigating away from Home
  useEffect(() => {
    if (currentPage !== Page.HOME) setShowExitConfirm(false);
  }, [currentPage]);

  // Trap focus inside modal when shown — dependência apenas em showExitConfirm
  useEffect(() => {
    if (!showExitConfirm) return undefined;
    pushRef.current('exit-confirm-modal');
    return () => popRef.current();
  }, [showExitConfirm]);

  const confirmExit = () => {
    playSelectSound();
    setShowExitConfirm(false);
    setSignal('canExitApp', true);
  };

  const cancelExit = () => {
    playSelectSound();
    setShowExitConfirm(false);
  };

  const requestExit = () => {
    const isCapacitor = !!window.Capacitor;

    if (showExitConfirm) {
      setSignal('canExitApp', true);
    } else if (isCapacitor) {
      setShowExitConfirm(true);
    } else {
      setSignal('canExitApp', true);
    }
  };

  return { showExitConfirm, setShowExitConfirm, confirmExit, cancelExit, requestExit };
}
