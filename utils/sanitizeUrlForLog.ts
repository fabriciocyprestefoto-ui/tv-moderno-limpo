/**
 * sanitizeUrlForLog — mascara tokens/credenciais antes de logar no app.
 *
 * Logs manuais (console.warn/logger) NUNCA devem imprimir token completo, pois
 * aparecem no logcat da TV (TCL/Fire Stick) e podem vazar credencial de stream.
 * O DevTools do navegador ainda mostra o token na aba Network porque é a
 * requisição real — isso é esperado e fora do nosso controle.
 *
 * Mostra host[:porta] + path + query com chaves sensíveis mascaradas, o
 * suficiente para diagnosticar (qual edge, qual stream) sem expor o segredo.
 */

const SENSITIVE_QUERY_RE =
  /^(token|access_token|auth|authorization|signature|sig|expires|expires_at|key|jwt)$/i;

const SENSITIVE_QUERY_INLINE_RE =
  /([?&](?:token|access_token|auth|authorization|signature|sig|expires|expires_at|key|jwt)=)[^&\s]+/gi;

export function sanitizeUrlForLog(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    for (const queryKey of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_RE.test(queryKey)) {
        parsed.searchParams.set(queryKey, '***MASKED***');
      }
    }
    // Mascara usuário/senha embutidos (http://user:pass@host) se houver.
    const auth = parsed.username || parsed.password ? '***:***@' : '';
    const query = parsed.searchParams.toString();
    return `${auth}${parsed.host}${parsed.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return raw.replace(SENSITIVE_QUERY_INLINE_RE, '$1***MASKED***').slice(0, 200);
  }
}
