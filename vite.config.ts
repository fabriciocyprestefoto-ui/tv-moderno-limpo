import fs from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';
import { shouldBlockProductionTestAccessCode } from './config/testAccessCode';

/** Pastas em `public/` que não devem ir para o APK — removidas do `dist` após o bundle (ex.: cópia acidental enorme). */
function stripMistakenPublicCopies(rootDir: string, dirNames: string[]): Plugin {
  const removeCopies = async () => {
    const outDir = path.join(rootDir, 'dist');
    await Promise.all(
      dirNames.map((name) =>
        fs.promises.rm(path.join(outDir, name), { recursive: true, force: true })
      )
    );
  };

  return {
    name: 'strip-mistaken-public-copies',
    enforce: 'post',
    apply: 'build',
    writeBundle: removeCopies,
    closeBundle: removeCopies,
  };
}

function stripCapacitorServiceWorker(rootDir: string, enabled: boolean): Plugin {
  return {
    name: 'strip-capacitor-service-worker',
    apply: 'build',
    async closeBundle() {
      if (!enabled) return;
      const outDir = path.join(rootDir, 'dist');
      await Promise.all(
        ['sw.js', 'workbox-*.js', 'registerSW.js', 'manifest.webmanifest'].map(async (name) => {
          if (name.includes('*')) {
            const entries = await fs.promises.readdir(outDir).catch(() => []);
            await Promise.all(
              entries
                .filter((entry) => new RegExp(`^${name.replace('*', '.*')}$`).test(entry))
                .map((entry) => fs.promises.rm(path.join(outDir, entry), { force: true }))
            );
            return;
          }
          await fs.promises.rm(path.join(outDir, name), { force: true });
        })
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname);
  const env = loadEnv(mode, envDir, '');
  const isProductionBuild = mode === 'production';
  const pkgJson = JSON.parse(fs.readFileSync(path.join(envDir, 'package.json'), 'utf-8')) as {
    version?: string;
  };
  const appVersion = String(env.VITE_APP_VERSION || pkgJson.version || '0.0.0').trim();

  const isEnabled = (value?: string) =>
    ['1', 'true', 'yes', 'on'].includes(
      String(value || '')
        .trim()
        .toLowerCase()
    );

  const tvTestLoginEnabled = isEnabled(env.VITE_TV_TEST_LOGIN);
  const lifecycle = String(process.env.npm_lifecycle_event || '');
  const isCapacitorBuild =
    isEnabled(env.VITE_CAPACITOR_BUILD) || /(?:android|apk)/i.test(lifecycle);
  const rawAppTarget = String(env.VITE_APP_TARGET || (isCapacitorBuild ? 'tv' : 'web'))
    .trim()
    .toLowerCase();
  const appBuildTarget = ['tv', 'web', 'legacy'].includes(rawAppTarget)
    ? rawAppTarget
    : isCapacitorBuild
      ? 'tv'
      : 'web';
  const isLegacyBuild = appBuildTarget === 'legacy' || isEnabled(env.VITE_LEGACY_BUILD);
  const isTvBuild = appBuildTarget === 'tv' || isEnabled(env.VITE_TV_BUILD) || isCapacitorBuild;
  const isWebBuild = appBuildTarget === 'web' || isEnabled(env.VITE_WEB_BUILD);
  /** Com login de teste na TV, canal por omissão = testing (senão ficava "production" e o código 000000 não ativava no APK). */
  const defaultBuildChannel = isProductionBuild
    ? tvTestLoginEnabled
      ? 'testing'
      : 'production'
    : mode;
  const buildChannel = String(env.VITE_BUILD_CHANNEL?.trim() || defaultBuildChannel).trim();

  // SECURITY GUARD: FAKE_LOGIN nunca deve chegar em produção
  if (isProductionBuild && isEnabled(env.VITE_FAKE_LOGIN)) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_FAKE_LOGIN=true está proibido em produção!\n' +
        'Remova ou defina VITE_FAKE_LOGIN=false antes de fazer o build de produção.\n'
    );
  }

  if (isProductionBuild && isEnabled(env.VITE_ADMIN_BYPASS)) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_ADMIN_BYPASS=true está proibido em produção!\n' +
        'Remova esse bypass antes de gerar builds distribuíveis.\n'
    );
  }

  if (isProductionBuild && isEnabled(env.VITE_SKIP_AUTH)) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_SKIP_AUTH=true está proibido em produção!\n' +
        'Remova esse bypass antes de gerar builds distribuíveis.\n'
    );
  }

  if (
    shouldBlockProductionTestAccessCode({
      isProductionBuild,
      tvTestLoginEnabled,
      buildChannel,
    })
  ) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_TV_TEST_LOGIN=true com VITE_BUILD_CHANNEL=production não é permitido.\n' +
        'O código 000000 fica ativo em APK de teste: use só VITE_TV_TEST_LOGIN=true (canal testing por omissão)\n' +
        'ou defina VITE_BUILD_CHANNEL=testing|internal|staging. Para loja: VITE_TV_TEST_LOGIN=false.\n'
    );
  }

  if (isProductionBuild && String(env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_SUPABASE_SERVICE_ROLE_KEY nunca pode ir para o bundle cliente.\n' +
        'Use apenas SUPABASE_SERVICE_ROLE_KEY em scripts/backend e remova a variante VITE_.\n'
    );
  }

  if (isProductionBuild && String(env.VITE_ADMIN_PASSWORD_FALLBACK || '').trim()) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_ADMIN_PASSWORD_FALLBACK está exposto no bundle JS — qualquer usuário\n' +
        'pode ler a senha de admin no DevTools do navegador.\n' +
        'Remova VITE_ADMIN_PASSWORD_FALLBACK do .env antes de gerar um build de produção.\n'
    );
  }

  if (isProductionBuild && String(env.VITE_BINSTREAM_PASSWORD || '').trim()) {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_BINSTREAM_PASSWORD está exposto no bundle JS — qualquer usuário\n' +
        'pode ler a senha Binstream no DevTools do navegador.\n' +
        'Remova VITE_BINSTREAM_PASSWORD do .env e faça a autenticação via backend/proxy seguro.\n'
    );
  }

  // VITE_ADULT_PIN vai para o bundle JS — qualquer usuário lê no DevTools.
  // Verificação deve ser server-side (Edge Function verify-adult-pin).
  const adultPin = String(env.VITE_ADULT_PIN || '').trim();
  if (isProductionBuild && adultPin && adultPin !== '') {
    throw new Error(
      '\n\n🚫 SEGURANÇA: VITE_ADULT_PIN está definido e será embutido no bundle JS em texto claro.\n' +
        'Qualquer usuário pode ler o PIN adulto via DevTools → Sources.\n' +
        'Remova VITE_ADULT_PIN do .env e mova a verificação para a Edge Function verify-adult-pin.\n'
    );
  }

  // APK / bundle: embute URL + anon key no JS — obrigatório usar credenciais reais do Dashboard (Settings → API).
  if (isProductionBuild) {
    const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnon = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
    const urlLower = supabaseUrl.toLowerCase();
    const placeholderHints = [
      'seu-projeto',
      'your-project',
      'example.com',
      'changeme',
      'placeholder',
      'xxx.supabase',
    ];
    if (!supabaseUrl) {
      throw new Error(
        '\n\n🚫 Build produção: VITE_SUPABASE_URL está vazio.\n' +
          'Defina no `.env` ou `.env.production` a URL do projeto (Dashboard → Settings → API → Project URL),\n' +
          'ex.: https://abcdefgh.supabase.co — depois volte a correr `npm run build` / `npm run build:apk`.\n'
      );
    }
    if (placeholderHints.some((h) => urlLower.includes(h))) {
      throw new Error(
        '\n\n🚫 Build produção: VITE_SUPABASE_URL parece placeholder (não é o projeto real).\n' +
          'Substitua pelo Project URL copiado do Supabase Dashboard.\n'
      );
    }
    const allowCustomHost = ['1', 'true', 'yes', 'on'].includes(
      String(env.VITE_ALLOW_CUSTOM_SUPABASE_URL || '')
        .trim()
        .toLowerCase()
    );
    const isDefaultSupabaseHost = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl);
    if (!isDefaultSupabaseHost && !allowCustomHost) {
      throw new Error(
        '\n\n🚫 Build produção: VITE_SUPABASE_URL deve ser https://<ref>.supabase.co (Project URL do Dashboard).\n' +
          `Valor atual: ${supabaseUrl.slice(0, 56)}${supabaseUrl.length > 56 ? '…' : ''}\n` +
          'Self-hosted / domínio próprio: defina VITE_ALLOW_CUSTOM_SUPABASE_URL=1 e mantenha HTTPS.\n'
      );
    }
    if (allowCustomHost && !/^https:\/\//i.test(supabaseUrl)) {
      throw new Error(
        '\n\n🚫 Build produção: com domínio customizado, VITE_SUPABASE_URL deve ser HTTPS.\n'
      );
    }
    if (!supabaseAnon || supabaseAnon.length < 80) {
      throw new Error(
        '\n\n🚫 Build produção: VITE_SUPABASE_ANON_KEY em falta ou demasiado curta.\n' +
          'Cole a chave **anon** / **publishable** (Dashboard → Settings → API) em `.env` ou `.env.production`.\n'
      );
    }
    if (!supabaseAnon.startsWith('eyJ')) {
      throw new Error(
        '\n\n🚫 Build produção: VITE_SUPABASE_ANON_KEY deve ser o JWT **anon public** (costuma começar por eyJ).\n' +
          'Não use a service_role no cliente.\n'
      );
    }
  }

  return {
    base: './',
    plugins: [
      react(),
      // Transpila sintaxe ES2017+ + polyfills core-js → roda em WebView Android 5
      // (Chromium 37-39). Targets cobrem Fire OS 5 (Chrome 39) e Android TV velho.
      legacy({
        targets: ['Android >= 5', 'Chrome >= 38'],
        modernPolyfills: true,
        renderLegacyChunks: true,
        polyfills: [
          'es.promise',
          'es.array.iterator',
          'es.object.assign',
          'es.symbol',
          'es.string.includes',
          'es.array.includes',
          'es.array.find',
          'es.array.find-index',
          'es.array.from',
          'es.array.flat',
          'es.array.flat-map',
          'es.object.entries',
          'es.object.values',
          'es.object.from-entries',
          'es.string.replace-all',
          'es.promise.all-settled',
          'esnext.global-this',
        ],
      }),
      ...(!isCapacitorBuild
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              injectRegister: 'auto',
              workbox: {
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                // Cache shell do app (JS/CSS/HTML) com StaleWhileRevalidate
                globPatterns: ['**/*.{js,css,html,woff2}'],
                // Não cachear chunks de admin e player no precache — sob demanda
                globIgnores: ['**/pages-admin*', '**/vendor-sentry*'],
                runtimeCaching: [
                  {
                    // Imagens TMDB — CacheFirst 7 dias (mudam raramente)
                    urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'tmdb-images',
                      expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                  {
                    // Assets wsrv.nl (proxy de imagem) — CacheFirst 3 dias
                    urlPattern: /^https:\/\/wsrv\.nl\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'wsrv-images',
                      expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 3 },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                  {
                    // Supabase REST — NetworkFirst (dados frescos, cache só em offline)
                    urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/.*/i,
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'supabase-rest',
                      networkTimeoutSeconds: 5,
                      expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                ],
                // Aumentar limite para HLS.js + framer-motion chunks
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
              },
              manifest: {
                name: 'Redflix',
                short_name: 'Redflix',
                description: 'Streaming de filmes, séries e canais ao vivo',
                theme_color: '#1E1B4B',
                background_color: '#000000',
                display: 'standalone',
                orientation: 'landscape',
                icons: [
                  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                  {
                    src: '/icons/icon-512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              // Dev: não ativar service worker em desenvolvimento
              devOptions: { enabled: false },
            }),
          ]
        : []),
      stripMistakenPublicCopies(envDir, ['futcard-main']),
      stripCapacitorServiceWorker(envDir, isCapacitorBuild),
    ],
    envDir,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
      'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(env.VITE_SENTRY_DSN || ''),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_BUILD_CHANNEL': JSON.stringify(buildChannel),
      'import.meta.env.VITE_TV_TEST_LOGIN': JSON.stringify(env.VITE_TV_TEST_LOGIN || ''),
      'import.meta.env.VITE_APP_TARGET': JSON.stringify(appBuildTarget),
      'import.meta.env.VITE_TV_BUILD': JSON.stringify(isTvBuild ? '1' : ''),
      'import.meta.env.VITE_WEB_BUILD': JSON.stringify(isWebBuild ? '1' : ''),
      'import.meta.env.VITE_LEGACY_BUILD': JSON.stringify(isLegacyBuild ? '1' : ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    build: {
      minify: 'terser',
      sourcemap: false,
      // hls.js, lucide-react e vendor-misc são naturalmente grandes; cache agressivo compensa.
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        treeshake: true,
        output: {
          manualChunks(id) {
            // ── Vendors ──────────────────────────────────────────────────────────
            if (id.includes('node_modules')) {
              if (id.includes('/node_modules/hls.js')) return 'vendor-hls';
              if (id.includes('framer-motion')) return 'vendor-motion';
              if (id.includes('@supabase')) return 'vendor-supabase';
              // Ícones em chunk dedicado para melhor cache HTTP
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('@capacitor')) return 'vendor-capacitor';
              if (id.includes('@tanstack')) return 'vendor-tanstack';
              if (id.includes('recharts') || id.includes('victory-') || id.includes('d3-'))
                return 'vendor-charts';
              if (id.includes('@sentry')) return 'vendor-sentry';
              if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router';
              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/scheduler/') ||
                id.includes('/node_modules/react-is/')
              ) {
                return 'vendor-react';
              }
              return 'vendor-misc';
            }

            // ── App: admin isolado para carregar somente quando necessário ────────
            // Checar components/admin ANTES da regra genérica de components/ para
            // evitar que admin caia no chunk app-ui (que é carregado na rota /).
            if (id.includes('/pages/admin/') || id.includes('/components/admin/'))
              return 'pages-admin';

            // ── Player e player controls (carregados sob demanda) ────────────────
            if (id.includes('/components/player/') || id.includes('/components/VideoPlayer/'))
              return 'components-player';

            // services + utils + contexts: chunk único evita ciclos (ex.: app-ui ↔ app-hooks
            // quando componentes importam contextos e AuthContext importava hooks). O
            // supabaseService fica aqui porque separar esse arquivo gerava ciclo
            // app-supabase ↔ app-core no Rollup.
            if (id.includes('/services/') || id.includes('/utils/') || id.includes('/contexts/'))
              return 'app-core';

            // Hooks + componentes no mesmo chunk — evita "Circular chunk" quando features
            // misturam pastas (ex.: features/.../hooks importadas por features/.../components).
            if (id.includes('/hooks/') || id.includes('/components/')) return 'app-ui-hooks';

            // Player (página pesada) — chunk próprio
            if (id.includes('/pages/Player') || id.includes('\\pages\\Player'))
              return 'pages-player';

            // Sem regra pages-app: cada React.lazy(() => import('./pages/X')) vira chunk
            // independente — TV Box carrega só a página visitada, não todas de uma vez.
            return undefined;
          },
        },
      },
    },
    // Configuração de testes movida para vitest.workspace.ts
    server: {
      port: Number(env.PORT || process.env.PORT) || 5173,
      strictPort: false,
      host: true,
      hmr: {
        overlay: false,
      },
      watch: {
        ignored: [
          '**/*.json',
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/android/**',
          '**/.claude/**',
          '**/appandroid/**',
          '**/cypress/**',
          '**/coverage/**',
          '**/_backup*/**',
          '**/como/**',
          '**/tv/**',
          '**/public/**/*.xml',
          '**/public/futcard-main/**',
          '**/public/adulto-data.m3u',
        ],
      },
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        // CSP dev: unsafe-inline necessário para HMR do Vite e detection script do plugin legacy.
        // unsafe-eval REMOVIDO — HLS.js 1.x ESM não usa eval; era resquício do HLS 0.x.
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          'img-src * data: blob:',
          'media-src * blob:',
          'connect-src * ws: wss:',
          "worker-src 'self' blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
        ].join('; '),
      },
      proxy: {
        '/tmdb-proxy': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/tmdb-proxy/, ''),
        },
        '/img-proxy': {
          target: 'https://wsrv.nl',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/img-proxy\/?/, '/'),
          // Whitelist de domínios permitidos — bloqueia proxy de IPs internos e domínios não autorizados
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const urlParam =
                new URL(req.url ?? '', 'http://localhost').searchParams.get('url') ?? '';
              const allowed = [
                'image.tmdb.org',
                'images.weserv.nl',
                'wsrv.nl',
                'm.media-amazon.com',
                'lh3.googleusercontent.com',
                'raw.githubusercontent.com',
              ];
              if (urlParam) {
                try {
                  const { hostname } = new URL(urlParam);
                  if (!allowed.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
                    proxyReq.destroy(new Error(`[img-proxy] Domínio não autorizado: ${hostname}`));
                  }
                } catch {
                  proxyReq.destroy(new Error(`[img-proxy] URL inválida: ${urlParam.slice(0, 80)}`));
                }
              }
            });
          },
        },
      },
    },
  };
});
