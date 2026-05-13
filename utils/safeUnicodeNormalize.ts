/**
 * Remove diacríticos via NFD + combinação. Em WebViews antigos (TV Box) `String.normalize`
 * pode não existir ou lançar — nesse caso devolve a string original para não derrubar a UI.
 */
export function stripDiacriticsSafe(input: string): string {
  const s = String(input ?? '');
  try {
    if (typeof s.normalize === 'function') {
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
  } catch {
    /* engine rejeitou normalize */
  }
  return s;
}
