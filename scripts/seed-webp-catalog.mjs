/**
 * seed-webp-catalog.mjs
 *
 * Script batch para converter todas as URLs de imagens TMDB no banco
 * para URLs WebP otimizadas via proxy weserv.nl.
 *
 * Uso:
 *   node scripts/seed-webp-catalog.mjs
 *
 * O que faz:
 *   1. Lê todos os filmes e séries do Supabase
 *   2. Para cada item com poster/backdrop apontando para image.tmdb.org:
 *      - Gera URL WebP via proxy weserv.nl
 *      - Atualiza o registro no banco
 *   3. Pula itens que já estão otimizados (weserv.nl ou supabase.co)
 *   4. Processa em lotes para não sobrecarregar
 *
 * Requer no .env: VITE_SUPABASE_URL ou SUPABASE_URL, e SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

// ── Configuração Supabase (URL + service_role no .env) ─────────
const SUPABASE_URL = requireSupabaseUrl();
const SUPABASE_SERVICE_KEY = requireServiceRoleKey();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Proxy WebP ─────────────────────────────────────────────────
const PROXY_BASE = 'https://images.weserv.nl/';
const WEBP_QUALITY = 80;

const MAX_WIDTHS = {
  poster: 500,
  backdrop: 1280,
};

function toWebP(url, imageType = 'poster') {
  if (!url || url.length < 10) return url || '';
  if (url.includes('images.weserv.nl')) return url;
  if (url.includes('supabase.co/storage')) return url;
  if (url.toLowerCase().endsWith('.webp')) return url;
  if (!url.includes('image.tmdb.org')) return url;
  if (url.startsWith('data:')) return url;

  const cleanUrl = url.replace(/^https?:\/\//, '');
  const maxWidth = MAX_WIDTHS[imageType] || 500;
  return `${PROXY_BASE}?url=${encodeURIComponent(cleanUrl)}&output=webp&q=${WEBP_QUALITY}&w=${maxWidth}&we`;
}

// ── Processamento ──────────────────────────────────────────────
const BATCH_SIZE = 50; // Itens por query
const UPDATE_DELAY = 100; // ms entre updates

async function processTable(tableName) {
  console.log(`\n📋 Processando tabela: ${tableName}`);

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalProcessed = 0;

  while (true) {
    const { data: items, error } = await supabase
      .from(tableName)
      .select('id, poster, backdrop, title')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error(`❌ Erro ao ler ${tableName}:`, error.message);
      break;
    }

    if (!items || items.length === 0) break;

    for (const item of items) {
      totalProcessed++;
      const updates = {};
      let needsUpdate = false;

      // Verificar poster
      if (item.poster && item.poster.includes('image.tmdb.org')) {
        updates.poster = toWebP(item.poster, 'poster');
        needsUpdate = true;
      }

      // Verificar backdrop
      if (item.backdrop && item.backdrop.includes('image.tmdb.org')) {
        updates.backdrop = toWebP(item.backdrop, 'backdrop');
        needsUpdate = true;
      }

      if (!needsUpdate) {
        totalSkipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', item.id);

      if (updateError) {
        console.error(`  ❌ Erro ao atualizar "${item.title}" (${item.id}):`, updateError.message);
      } else {
        totalUpdated++;
        if (totalUpdated % 20 === 0) {
          console.log(`  ✅ ${totalUpdated} atualizados...`);
        }
      }

      // Pequeno delay para não sobrecarregar
      if (UPDATE_DELAY > 0) {
        await new Promise((ok) => setTimeout(ok, UPDATE_DELAY));
      }
    }

    offset += BATCH_SIZE;

    // Se retornou menos que BATCH_SIZE, acabou
    if (items.length < BATCH_SIZE) break;
  }

  console.log(
    `  📊 ${tableName}: ${totalProcessed} processados, ${totalUpdated} atualizados, ${totalSkipped} já otimizados`
  );
  return { totalProcessed, totalUpdated, totalSkipped };
}

async function main() {
  console.log('🚀 Iniciando conversão de catálogo para WebP...');
  console.log(`   Proxy: ${PROXY_BASE}`);
  console.log(`   Qualidade: ${WEBP_QUALITY}`);
  console.log(`   Poster max: ${MAX_WIDTHS.poster}px | Backdrop max: ${MAX_WIDTHS.backdrop}px`);

  const startTime = Date.now();

  const movies = await processTable('movies');
  const series = await processTable('series');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n════════════════════════════════════════');
  console.log('✅ Conversão concluída!');
  console.log(`   Filmes:  ${movies.totalUpdated} atualizados / ${movies.totalProcessed} total`);
  console.log(`   Séries:  ${series.totalUpdated} atualizados / ${series.totalProcessed} total`);
  console.log(`   Tempo:   ${elapsed}s`);
  console.log('════════════════════════════════════════');
}

main().catch((err) => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
