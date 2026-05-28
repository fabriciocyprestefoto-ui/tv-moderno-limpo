/**
 * Service Worker — RedX Streaming v6
 * Cache inteligente — HTML5 apenas
 *
 * Estratégias:
 *   imagens WebP/TMDB        → CacheFirst (7 dias)
 *   API TMDB metadata         → StaleWhileRevalidate (1h)
 *   Supabase REST (channels)  → Passthrough
 *   Tudo mais                 → Network (sem cache)
 *
 * Zero dependência externa (sem Workbox).
 */

const CACHE_VERSION = 'redx-v6';
const CACHE_IMAGES = 'redx-images-v6';
const CACHE_API = 'redx-api-v6';
const OLD_DEAD_SOURCE_RE = /newoneblue(?:\.site)?/i;

// TTLs em ms
const TTL_IMAGES = 7 * 24 * 60 * 60 * 1000; // 7 dias
const TTL_API_TMDB = 60 * 60 * 1000;        // 1h
const TTL_API_SUPABASE = 2 * 60 * 60 * 1000; // 2h
const TTL_CLEANUP = 24 * 60 * 60 * 1000;    // 24h para limpeza

// ═══ Helpers ═══

function isImageRequest(url) {
  return (
    url.includes('wsrv.nl') ||
    url.includes('images.weserv.nl') ||
    url.includes('image.tmdb.org') ||
    url.includes('/img-proxy/') ||
    /\.(webp|jpg|jpeg|png|gif|svg)(\?|$)/i.test(url)
  );
}

function isDeadSourceRequest(url) {
  return OLD_DEAD_SOURCE_RE.test(String(url || ''));
}

/** Detecta ambiente de desenvolvimento (localhost) */
function isDevEnvironment(url) {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function isTmdbApi(url) {
  return url.includes('api.themoviedb.org');
}

function isSupabaseRest(url) {
  return url.includes('supabase.co/rest');
}

/** Verifica se entry cacheado expirou */
function isExpired(response, ttl) {
  const date = response.headers.get('sw-cache-time');
  if (!date) return true;
  return (Date.now() - parseInt(date, 10)) > ttl;
}

/** Clona response adicionando timestamp para controle de TTL */
function withTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cache-time', Date.now().toString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Valida se recurso no cache ainda é válido usando ETag ou Last-Modified */
async function validateWithHeaders(request, campaignResponse) {
  try {
    // Preparar headers apara validação 304
    const headers = new Headers();
    
    const eTag = campaignResponse.headers.get('etag');
    if (eTag) headers.set('if-none-match', eTag);
    
    const lastModified = campaignResponse.headers.get('last-modified');
    if (lastModified) headers.set('if-modified-since', lastModified);

    const validationRequest = new Request(request, {
      method: 'HEAD',
      headers
    });

    const response = await fetch(validationRequest);
    
    // 304 Not Modified = cache ainda é válido
    if (response.status === 304) {
      return campaignResponse; // Continue usando cache
    }

    // Novo recurso (200) = atualizar cache
    if (response.status === 200) {
      return response;
    }

    // Qualquer outro status = manter cache antigo
    return campaignResponse;
  } catch {
    // Erro na validação = manter cache antigo
    return campaignResponse;
  }
}

// ═══ Estratégias de Cache ═══

/**
 * StaleWhileRevalidate com ETag: retorna cache imediatamente, valida com ETag em background
 * Se cache expirou, espera network. 304 = cache válido, 200 = novo recurso.
 */
async function staleWhileRevalidate(request, cacheName, ttl) {
  let cache; let cached;
  try {
    cache = await caches.open(cacheName);
    cached = await cache.match(request);
  } catch {
    try { return await fetch(request); } catch { return new Response('Offline', { status: 503 }); }
  }

  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        // Se server retorna 304, significa que cache ainda está válido
        if (networkResponse.status !== 304) {
          await cache.put(request, withTimestamp(networkResponse.clone()));
        }
      }
      return networkResponse;
    })
    .catch(() => null);

  // Se temos cache válido (não expirado), retorna imediatamente
  if (cached && !isExpired(cached, ttl)) {
    // Validar cache com ETag em background (não espera)
    (async () => {
      try {
        const validated = await validateWithHeaders(request, cached);
        if (validated !== cached && validated.ok) {
          await cache.put(request, withTimestamp(validated));
        }
      } catch { /* ignore */ }
    })();
    return cached;
  }

  // Cache expirado ou inexistente — espera network com validação
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    // Se recebeu 304, significa cache anterior era válido
    if (networkResponse.status === 304 && cached) {
      return cached;
    }
    return networkResponse;
  }

  // Network falhou — retorna cache stale como último recurso
  if (cached) return cached;

  // Nada disponível
  return new Response('Offline', { status: 503 });
}

