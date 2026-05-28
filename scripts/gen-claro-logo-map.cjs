// Gera utils/claroChannelLogos.ts mesclando logos de duas fontes (ambas PNG
// transparente, servidas via raw.githubusercontent):
//   1) tv-logo/tv-logos  countries/brazil  → PRIMÁRIO (logos reais/atuais)
//   2) marceleira/claro-tv-icons icons/     → FALLBACK (cobertura ampla)
// Em colisão de chave, a fonte primária vence.
//
//   node scripts/gen-claro-logo-map.cjs
const fs = require('fs');
const path = require('path');

const TVLOGOS_TREE = 'https://api.github.com/repos/tv-logo/tv-logos/git/trees/main?recursive=1';
const CLARO_TREE = 'https://api.github.com/repos/marceleira/claro-tv-icons/git/trees/main?recursive=1';

async function fetchTree(api) {
  const res = await fetch(api, { headers: { 'User-Agent': 'redflix-logo-gen' } });
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} (${api})`);
  return ((await res.json()).tree || []).map((n) => n.path);
}

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const alnum = (s) => s.replace(/[^a-z0-9]+/g, '');
function stripTrailingQuality(x) {
  let p = x;
  for (;;) { const n = p.replace(/(fhd|uhd|hd|sd|4k|8k)$/i, ''); if (n === p) break; p = n; }
  return p;
}
// chaves normalizadas de um basename de ícone
function iconKeys(basename) {
  let b = stripDiacritics(basename.toLowerCase());
  b = b.replace(/-br$/, '').replace(/-(hd|fhd|sd|uhd|4k)$/, '');
  const k = alnum(b);
  const keys = new Set([k]);
  const sq = stripTrailingQuality(k);
  if (sq) keys.add(sq);
  return [...keys].filter(Boolean);
}

async function main() {
  const [tvlPaths, claroPaths] = await Promise.all([fetchTree(TVLOGOS_TREE), fetchTree(CLARO_TREE)]);

  const tvl = tvlPaths
    .filter((p) => /^countries\/brazil\/.+\.png$/i.test(p))
    .map((p) => p.replace(/^countries\/brazil\//, '').replace(/\.png$/i, ''));
  const claro = claroPaths
    .filter((p) => /^icons\/.+\.png$/i.test(p))
    .map((p) => p.replace(/^icons\//, '').replace(/\.png$/i, ''));

  // valor = "t/<file>" (tv-logos) | "c/<file>" (claro) — base reconstruída no runtime
  const keyToVal = new Map();
  for (const f of tvl) for (const k of iconKeys(f)) if (!keyToVal.has(k)) keyToVal.set(k, `t/${f}`);
  for (const f of claro) for (const k of iconKeys(f)) if (!keyToVal.has(k)) keyToVal.set(k, `c/${f}`);

  const entries = [...keyToVal.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const mapLiteral = entries.map(([k, v]) => `  ['${k}', '${v}'],`).join('\n');

  const out = `/**
 * utils/claroChannelLogos.ts — GERADO por scripts/gen-claro-logo-map.cjs.
 * Resolve a logo real de um canal por nome, usando duas fontes de PNG
 * transparente (raw.githubusercontent), com prioridade:
 *   1) tv-logo/tv-logos  countries/brazil   (logos reais/atuais)
 *   2) marceleira/claro-tv-icons             (fallback de cobertura)
 *
 * Motivo: as logos vindas do provedor (Supabase row.logo) costumam apontar
 * para fontes mortas (404). Quando há match por nome, esta logo substitui.
 *
 * Regerar (após mudar canais ou os repos de ícones):
 *   node scripts/gen-claro-logo-map.cjs
 */

const TVLOGOS_BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil';
const CLARO_BASE = 'https://raw.githubusercontent.com/marceleira/claro-tv-icons/main/icons';

// chave normalizada -> "t/<file>" (tv-logos) | "c/<file>" (claro)
const KEY_TO_VAL: Map<string, string> = new Map([
${mapLiteral}
]);

// Aliases marca→chave para nomes que não casam direto.
const ALIASES: Record<string, string> = {
  ae: 'aande',
  boavontade: 'boavontadetv',
  canaloff: 'off',
};

