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

## ESTADO ATUAL (snapshot — atualizar a cada fase)
| Fase | Status | Commit | Feito | Falta |
|---|---|---|---|---|
| 0 Segurança | PARCIAL | 88bce07 | anti-repack só em release + `webContentsDebuggingEnabled=false` (debug não brickou) | assinar release (`redx-release.jks` ausente) + `EXPECTED_SIGNATURE` + rate-limit das chaves (edge fn) |
| 1 Reprodutibilidade | PARCIAL | 5b21cc2 | README + supabase/README + .env.example completo | `supabase db pull` (migrations+RLS) + `functions download` (source) — precisa login Supabase do dono |
| 2 Robustez stream | PARCIAL | 7acce02 | removido overlay debug; botão "Próximo canal" (skip manual) | auto-skip AUTOMÁTICO (diferido: risco loop player nativo sem teste device) + agendar prune |
| 3 Performance | PARCIAL | 842fcce | matada tempestade fetch TMDB por card; `vendor-charts` já lazy (só admin) | unificar 3 componentes de imagem (refactor amplo, diferido) |
| 4 Qualidade | PARCIAL | 3be0693 | **`tsc` limpo no projeto inteiro** (fix generics sourceSanitizer, sem `as any`) | consolidar 2 navs em 1 + reduzir `as any` (142) — diferidos por risco |
| 5 Testes | PARCIAL | 7f0541a | suíte 269/269; E2E mínimo reprodução/canais/erro/D-pad verde; **D-pad validado em device real (TCL via CDP)** | só elevar cobertura por área (opcional) |
| 6 UX/A11y | **COMPLETA** | — | ARIA cards/rows/player + loading status + contraste/foco + **layout shift auditado (CLS máx 0.0018)** | — |
| 7 Android/loja | PARCIAL | — | store-safe por flag + E2E verde + **chunk AdultoPage removido por DCE** + LiveTV bloqueia canal adulto em store-safe | só formalizar buildTypes Gradle (baixo impacto); flavor nativo dispensável |

**Bloqueios que dependem de VOCÊ (não-código):** (a) keystore release + `supabase login`/senha DB → fecha Fase 0 (assinatura+rate-limit) e Fase 1 (migrations+functions).
**Próximas executáveis sem credenciais:** Fase 6 (layout shift), Fase 7 (flavor/variant nativo se necessário), D-pad em device real.

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

## Fase 5 — Testes · Testes 5→8 · STATUS: PARCIAL
- [x] **Suíte medida e verde** (antes: cobertura desconhecida): **269/269 testes passando**. Estava 12 falhas/3 arquivos → 0 falhas.
- [x] **HeroBanner** (9 falhas) corrigido: mock de `@/utils/imageProxy` estava desatualizado (faltava `getResponsiveImageSrcSet` que o componente usa). `components/__tests__/HeroBanner.test.tsx`.
- [x] Regressão do fix Fase 4 (sourceSanitizer) já coberta por `utils/__tests__/sourceSanitizer.test.ts` (passa) + `tsc` limpo.
- [x] **Pré-existentes corrigidos:** `adultPinUtils.test.ts` agora limpa também cache em memória via `clearAdultUnlocked()`; `playbackHealth.test.ts` alinhado ao contrato v2 (query preservada, hash removido, storage key v2).
- [x] **E2E mínimo estabilizado:** `minimum-tv-flow.cy.ts` cobre "abrir título → reproduzir → voltar", "Canais → voltar" e ErrorBoundary global com fixture local de catálogo.
- [x] **Runner E2E padrão ampliado e verde:** `scripts/run-e2e-ci.mjs` agora roda `smoke-basic`, `shell-navigation` e `minimum-tv-flow` por padrão; suíte E2E padrão passou com 6/6 testes.
- [x] **Gate de cobertura local validado:** `npm run test:coverage` passou com 269/269 testes. Cobertura global reportada baixa (36.6% statements), mas thresholds atuais por projeto passaram.
- [x] **Regressão D-pad em browser/E2E:** `dpad-navigation.cy.ts` valida que seta no menu lateral permanece no sidebar e move Início → Gêneros; navegação longa fica para device real.
- [x] **D-pad em DEVICE REAL validado (TCL `192.168.0.4`)** via adb keyevents + inspeção de `document.activeElement` por CDP (build debug, `webview_devtools_remote`). Confirmado: sidebar vertical (Início→Gêneros→Séries→Filmes, igual ao `dpad-navigation.cy.ts`), lista de canais vertical (foco move entre canais), lista→overlay "Canal indisponível" (DPAD_RIGHT foca "TENTAR NOVAMENTE"), `ExitConfirmModal` com nav horizontal Não↔Sair + focus trap correto, ENTER aciona botão. App vivo o tempo todo (sem crash/ANR); BACK abre confirmação de saída. Firestick `192.168.0.8`: alcançável, app rodando, CDP vivo (estava em login — não re-testado, TCL conclusivo).
- [ ] **OPCIONAL:** elevar thresholds/cobertura por áreas críticas.
**Pronto:** suíte unitária/integração (269/269), coverage gate local verde, E2E mínimo verde **e D-pad validado em device real (TCL)**. Resta só amadurecer meta de cobertura (opcional).

