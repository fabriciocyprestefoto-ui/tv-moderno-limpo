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

## Fase 2 — Robustez de stream/erros · Erros 6→8 · STATUS: PENDENTE
- [ ] Auto-skip para próximo canal vivo quando stream falha (LiveTV + Adulto).
- [ ] Remover overlay debug de produção: `pages/LiveTV.tsx:1314`.
- [ ] Telas de erro padronizadas (retry elegante).
- [ ] Agendar prune de streams mortos (`scripts/prune-dead-adult-streams.cjs`).
**Pronto:** item morto nunca trava a tela.

## Fase 3 — Performance · Perf 7→9 · STATUS: PENDENTE
- [ ] Fila única de fetch TMDB (cap concorrência, só no foco): `components/MediaCard.tsx:304`, `components/MovieRow.tsx:121`.
- [ ] Unificar 3 componentes de imagem (LazyImage/NetflixImage/PosterImage) em 1.
- [ ] Garantir `vendor-charts` (278KB) lazy só no admin.
**Pronto:** scroll de fileira sem engasgo na TV.

## Fase 4 — Qualidade de código · Código 6→8 · STATUS: PENDENTE
- [ ] Consolidar 2 sistemas de navegação em 1 (geométrico OU spatial).
- [ ] Zerar erros TS legados em `services/channelsService.ts`.
- [ ] Reduzir `as any` (142) nos hot paths.
**Pronto:** `tsc` limpo; um motor de nav único documentado.

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
- **Próximo:** Fase 2 (robustez de stream): auto-skip de canal morto + remover overlay debug de produção + telas de erro padronizadas. (Não depende de credenciais — executável.)
