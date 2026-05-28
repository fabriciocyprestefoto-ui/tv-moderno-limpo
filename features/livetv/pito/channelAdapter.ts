import { Channel } from '@/types';
import { stripDiacriticsSafe } from '@/utils/safeUnicodeNormalize';
import { sanitizeFontezChannels } from '@/utils/sourceSanitizer';
import { resolveClaroLogo } from '@/utils/claroChannelLogos';
import { ChannelQuality, ChannelRegion, PitoChannel, PitoCategory, Program } from './types';

/** Ordem de prioridade de qualidade (melhor primeiro) */
const QUALITY_ORDER = ['4K', 'UHD', 'FHD', 'HD', 'SD'];
const TRADITIONAL_CATEGORY_NAME = 'Tradicionais';
const TRADITIONAL_CATEGORY_ID = 'tradicionais';

type TraditionalChannelSpec = {
  key: string;
  displayName: string;
  number: number;
};

const TRADITIONAL_CHANNELS: TraditionalChannelSpec[] = [
  { key: 'tv-brasil', displayName: 'TV Brasil', number: 2 },
  { key: 'tv-cultura', displayName: 'TV Cultura', number: 3 },
  { key: 'sbt', displayName: 'SBT', number: 4 },
  { key: 'globo', displayName: 'Globo', number: 5 },
  // A lista recebida repetia o número 4; usamos o 6 livre para manter zapping único.
  { key: 'record-news', displayName: 'Record News', number: 6 },
  { key: 'record-tv', displayName: 'Record TV', number: 7 },
  { key: 'rede-vida', displayName: 'Rede Vida', number: 8 },
  { key: 'redetv', displayName: 'RedeTV!', number: 9 },
  { key: 'novo-tempo', displayName: 'Novo Tempo', number: 10 },
  { key: 'rede-cnt', displayName: 'Rede CNT', number: 11 },
  { key: 'cancao-nova', displayName: 'Canção Nova', number: 12 },
  { key: 'band', displayName: 'Band', number: 13 },
  { key: 'tv-aparecida', displayName: 'TV Aparecida', number: 14 },
  { key: 'rit-tv', displayName: 'RIT TV', number: 15 },
];

const TRADITIONAL_RESERVED_NUMBERS = new Set(TRADITIONAL_CHANNELS.map((ch) => ch.number));
const GITHUB_TV_LOGO_BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main';

const TRADITIONAL_LOGOS: Record<string, string> = {
  'tv-brasil': `${GITHUB_TV_LOGO_BASE}/countries/brazil/tv-brasil-br.png`,
  'tv-cultura': `${GITHUB_TV_LOGO_BASE}/countries/brazil/tv-cultura-br.png`,
  sbt: `${GITHUB_TV_LOGO_BASE}/countries/brazil/sbt-br.png`,
  globo: `${GITHUB_TV_LOGO_BASE}/countries/brazil/globo-br.png`,
  'record-news': `${GITHUB_TV_LOGO_BASE}/countries/brazil/record-news-br.png`,
  'record-tv': `${GITHUB_TV_LOGO_BASE}/countries/brazil/record-br.png`,
  'rede-vida': `${GITHUB_TV_LOGO_BASE}/countries/brazil/rede-vida-br.png`,
  redetv: `${GITHUB_TV_LOGO_BASE}/countries/brazil/rede-tv-br.png`,
  'novo-tempo': `${GITHUB_TV_LOGO_BASE}/countries/brazil/novo-tempo-br.png`,
  'rede-cnt': `${GITHUB_TV_LOGO_BASE}/countries/brazil/rede-cnt-br.png`,
  'cancao-nova': `${GITHUB_TV_LOGO_BASE}/countries/brazil/cancao-nova-tv-br.png`,
  band: `${GITHUB_TV_LOGO_BASE}/countries/brazil/band-br.png`,
  'tv-aparecida': `${GITHUB_TV_LOGO_BASE}/countries/brazil/tv-aparecida-br.png`,
  'rit-tv': `${GITHUB_TV_LOGO_BASE}/countries/brazil/rit-br.png`,
};

