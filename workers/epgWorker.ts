/**
 * epgWorker.ts — Web Worker para parse de XMLTV
 * Roda fora da main thread para não travar a UI em TV Box com CPU fraco.
 *
 * Recebe: { xmlText: string }
 * Retorna: { channels: SerializedEPGChannel[] }
 */

interface SerializedProgramme {
  title: string;
  description: string;
  category: string;
  start: number; // timestamp ms (Date não é transferível via postMessage)
  stop: number;
  channelId: string;
  isLive: boolean;
  episode?: string;
}

interface SerializedEPGChannel {
  id: string;
  displayName: string;
  icon?: string;
  programmes: SerializedProgramme[];
}

/** Parse data XMLTV: "20260212060000 +0000" → timestamp ms */
function parseXMLTVDate(str: string): number {
  const clean = str.trim();
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  const hour = parseInt(clean.substring(8, 10));
  const min = parseInt(clean.substring(10, 12));
  const sec = parseInt(clean.substring(12, 14));

  const tzMatch = clean.match(/([+-]\d{4})$/);
  if (tzMatch) {
    const tzStr = tzMatch[1];
    const tzSign = tzStr[0] === '+' ? 1 : -1;
    const tzHours = parseInt(tzStr.substring(1, 3));
    const tzMins = parseInt(tzStr.substring(3, 5));
    const totalOffsetMs = tzSign * (tzHours * 60 + tzMins) * 60 * 1000;
    return Date.UTC(year, month, day, hour, min, sec) - totalOffsetMs;
  }

  return new Date(year, month, day, hour, min, sec).getTime();
}

function parseXMLTV(xmlText: string): SerializedEPGChannel[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const channelMap = new Map<string, SerializedEPGChannel>();

  // Parse canais
  const channelNodes = doc.querySelectorAll('channel');
  channelNodes.forEach((node) => {
    const id = node.getAttribute('id') || '';
    const displayName = node.querySelector('display-name')?.textContent || id;
    const icon = node.querySelector('icon')?.getAttribute('src') || undefined;
    if (id) {
      channelMap.set(id, { id, displayName, icon, programmes: [] });
    }
  });

  // Parse programas (só hoje/amanhã)
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 2 * 24 * 60 * 60 * 1000;

  const progNodes = doc.querySelectorAll('programme');
  progNodes.forEach((node) => {
    const channelId = node.getAttribute('channel') || '';
    const startStr = node.getAttribute('start') || '';
    const stopStr = node.getAttribute('stop') || '';

    if (!channelId || !startStr || !stopStr) return;

    const start = parseXMLTVDate(startStr);
    const stop = parseXMLTVDate(stopStr);

    if (stop < dayStartMs || start > dayEndMs) return;

    const title = node.querySelector('title')?.textContent?.trim() || '';

    const descNode = node.querySelector('desc');
    let description = descNode?.textContent?.trim() || '';

    let category = node.querySelector('category')?.textContent?.trim() || '';
    if (!category && description) {
      const lines = description.split('\n');
      if (lines.length > 1 && lines[0].length < 30) {
        category = lines[0].trim();
        description = lines.slice(1).join('\n').trim();
      }
    }

    const episodeNum = node.querySelector('episode-num')?.textContent || '';
    const isLive =
      category.toLowerCase().includes('live') || title.toLowerCase().includes('ao vivo');

    const programme: SerializedProgramme = {
      title,
      description,
      category,
      start,
      stop,
      channelId,
      isLive,
      episode: episodeNum || undefined,
    };

    const channel = channelMap.get(channelId);
    if (channel) {
      channel.programmes.push(programme);
    } else {
      channelMap.set(channelId, {
        id: channelId,
        displayName: channelId,
        programmes: [programme],
      });
    }
  });

  // Ordenar programas por horário
  channelMap.forEach((ch) => {
    ch.programmes.sort((a, b) => a.start - b.start);
  });

  return Array.from(channelMap.values());
}

// ── Worker message handler ──
self.onmessage = (e: MessageEvent<{ xmlText: string }>) => {
  try {
    const { xmlText } = e.data;
    const channels = parseXMLTV(xmlText);
    (self as any).postMessage({ success: true, channels });
  } catch (err: any) {
    (self as any).postMessage({ success: false, error: err?.message || 'Parse error' });
  }
};
