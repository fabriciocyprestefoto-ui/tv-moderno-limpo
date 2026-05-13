import type { Session } from '@supabase/supabase-js';

/**
 * Verifica se a sessão tem claim de admin.
 *
 * Apenas app_metadata é confiável — é controlado pelo servidor (Supabase admin/service role).
 * user_metadata é MODIFICÁVEL pelo próprio usuário via supabase.auth.updateUser()
 * e NUNCA deve ser usado para decisões de autorização.
 */
export function hasAdminClaim(session: Session | null): boolean {
  const appRole = session?.user?.app_metadata?.role;
  return appRole === 'admin' || appRole === 'superadmin';
}
