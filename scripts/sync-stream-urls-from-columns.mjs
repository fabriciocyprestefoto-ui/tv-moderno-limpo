#!/usr/bin/env node
/**
 * sync-stream-urls-from-columns.mjs
 *
 * Usa a API Supabase (service role no .env) para alinhar `stream_url` com a
 * primeira URL “real” encontrada nas colunas habituais (video_url, source_url, …),
 * ignorando placeholders (ex.: example.com).
 *
 * Uso:
 *   node scripts/sync-stream-urls-from-columns.mjs           # dry-run (só lista)
 *   node scripts/sync-stream-urls-from-columns.mjs --apply    # grava no banco
 *   node scripts/sync-stream-urls-from-columns.mjs --apply --clear-bad  # também limpa stream_url só-placeholder sem alternativa
 *   node scripts/sync-stream-urls-from-columns.mjs --table=movies --limit=200  # só uma tabela, primeiras 200 linhas (teste)
 *
 * Requer: VITE_SUPABASE_URL ou SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { createClient } from '@supabase/supabase-js';
import { loadRootEnv, requireServiceRoleKey, requireSupabaseUrl } from './supabase-env.mjs';

loadRootEnv();

const FETCH_TIMEOUT_MS = 90_000;

function fetchWithTimeout(ms) {
  return async (url, init = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };
}

const FAKE_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'invalid',
  'domain.invalid',
]);

const URL_KEYS = ['stream_url', 'video_url', 'videoUrl', 'source_url', 'url', 'link'];

function isPlaceholderOrFakeStreamUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return true;
  const low = raw.toLowerCase();
  if (!low.startsWith('http')) return true;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (FAKE_HOSTS.has(host)) return true;
    if (host.endsWith('.example.com') || host.endsWith('.example.org')) return true;
  } catch {
    return true;
  }
  if (low.includes('example.com/') || low.includes('example.org/')) return true;
  return false;
}

function pickFirstRealStreamUrlFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  for (const key of URL_KEYS) {
    const value = row[key];
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (!cleaned || cleaned.length <= 5) continue;
    if (cleaned.includes('undefined') || cleaned.includes('null')) continue;
    if (isPlaceholderOrFakeStreamUrl(cleaned)) continue;
    return cleaned;
  }
  return '';
}

const TABLES = ['movies', 'series', 'episodes', 'channels'];

/** Colunas mínimas para leitura (menos payload que `*`). */
const URL_SELECT = URL_KEYS.join(', ');

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    apply: argv.includes('--apply'),
    clearBad: argv.includes('--clear-bad'),
    table: (() => {
      const i = argv.indexOf('--table');
      if (i >= 0 && argv[i + 1]) return argv[i + 1];
      return null;
    })(),
    limit: (() => {
      const a = argv.find((x) => x.startsWith('--limit='));
      if (!a) return null;
      const n = Number(a.slice('--limit='.length));
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    })(),
  };
}

