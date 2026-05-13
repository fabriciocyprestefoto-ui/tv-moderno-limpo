/**
 * localContent.ts — Limpeza da Home Page
 * ═══════════════════════════════════════════════════════════
 * Remove episódios soltos, temporadas avulsas e nomes inválidos
 * que poluem as listagens de filmes/séries.
 * ═══════════════════════════════════════════════════════════
 */

import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

// Padrões que indicam episódios/temporadas soltas (não devem aparecer como conteúdo standalone)
const EPISODE_PATTERNS = [
  /^s\d{1,2}e\d{1,2}/i, // S01E05
  /^\d{1,2}x\d{2}/i, // 1x04
  /epis[oó]dio\s*\d/i, // Episódio 1, Episodio 3
  /chapter\s*\d/i, // Chapter 3
  /cap[ií]tulo\s*\d/i, // Capítulo 5
  /^temporada\s*\d+/i, // Temporada 1
  /^season\s*\d+/i, // Season 2
  /^t\d{1,2}\s*$/i, // T1, T02
  /^s\d{1,2}\s*$/i, // S1, S02
  /^temp\s*\d+/i, // Temp 3
  /^s\d{1,2}\s*[·-]\s*e\d+/i, // S01 · E03
  /^(\d+)[ªa]\s*temporada/i, // 1ª Temporada
  /^ep\s*\d+/i, // Ep 5, EP05
];

function isEpisodeOrSeason(title: string): boolean {
  if (!title || title.trim().length < 2) return true;
  return EPISODE_PATTERNS.some((pattern) => pattern.test(title.trim()));
}

export const localContentService = {
  /**
   * Busca filmes do Supabase, removendo itens que parecem episódios soltos
   */
  async getMoviesClean() {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[localContent] Erro ao buscar filmes:', error);
      return [];
    }
    if (!data) return [];

    const clean = data.filter((m) => {
      if (!m.title) return false;
      if (isEpisodeOrSeason(m.title)) return false;
      return true;
    });

    logger.log(
      `[localContent] Filmes: ${data.length} total → ${clean.length} limpos (${data.length - clean.length} removidos)`
    );
    return clean;
  },

  /**
   * Busca séries do Supabase (séries legítimas, sem filtro agressivo)
   */
  async getSeriesClean() {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[localContent] Erro ao buscar séries:', error);
      return [];
    }

    // Filtrar apenas títulos inválidos/vazios
    const clean = (data || []).filter((s) => s.title && s.title.trim().length > 1);
    return clean;
  },
};

export default localContentService;
