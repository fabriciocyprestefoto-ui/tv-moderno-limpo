# Plano Nível Netflix — RedFlix TVBox

> Documento de execução faseada para elevar o produto de **6,4 → ~8,4** (profissional).
> Mantido atualizado a cada passo para permitir continuidade por outra IA/dev.
> **Não quebrar:** player nativo, login/PIN, canais, futebol, APIs, fluxo de stream.

## Como usar este arquivo
- Cada fase tem: objetivo, ações, critério de pronto, **STATUS**.
- Marque `[x]` ao concluir. Atualize a seção **LOG DE PROGRESSO** no fim.
- Builds: `npm run build:apk:debug` (copia para `redflix-tvmoderno.apk` na raiz).
- TVs de teste: TCL `192.168.0.4:5555`, Firestick `192.168.0.8:5555` (adb).
- adb: `C:\Users\Fabricio\AppData\Local\Android\Sdk\platform-tools\adb.exe`

## Linha de base (auditoria)
Média **6,4**. Notas: TV mode 8 · UX 8 · Performance 7 · Android 7 · Erros 6 · Código 6 · Testes 5 · **Segurança 4**.

---

## Fase 0 — Segurança crítica · Sec 4→7 · STATUS: PARCIAL (código pronto; 2 itens bloqueados por infra)
- [x] Reativar `AppValidator.validate()` — **apenas em release** (`if (!BuildConfig.DEBUG) AppValidator.validate(this)`). Debug confirmado SEM brick (pid vivo + CDP ativo). Arquivo: `android/app/src/main/java/com/redx/tvbox/MainActivity.java:47`.
- [x] `webContentsDebuggingEnabled: false` em `capacitor.config.json`. `MainActivity.java:150` reativa só em debug (`BuildConfig.DEBUG`) → CDP segue funcionando em debug, off em release.
- [ ] **BLOQUEADO (precisa keystore):** gerar/guardar `android/redx-release.jks` e confirmar/atualizar `EXPECTED_SIGNATURE` (SHA-256 do cert release) em `AppValidator.java:55`. Sem isso o release brica (fail-closed). Build via `npm run build:apk` (checa assinatura).
  - Como obter o SHA-256: `keytool -list -v -keystore redx-release.jks` → pegar SHA256 do cert, normalizar p/ hex sem ':' (64 chars maiúsc.).
- [ ] **BLOQUEADO (edge fn fora do repo):** rate-limit + expiração nas chaves de acesso (login 16 chars) na edge function de auth (resolver junto da Fase 1, quando as functions entrarem no repo).
**Pronto (parcial):** debug roda; release (quando assinado) valida assinatura; sem debug remoto em produção. Resta: assinar release + rate-limit das chaves.

