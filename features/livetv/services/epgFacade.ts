/**
 * features/livetv/services/epgFacade.ts
 * Fachada para o sistema de EPG (Electronic Program Guide)
 * Delega para o epgService real e expõe API simplificada para LiveTV.
 */

import {
  getCurrentProgramme as _getCurrent,
  getNextProgramme as _getNext,
  getChannelSchedule as _getSchedule,
  getProgrammeProgress as _getProgress,
  formatTime as _formatTime,
  initEPG,
  type EPGProgramme,
} from '@/services/epgService';

let _ready = false;

/**
 * Garante que os dados de EPG estejam carregados.
 * Chamado uma vez após o carregamento dos canais.
 */
export async function ensureLiveTVEPGReady(): Promise<void> {
  if (_ready) return;
  try {
    await initEPG();
  } catch {
    // EPG não é crítico — falha silenciosamente
  }
  _ready = true;
}

/**
 * Retorna a programação atual de um canal (cached).
 */
export function getCurrentProgrammeCached(channelName: string): EPGProgramme | null {
  return _getCurrent(channelName);
}

/**
 * Retorna o próximo programa de um canal (cached).
 */
export function getNextProgrammeCached(channelName: string): EPGProgramme | null {
  return _getNext(channelName);
}

/**
 * Retorna a grade de programação das próximas horas.
 */
export function getChannelScheduleCached(channelName: string, hours = 6): EPGProgramme[] {
  return _getSchedule(channelName, hours);
}

/**
 * Progresso do programa atual (0-100).
 */
export function getProgrammeProgressCached(programme: EPGProgramme): number {
  return _getProgress(programme);
}

/**
 * Objeto utilitário para views — formatação de horário.
 */
export const epgView = {
  formatTime: _formatTime,
};
