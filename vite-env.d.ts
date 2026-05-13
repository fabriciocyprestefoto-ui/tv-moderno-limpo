/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference types="vite/client" />
/// <reference path="./types/windowExtensions.ts" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Opcional: base URL para imagens WebP em Storage (default: mesmo projeto que VITE_SUPABASE_URL) */
  readonly VITE_SUPABASE_IMAGES_URL?: string;
  readonly VITE_TMDB_API_KEY?: string;
  readonly VITE_TMDB_READ_TOKEN?: string;
  readonly VITE_TMDB_READ_TOKENS?: string;
  /** Versão exposta no bundle (Sentry release, diagnóstico). Default: campo `version` do package.json no build. */
  readonly VITE_APP_VERSION: string;
  /** Opcional: identificador de build/distribuição no Sentry (ex.: número de CI). */
  readonly VITE_SENTRY_DIST?: string;
  /** Canal de build: production, testing, staging, qa, e2e ou internal. */
  readonly VITE_BUILD_CHANNEL?: string;
  /** Alvo arquitetural do bundle: tv, web ou legacy. */
  readonly VITE_APP_TARGET?: string;
  /** Flag explícita para bundle Android TV/Capacitor. */
  readonly VITE_TV_BUILD?: string;
  /** Flag explícita para bundle web/browser. */
  readonly VITE_WEB_BUILD?: string;
  /** Flag explícita para manter caminhos legados isolados. */
  readonly VITE_LEGACY_BUILD?: string;
  /** Flag de build Capacitor; também pode ser inferida por scripts android/apk. */
  readonly VITE_CAPACITOR_BUILD?: string;
  /** Quando true no bundle (ex. APK de teste), aceita o código de acesso 000000 sem validar no servidor. */
  readonly VITE_TV_TEST_LOGIN?: string;
  /** Quando `1`, habilita ganchos usados pelos testes E2E (nunca em APK de loja). */
  readonly VITE_E2E?: string;
  /** Apenas dev: fallback se a Edge Function verify-admin-password não estiver disponível */
  readonly VITE_ADMIN_PASSWORD_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
