import { logger } from '../utils/logger';
import { loadEpgFromIdb, saveEpgToIdb } from '../utils/epgIdbStorage';
import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';

// ═══════════════════════════════════════════════════════════════
// EPG Service — Grade de Programação (XMLTV)
// ═══════════════════════════════════════════════════════════════

export interface EPGProgramme {
  title: string;
  description: string;
  category: string;
  start: Date;
  stop: Date;
  channelId: string;
  isLive: boolean;
  episode?: string;
}

export interface EPGChannel {
  id: string;
  displayName: string;
  icon?: string;
  programmes: EPGProgramme[];
}

/** Única fonte XMLTV do projeto (canais) — grade Claro (GitHub) */
export const EPG_SOURCE_URL =
  'https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml';

// Cache
let epgCache: Map<string, EPGChannel> = new Map();
let lastFetchTime = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 horas
let fetchPromise: Promise<void> | null = null;

// ═══ Helpers ═══

/** Parse data XMLTV: "20260212060000 +0000" ou "20260212060000 -0300" → Date */
function parseXMLTVDate(str: string): Date {
  const clean = str.trim();
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  const hour = parseInt(clean.substring(8, 10));
  const min = parseInt(clean.substring(10, 12));
  const sec = parseInt(clean.substring(12, 14));

  const tzMatch = clean.match(/([+-]\d{4})$/);
  if (tzMatch) {
    const tzStr = tzMatch[1];
    const tzSign = tzStr[0] === '+' ? 1 : -1;
    const tzHours = parseInt(tzStr.substring(1, 3));
    const tzMins = parseInt(tzStr.substring(3, 5));
    const totalOffsetMs = tzSign * (tzHours * 60 + tzMins) * 60 * 1000;
    const utcMs = Date.UTC(year, month, day, hour, min, sec) - totalOffsetMs;
    return new Date(utcMs);
  }

  return new Date(year, month, day, hour, min, sec);
}

/** Normaliza nome de canal para comparação fuzzy */
function normalizeChannelName(name: string): string {
  return (
    stripDiacriticsSafe(name.toLowerCase())
      // Remover prefixos comuns: "BR - ", "BR: " etc.
      .replace(/^br\s*[-:]\s*/i, '')
      // Remover sufixos de qualidade
      .replace(/\s*(hd|fhd|sd|4k|uhd)\s*/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim()
  );
}

/** Parse um XML XMLTV e extrai canais/programas */

function parseXMLTV(xmlText: string): Map<string, EPGChannel> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // DOMParser não lança exceção em XML inválido — retorna documento com <parsererror>
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(
      `[EPG] XMLTV parse error: ${parseError.textContent?.slice(0, 200) ?? 'unknown'}`
    );
  }

  const result = new Map<string, EPGChannel>();

  // Parse canais (com ícones) — todos os <channel> (igual ao epgWorker; necessário para claro.xml)
  const channelNodes = doc.querySelectorAll('channel');
  channelNodes.forEach((node) => {
    const id = node.getAttribute('id') || '';
    const displayName = node.querySelector('display-name')?.textContent || id;
    const icon = node.querySelector('icon')?.getAttribute('src') || undefined;
    if (id) {
      result.set(id, { id, displayName, icon, programmes: [] });
    }
  });

  // Parse programas
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 2);

  const progNodes = doc.querySelectorAll('programme');
  progNodes.forEach((node) => {
    const channelId = node.getAttribute('channel') || '';
    const startStr = node.getAttribute('start') || '';
    const stopStr = node.getAttribute('stop') || '';

    if (!channelId || !startStr || !stopStr) return;

    const start = parseXMLTVDate(startStr);
    const stop = parseXMLTVDate(stopStr);

    // Só importar programas de hoje/amanhã
    if (stop < dayStart || start > dayEnd) return;

    const title = node.querySelector('title')?.textContent?.trim() || '';

    // Descrição: pode estar em <desc> com sinopse completa
    const descNode = node.querySelector('desc');
    let description = descNode?.textContent?.trim() || '';

    // Separar categoria da descrição se formato "Category\nSinopse..."
    let category = node.querySelector('category')?.textContent?.trim() || '';
    if (!category && description) {
      // Formato epg-br.xml: primeira linha pode ser o gênero
      const lines = description.split('\n');
      if (lines.length > 1 && lines[0].length < 30) {
        category = lines[0].trim();
        description = lines.slice(1).join('\n').trim();
      }
    }

    const episodeNum = node.querySelector('episode-num')?.textContent || '';
    const isLive =
      category.toLowerCase().includes('live') || title.toLowerCase().includes('ao vivo');

    const programme: EPGProgramme = {
      title,
      description,
      category,
      start,
      stop,
      channelId,
      isLive,
      episode: episodeNum || undefined,
    };

    const channel = result.get(channelId);
    if (channel) {
      channel.programmes.push(programme);
    } else {
      result.set(channelId, {
        id: channelId,
        displayName: channelId,
        programmes: [programme],
      });
    }
  });

  // Ordenar programas por horário
  result.forEach((ch) => {
    ch.programmes.sort((a, b) => a.start.getTime() - b.start.getTime());
  });

  return result;
}

