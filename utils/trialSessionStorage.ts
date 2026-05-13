/**
 * Persistência da sessão trial (código de acesso) — módulo sem React para
 * AuthContext e hooks poderem usar sem ciclo de chunks (contexts em app-core).
 */

export const TRIAL_EXPIRED_KEY = 'redx_trial_expired';

export function clearTrialSession(): void {
  try {
    localStorage.removeItem('redx_trial_code');
    localStorage.removeItem('redx_trial_expires');
    localStorage.removeItem(TRIAL_EXPIRED_KEY);
  } catch (error) {
    console.error('Erro ao limpar sessão trial:', error);
  }
}

export function hasActiveTrialSession(): boolean {
  try {
    const code = localStorage.getItem('redx_trial_code');
    const expiresAtStr = localStorage.getItem('redx_trial_expires');

    if (!code || !expiresAtStr) {
      return false;
    }

    const expiresAt = new Date(expiresAtStr);
    const now = new Date();

    return expiresAt > now;
  } catch {
    return false;
  }
}