const CHANNEL_LOGO_OVERRIDES: Array<{ match: RegExp; logo: string }> = [
  { match: /\bsbt\b/i, logo: TRADITIONAL_LOGOS.sbt },
  { match: /\bglobo\b/i, logo: TRADITIONAL_LOGOS.globo },
  { match: /\brecord\b/i, logo: TRADITIONAL_LOGOS['record-tv'] },
  { match: /\bnovo tempo\b/i, logo: TRADITIONAL_LOGOS['novo-tempo'] },
  { match: /\bcan[cç]a?o nova\b/i, logo: TRADITIONAL_LOGOS['cancao-nova'] },
  { match: /\bband\b/i, logo: TRADITIONAL_LOGOS.band },
  { match: /\btv brasil\b/i, logo: TRADITIONAL_LOGOS['tv-brasil'] },
  { match: /\btv cultura\b/i, logo: TRADITIONAL_LOGOS['tv-cultura'] },
  { match: /\brede vida\b/i, logo: TRADITIONAL_LOGOS['rede-vida'] },
  { match: /\brede ?tv\b/i, logo: TRADITIONAL_LOGOS.redetv },
  { match: /\b(cnt|rede cnt)\b/i, logo: TRADITIONAL_LOGOS['rede-cnt'] },
  { match: /\btv aparecida\b/i, logo: TRADITIONAL_LOGOS['tv-aparecida'] },
  { match: /\brit\b/i, logo: TRADITIONAL_LOGOS['rit-tv'] },
  {
    match: /\bdiscovery (channel|hd|fhd|sd)?\b/i,
    logo: `${GITHUB_TV_LOGO_BASE}/countries/argentina/discovery-channel-ar.png`,
  },
  {
    match: /\b(discovery h(&|e|and)h|home ?& ?health|home and health)\b/i,
    logo: `${GITHUB_TV_LOGO_BASE}/countries/argentina/discovery-home-and-health-ar.png`,
  },
  {
    match: /\bhgtv\b/i,
    logo: `${GITHUB_TV_LOGO_BASE}/countries/argentina/hgtv-ar.png`,
  },
];

/** Palavra-chave do afiliado principal de cada estado (para escolher o "mais principal") */
const STATE_MAIN_KEYWORDS: Record<string, string[]> = {
  AC: ['RIO BRANCO'],
  AL: ['ALAGOAS'],
  AM: ['MANAUS'],
  AP: ['AMAPA', 'AMAPÁ'],
  BA: ['BAHIA'],
  CE: ['VERDES MARES', 'FORTALEZA'],
  DF: ['BRASILIA', 'BRASÍLIA'],
  ES: ['VITORIA', 'VITÓRIA', 'GAZETA'],
  GO: ['GOIANIA', 'GOIÂNIA'],
  MA: ['MIRANTE', 'SAO LUIS'],
  MG: ['MINAS GERAIS', 'GLOBO MINAS', 'BELO HORIZONTE'],
  MS: ['CAMPO GRANDE', 'MORENA'],
  MT: ['CUIABA', 'CUIABÁ'],
  PA: ['LIBERAL', 'BELEM', 'BELÉM'],
  PB: ['CABO BRANCO', 'JOAO PESSOA'],
  PE: ['PERNAMBUCO', 'RECIFE'],
  PI: ['CLUBE', 'TERESINA'],
  PR: ['CURITIBA', 'RPC CURITIBA'],
  RJ: ['RIO DE JANEIRO', 'RIO'],
  RN: ['CABUGI', 'NATAL'],
  RO: ['PORTO VELHO'],
  RR: ['BOA VISTA'],
  RS: ['PORTO ALEGRE', 'RBS PORTO ALEGRE'],
  SC: ['FLORIANOPOLIS', 'FLORIANÓPOLIS', 'NSC TV FLORIANOPOLIS'],
  SE: ['SERGIPE', 'ARACAJU'],
  SP: ['SAO PAULO', 'SÃO PAULO'],
  TO: ['PALMAS'],
};

/** Extrai o sufixo de qualidade de um nome de canal */
function extractQuality(name: string): { base: string; quality: string } {
  const match = name.match(/\s+(4K|UHD|FHD|HD|SD)\s*$/i);
  if (match) {
    return {
      base: name.slice(0, name.length - match[0].length).trim(),
      quality: match[1].toUpperCase(),
    };
  }
  return { base: name.trim(), quality: 'HD' };
}