/** Parse XML via Web Worker (off main thread) com fallback para main thread */
function parseXMLTVOffThread(xmlText: string): Promise<Map<string, EPGChannel>> {
  return new Promise((resolve) => {
    try {
      const worker = new Worker(new URL('../workers/epgWorker.ts', import.meta.url), {
        type: 'module',
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        logger.warn('[EPG] Worker timeout, fallback para main thread');
        resolve(parseXMLTV(xmlText));
      }, 15000);

      worker.onmessage = (e: MessageEvent) => {
        clearTimeout(timeout);
        worker.terminate();

        if (e.data.success && e.data.channels) {
          // Converter de serializado (timestamps) para Map com Dates
          const result = new Map<string, EPGChannel>();
          for (const ch of e.data.channels) {
            result.set(ch.id, {
              id: ch.id,
              displayName: ch.displayName,
              icon: ch.icon,
              programmes: ch.programmes.map((p: any) => ({
                ...p,
                start: new Date(p.start),
                stop: new Date(p.stop),
              })),
            });
          }
          resolve(result);
        } else {
          // Fallback normal para main thread (não é erro)
          resolve(parseXMLTV(xmlText));
        }
      };

      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        logger.warn('[EPG] Worker erro, fallback para main thread');
        resolve(parseXMLTV(xmlText));
      };

      worker.postMessage({ xmlText });
    } catch {
      // Worker não suportado (ex: WebView muito antigo)
      logger.warn('[EPG] Worker não disponível, usando main thread');
      resolve(parseXMLTV(xmlText));
    }
  });
}

/** Buscar e parsear um XMLTV individual */
async function fetchXMLTVSource(
  url: string,
  timeoutMs: number
): Promise<Map<string, EPGChannel> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let xmlText = '';

    // Suporte para descompressão .gz nativa (DecompressionStream)
    if (url.endsWith('.gz')) {
      if (typeof DecompressionStream !== 'undefined' && res.body) {
        try {
          const ds = new DecompressionStream('gzip');
          const decompressedStream = res.body.pipeThrough(ds);
          xmlText = await new Response(decompressedStream).text();
        } catch (e) {
          logger.warn(
            `[EPG] Falha ao descompactar .gz via DecompressionStream, tentando text():`,
            e
          );
          xmlText = await res.text();
        }
      } else {
        xmlText = await res.text();
      }
    } else {
      xmlText = await res.text();
    }

    if (!xmlText || xmlText.length < 100) return null;

    const parsed = await parseXMLTVOffThread(xmlText);
    return parsed.size > 0 ? parsed : null;
  } catch (err) {
    logger.warn(`[EPG] Falha ao carregar fonte: ${url}`, err);
    return null;
  }
}

const EPG_TIMEOUT_MS = 25000; // Aumentado para lidar com arquivos maiores