## Fase 6 — UX/A11y polish · UX 8→9 · STATUS: PARCIAL
- [x] ARIA inicial em cards/rows: `MediaCard`, cards de futebol e menus/listas de canais com labels mais descritivos; skeleton da Home marcado como `role="status"`/`aria-busy`.
- [x] ARIA do player e overlays principais: HUD, progresso, erro/retry, retomar, qualidade, elenco e episódios.
- [x] Loading/empty states principais anunciados sem layout shift novo (`HomeSkeleton`, `VirtualGrid`, loading-more).
- [x] Contraste/foco visual dos caminhos principais revisado: plataformas, cards, canais e controles do player têm foco visível também em `:focus` de WebView/TV.
- [x] **Auditoria final de layout shift CONCLUÍDA** via PerformanceObserver `layout-shift` (buffered) no dev server (login dev `000000`). CLS por rota/interação, todas << 0.1 (limiar "bom"): Home load **0.0018**, Séries **0.0016**, Canais/Filmes/Futebol/Kids/Pesquisar/Configurações/Minha-lista **0**, foco/expand de card **0** (usa `transform`/`scale`, não layout), sidebar expand **0** (overlay, não empurra conteúdo), Home @1920×1080 (TV) **0**. Sem shifts ruins; nenhuma correção necessária.
**Pronto:** auditoria a11y básica passa + layout shift auditado e verde (CLS máx 0.0018). STATUS: **COMPLETA**.

