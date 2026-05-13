const SAFE_INTERNAL_REDIRECT = /^\/(?!\/)[^\s]*$/;

// Rotas restritas que não devem ser usadas como redirect para usuários comuns
const ADMIN_ONLY_PATHS = ['/admin'];

function isAdminOnlyPath(path: string): boolean {
  return ADMIN_ONLY_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

export function sanitizeInternalRedirect(redirect: string | null | undefined): string | null {
  const value = String(redirect || '').trim();
  if (!value || value === 'null' || value === 'undefined') return null;
  if (!SAFE_INTERNAL_REDIRECT.test(value)) return null;
  if (value.includes('://')) return null;
  return value;
}

/**
 * Consome o redirect pós-login salvo no localStorage.
 * @param storageKey - chave de storage
 * @param isAdmin - se true, permite redirecionamento para rotas admin; se false, bloqueia
 */
export function consumeSafePostLoginRedirect(
  storageKey = 'redx_post_login_redirect',
  isAdmin = false
): string | null {
  try {
    const rawRedirect = localStorage.getItem(storageKey);
    if (rawRedirect) localStorage.removeItem(storageKey);
    const safe = sanitizeInternalRedirect(rawRedirect);
    // Bloquear redirect para /admin se o usuário não for admin
    if (safe && isAdminOnlyPath(safe) && !isAdmin) return null;
    return safe;
  } catch {
    return null;
  }
}