const QUALITY = /\\b(fhd|uhd|hd|sd|4k|8k|legendado|leg|dublado|dub|alternativo|alt|ao vivo)\\b/g;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
}
function cleanName(raw: string): string {
  let s = stripDiacritics(String(raw || '').toLowerCase());
  s = s.replace(/[\\u00b9\\u00b2\\u00b3\\u2070-\\u209f]/g, '');
  if (s.includes(' - ')) s = s.split(' - ')[0];
  s = s.replace(/\\+/g, ' ');
  s = s.replace(QUALITY, ' ');
  return s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\\s+/g, ' ').trim();
}
const alnum = (s: string): string => s.replace(/[^a-z0-9]+/g, '');

function toUrl(val: string): string {
  const file = val.slice(2);
  return val.charCodeAt(0) === 116 /* 't' */
    ? \`\${TVLOGOS_BASE}/\${file}.png\`
    : \`\${CLARO_BASE}/\${file}.png\`;
}

/** Retorna a URL da logo real do canal, ou null se não houver match. */
export function resolveClaroLogo(channelName: string): string | null {
  const cleaned = cleanName(channelName);
  if (!cleaned) return null;
  const tokens = cleaned.split(' ').filter(Boolean);
  const c0 = alnum(cleaned);
  const firstTwo = alnum(tokens.slice(0, 2).join(''));
  const c1 = c0.replace(/\\d+$/, '');
  const firstTok = alnum(tokens[0] || '');

  for (const cand of [c0, firstTwo, c1, firstTok]) {
    if (!cand) continue;
    const v = KEY_TO_VAL.get(cand);
    if (v) return toUrl(v);
    const alias = ALIASES[cand];
    if (alias) { const av = KEY_TO_VAL.get(alias); if (av) return toUrl(av); }
  }
  return null;
}
`;

  fs.writeFileSync(path.resolve('utils/claroChannelLogos.ts'), out, 'utf8');
  console.log(`Gerado utils/claroChannelLogos.ts: ${keyToVal.size} chaves (tvlogos-br=${tvl.length}, claro=${claro.length}).`);

  // Relatório de cobertura (best-effort) contra a tabela channels do Supabase.
  try {
    await reportCoverage(keyToVal);
  } catch (e) {
    console.log('[cobertura] pulada:', e.message);
  }
}

function loadEnv(file) {
  const e = {};
  if (!fs.existsSync(file)) return e;
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    e[t.slice(0, i).trim()] = v;
  }
  return e;
}

async function reportCoverage(keyToVal) {
  const env = loadEnv(path.resolve('.env'));
  const BASE = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
  if (!BASE || !ANON) { console.log('[cobertura] sem .env'); return; }
  const r = await fetch(`${BASE}/rest/v1/channels?select=name&limit=2000`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) { console.log('[cobertura] HTTP', r.status); return; }
  const rows = await r.json();

  const QUALITY = /\b(fhd|uhd|hd|sd|4k|8k|legendado|leg|dublado|dub|alternativo|alt|ao vivo)\b/g;
  const clean = (raw) => {
    let s = stripDiacritics(String(raw || '').toLowerCase()).replace(/[¹²³⁰-₟]/g, '');
    if (s.includes(' - ')) s = s.split(' - ')[0];
    s = s.replace(/\+/g, ' ').replace(QUALITY, ' ');
    return s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  };
  const ALIASES = { ae: 'aande', boavontade: 'boavontadetv', canaloff: 'off' };
  const match = (name) => {
    const cl = clean(name); if (!cl) return null;
    const tk = cl.split(' ').filter(Boolean);
    const c0 = alnum(cl), firstTwo = alnum(tk.slice(0, 2).join('')), c1 = c0.replace(/\d+$/, ''), firstTok = alnum(tk[0] || '');
    for (const cand of [c0, firstTwo, c1, firstTok]) {
      if (!cand) continue;
      if (keyToVal.has(cand)) return keyToVal.get(cand);
      if (ALIASES[cand] && keyToVal.has(ALIASES[cand])) return keyToVal.get(ALIASES[cand]);
    }
    return null;
  };
  let matched = 0, fromT = 0; const miss = [];
  for (const c of rows) { const v = match(c.name); if (v) { matched++; if (v[0] === 't') fromT++; } else miss.push(c.name); }
  console.log(`[cobertura] ${matched}/${rows.length} (${Math.round(matched / rows.length * 100)}%) — tvlogos=${fromT}, claro=${matched - fromT}`);
  console.log('[cobertura] sem match:', miss.length);
  miss.forEach((m) => console.log('   -', m));
}

main().catch((err) => {
  console.error('Erro ao gerar mapa de logos:', err && err.message ? err.message : err);
  process.exit(1);
});
