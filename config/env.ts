/**
 * config/env.ts — Validação centralizada de variáveis de ambiente
 * Garante que as variáveis obrigatórias estejam configuradas antes de usar.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente "${key}" não configurada. Defina no arquivo .env e faça o build novamente.`
    );
  }
  return value.trim();
}

function optionalEnv(key: string, fallback = ''): string {
  const value = import.meta.env[key] as string | undefined;
  return value?.trim() || fallback;
}

export const env = {
  supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('VITE_SUPABASE_ANON_KEY'),
  tmdbApiKey: optionalEnv('VITE_TMDB_API_KEY'),
  tmdbReadToken: optionalEnv('VITE_TMDB_READ_TOKEN'),
  sportsApiToken: optionalEnv('VITE_SPORTS_API_TOKEN'),
} as const;