/**
 * Detecta canais regionais no padrão "BASE UF - AFILIADO"
 * Ex: "GLOBO SP - SAO PAULO" → { base: "GLOBO", state: "SP", affiliateName: "SAO PAULO" }
 */
function extractRegionInfo(
  nameAfterQuality: string
): { base: string; state: string; affiliateLabel: string } | null {
  const match = nameAfterQuality.match(/^(.+?)\s+([A-Z]{2})\s+-\s+(.+)$/);
  if (match) {
    return {
      base: match[1].trim(),
      state: match[2],
      affiliateLabel: `${match[2]} - ${match[3].trim()}`,
    };
  }
  return null;
}

/**
 * Escolhe o afiliado principal de um estado para exibição padrão.
 * Usa lista de palavras-chave; fallback: mais variantes de qualidade, depois alfabético.
 */
function pickMainAffiliateKey(state: string, affiliateMap: Map<string, VariantEntry[]>): string {
  const keywords = STATE_MAIN_KEYWORDS[state] ?? [];
  for (const kw of keywords) {
    const kwNorm = stripDiacriticsSafe(kw).toUpperCase();
    for (const key of affiliateMap.keys()) {
      const keyNorm = stripDiacriticsSafe(key).toUpperCase();
      if (keyNorm.includes(kwNorm)) return key;
    }
  }
  // fallback: afiliado com mais qualidades, depois primeiro alfabético
  let best = '';
  let bestCount = -1;
  for (const [key, vs] of affiliateMap) {
    if (vs.length > bestCount || (vs.length === bestCount && key < best)) {
      best = key;
      bestCount = vs.length;
    }
  }
  return best;
}

type VariantEntry = {
  raw: Channel;
  base: string;
  quality: string;
  catId: string;
  state?: string;
  affiliateLabel?: string;
};

function hasPlayableStream(entry: VariantEntry): boolean {
  return Boolean(entry.raw.stream_url && String(entry.raw.stream_url).trim());
}

function formatProgTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function applyEpgTitle(p: Program, raw: Channel): Program {
  const title = typeof raw.program === 'string' ? raw.program.trim() : '';
  return title ? { ...p, title } : p;
}

function pickChannelLogo(variants: VariantEntry[], traditionalSpec: TraditionalChannelSpec | null): string {
  // Prioridade: ícone do Claro (github raw, estável) casado pelo nome do canal.
  // Substitui a logo original do provedor, que frequentemente está morta (404).
  for (const v of variants) {
    const claro = resolveClaroLogo(String(v.raw.name || ''));
    if (claro) return claro;
  }

  if (traditionalSpec) {
    const traditionalLogo = TRADITIONAL_LOGOS[traditionalSpec.key];
    if (traditionalLogo) return traditionalLogo;
  }

  const names = variants
    .flatMap((v) => [v.raw.name, v.raw.category])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const matched = CHANNEL_LOGO_OVERRIDES.find((entry) =>
    names.some((name) => entry.match.test(name))
  );
  if (matched?.logo) return matched.logo;

  const fromVariant = variants.map((v) => String(v.raw.logo || '').trim()).find(Boolean);
  if (fromVariant) return fromVariant;
  return '';
}

/**
 * Mapeia o group-title bruto do M3U para um dos 15 gêneros canônicos:
 * Aberto | Notícias | Esportes | Filmes | Séries | Infantil | Documentários
 * | Variedades | Religioso | Música | Lifestyle | Adulto | Educativo | Compras | Regional
 */
