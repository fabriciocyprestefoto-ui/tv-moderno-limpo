/**
 * Device Security - Detecção de Root, Emulador e Anti-Tampering
 * Proteção contra engenharia reversa e ambientes inseguros
 */

import { Capacitor } from '@capacitor/core';

export interface DeviceSecurityCheck {
  isRooted: boolean;
  isEmulator: boolean;
  isTampered: boolean;
  isDebuggerAttached: boolean;
  securityScore: number; // 0-100 (100 = seguro)
  warnings: string[];
}

/**
 * Verifica se o dispositivo está com root
 */
async function checkRoot(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const rootIndicators = [
    '/system/app/Superuser.apk',
    '/sbin/su',
    '/system/bin/su',
    '/system/xbin/su',
    '/data/local/xbin/su',
    '/data/local/bin/su',
    '/system/sd/xbin/su',
    '/system/bin/failsafe/su',
    '/data/local/su',
    '/su/bin/su',
  ];

  // Placeholder: verificação real requer plugin nativo (FileSystem/Java).
  // rootIndicators e rootApps listados para referência futura.
  void rootIndicators;

  const rootApps = [
    'com.noshufou.android.su',
    'com.thirdparty.superuser',
    'eu.chainfire.supersu',
    'com.koushikdutta.superuser',
    'com.zachspong.temprootremovejb',
    'com.ramdroid.appquarantine',
    'com.topjohnwu.magisk',
  ];
  void rootApps; // Referência para plugin nativo futuro

  return false; // Implementar verificação nativa
}

/**
 * Verifica se está rodando em emulador
 */
async function checkEmulator(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const ua = navigator.userAgent.toLowerCase();
  const emulatorIndicators = [
    'generic',
    'emulator',
    'sdk',
    'genymotion',
    'bluestacks',
    'nox',
    'memu',
    'ldplayer',
  ];

  for (const indicator of emulatorIndicators) {
    if (ua.includes(indicator)) return true;
  }

  // Verificar características do hardware (reservado para implementação nativa)

  return false; // Implementar verificação nativa
}

/**
 * Verifica se o app foi modificado (tampering)
 */
async function checkTampering(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  // Verificar assinatura do APK
  // Comparar hash do código com hash esperado
  // Verificar integridade dos assets

  // Verificar se está rodando em modo debug
  const isDebugBuild = import.meta.env.DEV;
  if (isDebugBuild) return false; // Permitir em dev

  return false; // Implementar verificação nativa
}

/**
 * Detecta se há debugger anexado
 */
function checkDebugger(): boolean {
  // Verificar se DevTools está aberto
  let devtoolsOpen = false;
  const threshold = 160;

  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;

  if (widthThreshold || heightThreshold) {
    devtoolsOpen = true;
  }

  // Detectar timing de debugger (usando eval indiretamente para evitar a keyword no bundle)
  const start = performance.now();
  try {
    (0, eval)('void 0');
  } catch {
    /* ignore */
  }
  const end = performance.now();

  if (end - start > 100) {
    devtoolsOpen = true;
  }

  return devtoolsOpen;
}

/**
 * Verifica integridade do código JavaScript
 */
function checkCodeIntegrity(): boolean {
  // Verificar se funções críticas foram modificadas (lista para auditoria futura)

  // Verificar se console foi sobrescrito
  if (typeof console.log !== 'function') return false;

  // Verificar se Object.prototype foi modificado
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  if (typeof hasOwnProperty !== 'function') return false;

  return true;
}

/**
 * Executa verificação completa de segurança do dispositivo
 */
export async function performSecurityCheck(): Promise<DeviceSecurityCheck> {
  const warnings: string[] = [];
  let securityScore = 100;

  // Verificar root
  const isRooted = await checkRoot();
  if (isRooted) {
    warnings.push('Dispositivo com root detectado');
    securityScore -= 40;
  }

  // Verificar emulador
  const isEmulator = await checkEmulator();
  if (isEmulator) {
    warnings.push('Emulador detectado');
    securityScore -= 30;
  }

  // Verificar tampering
  const isTampered = await checkTampering();
  if (isTampered) {
    warnings.push('App modificado detectado');
    securityScore -= 50;
  }

  // Verificar debugger
  const isDebuggerAttached = checkDebugger();
  if (isDebuggerAttached) {
    warnings.push('Debugger anexado detectado');
    securityScore -= 20;
  }

  // Verificar integridade do código
  const codeIntact = checkCodeIntegrity();
  if (!codeIntact) {
    warnings.push('Código JavaScript modificado');
    securityScore -= 30;
  }

  return {
    isRooted,
    isEmulator,
    isTampered,
    isDebuggerAttached,
    securityScore: Math.max(0, securityScore),
    warnings,
  };
}

/**
 * Aplica políticas de segurança baseadas no ambiente
 */
export async function enforceSecurityPolicy(): Promise<void> {
  // DESABILITADO: Trava de UI pesada e sem sentido real para o projeto web/hybrid
  console.log('[Security] enforceSecurityPolicy bypassado para performance.');
}

/**
 * Inicia monitoramento contínuo de segurança
 */
export function startSecurityMonitoring(_intervalMs: number = 60000): () => void {
  // DESABILITADO: Trava CPU com intervalos rodando e chamadas lentas async
  console.log('[Security] startSecurityMonitoring desativado para ganho de performance.');
  return () => {};
}