/** Buscar e parsear EPG — prioridade: memória > IndexedDB > rede */
export async function fetchAllEPG(): Promise<void> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL && epgCache.size > 0) return;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    // 1. Tentar IndexedDB
    const fromIdb = await loadEpgFromIdb();
    if (fromIdb?.size) {
      epgCache = fromIdb;
      lastFetchTime = Date.now();
      fetchPromise = null;
      logger.log(`[EPG] Carregado do cache: ${epgCache.size} canais`);
      return;
    }

    logger.log(`[EPG] Carregando grade (${EPG_SOURCE_URL})...`);

    let result = await fetchXMLTVSource(EPG_SOURCE_URL, EPG_TIMEOUT_MS);
    if (!result?.size && typeof window !== 'undefined') {
      try {
        const localUrl = new URL('epg-br.xml', window.location.href).href;
        logger.warn('[EPG] Fonte remota vazia ou falhou; tentando fallback local epg-br.xml');
        const local = await fetchXMLTVSource(localUrl, EPG_TIMEOUT_MS);
        if (local?.size) result = local;
      } catch {
        /* noop */
      }
    }
    const newCache = result ?? new Map<string, EPGChannel>();

    if (result?.size) {
      logger.log(`[EPG] Fonte: ${result.size} canais carregados.`);
    } else {
      logger.warn('[EPG] Fonte retornou vazio ou falhou; mantendo cache em memória existente.');
      // Não sobrescrever cache em memória com Map vazio — preserva dados de sessões anteriores
      fetchPromise = null;
      lastFetchTime = Date.now() - CACHE_TTL + 5 * 60 * 1000; // Retentar em 5 min
      return;
    }

    let totalProgrammes = 0;
    newCache.forEach((ch) => {
      totalProgrammes += ch.programmes.length;
    });

    epgCache = newCache;
    rebuildEPGIndex(); // OTIMIZAÇÃO: Constrói índice O(1) para evitar travamento em TV Box
    lastFetchTime = Date.now();
    fetchPromise = null;
    logger.log(`[EPG] Pronto: ${newCache.size} canais, ${totalProgrammes} programas`);
    if (newCache.size > 0) saveEpgToIdb(newCache).catch(() => {});
  })();

  return fetchPromise;
}

// ═══ Mapeamento canal local → canal EPG ═══

// Cache de matching
const matchCache = new Map<string, string | null>();

// Mapeamento manual para canais com nomes muito diferentes
const MANUAL_MAP: Record<string, string[]> = {
  sbt: ['sbtbrasil', 'sbtrj', 'sbtsp'],
  record: ['recordtvbrasil', 'recordtvrj', 'recordtvsp'],
  'record news': ['recordnews'],
  globo: ['globobrasil', 'globorj', 'globosp'],
  band: ['bandbrasil', 'bandrj', 'bandsp'],
  redetv: ['redetv', 'redetvrj', 'redetvsp'],
  'tv cultura': ['cultura'],
  'tv câmara': ['tvcamara'],
  'tv camara': ['tvcamara'],
  'rede brasil': ['redebrasil'],
  'cnn brasil': ['cnnbrasil'],
  'cartoon network': ['cartoonnetwork'],
  'discovery kids': ['discoverykids'],
  globonews: ['globonews'],
  'band news': ['bandnews'],
  sportv: ['sportv'],
  'sportv 2': ['sportv2'],
  'sportv 3': ['sportv3'],
  premiere: ['premiereclubes'],
  'disney channel': ['disneychannel'],
  'disney junior': ['disneyjunior'],
  hbo: ['hbo'],
  telecine: ['telecinepremium', 'telecineaction'],
  espn: ['espn'],
  'espn 2': ['espn2'],
  multishow: ['multishow'],
  gnt: ['gnt'],
  viva: ['viva'],
  bis: ['bis'],
  megapix: ['megapix'],
  universal: ['universalchannel', 'universaltv'],
  'comedy central': ['comedycentral'],
  mtv: ['mtv'],
  vh1: ['vh1'],
  axn: ['axn'],
  tnt: ['tnt'],
  space: ['space'],
  warner: ['warnerchannel'],
  fx: ['fx'],
  'a&e': ['ae'],
  history: ['historychannel', 'history'],
  discovery: ['discoverychannel', 'discovery'],
  'animal planet': ['animalplanet'],
  natgeo: ['nationalgeographic', 'natgeo'],
  'national geographic': ['nationalgeographic', 'natgeo'],
  'travel box': ['travelbox'],
  'food network': ['foodnetwork'],
};

const normalizedIndex = new Map<string, string>(); // normalizedName -> channelId

/** Reconstrói o índice de nomes normalizados para busca rápida */
function rebuildEPGIndex() {
  normalizedIndex.clear();
  matchCache.clear();
  epgCache.forEach((ch, id) => {
    const nameNorm = normalizeChannelName(ch.displayName);
    const idNorm = normalizeChannelName(id);
    if (nameNorm) normalizedIndex.set(nameNorm, id);
    if (idNorm) normalizedIndex.set(idNorm, id);
  });
}

