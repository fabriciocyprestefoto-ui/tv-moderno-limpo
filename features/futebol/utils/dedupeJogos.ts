import { normalizeTeamName } from '@/features/futebol/services/futebolService';

function normTeam(s: string | null | undefined): string {
  return normalizeTeamName(s || '')
    .replace(/saf$/g, '')
    .replace(/fc$/g, '')
    .replace(/futebolclube$/g, '')
    .trim();
}

/**
 * Remove jogos duplicados: idEvent; senão par mandante/visitante (ordem-independente) + data + hora.
 */
export function dedupeFutebolEventos<
  T extends {
    idEvent?: string | null;
    strHomeTeam?: string | null;
    strAwayTeam?: string | null;
    dateEvent?: string | null;
    strTime?: string | null;
  },
>(jogos: T[]): T[] {
  const seenId = new Set<string>();
  const seenPair = new Set<string>();
  return jogos.filter((j) => {
    const rawId = j.idEvent;
    if (rawId != null && String(rawId).trim() !== '') {
      const k = `id:${rawId}`;
      if (seenId.has(k)) return false;
      seenId.add(k);
      return true;
    }
    const a = normTeam(j.strHomeTeam);
    const b = normTeam(j.strAwayTeam);
    const t1 = a <= b ? a : b;
    const t2 = a <= b ? b : a;
    const dateKey = String(j.dateEvent || '').trim();
    const timeKey = String(j.strTime || '')
      .trim()
      .slice(0, 5);
    const key = `${t1}__${t2}__${dateKey}__${timeKey}`;
    if (seenPair.has(key)) return false;
    seenPair.add(key);
    return true;
  });
}
