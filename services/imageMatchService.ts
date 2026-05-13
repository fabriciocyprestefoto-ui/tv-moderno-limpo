/**
 * imageMatchService.ts — Serviço de matching inteligente de imagens para o painel admin.
 *
 * Fluxo:
 *  1. Limpa o nome do arquivo para extrair um título
 *  2. Busca no Supabase (movies / series) por ilike
 *  3. Fallback: busca no TMDB para identificação
 *  4. Detecta orientação (poster / backdrop) via aspect ratio
 *  5. Converte para WebP via canvas
 *  6. Upload no Supabase Storage (bucket 'posters' ou 'backdrops')
 *  7. Atualiza o registro no banco com a URL pública
 *  8. Complementa poster/backdrop faltante com URL do TMDB
 */

import { supabase } from './supabaseService';
import { getCurrentToken, nextToken as _nextToken } from './tmdbKeys';
const getNextToken = () => {
  const t = getCurrentToken();
  _nextToken();
  return t;
};
import { logger } from '../utils/logger';
import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageMatchResult {
  file: File;
  fileName: string;
  cleanTitle: string;
  orientation: 'poster' | 'backdrop';
  width: number;
  height: number;
  previewUrl: string;
  matched: boolean;
  matchedItem?: {
    id: string;
    title: string;
    type: 'movie' | 'series';
    tmdb_id?: number;
    poster?: string;
    backdrop?: string;
    stream_url?: string;
  };
  matchSource?: 'database' | 'tmdb';
  tmdbResult?: {
    id: number;
    title: string;
    type: 'movie' | 'series';
    poster_path?: string;
    backdrop_path?: string;
  };
  uploaded: boolean;
  newUrl?: string;
  error?: string;
  status: 'pending' | 'matching' | 'matched' | 'not_found' | 'uploading' | 'done' | 'error';
}

interface DbMatch {
  id: string;
  title: string;
  type: 'movie' | 'series';
  tmdb_id?: number;
  poster?: string;
  backdrop?: string;
  stream_url?: string;
}

interface TmdbMatch {
  id: number;
  title: string;
  type: 'movie' | 'series';
  poster_path?: string;
  backdrop_path?: string;
}

type ProgressCallback = (result: ImageMatchResult) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
const TMDB_POSTER_SIZE = 'w780';
const TMDB_BACKDROP_SIZE = 'w1280';

/**
 * Remove acentos de uma string (NFD + strip combining marks).
 */
function removeAccents(str: string): string {
  return stripDiacriticsSafe(str);
}

/**
 * Gera um slug a partir de um título.
 * Ex: "Os Caras Malvados 2" → "os-caras-malvados-2"
 */
