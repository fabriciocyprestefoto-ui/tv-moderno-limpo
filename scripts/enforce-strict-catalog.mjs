#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function enforceStrictCatalog() {
  console.log('🚀 Iniciando Auditoria Estrita de Catálogo...');

  const tables = ['movies', 'series'];

  for (const table of tables) {
    console.log(`\n📦 Analisando tabela: ${table}`);

    // Buscar todos para filtrar localmente (quem não tem URL funcional ou poster)
    const { data, error } = await supabase.from(table).select('id, title, url, poster, tmdb_id');

    if (error) {
      console.error(`❌ Erro ao buscar ${table}:`, error.message);
      continue;
    }

    const toDelete = data.filter((item) => {
      const hasUrl =
        item.url && item.url.startsWith('http') && !item.url.includes('api.cdnapp.fun');
      const hasPoster = item.poster && item.poster.includes('tmdb.org');
      const hasTmdbId = !!item.tmdb_id;

      // Se FALHAR em qualquer um dos requisitos, deletar
      return !hasUrl || !hasPoster || !hasTmdbId;
    });

    if (toDelete.length > 0) {
      console.log(`⚠️  Encontrados ${toDelete.length} itens inválidos em ${table}. Removendo...`);
      const ids = toDelete.map((i) => i.id);

      // Deletar em lotes de 100
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error: delError } = await supabase.from(table).delete().in('id', chunk);
        if (delError) {
          console.error(`❌ Erro ao deletar lote em ${table}:`, delError.message);
        } else {
          console.log(`✅ Lote ${Math.floor(i / 100) + 1} removido.`);
        }
      }
    } else {
      console.log(`✨ Tabela ${table} está limpa e segue as regras estritas.`);
    }
  }

  console.log('\n🎉 Auditoria concluída com sucesso!');
}

enforceStrictCatalog().catch(console.error);