## Fase 1 — Reprodutibilidade · destrava venda/DD · STATUS: PARCIAL (docs prontas; artefatos fiéis bloqueados por credenciais)
- [x] **README.md** criado (setup, env, build targets, deploy supabase, release assinado, TVs, arquitetura).
- [x] **.env.example** completado: adicionadas chaves faltantes (`VITE_APP_TARGET`, `VITE_BUILD_CHANNEL`, `VITE_TV/WEB/LEGACY_BUILD`, `VITE_NATIVE_ANDROID_PLAYER`, `VITE_SKIP_AUTH`, `VITE_BRASILEIRAO_API_URL`, `VITE_API_BR_URL`, `VITE_BINSTREAM_*`, `VITE_TMDB_READ_TOKEN_HOME`).
- [x] **supabase/README.md** criado: schema observado (channels, adult_streams, adult_menu_*, adult_profile_verifications) + comandos `db pull`/`functions download` + nota de RLS.
- [ ] **BLOQUEADO (precisa `supabase login` + senha do DB):** `supabase db pull` → `supabase/migrations/*.sql` fiel (tipos/constraints/índices/**RLS**). Introspecção via REST não traz RLS/DDL completo.
- [ ] **BLOQUEADO (source no servidor):** `supabase functions download tmdb-proxy` e `verify-admin-password` → versionar source real. (Resolve junto o rate-limit das chaves da Fase 0.)
**Pronto (parcial):** docs/scaffold prontos; falta o dono rodar `db pull` + `functions download` (credenciais Supabase) para fechar a reprodutibilidade fiel.

## Fase 2 — Robustez de stream/erros · Erros 6→8 · STATUS: PARCIAL
- [x] **Removido overlay debug cru** de produção em `pages/LiveTV.tsx` (bloco `fontFamily:sans-serif` inalcançável/feio). Estados vazio/erro já têm UI glass+retry (`LiveTV.tsx:~1254`).
- [x] **Botão "Próximo canal"** no overlay "Canal indisponível" (`LiveTV.tsx:~1447`) → skip MANUAL seguro via `selectAdjacentLiveChannel(1)` (sem loop).
- [ ] **DIFERIDO (precisa teste on-device):** auto-skip AUTOMÁTICO ao falhar. Motivo: `playNative` resolve só quando a Activity fecha → auto-cycle relança Activities repetidamente; sem validação no device há risco de loop/flash na área protegida (Canais). Design: budget bounded (MAX ~4) + reset em seleção do usuário + pular canais com falha recente (`getRecentChannelFailure`). Implementar quando puder validar via remote na TV.
- [ ] **MANUAL/infra:** agendar prune de streams mortos (`scripts/prune-dead-adult-streams.cjs`) via cron/Supabase scheduled — fora do código do app.
**Pronto (parcial):** sem overlay debug; erro de stream tem retry + próximo canal. Falta auto-skip automático (diferido por segurança) + agendamento do prune.

## Fase 3 — Performance · Perf 7→9 · STATUS: PARCIAL
- [x] **Matada a tempestade de fetch TMDB por card**: removida a IntersectionObserver de preload (200px) do `MediaCard` que disparava `getMediaDetailsByID` para todo card próximo da viewport. Preload agora SÓ no foco/hover (`handleFocus`/`handleMouseEnter`). Poster base aparece sem preload; logo/backdrop só no estado expandido (exige foco). `components/MediaCard.tsx:~297`.
- [x] **`vendor-charts` (278KB) já é lazy**: `recharts` só é importado por `pages/admin/Dashboard.tsx` (admin é rota lazy → chunk `pages-admin`). Não carrega no caminho TV/Home. Confirmado. Sem mudança.
- [ ] **DIFERIDO (refactor amplo):** unificar 3 componentes de imagem (LazyImage/NetflixImage/PosterImage) em 1 com cache compartilhado. Risco de regressão visual em várias páginas; fazer com testes visuais por tela. `MovieRow` não é storm (busca logo só do 1º + focado).
**Pronto (parcial):** scroll de grade sem rajada de requests TMDB. Falta unificar componentes de imagem (diferido).

## Fase 4 — Qualidade de código · Código 6→8 · STATUS: PARCIAL
- [x] **`tsc` LIMPO no projeto inteiro** (exit 0). Causa raiz dos erros legados: `sanitizeFontezChannels`/`removeOldDeadSources` exigiam `T extends SourceLike` (Record<string,unknown> & ...), e `Channel`/`AdultStream` não têm index signature. Fix: constraint `T extends object` + indexação interna via cast controlado `as Record<string,unknown>` (sem `as any`). `utils/sourceSanitizer.ts`.
- [ ] **DIFERIDO (alto risco):** consolidar 2 sistemas de navegação (geométrico `useRemoteNavigation` + `useSpatialNavigation`) em 1. Mexe na área que funciona bem; precisa E2E de D-pad em todos os fluxos antes. Documentar hierarquia de guards primeiro.
- [ ] **DIFERIDO:** reduzir `as any` (142) nos hot paths — fazer pontualmente, com verificação por arquivo (risco de mascarar shape real).
**Pronto (parcial):** projeto typecheck-clean. Falta consolidar nav (diferido por risco) + reduzir as-any.

## Fase 5 — Testes · Testes 5→8 · STATUS: PENDENTE
- [ ] E2E: abrir título → reproduzir → voltar (VOD + live).
- [ ] Regressão de D-pad (foco/scroll/back).
- [ ] Cobertura no CI (meta ≥60% services/hooks core).
**Pronto:** CI verde com E2E dos fluxos críticos.

## Fase 6 — UX/A11y polish · UX 8→9 · STATUS: PENDENTE
- [ ] ARIA consistente em cards/rows/player.
- [ ] Contraste/foco revisados; transições suaves.
- [ ] Loading states sem layout shift.
**Pronto:** auditoria a11y básica passa.

## Fase 7 — Android/distribuição · Android 7→8,5 · STATUS: PENDENTE
- [ ] Separar build adulto (flag/variant) para versão Play Store.
- [ ] Formalizar buildTypes por target (tv/web/legacy já existem).
**Pronto:** caminho de loja viável (versão sem adulto).

---

## LOG DE PROGRESSO
(ordem cronológica; mais recente embaixo)

- _início_ — arquivo criado. Linha de base registrada. Iniciando Fase 0.
- **Fase 0 (código)** — `MainActivity.java`: `AppValidator.validate(this)` reativado só em release (`!BuildConfig.DEBUG`). `capacitor.config.json`: `webContentsDebuggingEnabled` → false. Build debug instalado na TCL → app abre (pid vivo) e CDP ativo (Chrome 148): **debug não brickou**. Falta: keystore release + EXPECTED_SIGNATURE + rate-limit das chaves (bloqueados por infra/edge fn).
- **Fase 1 (docs)** — Criados `README.md` (setup completo), `supabase/README.md` (schema observado + comandos `db pull`/`functions download` + RLS). `.env.example` completado com chaves de build/target/streams faltantes. **Bloqueado:** `supabase db pull` (precisa login+senha DB) e `functions download` (source no servidor) — só o dono do projeto consegue. Esses fecham migrations fiéis + source das edge functions + rate-limit das chaves.
- **Fase 2 (parcial)** — Removido overlay debug cru do LiveTV. Adicionado botão "Próximo canal" no overlay de erro de stream (skip manual seguro). Auto-skip AUTOMÁTICO **diferido** (risco de loop no player nativo sem teste on-device). tsc+eslint limpos.
- **Fase 2** validada no device (Canais abre History, sem overlay debug). Commit 7acce02.
- **Fase 3 (parcial)** — Removida IO de preload do MediaCard (fim da tempestade de `getMediaDetailsByID` por card ao rolar). `vendor-charts` confirmado lazy (só admin). Unificação de imagem diferida (refactor amplo). tsc+eslint limpos.
- **Fase 4 (parcial)** — `tsc` agora LIMPO no projeto todo (erros legados de channelsService zerados via fix de generics em sourceSanitizer; sem `as any`). Consolidação de nav e redução de as-any diferidas (risco). Validar canais no device (sanitizer está no caminho).
- **Próximo:** validar canais (carga/play) no device pós-fix do sanitizer; depois Fase 5 (testes E2E), 6 (a11y), 7 (Android/loja).