## Fase 7 — Android/distribuição · Android 7→8,5 · STATUS: PARCIAL
- [x] Primeira camada de build store-safe: `VITE_STORE_SAFE_BUILD=true` desativa menu/rota Adulto via `runtimeFlags.adultContentEnabled`; `.env.example` documentado.
- [x] Scripts formais: `build:android:store`, `build:apk:store`, `build:android:full`, `build:apk:debug:full`; Vite bloqueia `STORE_SAFE=true` com adulto ligado.
- [x] E2E store-safe dedicado: com `VITE_STORE_SAFE_BUILD=true` e `VITE_ENABLE_ADULT_CONTENT=false`, o menu lateral não mostra Adulto e `/adulto` não monta `AdultoPage`.
- [x] **Chunk `AdultoPage-*.js` removido FISICAMENTE do bundle de loja** via dead-code-elimination de build. Guard build-time foldable em `App.tsx`/`LegacyApp.tsx`: `const ADULT_CONTENT_BUNDLED = import.meta.env.VITE_ENABLE_ADULT_CONTENT !== 'false' && import.meta.env.VITE_STORE_SAFE_BUILD !== 'true'` em `&&` antes do `import('./pages/AdultoPage')`. Vite substitui os literais → Rollup elimina o branch morto → chunk não emitido. Verificado: build store = 0 chunks `AdultoPage` (grep no `dist/assets` zero referências); build full = `AdultoPage-*.js` presente. Não precisou flavor Gradle nativo.
- [x] **LiveTV store-safe:** canal de categoria adulta (`adultos`/`adulto`/`hot`) com `runtimeFlags.adultContentEnabled=false` é bloqueado sem expor o modal de PIN; `adultUnlocked` inicial força `false` em build de loja. Guardado por flag → builds normais inalterados.
- [ ] Separar variant Android nativa/flavor: **dispensável** para o chunk adulto (já removido por DCE). Só necessário se a loja exigir separação por buildType Gradle de outros artefatos.
- [ ] Formalizar buildTypes por target (tv/web/legacy já existem) — pendente, baixo impacto.
**Pronto (parcial→quase):** caminho de loja viável por flag, validado em E2E (2/2), suíte 269/269, tsc+eslint limpos. Chunk `AdultoPage` **fisicamente ausente** no bundle store; `AdultPinModal` (gate de canais ao vivo) permanece estático no LiveTV mas inalcançável em store-safe (canal adulto bloqueado antes do PIN). Resta só formalizar buildTypes Gradle se a loja pedir.

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
- **Fase 4** validada no device (canais carregam pós-fix sanitizer). Commit 3be0693.
- **Fase 5 (parcial)** — Suíte medida: 269 testes. Corrigido mock desatualizado do HeroBanner (12→3 falhas). Restam 3 pré-existentes (adultPinUtils isolamento, playbackHealth normalização) em arquivos não tocados — documentadas para fix sem mascarar comportamento. E2E de reprodução + cobertura no CI pendentes.
- **Fase 6 (parcial)** — Aplicada primeira fatia de A11y/UX: `MediaCard` agora anuncia tipo/título/estado expandido e ações internas com `aria-label`/`aria-pressed`; `FutebolMatchCard` anuncia confronto/campeonato/status; listas de canais anunciam número, nome e programa atual; `HomeSkeleton` anuncia carregamento do catálogo. Typecheck filtrado dos arquivos tocados sem erros.
- **Fase 6 (parcial)** — Aplicada segunda fatia de A11y/UX: HUD/overlays do player receberam roles/labels/estado; `VirtualGrid` passou a anunciar loading/empty/loading-more; `VideoCard` ganhou labels de ações e progressbar; shimmer/skeleton recebeu contenção de paint e fallback mais forte para `prefers-reduced-motion`. Typecheck filtrado dos arquivos tocados sem erros.
- **Fase 6 (parcial)** — Aplicada terceira fatia de UX/A11y: plataformas agora anunciam filtro e preservam logos decorativas; `ContinueWatchingRow` e `Top10Row` receberam labels/progressbar; controles do player ganharam `data-player-control`/estado atual e foco robusto para WebView/TV. Falta auditoria visual final de layout shift em device/browser.
- **Fase 6 (parcial)** — Checagem prática via Playwright em `http://127.0.0.1:5173/`: login dev `000000` abriu Home uma vez e confirmou plataformas com labels/sem pageerror; revelou destaque antigo de `MovieRow` sem label, corrigido. Nova queda no login revelou input de chave sem `aria-label`, corrigido. Logs de catálogo Supabase abortado/timeout permaneceram externos à Fase 6.
- **Fase 7 (parcial)** — Adicionada flag store-safe (`VITE_STORE_SAFE_BUILD`) e override adulto (`VITE_ENABLE_ADULT_CONTENT`): runtime agora expõe `adultContentEnabled`; Sidebar remove Adulto quando desativado; rota `/adulto` cai para shell seguro; LegacyApp bloqueia navegação/render adulto em build de loja. Falta formalizar scripts/variants Android e validar build de loja.
- **Fase 7 (parcial)** — Formalizados scripts npm para store/full sem rodar build: `build:android:store`, `build:apk:store`, `build:android:full`, `build:apk:debug:full`; adicionada trava no Vite contra flags contraditórias (`STORE_SAFE=true` + adulto ligado). Falta validar build store e decidir se precisa flavor Gradle nativo.
- **Fase 5** — Corrigidas as 3 falhas pré-existentes documentadas: cache adulto em memória agora tem `clearAdultUnlocked()` para isolamento de teste; testes de `playbackHealth` foram atualizados para o contrato atual v2, que preserva query string para evitar falsos positivos com tokens novos. Teste alvo: 23/23. Suíte completa: 269/269.
- **Fase 5** — E2E mínimo de reprodução estabilizado: cache local `redx-catalog-cache-v9` no spec evita dependência do Supabase para Home/Assistir; rota de canais aceita BrowserRouter/HashRouter; ErrorBoundary pode ser disparado por query E2E e o fallback customizado ganhou `role="alert"`. Rodado via `E2E_CYPRESS_SPEC=cypress/e2e/minimum-tv-flow.cy.ts E2E_CYPRESS_BROWSER=electron npm run e2e:ci`: 3/3 testes passaram.
- **Fase 5** — `scripts/run-e2e-ci.mjs` agora inclui `minimum-tv-flow.cy.ts` na suíte padrão, além de `smoke-basic` e `shell-navigation`. Rodado com `E2E_CYPRESS_BROWSER=electron npm run e2e:ci`: 6/6 testes passaram.
- **Fase 5** — Coverage gate local validado: `npm run test:coverage` passou com 28 arquivos e 269/269 testes. Relatório global atual: 36.6% statements, 30.27% branches, 35.75% functions, 38.49% lines; thresholds configurados por projeto passaram.
- **Fase 5** — Adicionada regressão D-pad em `cypress/e2e/dpad-navigation.cy.ts`: seta para baixo no menu lateral valida foco em Início → Gêneros usando evento no elemento focado. Corrigido `useRemoteNavigation` para não roubar teclas originadas dentro de `[data-nav-sidebar]`. `scripts/run-e2e-ci.mjs` inclui esse spec. Rodado com `E2E_CYPRESS_BROWSER=electron npm run e2e:ci`: 7/7 testes passaram.
- **Fase 7** — Adicionado E2E store-safe em `cypress/e2e/store-safe.cy.ts`: valida que `VITE_STORE_SAFE_BUILD=true` + `VITE_ENABLE_ADULT_CONTENT=false` remove Adulto do menu e bloqueia acesso direto a `/adulto` sem montar `AdultoPage`. Rodado com `E2E_CYPRESS_SPEC=cypress/e2e/store-safe.cy.ts E2E_CYPRESS_BROWSER=electron VITE_STORE_SAFE_BUILD=true VITE_ENABLE_ADULT_CONTENT=false VITE_APP_TARGET=tv npm run e2e:ci`: 2/2 testes passaram. Nota: build ainda lista chunk adulto; se precisar separação física para loja, criar flavor/entrypoint dedicado.
- **Fase 6 (COMPLETA)** — Auditoria final de layout shift feita no dev server (Vite + login dev `000000`) com `PerformanceObserver({type:'layout-shift',buffered:true})` filtrando `hadRecentInput`. Medido CLS por rota e por interação: Home load 0.0018, Séries 0.0016, demais rotas (Canais/Filmes/Futebol/Kids/Pesquisar/Configurações/Minha-lista) 0, foco/expand de card 0 (anima via `transform`, não layout), sidebar expand 0 (overlay absoluto, não empurra `main`), Home @1920×1080 (TV) 0. Tudo bem abaixo do limiar "bom" (CLS<0.1). Nenhum shift problemático → sem correção de código necessária. Fase 6 fechada.
- **Fase 7 (avanço)** — Fechado o gap do chunk adulto físico: guard build-time foldable (`ADULT_CONTENT_BUNDLED`) em `App.tsx`/`LegacyApp.tsx` faz o Rollup eliminar o `import('./pages/AdultoPage')` no bundle de loja (DCE). Verificado: store build sem `AdultoPage-*.js`, full build com. LiveTV passou a bloquear canal de categoria adulta em store-safe (sem expor PIN) e `adultUnlocked` inicia `false` quando `adultContentEnabled=false`; tudo guardado por flag → builds normais idênticos. Validado: tsc 0, eslint 0, unit 269/269, E2E store-safe 2/2, builds store/full conferem chunks. Não precisou flavor Gradle nativo.
- **Fase 5 (D-pad device real)** — Validado na TCL (`192.168.0.4`) com `adb input keyevent` + leitura de `document.activeElement` via CDP (`webview_devtools_remote`, build debug). OK: sidebar Início→Gêneros→Séries→Filmes, lista de canais vertical, lista→overlay (RIGHT foca "TENTAR NOVAMENTE"), ExitConfirmModal Não↔Sair com focus trap, ENTER aciona. Sem crash. Firestick (`192.168.0.8`) alcançável e app vivo (estava em login). Plano: Fase 5 só com cobertura opcional pendente.
- **Próximo:** formalizar buildTypes Gradle por target se a loja exigir; cobertura de testes por área (opcional); itens bloqueados por infra (keystore release + `supabase login` → Fases 0/1).