function slugify(title: string): string {
  return removeAccents(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normaliza um título para comparação (lowercase, sem acentos, sem espaços extras).
 */
function normalizeForComparison(str: string): string {
  return removeAccents(str).toLowerCase().trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// 1. cleanFileName
// ---------------------------------------------------------------------------

/**
 * Extrai um título limpo a partir do nome do arquivo.
 *
 * Remove extensão, tags de resolução, sufixos comuns e caracteres especiais.
 */
export function cleanFileName(name: string): string {
  let clean = name;

  // Remove extensão
  clean = clean.replace(/\.(jpe?g|png|webp|gif|bmp|tiff?|avif|svg)$/i, '');

  // Remove tags de resolução
  clean = clean.replace(
    /\b(2160p|1080p|720p|480p|360p|4k|uhd|hd|sd|bluray|brrip|webrip|hdtv)\b/gi,
    ''
  );

  // Remove sufixos comuns de imagem
  clean = clean.replace(
    /\b(poster|backdrop|banner|cover|capa|thumb|thumbnail|art|artwork|fanart|keyart|logo|still|screenshot)\b/gi,
    ''
  );

  // Remove underscores e hífens → espaços
  clean = clean.replace(/[_]+/g, ' ');
  clean = clean.replace(/[-]+/g, ' ');

  // Remove pontos que separam palavras (ex: "The.Matrix" → "The Matrix")
  clean = clean.replace(/\.+/g, ' ');

  // Remove parênteses e colchetes com conteúdo numérico ou vazio
  clean = clean.replace(/\(\s*\d*\s*\)/g, '');
  clean = clean.replace(/\[\s*\d*\s*\]/g, '');

  // Remove números isolados no final (ex: "Filme 1080" residual)
  clean = clean.replace(/\s+\d{3,4}\s*$/g, '');

  // Colapsa espaços e trim
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

// ---------------------------------------------------------------------------
// 2. detectOrientation
// ---------------------------------------------------------------------------

/**
 * Carrega a imagem no browser e retorna orientação + dimensões.
 */
export function detectOrientation(
  file: File
): Promise<{ orientation: 'poster' | 'backdrop'; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      URL.revokeObjectURL(url);
      // Vertical ou quadrado → poster; horizontal → backdrop
      const orientation: 'poster' | 'backdrop' = height >= width ? 'poster' : 'backdrop';
      resolve({ orientation, width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Falha ao carregar imagem: ${file.name}`));
    };

    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// 3. convertToWebP
// ---------------------------------------------------------------------------

/**
 * Converte qualquer imagem para WebP usando canvas.
 * Redimensiona para maxWidth mantendo aspect ratio.
 */
export function convertToWebP(file: File, maxWidth: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { naturalWidth: w, naturalHeight: h } = img;

      // Redimensiona se necessário
      if (w > maxWidth) {
        const ratio = maxWidth / w;
        w = maxWidth;
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context indisponível'));
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao converter para WebP'));
            return;
          }
          const webpFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
            type: 'image/webp',
          });
          resolve(webpFile);
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Falha ao carregar imagem para conversão: ${file.name}`));
    };

    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// 4. searchDatabase
// ---------------------------------------------------------------------------

/**
 * Busca no Supabase (movies e series) por título usando ilike.
 * Retorna o primeiro match que possua stream_url válida.
 */
export async function searchDatabase(title: string): Promise<DbMatch | null> {
  const normalized = normalizeForComparison(title);
  const pattern = `%${normalized}%`;

  try {
    // Busca em movies
    const { data: movies, error: moviesErr } = await supabase
      .from('movies')
      .select('id, title, tmdb_id, poster, backdrop, stream_url')
      .ilike('title', pattern)
      .limit(10);

    if (moviesErr) {
      logger.warn('[imageMatch] Erro buscando movies:', moviesErr.message);
    }

    if (movies && movies.length > 0) {
      // Prioriza match com stream_url válida
      const withStream = movies.find(
        (m) => m.stream_url && (m.stream_url as string).startsWith('http')
      );
      const best = withStream || movies[0];
      return {
        id: best.id,
        title: best.title,
        type: 'movie',
        tmdb_id: best.tmdb_id ?? undefined,
        poster: best.poster ?? undefined,
        backdrop: best.backdrop ?? undefined,
        stream_url: best.stream_url ?? undefined,
      };
    }

    // Busca em series
    const { data: series, error: seriesErr } = await supabase
      .from('series')
      .select('id, title, tmdb_id, poster, backdrop, stream_url')
      .ilike('title', pattern)
      .limit(10);

    if (seriesErr) {
      logger.warn('[imageMatch] Erro buscando series:', seriesErr.message);
    }

    if (series && series.length > 0) {
      const withStream = series.find(
        (s) => s.stream_url && (s.stream_url as string).startsWith('http')
      );
      const best = withStream || series[0];
      return {
        id: best.id,
        title: best.title,
        type: 'series',
        tmdb_id: best.tmdb_id ?? undefined,
        poster: best.poster ?? undefined,
        backdrop: best.backdrop ?? undefined,
        stream_url: best.stream_url ?? undefined,
      };
    }

    return null;
  } catch (err) {
    logger.error('[imageMatch] Exceção em searchDatabase:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. searchTMDB
// ---------------------------------------------------------------------------

/**
 * Busca no TMDB search/multi como fallback quando não encontrado no banco.
 */
export async function searchTMDB(title: string): Promise<TmdbMatch | null> {
  const token = getNextToken();
  if (!token) {
    logger.warn('[imageMatch] TMDB read token não configurado, pulando busca TMDB.');
    return null;
  }

  try {
    const query = encodeURIComponent(title);
    const url = `https://api.themoviedb.org/3/search/multi?query=${query}&language=pt-BR&page=1&include_adult=false`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      logger.warn('[imageMatch] TMDB search retornou', resp.status);
      return null;
    }

    const data = (await resp.json()) as {
      results: Array<{
        id: number;
        media_type: string;
        title?: string;
        name?: string;
        poster_path?: string | null;
        backdrop_path?: string | null;
      }>;
    };

    // Filtra apenas movie ou tv
    const relevant = data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');

    if (relevant.length === 0) return null;

    const first = relevant[0];
    return {
      id: first.id,
      title: first.title || first.name || title,
      type: first.media_type === 'movie' ? 'movie' : 'series',
      poster_path: first.poster_path ?? undefined,
      backdrop_path: first.backdrop_path ?? undefined,
    };
  } catch (err) {
    logger.error('[imageMatch] Exceção em searchTMDB:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch TMDB images helper
// ---------------------------------------------------------------------------

/**
 * Busca detalhes de poster/backdrop no TMDB pelo tmdb_id.
 */
async function fetchTmdbImages(
  tmdbId: number,
  type: 'movie' | 'series'
): Promise<{ poster_path?: string; backdrop_path?: string } | null> {
  const token = getNextToken();
  if (!token) return null;

  try {
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?language=pt-BR`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      poster_path?: string | null;
      backdrop_path?: string | null;
    };

    return {
      poster_path: data.poster_path ?? undefined,
      backdrop_path: data.backdrop_path ?? undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 6. matchAndUpload
// ---------------------------------------------------------------------------

/**
 * Função principal: faz o matching + upload de uma imagem.
 */
export async function matchAndUpload(
  file: File,
  onProgress?: ProgressCallback
): Promise<ImageMatchResult> {
  const previewUrl = URL.createObjectURL(file);

  const result: ImageMatchResult = {
    file,
    fileName: file.name,
    cleanTitle: '',
    orientation: 'poster',
    width: 0,
    height: 0,
    previewUrl,
    matched: false,
    uploaded: false,
    status: 'pending',
  };

  const emit = () => onProgress?.(structuredClone({ ...result, file }));

  try {
    // --- a. Limpar nome ---
    result.cleanTitle = cleanFileName(file.name);
    result.status = 'matching';
    emit();

    logger.info('[imageMatch] Processando:', file.name, '→', result.cleanTitle);

    // --- b. Detectar orientação ---
    const { orientation, width, height } = await detectOrientation(file);
    result.orientation = orientation;
    result.width = width;
    result.height = height;

    // --- c. Buscar no banco ---
    let dbMatch = await searchDatabase(result.cleanTitle);
    let tmdbResult: TmdbMatch | null = null;

    // --- d. Fallback TMDB ---
    if (!dbMatch) {
      logger.info('[imageMatch] Sem match no banco, tentando TMDB para:', result.cleanTitle);
      tmdbResult = await searchTMDB(result.cleanTitle);

      if (tmdbResult) {
        result.tmdbResult = tmdbResult;
        // Tenta buscar no banco pelo título retornado pelo TMDB
        dbMatch = await searchDatabase(tmdbResult.title);
        if (dbMatch) {
          result.matchSource = 'tmdb';
        }
      }
    } else {
      result.matchSource = 'database';
    }

    // Se encontrou match no banco
    if (dbMatch) {
      result.matched = true;
      result.matchedItem = dbMatch;
      result.status = 'matched';
      emit();

      // --- e. Upload ---
      // Só faz upload se o item tem stream_url válida
      if (dbMatch.stream_url && dbMatch.stream_url.startsWith('http')) {
        result.status = 'uploading';
        emit();

        try {
          // Converter para WebP
          const maxWidth = orientation === 'poster' ? 780 : 1280;
          const webpFile = await convertToWebP(file, maxWidth);

          // Gerar nome do arquivo: slug do título + .webp
          const slug = slugify(dbMatch.title);
          const storagePath = `${slug}.webp`;
          const bucket = orientation === 'poster' ? 'posters' : 'backdrops';

          // Upload no Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(storagePath, webpFile, {
              upsert: true,
              contentType: 'image/webp',
            });

          if (uploadError) {
            throw new Error(`Upload falhou: ${uploadError.message}`);
          }

          // Obter URL pública
          const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);

          const newUrl = publicUrlData.publicUrl;
          result.newUrl = newUrl;

          // Atualizar banco
          const table = dbMatch.type === 'movie' ? 'movies' : 'series';
          const fieldToUpdate = orientation === 'poster' ? 'poster' : 'backdrop';

          const { error: updateError } = await supabase
            .from(table)
            .update({ [fieldToUpdate]: newUrl })
            .eq('id', dbMatch.id);

          if (updateError) {
            logger.warn('[imageMatch] Erro ao atualizar registro:', updateError.message);
          }

          // Complementar imagem faltante com TMDB
          const tmdbId = dbMatch.tmdb_id || tmdbResult?.id;
          if (tmdbId) {
            const tmdbImages = await fetchTmdbImages(tmdbId, dbMatch.type);

            if (tmdbImages) {
              if (orientation === 'poster' && tmdbImages.backdrop_path && !dbMatch.backdrop) {
                // Uploaded poster → buscar backdrop do TMDB
                const tmdbBackdropUrl = `${TMDB_IMAGE_BASE}${TMDB_BACKDROP_SIZE}${tmdbImages.backdrop_path}`;
                const { error: bdErr } = await supabase
                  .from(table)
                  .update({ backdrop: tmdbBackdropUrl })
                  .eq('id', dbMatch.id);

                if (bdErr) {
                  logger.warn('[imageMatch] Erro ao salvar backdrop TMDB:', bdErr.message);
                } else {
                  logger.info('[imageMatch] Backdrop TMDB salvo para', dbMatch.title);
                }
              } else if (orientation === 'backdrop' && tmdbImages.poster_path && !dbMatch.poster) {
                // Uploaded backdrop → buscar poster do TMDB
                const tmdbPosterUrl = `${TMDB_IMAGE_BASE}${TMDB_POSTER_SIZE}${tmdbImages.poster_path}`;
                const { error: psErr } = await supabase
                  .from(table)
                  .update({ poster: tmdbPosterUrl })
                  .eq('id', dbMatch.id);

                if (psErr) {
                  logger.warn('[imageMatch] Erro ao salvar poster TMDB:', psErr.message);
                } else {
                  logger.info('[imageMatch] Poster TMDB salvo para', dbMatch.title);
                }
              }
            }
          }

          result.uploaded = true;
          result.status = 'done';
          logger.info('[imageMatch] Upload concluído:', dbMatch.title, '→', newUrl);
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          result.error = msg;
          result.status = 'error';
          logger.error('[imageMatch] Erro no upload:', msg);
        }
      } else {
        // Match encontrado mas sem stream_url válida
        result.error = 'Item encontrado mas sem stream_url válida';
        result.status = 'matched';
        logger.warn('[imageMatch] Match sem stream_url:', dbMatch.title);
      }
    } else {
      // Nenhum match encontrado
      result.status = 'not_found';
      if (tmdbResult) {
        result.tmdbResult = tmdbResult;
      }
      logger.warn('[imageMatch] Nenhum match encontrado para:', result.cleanTitle);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    result.status = 'error';
    logger.error('[imageMatch] Erro geral:', msg);
  }

  emit();
  return result;
}

// ---------------------------------------------------------------------------
// 7. processMultipleFiles
// ---------------------------------------------------------------------------

/**
 * Processa múltiplos arquivos sequencialmente, emitindo progresso após cada um.
 */
export async function processMultipleFiles(
  files: File[],
  onProgress: (results: ImageMatchResult[]) => void
): Promise<ImageMatchResult[]> {
  const results: ImageMatchResult[] = [];

  for (const file of files) {
    const result = await matchAndUpload(file, (partial) => {
      // Atualiza o resultado parcial na lista
      const idx = results.findIndex((r) => r.fileName === partial.fileName);
      if (idx >= 0) {
        results[idx] = partial;
      } else {
        results.push(partial);
      }
      onProgress([...results]);
    });

    // Garante resultado final na lista
    const idx = results.findIndex((r) => r.fileName === result.fileName);
    if (idx >= 0) {
      results[idx] = result;
    } else {
      results.push(result);
    }
    onProgress([...results]);
  }

  return results;
}
