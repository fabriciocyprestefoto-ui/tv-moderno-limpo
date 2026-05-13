/**
 * Adiciona política RLS anon para home_banners e verifica acesso.
 * Execute: node scripts/fix-home-banners-rls.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
DO $$
BEGIN
  -- Permite leitura anônima de banners ativos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'home_banners' AND policyname = 'banners_anon_read'
  ) THEN
    CREATE POLICY banners_anon_read
      ON public.home_banners
      FOR SELECT TO anon
      USING (ativo = true);
    RAISE NOTICE 'Policy banners_anon_read criada.';
  ELSE
    RAISE NOTICE 'Policy banners_anon_read já existe.';
  END IF;
END;
$$;
`;

let rpcError = null;
try {
  const result = await sb.rpc('execute_sql', { query: sql });
  rpcError = result.error;
} catch {
  rpcError = { message: 'rpc não disponível' };
}

if (rpcError) {
  console.log('RPC não disponível — aplique manualmente no Supabase Dashboard (SQL Editor):');
  console.log(sql);
} else {
  console.log('Policy criada com sucesso.');
}

// Verificar acesso anon
const sbAnon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { data, error: e2 } = await sbAnon
  .from('home_banners')
  .select('id, tmdb_id, ativo')
  .eq('ativo', true)
  .limit(5);

if (e2) {
  console.log('Acesso anon ainda bloqueado:', e2.message);
} else {
  console.log('Acesso anon OK — banners visíveis:', data?.length ?? 0);
}