function mapToCanonicalGenre(rawCat: string): string {
  // Normaliza: remove diacríticos, emojis/símbolos, pipes e espaços extras → lowercase
  const n = stripDiacriticsSafe(rawCat)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Aberto (canais abertos terrestres e regionais)
  if (/\b(abertos?|band\b|record\b|sbt\b|redetv|portugal)\b/.test(n)) return 'Aberto';
  if (/\bglobo\b/.test(n)) return 'Aberto';

  // Notícias
  if (/\b(noticias?|news)\b/.test(n)) return 'Notícias';

  // Esportes
  if (
    /\b(esportes?|sportv|premiere|eventos\s+do\s+dia|combate|ufc|nba|league\s+pass|caze|goat\s+tv|sportynet|sports)\b/.test(
      n
    ) ||
    /^espn/.test(n) ||
    /\bmax.?tnt\b/.test(n)
  )
    return 'Esportes';

  // Filmes (antes de séries para cobrir "filmes e series")
  if (/\b(filmes?|telecine|cinema)\b/.test(n)) return 'Filmes';
  if (/\bhbo\b/.test(n) && !/\bseries\b/.test(n)) return 'Filmes';

  // Séries & Novelas
  if (/\b(series|novelas?|doramas?)\b/.test(n)) return 'Séries';
  if (/\bhbo\b/.test(n)) return 'Séries';

  // Infantil
  if (/\b(infantil|desenhos?|animes?|animac|marvel|dc\s+comics)\b/.test(n)) return 'Infantil';

  // Documentários
  if (/\b(documentarios?|discovery)\b/.test(n)) return 'Documentários';

  // Religioso
  if (/\b(religiosos?|gospel|evangelico|church)\b/.test(n)) return 'Religioso';

  // Música
  if (/\b(musicais?|musica)\b/.test(n)) return 'Música';

  // Variedades (conteúdo misto e plataformas de streaming)
  if (
    /\b(variedades?|bbb|legendados?|comedia|disney|paramount|prime\s+video|shows?|programas?|4k)\b/.test(
      n
    )
  )
    return 'Variedades';

  // Fallback: devolve a categoria limpa sem prefixo "Canais - "
  return rawCat.replace(/^Canais\s*[-–]\s*/i, '').trim();
}

function getIconForCategory(name: string): string {
  const n = normalize(name);
  if (n.includes('tradicion')) return 'Tv';
  if (n.includes('aberto') || n.includes('globo')) return 'Globe';
  if (n.includes('noticia') || n.includes('news')) return 'Newspaper';
  if (n.includes('esport') || n.includes('sport') || n.includes('premiere') || n.includes('ufc'))
    return 'Trophy';
  if (n.includes('serie') || n.includes('novela') || n.includes('dorama')) return 'Clapperboard';
  if (n.includes('filme') || n.includes('cine') || n.includes('telecine')) return 'Film';
  if (n.includes('infant') || n.includes('anime') || n.includes('kid') || n.includes('desenho'))
    return 'Baby';
  if (n.includes('docum') || n.includes('discovery')) return 'BookOpen';
  if (n.includes('religi') || n.includes('gospel')) return 'Heart';
  if (n.includes('music')) return 'Music';
  if (n.includes('lifestyle')) return 'Star';
  if (n.includes('adult') || /\+18|xxx/.test(n)) return 'Flame';
  if (n.includes('educat')) return 'GraduationCap';
  if (n.includes('compra')) return 'ShoppingCart';
  if (n.includes('regional')) return 'MapPin';
  return 'Tv';
}

function normalizeId(name: string): string {
  return stripDiacriticsSafe(name)
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase();
}

function normalize(s: string): string {
  return stripDiacriticsSafe(String(s || ''))
    .trim()
    .toLowerCase();
}

function normalizeChannelNameForMatch(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTraditionalChannelSpec(baseName: string): TraditionalChannelSpec | null {
  const n = normalizeChannelNameForMatch(baseName);

  if (n === 'record news') return TRADITIONAL_CHANNELS.find((c) => c.key === 'record-news')!;
  if (n === 'record' || n === 'record tv' || n === 'rede record') {
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'record-tv')!;
  }
  if (n === 'sbt') return TRADITIONAL_CHANNELS.find((c) => c.key === 'sbt')!;
  if (n === 'globo' || n === 'tv globo')
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'globo')!;
  if (n === 'band' || n === 'tv band' || n === 'rede band') {
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'band')!;
  }
  if (n === 'redetv' || n === 'rede tv') {
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'redetv')!;
  }
  if (n === 'tv brasil') return TRADITIONAL_CHANNELS.find((c) => c.key === 'tv-brasil')!;
  if (n === 'tv cultura' || n === 'cultura') {
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'tv-cultura')!;
  }
  if (n === 'rede vida') return TRADITIONAL_CHANNELS.find((c) => c.key === 'rede-vida')!;
  if (n === 'cancao nova') return TRADITIONAL_CHANNELS.find((c) => c.key === 'cancao-nova')!;
  if (n === 'tv aparecida' || n === 'aparecida') {
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'tv-aparecida')!;
  }
  if (n === 'novo tempo' || n === 'tv novo tempo') {
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'novo-tempo')!;
  }
  if (n === 'rede cnt' || n === 'cnt')
    return TRADITIONAL_CHANNELS.find((c) => c.key === 'rede-cnt')!;
  if (n === 'rit tv' || n === 'rit') return TRADITIONAL_CHANNELS.find((c) => c.key === 'rit-tv')!;

  return null;
}