/**
 * CacheFirst: retorna cache se disponível e válido, senão busca network.
 * Trata ERR_CACHE_READ_FAILURE (cache corrompido) fazendo fallback para network.
 */
async function cacheFirst(request, cacheName, ttl) {
  let cache; let cached;
  try {
    cache = await caches.open(cacheName);
    cached = await cache.match(request);
  } catch {
    // ERR_CACHE_READ_FAILURE ou cache corrompido — ignora cache e vai direto para network
    try {
      return await fetch(request);
    } catch {
      return new Response('Offline', { status: 503 });
    }
  }

  if (cached && !isExpired(cached, ttl)) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && networkResponse.status === 200) {
      try {
        await cache.put(request, withTimestamp(networkResponse.clone()));
      } catch { /* ignora falha ao gravar cache */ }
    }
    return networkResponse;
  } catch {
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

/**
 * NetworkFirst: tenta network, se falhar usa cache.
 */
async function networkFirst(request, cacheName, ttl) {
  let cache;
  try {
    cache = await caches.open(cacheName);
  } catch {
    try { return await fetch(request); } catch { return new Response('Offline', { status: 503 }); }
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, withTimestamp(networkResponse.clone()));
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached && !isExpired(cached, ttl)) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// ═══ Event Handlers ═══

self.addEventListener('install', (event) => {
  // Ativar imediatamente sem esperar abas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Limpar caches antigos que não são da versão atual
  const CURRENT_CACHES = new Set([CACHE_VERSION, CACHE_IMAGES, CACHE_API]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !CURRENT_CACHES.has(key))
          .map((key) => caches.delete(key))
      )
    )
      .then(async () => {
        const currentKeys = await caches.keys();
        await Promise.all(
          currentKeys.map(async (cacheName) => {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();
            await Promise.all(
              requests
                .filter((request) => isDeadSourceRequest(request.url))
                .map((request) => cache.delete(request))
            );
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Ignorar requests não-GET
  if (request.method !== 'GET') return;

  // Ignorar requests de extensão, chrome-extension, etc.
  if (!url.startsWith('http')) return;

  if (isDeadSourceRequest(url)) {
    event.respondWith(new Response('', { status: 410, statusText: 'Dead source removed' }));
    return;
  }

  // ── Imagens (WebP proxy, TMDB) ──
  // Em dev: NetworkFirst para evitar ERR_CACHE_READ_FAILURE com cache corrompido
  // Em prod: CacheFirst (raramente mudam)
  if (isImageRequest(url)) {
    if (isDevEnvironment(url)) {
      event.respondWith(networkFirst(request, CACHE_IMAGES, TTL_IMAGES));
    } else {
      event.respondWith(cacheFirst(request, CACHE_IMAGES, TTL_IMAGES));
    }
    return;
  }

  // ── API TMDB → StaleWhileRevalidate ──
  if (isTmdbApi(url)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_API, TTL_API_TMDB));
    return;
  }

  // ── Supabase REST → Passthrough (sem cache do SW para evitar dados stale) ──
  if (isSupabaseRest(url)) {
    return; // Deixar o browser lidar diretamente — sem interceptação
  }

  // ── Tudo mais → Network normal (sem cache do SW) ──
});

// ═══ Cleanup periódico de cache ═══
// Limpar entries expirados a cada 30 min
setInterval(async () => {
  try {
    // Limpar API responses expirados (>2h)
    const apiCache = await caches.open(CACHE_API);
    const apiKeys = await apiCache.keys();
    let apiDeleted = 0;
    for (const req of apiKeys) {
      const res = await apiCache.match(req);
      if (res && isExpired(res, TTL_API_TMDB * 2)) {
        await apiCache.delete(req);
        apiDeleted++;
      }
    }

    if (apiDeleted > 0) {
      console.log(`[SW] Cleanup: deleted ${apiDeleted} API entries`);
    }
  } catch (err) {
    console.warn('[SW] Cleanup error:', err.message);
  }
}, 30 * 60 * 1000); // 30 min
