/**
 * Device Fingerprint - Identificação única de dispositivos
 * Sem custo adicional, usa apenas características do navegador
 */

import { logger } from './logger';

interface DeviceInfo {
  fingerprint: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  colorDepth: number;
  pixelRatio: number;
}

/**
 * Gera um hash simples a partir de uma string
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Coleta informações do dispositivo
 */
export function collectDeviceInfo(): DeviceInfo {
  const nav = navigator as any;

  const info: DeviceInfo = {
    fingerprint: '', // Será calculado depois
    userAgent: navigator.userAgent,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
  };

  // Gerar fingerprint único baseado nas características
  const fingerprintData = [
    info.userAgent,
    info.screenResolution,
    info.timezone,
    info.language,
    info.platform,
    info.hardwareConcurrency.toString(),
    info.deviceMemory?.toString() || '',
    info.colorDepth.toString(),
    info.pixelRatio.toString(),
  ].join('|');

  info.fingerprint = simpleHash(fingerprintData);

  return info;
}

/**
 * Obtém o fingerprint do dispositivo atual
 */
export function getDeviceFingerprint(): string {
  try {
    // Tentar obter do cache primeiro
    const cached = sessionStorage.getItem('redx_device_fingerprint');
    if (cached) return cached;

    // Gerar novo fingerprint
    const info = collectDeviceInfo();
    sessionStorage.setItem('redx_device_fingerprint', info.fingerprint);

    return info.fingerprint;
  } catch (error) {
    logger.error('Erro ao gerar device fingerprint:', error);
    // Fallback: usar timestamp + random
    return `fallback_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Verifica se é um dispositivo móvel
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Verifica se é um TV Box
 */
export function isTVBox(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return (
    ua.includes('tv') ||
    ua.includes('smarttv') ||
    ua.includes('googletv') ||
    ua.includes('android tv')
  );
}

/**
 * Obtém tipo de dispositivo
 */
export function getDeviceType(): 'mobile' | 'tvbox' | 'desktop' {
  if (isTVBox()) return 'tvbox';
  if (isMobileDevice()) return 'mobile';
  return 'desktop';
}

/**
 * Salva informações do dispositivo no Supabase
 */
export async function saveDeviceInfo(userId: string, supabase: any): Promise<boolean> {
  try {
    const info = collectDeviceInfo();
    const deviceType = getDeviceType();

    const { error } = await supabase.from('user_devices').upsert(
      {
        user_id: userId,
        fingerprint: info.fingerprint,
        device_type: deviceType,
        user_agent: info.userAgent,
        screen_resolution: info.screenResolution,
        timezone: info.timezone,
        language: info.language,
        platform: info.platform,
        last_seen: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,fingerprint',
      }
    );

    if (error) {
      logger.error('Erro ao salvar device info:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Erro ao salvar device info:', error);
    return false;
  }
}