/** Encontrar o melhor match de canal EPG para um nome local ou ID */
function findBestEPGMatch(channelName: string, channelId?: string): EPGChannel | null {
  const cacheKey = `${channelName}_${channelId || ''}`;
  const cached = matchCache.get(cacheKey);
  if (cached !== undefined) {
    return cached ? epgCache.get(cached) || null : null;
  }

  // 1. Match exato por ID (tvg-id) — Prioridade máxima (O(1))
  if (channelId) {
    const byId = epgCache.get(channelId);
    if (byId && byId.programmes.length > 0) {
      matchCache.set(cacheKey, channelId);
      return byId;
    }
  }

  const normalized = normalizeChannelName(channelName);

  // 2. Match por índice normalizado (O(1))
  const indexedId = normalizedIndex.get(normalized);
  if (indexedId) {
    const ch = epgCache.get(indexedId);
    if (ch && ch.programmes.length > 0) {
      matchCache.set(cacheKey, indexedId);
      return ch;
    }
  }

  // 3. Tentar mapeamento manual
  const manualKeys = Object.keys(MANUAL_MAP);
  for (const key of manualKeys) {
    if (normalizeChannelName(key) === normalized) {
      for (const epgNorm of MANUAL_MAP[key]) {
        const foundId = normalizedIndex.get(epgNorm);
        if (foundId) {
          const ch = epgCache.get(foundId);
          if (ch && ch.programmes.length > 0) {
            matchCache.set(cacheKey, foundId);
            return ch;
          }
        }
      }
    }
  }

  // 4. Fallback: Busca linear apenas para match parcial (fuzzy)
  // Limitado para não travar a UI se a lista for muito grande
  let bestMatch: EPGChannel | null = null;
  let bestScore = 0;

  // Só faz busca linear em canais que realmente precisam (ex: os primeiros 100 ou o selecionado)
  // Mas aqui vamos manter razoável checando se o cache está crescendo demais
  if (epgCache.size < 5000) {
    for (const [id, epgChannel] of epgCache) {
      if (epgChannel.programmes.length === 0) continue;

      const epgNorm = normalizeChannelName(epgChannel.displayName);
      const _idNorm = normalizeChannelName(id);
      void _idNorm;

      // Um contém o outro (score reduzido p/ evitar falsos positivos pesados)
      if (epgNorm.includes(normalized) || normalized.includes(epgNorm)) {
        const score =
          (Math.min(epgNorm.length, normalized.length) /
            Math.max(epgNorm.length, normalized.length)) *
          85;
        if (score > bestScore) {
          bestMatch = epgChannel;
          bestScore = score;
          if (bestScore > 90) break;
        }
      }
    }
  }

  if (bestScore >= 50 && bestMatch) {
    matchCache.set(cacheKey, (bestMatch as EPGChannel).id);
    return bestMatch;
  }

  matchCache.set(cacheKey, null);
  return null;
}

// ═══ API Pública ═══

/** Inicializar EPG (chamar no mount do LiveTV) */
export async function initEPG(): Promise<void> {
  await fetchAllEPG();
}

/** Obter programa atual de um canal */
export function getCurrentProgramme(channelName: string, channelId?: string): EPGProgramme | null {
  const epgChannel = findBestEPGMatch(channelName, channelId);
  if (!epgChannel) return null;

  const now = new Date();
  // Busca binária ou find simples se a lista for pequena (programas por canal costumam ser poucos)
  return epgChannel.programmes.find((p) => p.start <= now && p.stop > now) || null;
}

/** Obter próximo programa de um canal */
export function getNextProgramme(channelName: string, channelId?: string): EPGProgramme | null {
  const epgChannel = findBestEPGMatch(channelName, channelId);
  if (!epgChannel) return null;

  const now = new Date();
  return epgChannel.programmes.find((p) => p.start > now) || null;
}

/** Obter lista de programas do canal (próximas horas) */
export function getChannelSchedule(
  channelName: string,
  hours: number = 6,
  channelId?: string
): EPGProgramme[] {
  const epgChannel = findBestEPGMatch(channelName, channelId);
  if (!epgChannel) return [];

  const now = new Date();
  const limit = new Date(now.getTime() + hours * 60 * 60 * 1000);

  return epgChannel.programmes.filter((p) => p.stop > now && p.start < limit);
}

