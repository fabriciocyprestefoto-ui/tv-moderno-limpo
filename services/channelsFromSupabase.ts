import type { Channel } from '@/types';
import { env } from '@/config/env';
import { pickFirstRealStreamUrlFromRow } from '@/utils/streamUrlGuards';
import { sanitizeFontezChannels } from '@/utils/sourceSanitizer';

// Supabase REST default cap = 1000. Carregar em 1-2 requests reduz spinner em ~1s
// na TV (Wi-Fi lenta) vs 7 requests de 200 cada.
const PAGE_SIZE = 1000;

function rowToChannel(row: Record<string, unknown>): Channel | null {
  const stream_url = pickFirstRealStreamUrlFromRow(row);
  const name = String(row.name ?? row.nome ?? '').trim();
  if (!name || !stream_url) return null;

  const logo = String(
    row.logo ??
      row.logo_url ??
      row.logoUrl ??
      row.tvg_logo ??
      row['tvg-logo'] ??
      row.thumbnail ??
      row.image ??
      row.icon ??
      ''
  ).trim();
  const category =
    String(row.category ?? row.genero ?? row.grupo ?? 'Variedades').trim() || 'Variedades';
  const programRaw = row.current_program ?? row.program ?? row.epg_current ?? row.epg_line;
  const program =
    typeof programRaw === 'string' && programRaw.trim() ? programRaw.trim() : undefined;

  return {
    id: row.id != null ? String(row.id) : undefined,
    name,
    logo,
    category,
    stream_url,
    number: (row.number as number | undefined) ?? (row.numero as number | undefined),
    is_premium: row.is_premium as boolean | undefined,
    program,
  };
}

/**
 * Carrega canais da tabela `channels` via REST paginado (sem cliente Supabase JS).
 * Evita travas de auth lock (lock:redx-auth) que afetam o cliente Supabase em alguns ambientes.
 */
export async function loadChannelsFromSupabase(): Promise<Channel[]> {
  const url = env.supabaseUrl;
  const key = env.supabaseAnonKey;
  if (!url || !key || typeof fetch === 'undefined') return [];

  const out: Channel[] = [];
  let offset = 0;

  for (;;) {
    const path = `channels?select=*&offset=${offset}&limit=${PAGE_SIZE}&order=id.asc`;
    let response: Response;
    const hasAbort = typeof AbortController !== 'undefined';
    const controller = hasAbort ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15_000) : null;
    try {
      response = await fetch(`${url}/rest/v1/${path}`, {
        signal: controller?.signal,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });
    } catch (err) {
      console.warn('[channelsFromSupabase] fetch error:', err);
      break;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn(
        '[channelsFromSupabase] HTTP',
        response.status,
        await response.text().catch(() => '')
      );
      break;
    }

    const data = (await response.json()) as Record<string, unknown>[];
    if (!data.length) break;

    for (const row of data) {
      const c = rowToChannel(row);
      if (c) out.push(c);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return sanitizeFontezChannels(out, 'channelsFromSupabase');
}
