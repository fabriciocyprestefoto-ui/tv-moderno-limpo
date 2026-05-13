#!/usr/bin/env node
/**
 * Script para executar migration de access_codes no Supabase
 * Uso: node scripts/run_access_codes_migration.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_ROLE_KEY = requireServiceRoleKey();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function runMigration() {
  console.log('🚀 Executando migration de access_codes...\n');

  try {
    // Ler arquivo SQL
    const sqlPath = join(
      __dirname,
      '..',
      'supabase',
      'migrations',
      'create_access_codes_table.sql'
    );
    const sqlContent = readFileSync(sqlPath, 'utf8');

    console.log('📄 Migration carregada:', sqlPath);
    console.log('📏 Tamanho:', sqlContent.length, 'bytes\n');

    // Executar via REST API do Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sql: sqlContent }),
    });

    if (!response.ok) {
      // Tentar método alternativo
      console.log('⚠️  Método RPC não disponível, tentando via SQL direto...\n');

      const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });

      if (error) {
        throw new Error(`Erro ao executar SQL: ${error.message}`);
      }

      console.log('✅ Migration executada com sucesso!');
      console.log('📊 Resultado:', data);
    } else {
      const result = await response.json();
      console.log('✅ Migration executada com sucesso!');
      console.log('📊 Resultado:', result);
    }

    // Verificar se tabela foi criada
    const { data: tables, error: tableError } = await supabase
      .from('access_codes')
      .select('*')
      .limit(1);

    if (tableError) {
      console.log('\n⚠️  Aviso: Não foi possível verificar tabela:', tableError.message);
      console.log('Mas a migration pode ter sido executada com sucesso.');
    } else {
      console.log('\n✅ Tabela access_codes verificada e funcionando!');
    }

    console.log('\n🎉 Migration concluída!');
    console.log('\n📝 Próximos passos:');
    console.log('  1. Teste a geração de códigos no Admin');
    console.log('  2. Verifique se os códigos são salvos corretamente');
    console.log('  3. Teste a validação de códigos no Login');
  } catch (error) {
    console.error('\n❌ Erro ao executar migration:', error.message);
    console.error('\n💡 Solução alternativa:');
    console.error('  1. Abra o Supabase Dashboard');
    console.error('  2. Vá em SQL Editor');
    console.error('  3. Cole o conteúdo de supabase/migrations/create_access_codes_table.sql');
    console.error('  4. Execute manualmente');
    process.exit(1);
  }
}

runMigration();