async function processTable(supabase, table, { apply, clearBad, limit }) {
  const pageSize = 500;
  let from = 0;
  let scanned = 0;
  let wouldUpdate = 0;
  let wouldClear = 0;
  const errors = [];

  let selectColumns = `id, ${URL_SELECT}`;
  let useStar = false;

  for (;;) {
    if (limit !== null && scanned >= limit) break;

    const pageEnd = limit !== null ? Math.min(from + pageSize - 1, limit - 1) : from + pageSize - 1;
    if (limit !== null && from >= limit) break;

    process.stdout.write(`  ${table} offset ${from}…${pageEnd}\r`);

    const sel = useStar ? '*' : selectColumns;
    const { data, error } = await supabase
      .from(table)
      .select(sel)
      .order('id', { ascending: true })
      .range(from, pageEnd);

    if (error) {
      const msg = String(error.message || '');
      if (!useStar && msg.toLowerCase().includes('column')) {
        useStar = true;
        continue;
      }
      if (msg.toLowerCase().includes('column')) {
        console.warn(`\n[sync-stream-urls] Tabela "${table}": ignorada (${error.message})`);
      } else {
        errors.push({ table, error: error.message });
      }
      break;
    }

    if (!data?.length) break;

    for (const row of data) {
      if (limit !== null && scanned >= limit) break;
      scanned++;
      const id = row.id;
      if (id === undefined || id === null) continue;

      const cur = String(row.stream_url ?? '').trim();
      const picked = pickFirstRealStreamUrlFromRow(row);

      const curBad = !cur || isPlaceholderOrFakeStreamUrl(cur);

      if (picked) {
        if (curBad || cur !== picked) {
          if (!curBad && cur !== picked) {
            // Já há stream_url “real” diferente do pick: não sobrescrever
            continue;
          }
          wouldUpdate++;
          if (apply) {
            const { error: uerr } = await supabase
              .from(table)
              .update({ stream_url: picked })
              .eq('id', id);
            if (uerr) errors.push({ table, id, error: uerr.message });
          } else {
            console.log(
              `[dry-run] ${table} id=${id} stream_url <- ${picked.slice(0, 72)}${picked.length > 72 ? '…' : ''}`
            );
          }
        }
      } else if (clearBad && curBad && cur) {
        wouldClear++;
        if (apply) {
          const { error: uerr } = await supabase
            .from(table)
            .update({ stream_url: null })
            .eq('id', id);
          if (uerr) errors.push({ table, id, error: uerr.message });
        } else {
          console.log(
            `[dry-run] ${table} id=${id} stream_url -> NULL (só placeholder / sem alternativa)`
          );
        }
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  process.stdout.write('\n');
  return { scanned, wouldUpdate, wouldClear, errors };
}

async function main() {
  const { apply, clearBad, table: onlyTable, limit } = parseArgs();

  const url = requireSupabaseUrl();
  const key = requireServiceRoleKey();

  console.log(`Projeto: ${url}`);
  console.log(`Modo: ${apply ? 'APLICAR alterações' : 'DRY-RUN (use --apply para gravar)'}`);
  if (clearBad) console.log('Limpar stream_url inválido sem URL alternativa: sim');
  if (limit !== null) console.log(`Limite por tabela (--limit=N): ${limit}`);
  console.log('');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout(FETCH_TIMEOUT_MS) },
  });

  const tables = onlyTable ? [onlyTable] : TABLES;
  let totalScanned = 0;
  let totalUpdate = 0;
  let totalClear = 0;
  const allErrors = [];

  for (const t of tables) {
    console.log(`--- ${t} ---`);
    const r = await processTable(supabase, t, { apply, clearBad, limit });
    totalScanned += r.scanned;
    totalUpdate += r.wouldUpdate;
    totalClear += r.wouldClear;
    allErrors.push(...r.errors);
    console.log(
      `  Linhas lidas: ${r.scanned} | ${apply ? 'Atualizadas' : 'Mudanças previstas'}: ${r.wouldUpdate} | Limpezas: ${r.wouldClear}`
    );
    console.log('');
  }

  console.log('Resumo:', {
    tabelas: tables.join(', '),
    scanned: totalScanned,
    [apply ? 'updated' : 'wouldUpdate']: totalUpdate,
    [apply ? 'cleared' : 'wouldClear']: totalClear,
  });

  if (allErrors.length) {
    console.error('Erros:', allErrors.slice(0, 20));
    if (allErrors.length > 20) console.error(`… +${allErrors.length - 20} erros`);
    process.exit(1);
  }

  if (!apply && (totalUpdate > 0 || totalClear > 0)) {
    console.log(
      '\nPara gravar no Supabase: node scripts/sync-stream-urls-from-columns.mjs --apply'
    );
    if (!clearBad && totalClear === 0)
      console.log(
        'Opcional: --clear-bad para pôr NULL onde só há placeholder e não há outra coluna útil.'
      );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
