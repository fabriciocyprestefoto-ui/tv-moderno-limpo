# AI_HANDOFF.md

Ultima atualizacao: 2026-05-27 18:30 -03:00 (recuperacao + fix player nativo na TCL)

Fonte oficial de continuidade para GPT/Codex/Claude/futuras sessoes. Atualizar ao final de cada etapa antes de parar.

## 0. Estado Atual (2026-05-27)

### 0.1 Contexto de recuperacao
- Projeto atual em `C:\Users\Fabricio\Desktop\tv-moderno-limpo`.
- Backup `redflix-tvbox-app-backup-tv-moderno-2026-05-13.zip` = snapshot de 13/05 07:51. Conferido: o projeto atual e SUPERSET do backup (0 arquivos perdidos).
- Comparacao backup x atual: 518 arquivos com hash diferente, mas 467 eram apenas conversao de fim de linha LF->CRLF (Windows). Mudanca REAL de conteudo: 51 arquivos, quase todos codigo mais novo (player nativo, sportsApi, vite.config, etc.). NAO reverter para o backup — perderia ~2 semanas de trabalho.

### 0.2 Dispositivo de teste (TCL)
- Modelo: Smart TV "G07_4K_GB_NF" (RealTek). Android 11 (SDK 30). WebView Chromium 148.
- ADB sobre WiFi (Depuracao sem fio / wireless debugging, Android 11+): parear com `adb pair IP:portaPareamento <codigo>`, depois `adb connect IP:5555`. IP via DHCP (mudou 192.168.0.7 -> 192.168.0.4).
- adb.exe: `C:\Users\Fabricio\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
- appId: `com.redflix.tvmoderno`. UA inclui ` RedflixTV/1.0` (detector trata como TV Box).

### 0.3 Build e instalacao do APK
- `npm run build:apk:debug` (vite build -> `npx cap sync android` -> `gradlew assembleDebug` -> copia para `redflix-tvmoderno.apk`).
- `npm_lifecycle_event` casa `/apk/i` em `vite.config.ts` => `isCapacitorBuild=true` => `isTvBuild=true` e `nativeAndroidPlayerEnabled=true` (player nativo ligado).
- Instalar: `adb -s 192.168.0.4:5555 install -r android\app\build\outputs\apk\debug\app-debug.apk`.

### 0.4 Fix do player nativo (regressao corrigida) — RESOLVIDO
- Sintoma: clicar "Assistir" nao abria vinheta nem filme/serie (funcionava em 13/05).
- Causa: o refactor "TV Moderno" gateou o player nativo atras de `!isFireTV() && !isLegacyHtml5OnlyTV()` em DOIS lugares: `pages/Player.tsx` (decisao `NativeVodPlayer`) e `utils/tvModernoBridge.ts` (`hasNativePlayer()`). `isLegacyHtml5OnlyTV()` testa a VERSAO do WebView (Chrome<80 ou Android<=7), mas o player nativo e uma Activity Android (Media3/ExoPlayer) que NAO depende do WebView. Em 13/05 o player era usado sempre que `isTvBuild && isNativePlatform()`.
- Fix: removido `!isLegacyHtml5OnlyTV()` da decisao nativa nos dois arquivos (mantido `!isFireTV()`). Confirmado: player abre e reproduz na TCL.
- Observacao: nesta TCL especifica `isLegacyHtml5OnlyTV()` ja era `false` (Android 11 / Chrome 148), entao o fix nao a desbloqueou diretamente — o que resolveu na pratica foi rebuildar o APK a partir da fonte atual (o APK instalado antes era de um build antigo). O fix protege TVs de WebView realmente antigo e permanece correto.

### 0.5 Pipeline de imagem atual (posters/logos)
- `utils/mediaUtils.ts::getPosterUrl` resolve poster: tmdb_id+poster_path -> `${IMAGE_BASE}/w500${path}`; senao usa `media.poster` (URL completa). Sempre passa por `utils/imageProxy.ts::toWebP(url, 'poster')`.
- `imageProxy.toWebP`: em APK nativo (`isNativeCapacitorApp()`), retorna a URL TMDB DIRETA (sem proxy). Fora do nativo, posters/backdrops vao por `wsrv.nl` (WebP, w500/w1280). Logos TMDB retornam sempre DIRETO (mantem PNG transparente).
- Catalogo bundled (`public/data/*.json`): movies 4644 itens / 13690 URLs https TMDB + 133 http `file.gstaticontent.com`; series 5045 itens / 17 http; channels 2171 logos com 526 http (img.onetv.plus, postimg.cc, etc.).

### 0.6 Bug ABERTO — posters nao aparecem na TCL (so o logo do titulo)
- Sintoma: nas fileiras, aparece so o LOGO do titulo (PNG TMDB) sobre gradiente; o POSTER (JPG) fica em branco.
- Diagnostico ate agora:
  - Posters dos itens visiveis (ex.: Devil May Cry, Frieren, Maquina de Guerra) sao `https://image.tmdb.org/t/p/w500/*.jpg` validos (PC retorna HTTP 200). Hosts alcancaveis da TCL (ping OK). Logcat NAO mostra requests a `wsrv.nl` (bypass nativo ativo => posters vao direto).
  - Logos TMDB (https, /original/*.png) renderizam; posters TMDB (https, /w500/*.jpg) nao — mesma origem/scheme.
  - Mixed Content confirmado para as URLs http do catalogo (`http://file.gstaticontent.com//t/p/...`) — bloqueadas pelo Chromium 148 mesmo com `allowMixedContent:true`. `file.gstaticontent.com` so serve HTTP (https da SSL error), entao rewrite http->https nao resolve esse host.
  - `MediaCard`/`LazyImage`/`VirtualGrid`/`getPosterUrl` sao identicos a 13/05 (so CRLF). O que mudou foi `imageProxy.ts` (bypass nativo, 21/05): em 13/05 posters iam por wsrv.nl WebP (menor) e funcionavam; agora vao TMDB direto (JPG full-size).
- Hipotese principal: na TCL com pouca RAM, muitos JPG w500 full-size diretos falham ao decodificar/renderizar (memoria), enquanto o WebP menor via wsrv.nl cabia. Fix candidato: rotear posters/backdrops por wsrv.nl WebP tambem no nativo, e rotear qualquer URL http de imagem por wsrv.nl (https) para matar o mixed content. Validar com screenshot via adb apos rebuild.

## 1. Visao Geral

- `C:\Users\Fabricio\Desktop\sitepronto-novo`: base legacy/WebView para Android antigo. Pode conter heranca de HTML5 video, HLS.js e fluxo WebView.
- `C:\Users\Fabricio\Desktop\sitepronto-tv-moderno`: app Android TV moderno. Alvo principal: evitar playback do Chromium/WebView em TV nova e usar player nativo Android/Media3.

Este arquivo descreve o estado de `sitepronto-tv-moderno`.

## 2. Arquitetura Atual

- VOD (filmes/series/episodios): build TV nativo usa `NativePlayerPlugin` exclusivamente via `pages/Player.tsx -> NativeVodPlayer -> useNativePlayerGate -> playNative`.
- LiveTV: build TV nativo usa `NativePlayerPlugin` via `playNative({ type: 'live' })`; fallback HTML5/HLS.js fica apenas web/legacy.
- Adulto: ainda usa bridge legado `window.Android.openPlayer`; iframe YouTube foi desativado por seguranca; seta direita/esquerda troca canal.
- Trailers: removidos como reproducao. Sem iframe, sem YouTube embed, sem autoplay; app moderno usa apenas backdrop/poster/imagem estatica.
- Vinheta VOD: no APK TV moderno vai por `introUrl` do `NativePlayerPlugin` (`asset:///public/vinheta-tv.mp4` por padrao).
- Vinheta web/desktop: fallback HTML5 permanece apenas fora do build TV nativo.
- Previews/hover/autoplay: autoplay residual de trailer removido; cards/posters mantem efeitos visuais estaticos.

## 3. Pipeline Oficial Atual

Pipeline oficial VOD:

`React Player -> NativeVodPlayer -> useNativePlayerGate -> services/nativePlayerService.playNative -> NativePlayerPlugin.play -> ExoPlayerActivity -> retorno position/cancelled -> userService.saveProgress -> onClose`

Pipeline legado temporario:

`window.Android.openPlayer -> MainActivity bridge -> ExoPlayerActivity`

Uso atual:

- `NativePlayerPlugin`: VOD e LiveTV em APK TV moderno; hook preparado em `hooks/useNativePlayerGate.ts`.
- `window.Android.openPlayer`: Adulto e compatibilidade legada.
- Fallback HTML5/HLS.js: somente web/desktop dentro de `PlayerImpl`; nao deve rodar para VOD em APK TV moderno.
- Trailers/previews: sem pipeline de reproducao; exibe apenas imagem estatica.

## 3.1 Estado Atual do APK TV Moderno

- VOD = `NativePlayerPlugin` / Media3 / ExoPlayer.
- LiveTV = `NativePlayerPlugin` / Media3 / ExoPlayer.
- Player nativo = `ExoPlayerActivity` com HUD/card RedFlix nativo por cima do Media3; nao usa React/WebView para controles fullscreen.
- Trailers = removidos como reproducao.
- Iframe = removido dos fluxos do app moderno.
- YouTube embed = removido dos fluxos do app moderno.
- Autoplay residual de trailer/preview = removido.
- HLS debug = web/legacy apenas; `/hls-test` nao importa player HLS no build TV.
- Sem WebView player no fluxo principal.
- Sem trailer HTML5.
- Sem HLS.js no fluxo principal do APK TV moderno.

## 3.2 Dispositivos de Teste ADB

Dois alvos conectados por rede:

- **TCL Smart TV (Google TV, Android 11)**: `192.168.0.7:5555` — **prioridade maxima**. Android TV moderno principal e alvo final do projeto; onde apareceram os maiores bugs de player/tela preta historicamente.
- **FireStick/Fire TV**: `192.168.0.4:5555` — alvo secundario.

ADB local: `C:\Users\Fabricio\AppData\Local\Android\Sdk\platform-tools\adb.exe`.

Comandos padrao:

- Listar: `adb devices`
- Conectar: `adb connect 192.168.0.7:5555` ou `adb connect 192.168.0.4:5555`
- Instalar TCL: `adb -s 192.168.0.7:5555 install -r redflix-tvmoderno.apk`
- Instalar FireStick: `adb -s 192.168.0.4:5555 install -r redflix-tvmoderno.apk`
- Logcat TCL: `adb -s 192.168.0.7:5555 logcat`
- Logcat FireStick: `adb -s 192.168.0.4:5555 logcat`
- Filtro: `... logcat | findstr /i "redflix redx NativePlayer ExoPlayer AndroidRuntime FATAL Exception Capacitor"`

APK atual de teste: `C:\Users\Fabricio\Desktop\sitepronto-tv-moderno\redflix-tvmoderno.apk`.

Fluxo obrigatorio daqui pra frente:

1. `npm run build:apk:debug`
2. `adb -s 192.168.0.7:5555 install -r redflix-tvmoderno.apk` (TCL primeiro)
3. `adb -s 192.168.0.4:5555 install -r redflix-tvmoderno.apk` (FireStick)
4. Testar na TCL — sempre que diferir do FireStick, registrar.
5. Capturar logcat real se travar/crash.
6. Corrigir baseado no logcat.
7. Atualizar `AI_HANDOFF.md` e `docs/player-pipeline-map.md`.

## 4. Flags de Build

- `VITE_APP_TARGET=tv`: alvo Android TV moderno.
- `VITE_APP_TARGET=web`: alvo browser/web.
- `VITE_APP_TARGET=legacy`: alvo compatibilidade Android antigo/WebView.
- `VITE_TV_BUILD=1`: contrato explicito de TV.
- `VITE_WEB_BUILD=1`: contrato explicito web.
- `VITE_LEGACY_BUILD=1`: contrato explicito legacy.
- `VITE_CAPACITOR_BUILD=1`: continua suportado e implica alvo TV no `vite.config.ts`.
- `runtimeFlags.isTvBuild`: usado para isolar VOD/LiveTV nativos e bloquear trailers/previews HTML5 no APK TV.

## 5. Etapas Concluidas

Etapa 1 - Contratos e flags:

- Restaurado `vite.config.ts` a partir de `sitepronto-novo` confirmado pelo usuario.
- Criadas flags TV/WEB/LEGACY/Capacitor.
- Definido `NativePlayerPlugin` como pipeline oficial de VOD.
- Documentado mapa em `docs/player-pipeline-map.md`.
- Corrigido contrato `Media.media_type` opcional para type-check.
- Nao alterou LiveTV, trailers, D-pad, storage, adulto.

Etapa 2 - VOD nativo:

- Migrado VOD TV para `NativePlayerPlugin.play()`.
- `Player` agora retorna `NativeVodPlayer` quando `runtimeFlags.isTvBuild && isNativePlatform()`.
- Removido `openNativePlayer(...)` do fluxo VOD.
- Progresso inicial vem de `userService.getProgress`.
- Retorno do player salva progresso via `userService.saveProgress`.
- Vinheta VOD enviada por `introUrl` nativo.
- Fallback web/desktop preservado.
- Nao alterou LiveTV, adulto, trailers, D-pad global, login/storage.

Fluxos VOD removidos do legado na Etapa 2:

- `pages/Player.tsx` nao importa mais `openNativePlayer`.
- VOD TV nao chama mais `utils/tvModernoBridge.openNativePlayer`.
- VOD TV nao chama mais `window.Android.openPlayer`.
- VOD TV nao usa mais o disparo fire-and-forget seguido de `setTimeout(onClose, 100)`.
- VOD TV nao depende mais de `HTMLVideoElement`, `readyState`, `onLoadedData`, `onCanPlay`, `video.play()` ou HLS.js para abrir, salvar progresso ou retornar.
- VOD TV nao monta `<video>` principal nem `<video>` de vinheta no APK TV moderno.
- `PlayerImpl` com HTML5/HLS.js permanece somente para web/desktop.

Validacoes da Etapa 2:

- `npx tsc --noEmit`: OK.
- `npm run build`: OK.
- `npm run build:apk:debug`: OK.
- APK copiado para `redflix-tvmoderno.apk`.

Etapa 3 - LiveTV nativo incremental:

- Migrado LiveTV TV para `NativePlayerPlugin.play({ type: 'live' })`.
- Removido `openNativePlayer(...)` do fluxo LiveTV.
- `ExoPlayerActivity` live nao fecha mais com qualquer tecla.
- ChannelUp/ChannelDown na Activity live retornam `action: channelUp/channelDown`.
- React seleciona canal adjacente e relanca o player live nativo.
- Back/Menu na Activity live retorna ao guia LiveTV.
- Fallback HTML5/HLS.js preservado para web/legacy.
- Nao alterou VOD, adulto, trailers, D-pad global, login/storage.

Etapa 4 - Trailers/previews/autoplay:

- Removido `contexts/TrailerContext.tsx` (singleton iframe de hover/autoplay).
- `components/TrailerBanner.tsx` virou backdrop estatico; sem trailerKey, timer ou iframe.
- `pages/Details.tsx` perdeu botao Trailer, player inline e Outros Videos.
- `pages/MovieDetails.tsx` perdeu iframe de trailer; fica Sinopse/Info com imagem de fundo ja existente.
- `App.tsx` bloqueia `/hls-test` no build TV antes de importar a rota de debug.
- `pages/HLSTestPlayer.tsx` fica apenas para web/legacy.
- `pages/livetv/LivePlayerArea.tsx` e `pages/AdultoPage.tsx` nao montam mais iframe YouTube.
- Fallback browser/desktop preservado apenas onde nao aumenta risco do APK TV.
- Nao alterou VOD, LiveTV principal, D-pad global ou login/storage.
- Etapa 4 oficialmente encerrada: iframe/YouTube/trailer/autoplay nao devem voltar sem pipeline nativo dedicado e nova autorizacao.

Etapa 5 - Hardening e limpeza segura:

- Removido `components/TrailerBanner.tsx`, que ficou orfao apos a remocao definitiva de trailers.
- Removidas classes CSS orfas `.trailerWrap` e `.trailerIframe` de `components/MovieRow.module.css`.
- Atualizado comentario de `components/MediaCard.tsx` para remover referencia a preload de trailer.
- `contexts/ToastContext.tsx` agora limpa o timer secundario de remocao de toast no unmount.
- `contexts/ConfigContext.tsx` agora cancela `requestIdleCallback`/`setTimeout` pendente no cleanup.
- Fallbacks web/legacy de `pages/AdultoPage.tsx` e `pages/LiveTV.tsx` removem listener `loadedmetadata` no cleanup.
- Validacao final OK: `npx tsc --noEmit`, `npm run build`, `npm run build:apk:debug`; APK debug copiado para `redflix-tvmoderno.apk`.
- Varredura final OK: `index.html` sincronizado do Android nao referencia HLS debug, iframe, YouTube embed, autoplay de trailer, `TrailerBanner` ou `TrailerContext`.
- Nao alterou pipeline VOD, pipeline LiveTV nativo, NativePlayerPlugin, login/storage, Supabase ou D-pad global.

Hotfix pos-teste real - NativePlayerPlugin bridge:

- Sintoma real: ao clicar em canais/assistir, apareciam mensagens do bridge/plugin e depois tela preta antes do ExoPlayer iniciar.
- Causa provavel corrigida: `NativePlayerPlugin` escondia o WebView antes de confirmar o launch da Activity e usava flags `REORDER_TO_FRONT/BROUGHT_TO_FRONT`, que podiam trazer uma Activity antiga ou deixar o app preto se o launch falhasse.
- Correcao aplicada apenas em `android/app/src/main/java/com/redx/tvbox/NativePlayerPlugin.java`: usa `getActivity()` como contexto, nao oculta mais o WebView, restaura visibilidade em erro/retorno e remove flags de reorder; launch fica limpo com `FLAG_ACTIVITY_NO_ANIMATION`.
- Correcao adicional de lifecycle: removido `android:launchMode="singleTop"` de `ExoPlayerActivity` para impedir reutilizacao/stale intent; cada chamada do plugin deve criar Activity limpa com extras novos.
- Validacao local OK: `npx tsc --noEmit`, `:app:processDebugMainManifest`, `:app:compileDebugJavaWithJavac`, `npm run build:apk:debug`.
- Novo APK debug copiado para `redflix-tvmoderno.apk`.
- ADB disponivel em `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, mas nenhum dispositivo estava conectado durante a validacao local.
- Nao alterou arquitetura, VOD/LiveTV React, login/storage, D-pad global, trailers ou fallback WebView.

Hotfix pos-teste real - FireStick/Android TV:

- Sintoma reportado: Activity/player abre fluxo, UI/logos aparecem parcialmente, tela preta/congela e app fecha sozinho.
- `ExoPlayerActivity` agora forca `TextureView` tambem em Amazon/Fire TV/AFT, alem de TCL/Chromecast.
- Removidos fundos opacos de diagnostico do player (`root`/`PlayerView` agora pretos), evitando mascarar render/surface.
- `ExoPlayerActivity` ganhou logs `RED-X-Player` para device, extras, `buildLayout`, `buildPlayer`, `preparePlayback`, `onPause`, `onResume`, `onDestroy` e diagnostics.
- `NativePlayerPlugin` chama `startActivityForResult` via `activity.runOnUiThread` e loga antes/depois do launch.
- Adulto: D-pad local aceita `ArrowUp/ArrowDown` para trocar canais, alem de esquerda/direita/ChannelUp/ChannelDown.
- PIN adulto: desbloqueio persiste em `localStorage`, `sessionStorage` e memoria de modulo como fallback, sem alterar Supabase/login.
- Validacao local OK: `npx tsc --noEmit`, `:app:compileDebugJavaWithJavac`, `npm run build:apk:debug`.
- Novo APK debug copiado para `redflix-tvmoderno.apk` em 2026-05-13 05:02:56.
- Se ainda fechar app, capturar logcat filtrando `RED-X|RED-X-Player|RED-X-Plugin|AndroidRuntime|ExoPlayer`.

Hotfix pos-teste real - ANR ExoPlayerActivity / PlayerView:

- Sintoma ADB: `ANR in com.redflix.tvmoderno (com.redflix.tvmoderno/com.redx.tvbox.ExoPlayerActivity)`, `Reason: no window has focus`, app morto por `user request after error`.
- Causa real confirmada no DropBox: layouts proprios `res/layout/exo_player_view.xml` e `exo_player_view_texture.xml` sobrescreviam o recurso interno `exo_player_view` do Media3; `PlayerView` inflava a si mesmo em loop/recursao durante `buildLayout`.
- Correcao: layouts renomeados para `redx_player_view_surface.xml` e `redx_player_view_texture.xml`; `ExoPlayerActivity` usa estes recursos explicitamente.
- Validacao ADB apos instalar: VOD chegou em `RED-X-Player DIAG READY item=1 1280x720 avc1.4D401F`; a Activity deixou de travar no inflate.
- Removido banner visual `DIAG` e toasts de diagnostico do player; logs permanecem no logcat `RED-X-Player`.
- `npx tsc --noEmit`, `:app:compileDebugJavaWithJavac` e `npm run build:apk:debug`: OK.
- APK debug atualizado em `redflix-tvmoderno.apk` em 2026-05-13 05:40.
- Observacao: usuario confirmou VOD/filmes funcionando; Canais/LiveTV ainda precisa reteste real com o APK limpo. Se falhar, investigar erro de stream/rede/headers de LiveTV, nao mais colisao de `PlayerView`.

Hotfix pos-teste real - Card do player e controle Live/Adulto:

- O card antigo do player existia no React/HTML do `sitepronto-novo`; no APK moderno ele sumiu porque VOD/Live fullscreen rodam em `ExoPlayerActivity`.
- Correcao: recriado HUD/card RedFlix como overlay nativo em `ExoPlayerActivity`, com titulo, ano/status, progresso, tempos, play/pause, seek, speed e volume basicos.
- `NativePlayerPlugin`/`nativePlayerService`/`useNativePlayerGate` agora repassam `year` para a Activity nativa.
- Controller padrao do Media3 fica desligado; controles visuais sao nativos RedFlix, sem WebView.
- LiveTV/Adulto: qualquer tecla com player fullscreen aberto fecha a Activity e devolve ao menu/grade React.
- Adulto: `ArrowRight`/`ChannelUp` troca para proximo canal; `ArrowLeft`/`ChannelDown` troca para anterior; `ArrowUp/ArrowDown` navegam a lista quando o menu esta visivel.
- Removidos toasts visiveis de diagnostico do `NativePlayerPlugin`; logs permanecem no logcat.
- Validacao: `npx tsc --noEmit`, `:app:compileDebugJavaWithJavac`, `npm run build`, `npm run build:apk:debug` OK; APK copiado para `redflix-tvmoderno.apk`.

Patch UX 2026-05-13 08:10 - icones mono + Adulto sem menu + banners vidro 3D:

A) HUD VOD com icones monocromaticos:

- `ExoPlayerActivity.buildLayout`: trocados emojis coloridos (⏪/⏩/🔊/🔇/⏸/▶) por glifos Unicode monocromaticos: `◀` Back, `⏮` Rewind, `❚❚` Play, `⏭` Forward, `1×` Speed, `◉` Volume.
- `updateHud`: play/pause alterna `❚❚`/`▶`; volume alterna `◉`/`◌`.

E) AdultoPage sem menu lateral:

- `pages/AdultoPage.tsx`: estado inicial `isChannelMenuVisible=false`. Removido handler que reabria menu em focus/pageshow/visibilitychange.
- D-pad: ArrowRight/ChannelUp = proximo canal; ArrowLeft/ChannelDown = anterior; ArrowUp/ArrowDown/OK tambem ciclam canal. Menu lateral nunca aparece.
- Primeiro canal continua sendo selecionado em `setSelectedChannel(adapted[0])` ao carregar — auto-play imediato.

F) Banners das plataformas com vidro transparente 3D:

- `index.css` regra `.tv-box .platform-logo-glass` (e `.platform-filter-logo-glass`) trocou fundo opaco solido por gradient `145deg` com translucidos + inset highlight superior + inset shadow inferior + box-shadow externo. Sem backdrop-filter (caro em WebView TV) — profundidade vem dos gradients + shadows.

Validacao:

- `npx tsc --noEmit`: OK.
- `npm run build:apk:debug`: OK.
- APK atualizado em `redflix-tvmoderno.apk` 2026-05-13 08:10.
- `adb -s 192.168.0.7:5555 install -r`: Success (TCL).
- `adb -s 192.168.0.4:5555 install -r`: Success (FireStick).

Pendentes do mesmo lote (proximo round):

- B) Vinheta de fundo + card vidro por cima ao carregar canais (LiveTV loading).
- C) Performance: canais carregam lento em TV vs browser — investigar fetch/parse.
- D) Player VOD com elenco (cast) + selecao de temporada/episodio (so series) — exige paineis React por cima da Activity ou contrato Activity->React. Sprint dedicado.

Sprint 2 parcial - LiveTV: auto-switch de genero + auto-zap de canal (2026-05-13 07:50):

Feedback do usuario:

- Canais do genero focado abriam so apos pressionar OK.
- Canal selecionado so abria apos pressionar OK.

Mudancas em `pages/LiveTV.tsx`:

- useEffect que sincroniza categoria com o foco do sidebar ja existia (focusedCategoryIndex -> activeCategory), mas agora tambem chama `setIsGenreExpanded(true)` e `setSelectedChannel(firstChannel)` para garantir que a grade reflita o genero ao vivo enquanto o usuario navega o sidebar — sem precisar de OK e sem mover focusedSection para 'grid'.
- Novo useEffect: auto-zap por debounce. Quando `focusedSection === 'grid'` e `focusedChannelIndex` para por 600ms sobre um canal diferente do `selectedChannel`, dispara `handleSelectChannel(...)`. Replica zapping de IPTV: hover continuo nao spawna varias Activities, mas pausa de meio segundo abre o player nativo.
- `selectedChannel?.id` na deps evita auto-relaunch quando ja estamos tocando o mesmo canal.

Pipeline e arquitetura inalterados: continua `playNative({type:'live'}) -> ExoPlayerActivity`.

Validacao:

- `npx tsc --noEmit`: OK.
- `npm run build:apk:debug`: OK.
- APK atualizado em `redflix-tvmoderno.apk` em 2026-05-13 07:50.
- `adb -s 192.168.0.7:5555 install -r`: Success (TCL).
- `adb -s 192.168.0.4:5555 install -r`: Success (FireStick).

Reteste no TCL:

- LiveTV: navegar sidebar com Up/Down -> grade de canais troca conforme o genero focado, sem pressionar OK.
- LiveTV: entrar na grade (Right) e parar 600ms em um canal -> Activity nativa abre sozinha; mover novamente troca apos novo debounce.
- OK continua funcional para abertura imediata.

Riscos:

- Auto-zap pode causar relaunch frequente se debounce for curto demais; 600ms parece OK mas pode ser ajustado.
- Se a Activity nativa demorar a fechar entre zaps, pode ter sobreposicao visual; observar em TCL.

Sprint 3 parcial v3 - Card de controles VOD: icones + comportamentos do sitepronto-novo (2026-05-13 07:35):

Referencia comparada: `sitepronto-novo/pages/Player.tsx` Row 3 (HUD controls).

Mapeamento sitepronto-novo -> nativo (ExoPlayerActivity):

- Back (ArrowLeft, lucide) -> `‹` -> `returnResultAndFinish()`.
- Rewind (Rewind, lucide) -> `⏪` -> `seekBy(-30_000L)` (SEEK_STEP=30s identico ao antigo).
- Play/Pause (Play/Pause, lucide) -> `⏸` / `▶` (botao grande) -> `togglePlayPause()`.
- Forward (FastForward, lucide) -> `⏩` -> `seekBy(30_000L)`.
- Speed (texto `1×/1.25×...`) -> `1×` -> `cycleSpeed()` agora cobre [0.5, 0.75, 1, 1.25, 1.5, 2] igual `SPEED_OPTIONS` do antigo.
- Volume (Volume2/VolumeX) -> `🔊` / `🔇` -> `toggleMute()` (mute on/off; slider continuo nao foi portado, sem regressao funcional).
- Episodes (List), Cast (Users), Quality (Settings) -> NAO portados: dependem de paineis React (PlayerEpisodesPanel/PlayerCastPanel/PlayerSettingsModal) que nao tem equivalente puro na Activity nativa. Botoes LIST/INFO/SET no-op anteriores foram REMOVIDOS para nao confundir.

Atualizacoes em `ExoPlayerActivity.java`:

- `buildLayout` (branch VOD): controlsRow agora usa apenas Back/Rewind/Play/Forward (esquerda) + Speed/Volume (direita).
- `updateHud()`: glifo play/pause vira `⏸`/`▶`; volume vira `🔊`/`🔇`.
- `formatSpeed()`: cobre 0.5×/0.75×/1×/1.25×/1.5×/2×.
- `cycleSpeed()`: ciclo igual ao SPEED_OPTIONS do `sitepronto-novo`.
- Foco inicial continua no Play (index 2): Back(0), Rewind(1), Play(2), Forward(3), Speed(4), Volume(5).
- Live continua sem botoes (decidido na v2).

Validacao:

- `npm run build:apk:debug`: OK.
- APK atualizado em `redflix-tvmoderno.apk` em 2026-05-13 07:35.
- `adb -s 192.168.0.7:5555 install -r`: Success (TCL).
- `adb -s 192.168.0.4:5555 install -r`: Success (FireStick).

Reteste necessario nos dois dispositivos:

- VOD: card aparece so apos vinheta -> 6 icones (`‹`, `⏪`, `⏸`, `⏩`, `1×`, `🔊`) -> some 6s.
- VOD: D-pad esquerda/direita navega entre icones; OK aciona o icone focado.
- Speed: pressionar OK em `1×` deve ciclar 1 -> 1.25 -> 1.5 -> 2 -> 0.5 -> 0.75 -> 1.
- Volume: OK em `🔊` alterna mute (`🔇`).
- Back via icone ou tecla BACK: salva posicao e fecha.

Risco:

- Emojis (🔊/🔇/⏪/⏩/⏸/▶) podem nao renderizar em todas as fontes Android. Se aparecerem como caixinha em algum dispositivo, trocar por glifos ASCII ou usar drawables.

Sprint 3 parcial v2 - HUD: card so apos vinheta, logo sem texto, Live sem controles (2026-05-13 07:15):

Feedback do usuario apos primeiro teste real:

- Card nao pode aparecer por cima da vinheta no VOD; deve aparecer somente quando o video do filme/serie comecar.
- Card do filme/serie deve ter apenas LOGO; nao logo + nome.
- Card permanece visivel por 6s e some sozinho.
- Em canais (Live), card aparece quando o video abre, fica 6s, some; e NAO tem botoes de controle.

Mudancas em `ExoPlayerActivity.java`:

- `playerHud` inicia `View.GONE`. Removido `scheduleHudHide()` no fim de `buildLayout`.
- Novo helper `hudAllowed()`: bloqueia o HUD enquanto a vinheta toca em VOD (`introQueuedForCurrentPlayback && currentMediaItemIndex < 1`); Live sempre permitido.
- `showHud()` checa `hudAllowed()`; nao revela durante a vinheta.
- `onMediaItemTransition`: ao chegar no main stream apos a vinheta, dispara `showHud()`.
- `onIsPlayingChanged`: usa `hudAllowed()` antes de revelar; mantem regra de pausa em VOD (HUD visivel sem timer).
- `HUD_AUTO_HIDE_MS = 6000`; mesmo delay para VOD e Live (substitui 5s/10s).
- `loadImageIntoAsync`: quando o logo do conteudo carrega, esconde `hudTitle` automaticamente — VOD com logo passa a mostrar so a imagem.
- `buildLayout`: bloco de timeline (currentTime/remaining/duration), seekbar, controlsRow (Voltar/Rew/Play/FF/LIST/INFO/SET/Speed/Volume) agora so e adicionado em VOD; Live monta apenas o cabecalho com logo+titulo+chip.
- `updateHud()`, `dispatchKeyEvent` e `focusHudButton` ja sao null-safe / empty-safe; Live continua fechando Activity em qualquer tecla.

Validacao:

- `npm run build:apk:debug`: OK.
- APK atualizado em `redflix-tvmoderno.apk` em 2026-05-13 07:15.
- `adb install -r` no FireStick `192.168.0.4:5555`: Success.

Reteste necessario no FireStick:

- VOD com vinheta: clicar Assistir -> vinheta toca sem card por cima -> ao iniciar o filme/serie, card aparece com LOGO (sem nome), some em 6s.
- VOD sem vinheta: card aparece logo no start, some em 6s.
- VOD pausar: card volta e fica; retomar = some em 6s.
- Live/Canal: card aparece quando video pronto, sem botoes, some em 6s; tecla volta para grade React.

Sprint 3 parcial - Logica show/hide HUD nativo (2026-05-13 07:00):

Objetivo: portar comportamento de aparecer/desaparecer do card do player do `sitepronto-novo` para o HUD nativo do `sitepronto-tv-moderno` sem mudar arquitetura.

Referencia antiga:

- VOD `pages/Player.tsx` (sitepronto-novo): `AUTO_HIDE_MS = 5000`; `scheduleHide()` so esconde se `isPlaying && !showCast && showSettings==='none'`; pausa = HUD sempre visivel; qualquer reveal reagenda 5s.
- Live `pages/LiveTV.tsx` (sitepronto-novo): info overlay aparece 1.5s apos troca de canal e some sozinho apos 10s; menu de canais reabre com qualquer tecla; no modern o "menu" continua sendo a grade React, e a Activity nativa concentra so o player + info card.

Mudancas em `android/app/src/main/java/com/redx/tvbox/ExoPlayerActivity.java`:

- `hideHudRunnable`: VOD nao esconde mais o HUD enquanto o player esta pausado; Live agora esconde sozinho.
- `scheduleHudHide`: VOD pausado nao agenda hide; Live agenda hide com 10s (info overlay); VOD continua com 5s.
- Novo listener `Player.Listener.onIsPlayingChanged`:
  - Playing -> HUD VISIBLE + scheduleHudHide (VOD 5s / Live 10s).
  - Paused (so VOD) -> HUD VISIBLE + remove callbacks de hide.
- showHud() inalterado externamente; pipeline NativePlayerPlugin / Media3 / layouts `redx_player_view_*` nao foram tocados.

Validacao Sprint 3 parcial:

- `npm run build:apk:debug`: OK.
- APK debug copiado para `redflix-tvmoderno.apk` em 2026-05-13 07:01.
- `adb install -r` no FireStick `192.168.0.4:5555`: Success.

Reteste necessario no FireStick:

- VOD: abrir filme, esperar 5s sem mexer -> HUD some.
- VOD: pausar (OK/Enter) -> HUD aparece e permanece; retomar -> some 5s depois.
- Live: abrir canal -> HUD aparece, some sozinho apos ~10s; qualquer tecla volta para a grade React conforme contrato atual.

Riscos:

- Live ainda fecha Activity em qualquer tecla; nao da pra "reaparecer HUD" com tecla — comportamento intencional para nao mudar arquitetura. Reaparecer info overlay so via novo `play({type:'live'})` ao trocar canal.
- Se algum dispositivo nao emitir `onIsPlayingChanged` consistente, fallback continua sendo `onPlaybackStateChanged` ja existente.

Sprint 1 - Polimento UX rapido (2026-05-13):

Bugs corrigidos:

- URL/fonte tecnica nao aparece mais antes do conteudo. `pages/Player.tsx` overlay "Iniciando player nativo" agora mostra apenas "Carregando..." sem `sourceUrl.slice(0,80)`. `components/player/PlayerErrorScreen.tsx` removeu bloco `streamUrl.slice(...)` no estado de erro (prop mantida em interface por compatibilidade).
- PIN adulto agora persiste entre sessoes mesmo com WebView limpando localStorage. `pages/livetv/AdultPinModal.tsx` ganhou `setAdultUnlocked` escrevendo tambem em Capacitor Preferences (SharedPreferences) via `services/platformStorage`. Nova funcao `hydrateAdultUnlock()` reidrata `adultUnlockMemoryUntil` no boot do app. `App.tsx` chama `hydrateAdultUnlock` apos `initGlobalVideoDiagnostics`. `isAdultUnlocked()` continua sync via cache de memoria — TTL 30 dias preservado.
- Login por codigo de acesso ja persiste por design via `services/localAuthSession` + Capacitor Preferences; nao precisou de mudanca adicional nesta sprint.
- Foco duplicado em "Ver todo conteudo" (Home.tsx): wrapper `<div>` por card tinha `data-nav-media-card` redundante com o MediaCard interno; removido do wrapper e adicionado `tabIndex={-1}` para garantir que o wrapper nao receba foco. Selector de confirmacao Enter atualizado para `[data-media-index]` (que so existe no wrapper) — mantem o fallback de teclado funcional.

Validacao Sprint 1:

- `npx tsc --noEmit`: OK.
- `npm run build:apk:debug`: OK.
- APK debug copiado para `redflix-tvmoderno.apk` em 2026-05-13 06:35.
- `adb install -r` no FireStick `192.168.0.4:5555`: Success.
- Aguardando reteste real no dispositivo antes de iniciar Sprint 2.

Arquivos alterados Sprint 1:

- `pages/Player.tsx`
- `components/player/PlayerErrorScreen.tsx`
- `pages/livetv/AdultPinModal.tsx`
- `App.tsx`
- `pages/Home.tsx`
- `AI_HANDOFF.md`, `docs/player-pipeline-map.md`

Riscos restantes pos-Sprint 1:

- Bug "Iniciando play nativo > tela preta > app fecha" ainda nao foi reproduzido nesta sessao no logcat; usuario reportou mas a investigacao foi pivotada para polimento. Manter monitoria ADB ativa proxima sprint.
- Foco duplicado em outras paginas (Movies/Series/Kids/Genres) usa o mesmo padrao de wrapper com `data-nav-media-card` redundante — Sprint 2 pode estender o fix se reaparecer.
- Sprint 2 vai focar performance imagens + LiveTV; Sprint 3 vai mexer no HUD/card nativo Java.

Hotfix pos-teste real - Ajuste visual/navegacao do HUD:

- HUD nativo alterado para roxo claro/translucido, mais proximo do card antigo.
- `logo_url` TMDB agora e repassado: `Player.tsx -> useNativePlayerGate -> nativePlayerService -> NativePlayerPlugin -> ExoPlayerActivity`.
- LiveTV repassa `logo` do canal; Adulto usa `poster` como fallback de logo no HUD nativo.
- VOD: HUD aparece ao abrir e some automaticamente apos 5s; qualquer tecla mostra novamente.
- VOD: D-pad esquerda/direita navega entre botoes; OK/Enter aciona o botao focado. Rewind/FastForward fisicos continuam fazendo seek.
- Player continua sem WebView/HTML5 video para controles fullscreen.
- Validacao: `npx tsc --noEmit`, `:app:compileDebugJavaWithJavac`, `npm run build:apk:debug` OK; APK copiado para `redflix-tvmoderno.apk`.

## 6. Bugs Ja Resolvidos

- VOD TV nao chama mais `window.Android.openPlayer`.
- VOD/filmes abriram no FireStick apos corrigir a colisao de layout Media3.
- VOD TV nao fecha a rota imediatamente antes de receber posicao.
- Progresso VOD agora depende do retorno nativo, nao de evento HTML5 no APK TV.
- Vinheta VOD no APK TV nao usa `<video>` WebView.
- Trailers/previews/hover autoplay foram removidos como reproducao; nao ha iframe/YouTube de trailer.
- Rota debug `/hls-test` nao monta `<video>`/HLS.js no build TV moderno.
- Restos orfaos de trailer (`TrailerBanner`, CSS de trailer) removidos.
- Timers/listeners simples com risco de setState apos unmount foram limpos.
- Type-check quebrado por `media.media_type` foi corrigido.

## 7. Bugs Ainda Existentes

- LiveTV ainda relanca Activity a cada troca de canal; zapping esta funcional via retorno `action`, mas ainda nao e player nativo persistente com playlist interna.
- Adulto ainda usa bridge legado, mas sem iframe YouTube.
- Trailers nao tem player ativo; app moderno mostra imagens estaticas.
- `PlayerImpl` ainda contem HTML5/HLS.js para fallback web; garantir que nunca rode em APK TV moderno.
- `window.Android.openPlayer` ainda existe em `MainActivity`.
- D-pad/foco/back ainda precisam auditoria dedicada.
- Login/storage/lifecycle ainda precisam auditoria dedicada.
- Admin ainda possui campos `trailer_*` de catalogo; nao afetam reproducao no APK TV moderno.

## 8. Riscos Conhecidos

- Misturar LiveTV e VOD numa mesma etapa pode quebrar canais ao vivo.
- Remover fallback web pode quebrar browser/desktop.
- Remover TextureView fallback pode reabrir tela preta em TCL/Chromecast.
- Mexer em storage/login fora de etapa propria pode causar logout.
- Reativar trailers/YouTube iframe pode reintroduzir comportamento do Chromium.
- HLS.js ainda esta no projeto por fallback web/legacy; `vendor-hls` ainda pode ser copiado como asset nao referenciado no APK apos `cap sync`.
- `/hls-test` nao pode ser importado no build TV moderno.
- Adulto ainda precisa migracao futura para pipeline oficial, apesar de nao montar iframe.

## 9. O Que Nao Pode Ser Alterado Sem Etapa Propria

- Login, Supabase session, localStorage/sessionStorage/IndexedDB/cookies.
- LiveTV, zapping, grid de canais.
- Adulto/PIN adulto, exceto bloqueio ja aplicado de iframe YouTube.
- D-pad global/foco/back.
- Trailers nativos futuros, se realmente necessarios.
- TextureView fallback e retry nativo.
- Fallback web/desktop.

## 10. Regras Obrigatorias da Arquitetura

- Nunca reintroduzir `<video>` no APK TV moderno para VOD.
- Nunca usar HLS.js no fluxo VOD do APK TV moderno.
- Nunca usar iframe trailer no APK TV moderno.
- Nunca reintroduzir YouTube embed no app moderno.
- Nunca montar autoplay/preview HTML5 no APK TV moderno.
- Nunca importar HLS debug no build TV moderno.
- Nao misturar LiveTV e VOD na mesma etapa.
- Nao remover fallback web/desktop.
- Nao mexer em login/storage sem etapa especifica.
- Nao remover TextureView fallback.
- Toda etapa deve terminar com `tsc`, `build`, APK debug e atualizacao deste arquivo.

## 11. Fluxos Que Ainda Usam Legado

- Adulto: `pages/AdultoPage.tsx -> openNativePlayer -> window.Android.openPlayer`; branch YouTube mostra placeholder estatico.
- `/hls-test`: rota de debug permanece so web/legacy; no build TV o `App.tsx` nao importa o player HLS.
- Vinheta gates: `components/VinhetaGate.tsx` e `components/DetailsVinhetaFill.tsx` ainda consultam `hasNativePlayer`.
- MainActivity ainda expoe `window.Android.openPlayer`.
- Fallback HTML5/HLS.js permanece em `pages/Player.tsx` e hooks `pages/player/*` apenas para web/legacy, sem montar no VOD TV.
- Fallback HTML5/HLS.js de LiveTV permanece no arquivo `pages/LiveTV.tsx`, mas e bloqueado por `runtimeFlags.isTvBuild` no APK TV.

## 12. Objetivos Futuros

- Evoluir LiveTV para player nativo persistente com playlist/zapping in-place, se necessario.
- Revisar D-pad/foco/back em etapa dedicada.
- Revisar login/storage/lifecycle em etapa dedicada.
- Migrar Adulto para `NativePlayerPlugin` em etapa propria.
- Limpar debug toasts/banners nativos quando a reproducao estiver validada.

## 13. Proximas Etapas Sugeridas

1. Etapa 6: D-pad/foco/back.
2. Etapa 7: login/session/storage/lifecycle.
3. Etapa 8: Adulto/PIN/pipeline nativo.
4. Etapa 9: limpeza legacy/debug e reducao de bundle TV.
5. Futuro LiveTV: player persistente/playlist nativa para zapping in-place.

Nao iniciar etapa nova sem autorizacao do usuario.

## 14. Checklist de Testes

Obrigatorio ao final de cada etapa:

- `npx tsc --noEmit`
- `npm run build`
- `npm run build:apk:debug`
- Confirmar APK em `redflix-tvmoderno.apk`
- Revisar `rg` dos fluxos afetados.
- Atualizar `AI_HANDOFF.md`.

Checklist VOD TV:

- Filme abre em ExoPlayerActivity.
- Serie/episodio abre episodio correto.
- Back retorna para Details/lista.
- Progresso salva ao voltar.
- Retomar inicia na posicao salva.
- Vinheta nao monta `<video>` no APK TV.

Checklist trailers/previews TV:

- Details nao monta iframe YouTube.
- MovieDetails nao monta iframe YouTube.
- TrailerContext removido.
- TrailerBanner nao dispara autoplay.
- `/hls-test` nao monta video/HLS.js.
- Adulto e LivePlayerArea legado nao montam iframe YouTube.

Checklist obrigatorio antes de release:

- `npx tsc --noEmit`.
- `npm run build`.
- `npm run build:apk:debug`.
- Validar filme VOD em TCL/Chromecast/FireStick.
- Validar episodio de serie e retorno com progresso.
- Validar LiveTV, Back/Menu e ChannelUp/ChannelDown.
- Validar que `/hls-test` nao carrega player HLS no APK TV.
- Rodar `rg` para `youtube.com/embed`, `<iframe`, `autoplay=1`, `TrailerContext`, `details-trailer`.
- Confirmar `redflix-tvmoderno.apk` gerado.
- Confirmar `AI_HANDOFF.md` e `docs/player-pipeline-map.md` atualizados.

## 15. Regras Por Dispositivo

- TCL: manter TextureView fallback; maior risco de tela preta/audio sem video.
- Chromecast Google TV: manter TextureView fallback; evitar SurfaceView regressivo.
- FireStick: evitar WebView video; cuidado com memoria, Activity leaks e overlays.
- Android TV antigo: legacy/WebView pertence a `sitepronto-novo` ou alvo `legacy`; nao otimizar o moderno sacrificando o fallback web/legacy sem etapa propria.

## 16. Arquivos-Chave

- `pages/Player.tsx`: VOD moderno e fallback web.
- `hooks/useNativePlayerGate.ts`: gate Capacitor para NativePlayer.
- `services/nativePlayerService.ts`: contrato `NativePlayerPlugin`.
- `android/app/src/main/java/com/redx/tvbox/NativePlayerPlugin.java`: plugin Capacitor.
- `android/app/src/main/java/com/redx/tvbox/ExoPlayerActivity.java`: Media3/ExoPlayer.
- `utils/tvModernoBridge.ts`: bridge legado `window.Android.openPlayer`.
- `components/TrailerBanner.tsx`: hero estatico, sem trailer autoplay.
- `pages/Details.tsx` / `pages/MovieDetails.tsx`: sem trailer inline/iframe.
- `pages/HLSTestPlayer.tsx`: debug HLS apenas web/legacy; import bloqueado no build TV em `App.tsx`.
- `docs/player-pipeline-map.md`: mapa tecnico complementar.