/** Calcular progresso do programa atual (0-100) */
export function getProgrammeProgress(programme: EPGProgramme): number {
  const now = Date.now();
  const start = programme.start.getTime();
  const stop = programme.stop.getTime();
  const total = stop - start;
  if (total <= 0) return 0;
  const elapsed = now - start;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

/** Formatar horário: "14:30" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Verificar se um canal tem EPG disponível */
export function hasEPG(channelName: string): boolean {
  return findBestEPGMatch(channelName) !== null;
}

/** Limpar caches (ex: ao trocar de página) */
export function clearEPGCache(): void {
  matchCache.clear();
}

// ═══ Jogos de Futebol extraídos do EPG ═══

export interface EPGJogoFutebol {
  idEvent: string;
  strEvent: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  strLeague: string | null;
  dateEvent: string | null;
  strTime: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strVenue: string | null;
  strTVStation: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
}

const FOOTBALL_TITLE_RE =
  /brasileir|libertador|copa\s+do\s+brasil|copa\s+brasil|campeonato\s+brasileiro|conmebol|sul.americana|copa\s+america|estadual|futebol.*ao\s+vivo/i;
const MATCH_SPLIT_RE = /^(.+?):\s*(.+?)\s+x\s+(.+?)(?:\s*[-–—].*)?$/i;
const MATCH_SPLIT_RE2 = /^(.+?)\s*[-–—]\s*(.+?)\s+x\s+(.+?)(?:\s*[-–—].*)?$/i;
const REPLAY_RE = /\([\d/]+\)|reprise|replay|apresentação|melhores\s+momentos/i;

function parseFutebolTitle(title: string): { league: string; home: string; away: string } | null {
  if (!FOOTBALL_TITLE_RE.test(title)) return null;
  if (!/ x /i.test(title)) return null;
  if (REPLAY_RE.test(title)) return null;

  let m = MATCH_SPLIT_RE.exec(title);
  if (m) {
    return { league: m[1].trim(), home: m[2].trim(), away: m[3].trim() };
  }
  m = MATCH_SPLIT_RE2.exec(title);
  if (m) {
    return { league: m[1].trim(), home: m[2].trim(), away: m[3].trim() };
  }
  // fallback: apenas home x away
  const parts = title.split(/ x /i);
  if (parts.length === 2) {
    return { league: 'Futebol', home: parts[0].trim(), away: parts[1].trim() };
  }
  return null;
}

function normalizeTeamForKey(name: string): string {
  return stripDiacriticsSafe(name.toLowerCase()).replace(/[^a-z0-9]/g, '');
}

/**
 * Extrai jogos de futebol futuros do cache EPG.
 * Deduplica por par (home + away) mantendo o evento mais cedo.
 * Requer que initEPG() já tenha sido chamado.
 */
export function getJogosFromEPG(): EPGJogoFutebol[] {
  const now = new Date();
  const seen = new Map<string, EPGJogoFutebol>();

  epgCache.forEach((channel) => {
    channel.programmes.forEach((prog) => {
      if (prog.start < now) return;

      const parsed = parseFutebolTitle(prog.title);
      if (!parsed) return;

      const dedupeKey = `${normalizeTeamForKey(parsed.home)}__${normalizeTeamForKey(parsed.away)}`;

      const existing = seen.get(dedupeKey);
      // Mantém o mais cedo; acumula canais
      if (existing) {
        if (prog.start < new Date(existing.dateEvent + 'T' + (existing.strTime || '00:00'))) {
          seen.set(dedupeKey, {
            ...existing,
            dateEvent: prog.start.toISOString().slice(0, 10),
            strTime: prog.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            strTVStation: channel.displayName,
          });
        } else if (existing.strTVStation && !existing.strTVStation.includes(channel.displayName)) {
          existing.strTVStation += ` / ${channel.displayName}`;
        }
        return;
      }

      seen.set(dedupeKey, {
        idEvent: `epg_${dedupeKey}_${prog.start.getTime()}`,
        strEvent: prog.title,
        strHomeTeam: parsed.home,
        strAwayTeam: parsed.away,
        strLeague: parsed.league,
        dateEvent: prog.start.toISOString().slice(0, 10),
        strTime: prog.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        intHomeScore: null,
        intAwayScore: null,
        strStatus: null,
        strVenue: null,
        strTVStation: channel.displayName,
        strHomeTeamBadge: null,
        strAwayTeamBadge: null,
        idHomeTeam: null,
        idAwayTeam: null,
      });
    });
  });

  return Array.from(seen.values()).sort((a, b) => {
    const ta = new Date(`${a.dateEvent}T${a.strTime || '00:00'}`).getTime();
    const tb = new Date(`${b.dateEvent}T${b.strTime || '00:00'}`).getTime();
    return ta - tb;
  });
}
