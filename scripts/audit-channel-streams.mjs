import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ── .env loader ──────────────────────────────────────
function parseDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed
        .slice(0, eq)
        .replace(/^export\s+/, '')
        .trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    });
    return out;
  } catch {
    return {};
  }
}

function loadEnv() {
  const candidates = [
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env.development'),
    path.join(projectRoot, '.env'),
  ];
  let envFromFile = {};
  for (const p of candidates) {
    if (fs.existsSync(p)) envFromFile = { ...envFromFile, ...parseDotEnv(p) };
  }
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    envFromFile.SUPABASE_URL ||
    envFromFile.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    envFromFile.SUPABASE_ANON_KEY ||
    envFromFile.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('❌ SUPABASE_URL ou SUPABASE_ANON_KEY não encontrados no .env');
    process.exit(1);
  }
  return { url, anon };
}

// ── CLI args ─────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    limit: 50,
    all: false,
    concurrency: 5,
    timeoutMs: 10000,
    category: '',
    verbose: false,
    report: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--all') {
      opts.all = true;
      continue;
    }
    if (arg === '--verbose') {
      opts.verbose = true;
      continue;
    }
    const [flag, inline] = arg.split('=');
    const val = inline ?? next;
    const skip = inline == null;
    switch (flag) {
      case '--limit':
        opts.limit = Number(val);
        if (skip) i++;
        break;
      case '--concurrency':
        opts.concurrency = Number(val);
        if (skip) i++;
        break;
      case '--timeout':
        opts.timeoutMs = Number(val);
        if (skip) i++;
        break;
      case '--category':
        opts.category = String(val || '');
        if (skip) i++;
        break;
      case '--report':
        opts.report = String(val || '');
        if (skip) i++;
        break;
    }
  }
  if (!Number.isFinite(opts.limit) || opts.limit <= 0) opts.limit = 50;
  if (!Number.isFinite(opts.concurrency) || opts.concurrency <= 0) opts.concurrency = 5;
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) opts.timeoutMs = 10000;
  return opts;
}

function printHelp() {
  console.log(`
Uso: node scripts/audit-channel-streams.mjs [opções]

Testa as URLs m3u8 dos canais no Supabase via HTTP HEAD/GET.

Opções:
  --limit 50          Quantidade de canais a testar (padrão: 50)
  --all               Testar TODOS os canais
  --concurrency 5     Requests simultâneos (padrão: 5)
  --timeout 10000     Timeout por URL em ms (padrão: 10000)
  --category "Filmes" Filtrar por categoria
  --verbose           Mostrar cada canal testado
  --report path.json  Salvar relatório completo em JSON
  --help              Mostrar esta ajuda
`);
}

// ── Probe ────────────────────────────────────────────
async function probeUrl(url, timeoutMs) {
  if (!url || !url.trim()) {
    return { ok: false, status: 0, classification: 'empty_url', error: 'URL vazia' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // GET com Range para pegar apenas 1 byte — funciona melhor que HEAD para IPTV
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const ct = res.headers.get('content-type') || '';
    const isHls =
      ct.includes('mpegurl') || ct.includes('octet-stream') || url.toLowerCase().includes('.m3u8');
    if (res.status >= 200 && res.status < 400) {
      return {
        ok: true,
        status: res.status,
        contentType: ct,
        classification: isHls ? 'hls_ok' : 'ok',
      };
    }
    return { ok: false, status: res.status, contentType: ct, classification: `http_${res.status}` };
  } catch (err) {
    const classification = err?.name === 'AbortError' ? 'timeout' : 'network_error';
    return { ok: false, status: 0, classification, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Pool de concorrência ─────────────────────────────
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    const i = cursor++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

// ── Main ─────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const { url, anon } = loadEnv();
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Buscar canais
  const PAGE = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    let q = supabase.from('channels').select('id, name, stream_url, category, logo');
    if (opts.category) q = q.ilike('category', `%${opts.category}%`);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) {
      console.error('❌ Erro Supabase:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Normalizar
  const channels = rows.map((r) => ({
    id: r.id,
    name: r.name || '(sem nome)',
    stream_url: (r.stream_url || '').trim(),
    category: r.category || 'Geral',
  }));

  // Aplicar limite
  const targets = opts.all ? channels : channels.slice(0, opts.limit);

  if (targets.length === 0) {
    console.log('Nenhum canal encontrado.');
    return;
  }

  console.log(
    `\n🔍 Testando ${targets.length} de ${channels.length} canais (concurrency=${opts.concurrency}, timeout=${opts.timeoutMs}ms)\n`
  );

  // Executar probes
  const results = await runPool(targets, opts.concurrency, async (ch, i) => {
    const probe = await probeUrl(ch.stream_url, opts.timeoutMs);
    const result = { ...ch, ...probe };
    if (opts.verbose) {
      const icon = probe.ok ? '✅' : '❌';
      console.log(
        `[${i + 1}/${targets.length}] ${icon} ${ch.name} → ${probe.classification} (${probe.status})`
      );
    }
    return result;
  });

  // Resumo
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const byClass = {};
  results.forEach((r) => {
    byClass[r.classification] = (byClass[r.classification] || 0) + 1;
  });
  const byCat = {};
  failed.forEach((r) => {
    byCat[r.category] = (byCat[r.category] || 0) + 1;
  });

  console.log('\n═══════════════════════════════════════');
  console.log('  📊 RESULTADO DA AUDITORIA DE CANAIS');
  console.log('═══════════════════════════════════════');
  console.log(`  Total testados: ${results.length}`);
  console.log(
    `  ✅ Online:      ${ok.length}  (${((ok.length / results.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  ❌ Offline:     ${failed.length}  (${((failed.length / results.length) * 100).toFixed(1)}%)`
  );
  console.log('');
  console.log('  Por classificação:');
  Object.entries(byClass)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cls, n]) => {
      console.log(`    ${cls}: ${n}`);
    });

  if (Object.keys(byCat).length) {
    console.log('');
    console.log('  Falhas por categoria:');
    Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, n]) => {
        console.log(`    ${cat}: ${n}`);
      });
  }

  if (failed.length > 0) {
    console.log('');
    console.log('  Primeiros canais com falha:');
    failed.slice(0, 20).forEach((f) => {
      console.log(`    ❌ [${f.category}] ${f.name} (#${f.id})`);
      console.log(
        `       ${f.classification} | status=${f.status} | ${f.stream_url.substring(0, 80)}`
      );
      if (f.error) console.log(`       erro: ${f.error}`);
    });
  }

  // Salvar relatório
  if (opts.report) {
    const reportPath = path.isAbsolute(opts.report)
      ? opts.report
      : path.join(projectRoot, opts.report);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          total: channels.length,
          tested: results.length,
          ok: ok.length,
          failed: failed.length,
          byClassification: byClass,
          failures: failed,
          results,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`\n📄 Relatório salvo em: ${reportPath}`);
  }

  console.log('');
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});
