/**
 * config/platformConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fonte única de verdade para aliases de plataformas de streaming.
 *
 * Anteriormente duplicado em:
 *   - pages/Kids.tsx
 *   - components/PlatformFilterBanner.tsx
 *
 * Como usar:
 *   import { PLATFORM_ALIASES, getPlatformAliases } from '../config/platformConfig';
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Mapeamento de nome canônico da plataforma → lista de variações aceitas
 * no campo `platform` do banco de dados (case-insensitive).
 *
 * Ao adicionar uma nova plataforma: insira em ordem alfabética para facilitar
 * revisão e evite duplicar aliases já existentes em outras entradas.
 */
export const PLATFORM_ALIASES: Record<string, string[]> = {
  'Apple TV+': ['apple tv', 'apple tv+', 'apple tv store'],
  'Claro Video': ['claro video', 'claro tv'],
  Crunchyroll: ['crunchyroll'],
  'Disney+': ['disney plus', 'disney+'],
  Globoplay: ['globoplay'],
  'HBO Max': ['hbo max'],
  Max: ['hbo max', 'max'],
  Netflix: ['netflix'],
  'Paramount+': ['paramount plus', 'paramount+'],
  'Pluto TV': ['pluto tv'],
  'Prime Video': ['amazon prime video', 'prime video', 'amazon video'],
  'Warner Bros': ['warner'],
};

/**
 * Retorna os aliases para uma plataforma pelo nome canônico.
 * Fallback seguro: retorna array com o nome em lowercase se não encontrado.
 *
 * @example
 *   getPlatformAliases('Netflix')   // → ['netflix']
 *   getPlatformAliases('Unknown')   // → ['unknown']
 */
export function getPlatformAliases(platformName: string): string[] {
  return PLATFORM_ALIASES[platformName] ?? [platformName.toLowerCase()];
}

/**
 * Verifica se um valor do campo `platform` no banco corresponde
 * a um determinado nome canônico de plataforma.
 *
 * @example
 *   matchesPlatform('amazon prime video', 'Prime Video') // → true
 *   matchesPlatform('netflix', 'Disney+')                // → false
 */
export function matchesPlatform(dbValue: string, platformName: string): boolean {
  const aliases = getPlatformAliases(platformName);
  const normalized = dbValue.toLowerCase();
  return aliases.some((alias) => normalized.includes(alias));
}