export function adaptChannels(rawChannels: Channel[]): {
  channels: PitoChannel[];
  categories: PitoCategory[];
} {
  const safeRawChannels = sanitizeFontezChannels(rawChannels, 'channelAdapter');
  const pitoCats = new Map<string, PitoCategory>();

  // Mapa: baseName__catId → array de variantes
  const groupMap = new Map<string, VariantEntry[]>();

  safeRawChannels.forEach((c) => {
    let rawCat = (c.category || 'Variedades').trim();
    if (!rawCat) rawCat = 'Variedades';
    rawCat = mapToCanonicalGenre(rawCat);

    const { base: nameAfterQuality, quality } = extractQuality(c.name || '');
    const regionInfo = extractRegionInfo(nameAfterQuality);

    let base: string;
    let state: string | undefined;
    let affiliateLabel: string | undefined;

    if (regionInfo) {
      // Corrige typo: GLOBOO → GLOBO
      base = regionInfo.base === 'GLOBOO' ? 'GLOBO' : regionInfo.base;
      state = regionInfo.state;
      affiliateLabel = regionInfo.affiliateLabel;
    } else {
      base = nameAfterQuality;
    }

    const traditionalSpec = getTraditionalChannelSpec(base);
    if (traditionalSpec) {
      rawCat = TRADITIONAL_CATEGORY_NAME;
    }

    const catId = traditionalSpec ? TRADITIONAL_CATEGORY_ID : normalizeId(rawCat);
    const groupKey = traditionalSpec?.key ?? base.toLowerCase();
    const key = `${groupKey}__${catId}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push({ raw: c, base, quality, catId, state, affiliateLabel });
  });

  const channels: PitoChannel[] = [];
  let channelNumber = 1;
  const getNextAvailableChannelNumber = () => {
    while (TRADITIONAL_RESERVED_NUMBERS.has(channelNumber)) channelNumber += 1;
    return channelNumber++;
  };

  groupMap.forEach((variants) => {
    const hasRegions = variants.some((v) => v.state);

    // ── Determinar categoria ──────────────────────────────────────────────
    const representative = variants[0];
    const { catId, base } = representative;
    const traditionalSpec = getTraditionalChannelSpec(base);
    let rawCat = traditionalSpec
      ? TRADITIONAL_CATEGORY_NAME
      : (representative.raw.category || 'Variedades').trim();
    if (!rawCat) rawCat = 'Variedades';
    if (!traditionalSpec) rawCat = mapToCanonicalGenre(rawCat);
    const assignedNumber = traditionalSpec
      ? traditionalSpec.number
      : getNextAvailableChannelNumber();
    const displayName = traditionalSpec?.displayName ?? base;

    if (!pitoCats.has(catId)) {
      pitoCats.set(catId, {
        id: catId,
        name: rawCat.toUpperCase(),
        icon: getIconForCategory(rawCat),
        count: 0,
      });
    }

    const now = new Date();
    const end = new Date(now.getTime() + 3600000);
    const fallbackProg: Program = {
      id: `prog-f-${assignedNumber}`,
      title: 'Ao Vivo',
      time: formatProgTime(now),
      startTime: now.toISOString(),
      endTime: end.toISOString(),
      description: 'Programação ao vivo.',
    };

    // ── Canal REGIONAL (ex: GLOBO SP - SAO PAULO) ─────────────────────────
    if (hasRegions) {
      // Agrupar por estado
      const stateMap = new Map<string, VariantEntry[]>();
      variants.forEach((v) => {
        const sk = v.state || '_';
        if (!stateMap.has(sk)) stateMap.set(sk, []);
        stateMap.get(sk)!.push(v);
      });

      const regions: ChannelRegion[] = [];

      stateMap.forEach((stateVariants, stateKey) => {
        // Agrupar por afiliado dentro do estado
        const affiliateMap = new Map<string, VariantEntry[]>();
        stateVariants.forEach((v) => {
          const ak = v.affiliateLabel || stateKey;
          if (!affiliateMap.has(ak)) affiliateMap.set(ak, []);
          affiliateMap.get(ak)!.push(v);
        });

        // Escolher afiliado principal do estado
        const mainKey = pickMainAffiliateKey(stateKey, affiliateMap);
        let mainVariants = affiliateMap.get(mainKey) || stateVariants;
        if (!mainVariants.some(hasPlayableStream)) {
          const fallbackPlayableAffiliate = Array.from(affiliateMap.values()).find((entries) =>
            entries.some(hasPlayableStream)
          );
          if (fallbackPlayableAffiliate) mainVariants = fallbackPlayableAffiliate;
        }

        // Ordenar por melhor qualidade
        mainVariants = [...mainVariants].sort(
          (a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality)
        );
        const bestVariant = mainVariants.find(hasPlayableStream) || mainVariants[0];

        const seenLabels = new Set<string>();
        const qualities: ChannelQuality[] = mainVariants
          .filter((v) => {
            if (!hasPlayableStream(v) || seenLabels.has(v.quality)) return false;
            seenLabels.add(v.quality);
            return true;
          })
          .map((v) => ({ label: v.quality, streamUrl: v.raw.stream_url! }));

        regions.push({
          state: stateKey,
          affiliateLabel: mainKey,
          streamUrl: bestVariant.raw.stream_url || qualities[0]?.streamUrl || '',
          qualities,
        });
      });

      // Ordenar: SP primeiro, depois alfabético (maior cobertura BR como padrão)
      regions.sort((a, b) => {
        if (a.state === 'SP' && b.state !== 'SP') return -1;
        if (b.state === 'SP' && a.state !== 'SP') return 1;
        return a.state.localeCompare(b.state);
      });

      const defaultRegion = regions[0];
      const rawForId =
        variants.find((v) => v.state === defaultRegion.state)?.raw ?? variants[0].raw;

      const progR = applyEpgTitle(fallbackProg, rawForId);
      channels.push({
        id: String(rawForId.id),
        number: assignedNumber,
        name: displayName,
        logo: pickChannelLogo(variants, traditionalSpec),
        category: catId,
        streamUrl: defaultRegion.streamUrl,
        qualities: defaultRegion.qualities,
        regions,
        currentProgram: progR,
        nextPrograms: [progR],
      });

      return; // continua para próximo grupo
    }

    // ── Canal NÃO-REGIONAL: variantes de qualidade simples ───────────────
    const sortedVariants = [...variants].sort(
      (a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality)
    );
    const best = sortedVariants.find(hasPlayableStream) || sortedVariants[0];

    const seenLabels = new Set<string>();
    const qualities: ChannelQuality[] = sortedVariants
      .filter((v) => {
        if (!hasPlayableStream(v) || seenLabels.has(v.quality)) return false;
        seenLabels.add(v.quality);
        return true;
      })
      .map((v) => ({ label: v.quality, streamUrl: v.raw.stream_url! }));

    const progN = applyEpgTitle(fallbackProg, best.raw);
    channels.push({
      id: String(best.raw.id),
      number: assignedNumber,
      name: displayName,
      logo: pickChannelLogo(sortedVariants, traditionalSpec),
      category: catId,
      streamUrl: best.raw.stream_url || qualities[0]?.streamUrl || '',
      qualities,
      currentProgram: progN,
      nextPrograms: [progN],
    });
  });

  channels.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'pt-BR'));

  const categories = Array.from(pitoCats.values())
    .map((cat) => ({
      ...cat,
      count: channels.filter((ch) => ch.category === cat.id).length,
    }))
    .filter((cat) => cat.count > 0)
    .sort((a, b) => {
      const order = [
        'tradicionais',
        'aberto',
        'esportes',
        'filmes',
        'series',
        'noticias',
        'infantil',
        'documentarios',
        'variedades',
        'musica',
        'religioso',
      ];
      const indexA = order.findIndex((o) => a.id.startsWith(o));
      const indexB = order.findIndex((o) => b.id.startsWith(o));
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

  if (categories.length === 0) {
    categories.push({ id: 'variedades', name: 'VARIEDADES', icon: 'Tv', count: channels.length });
    channels.forEach((ch) => {
      ch.category = 'variedades';
    });
  }

  return { channels, categories };
}
