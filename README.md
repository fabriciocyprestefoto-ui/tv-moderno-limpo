# RedFlix TV Moderno

Plataforma de streaming (VOD + TV ao vivo + Futebol) multiplataforma:
**Web** (browser), **Desktop** (Electron), **Android TV / TV Box** (Capacitor + WebView + player nativo Media3/ExoPlayer).

> Stack: React 18 · Vite 6 · TypeScript (strict) · Tailwind 4 · Capacitor 8 · Supabase (REST/RLS) · HLS.js · Framer Motion · @tanstack/react-virtual · Sentry · Electron.
> Estado via React hooks + Context (não há Zustand, apesar de mencionado em docs antigas).

---

## 1. Pré-requisitos
- Node 20+ e npm.
- Conta Supabase (DB + Auth + Edge Functions).
- JDK + Android SDK (para build APK). adb em `platform-tools`.
- Supabase CLI (para migrations e edge functions): https://supabase.com/docs/guides/cli

## 2. Setup rápido (web/dev)
```bash
npm install
cp .env.example .env        # preencher VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (mínimo)
npm run dev                 # http://localhost:5173
```

## 3. Variáveis de ambiente
Ver `.env.example` (documentado). Mínimo para subir: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Grupos: Supabase, TMDB (api key/tokens), Sports/Futebol, Sentry, flags de build/target, login de teste.
`SUPABASE_SERVICE_ROLE_KEY` é **só para scripts Node locais** — nunca vai no bundle/APK.

## 4. Backend Supabase (reprodutibilidade) — **AÇÃO NECESSÁRIA**
O schema do banco e as Edge Functions **não estão versionados no repo** (estavam só no projeto Supabase). Para um clone limpo subir o backend, gere os artefatos a partir do projeto real:

```bash
supabase login
supabase link --project-ref SEU_REF
# Schema fiel (tabelas, RLS, constraints, índices) → cria supabase/migrations/*.sql
supabase db pull
# Código real das functions → supabase/functions/*
supabase functions download tmdb-proxy
supabase functions download verify-admin-password
git add supabase/ && git commit -m "chore: versionar schema + edge functions"
```

Tabelas observadas (referência; gerar DDL fiel com `db pull`): ver `supabase/README.md`.

Edge Functions usadas pelo app:
- **tmdb-proxy** — proxy do TMDB (esconde/round-robin de tokens). Base: `${SUPABASE_URL}/functions/v1/tmdb-proxy`.
- **verify-admin-password** — valida senha do painel admin (secret `ADMIN_PASSWORD`).
Deploy: `npm run supabase:deploy-tmdb-fn` · `npm run supabase:deploy-admin-fn`.

> RLS: o app cliente lê via REST anon (`channels`, `adult_streams`, etc.). Sem as policies de leitura anon, o app não recebe dados. Por isso o `db pull` (que captura RLS) é obrigatório para reprodução fiel.

## 5. Builds
```bash
npm run build            # web (dist/)
npm run build:apk:debug  # APK debug → raiz: redflix-tvmoderno.apk
npm run build:apk        # APK release ASSINADO (requer android/redx-release.jks + creds, ver §7)
npm run build:desktop    # Electron (Windows portable)
```
Targets: `VITE_APP_TARGET=tv|web|legacy`. `legacy` usa `@vitejs/plugin-legacy` (WebView Chromium antigo de TV box).

## 6. Instalar em TV (adb)
```bash
adb connect 192.168.0.4:5555   # TCL (exemplo)
adb -s 192.168.0.4:5555 install -r -d redflix-tvmoderno.apk
```

## 7. Release assinado (Android)
Requer `android/redx-release.jks` + credenciais (em `android/local.properties` ou env): `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
Anti-repack: `AppValidator` valida a assinatura **em release** (`MainActivity.onCreate`). Antes de publicar, confirme `EXPECTED_SIGNATURE` (`android/app/src/main/java/com/redx/tvbox/AppValidator.java`) com o SHA-256 do certificado:
```bash
keytool -list -v -keystore android/redx-release.jks   # usar o SHA256 (hex, sem ':', 64 chars)
```

## 8. Testes
```bash
npm test            # Vitest (unit, node+jsdom)
npm run cy:run      # Cypress E2E (specs em cypress/e2e/)
```

## 9. Arquitetura (resumo)
- `pages/` rotas (lazy). `components/` UI. `features/` (futebol, livetv). `services/` integrações (Supabase, TMDB, sports, streams). `hooks/` (navegação D-pad, catálogo). `contexts/`.
- Navegação TV: motor geométrico em `hooks/useRemoteNavigation.ts` (D-pad/foco/back).
- Player: nativo Media3/ExoPlayer (Activity Android) via plugin `NativePlayer`; fallback HLS.js web. Gating por device.
- Catálogo: Supabase + enriquecimento TMDB progressivo (SWR), fileiras virtualizadas.

## 10. Roadmap de qualidade
Ver `PLANO_NIVEL_NETFLIX.md` (plano faseado + log de progresso).
