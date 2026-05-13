# Player Pipeline Map - Pos-Sprint 1 polimento 2026-05-13 06:35

Este documento registra os contratos atuais apos as etapas concluidas. Atualizar ao final de cada etapa.

## Flags de build

- `VITE_APP_TARGET=tv`: bundle Android TV/Capacitor.
- `VITE_APP_TARGET=web`: bundle web/browser.
- `VITE_APP_TARGET=legacy`: bundle de compatibilidade para a versao Android antiga/WebView.
- `VITE_TV_BUILD=1`: ativa contrato explicito de TV.
- `VITE_WEB_BUILD=1`: ativa contrato explicito de web.
- `VITE_LEGACY_BUILD=1`: ativa contrato explicito de legado.
- `VITE_CAPACITOR_BUILD=1`: continua suportado e implica alvo TV no `vite.config.ts`.

As flags ficam expostas em `runtimeFlags` e protegem o APK TV moderno contra fallback WebView/HLS quando aplicavel.

## Estado atual do APK TV moderno

- VOD = `NativePlayerPlugin` -> `ExoPlayerActivity`.
- LiveTV = `NativePlayerPlugin` -> `ExoPlayerActivity`.
- HUD/card do player = overlay nativo em `ExoPlayerActivity`, inspirado no card React do `sitepronto-novo`; nao depende de WebView.
- HUD VOD usa `logo_url` TMDB quando disponivel, cor roxa clara/translucida, auto-hide apos 5s e foco D-pad proprio.
- `ExoPlayerActivity` usa layouts proprios `redx_player_view_surface.xml` / `redx_player_view_texture.xml`; nunca usar `exo_player_view.xml`, pois esse nome pertence ao Media3 e causou recursao/ANR no FireStick.
- Trailers = removidos como reproducao.
- Iframe = removido dos fluxos do app moderno.
- YouTube embed = removido dos fluxos do app moderno.
- Autoplay residual de trailer/preview = removido.
- HLS debug = web/legacy apenas; `/hls-test` nao importa player HLS no build TV.
- Sem WebView player no fluxo principal.
- Sem trailer HTML5.
- Sem HLS.js no fluxo principal.

## Dispositivos de teste ADB

- **TCL Smart TV (Android 11, Google TV)**: `192.168.0.7:5555` — alvo principal.
- **FireStick / Fire TV**: `192.168.0.4:5555` — alvo secundario.

ADB: `C:\Users\Fabricio\AppData\Local\Android\Sdk\platform-tools\adb.exe`.

Comandos:

- Listar: `adb devices`.
- Instalar TCL: `adb -s 192.168.0.7:5555 install -r redflix-tvmoderno.apk`.
- Instalar FireStick: `adb -s 192.168.0.4:5555 install -r redflix-tvmoderno.apk`.
- Logcat TCL: `adb -s 192.168.0.7:5555 logcat`.
- Logcat FireStick: `adb -s 192.168.0.4:5555 logcat`.

APK: `C:\Users\Fabricio\Desktop\sitepronto-tv-moderno\redflix-tvmoderno.apk`.

## Pipeline oficial de VOD

Pipeline oficial definido: `NativePlayerPlugin`.

- Contrato web: `services/nativePlayerService.ts`
- Hook preparado: `hooks/useNativePlayerGate.ts`
- Contrato nativo Android: `android/app/src/main/java/com/redx/tvbox/NativePlayerPlugin.java`
- Registro nativo: `android/app/src/main/java/com/redx/tvbox/MainActivity.java`
- ProGuard: `android/app/proguard-rules.pro`

Responsabilidade prevista para VOD:

- filmes
- series
- episodios
- posicao de reproducao
- headers/cookies quando forem conectados
- retorno controlado ao React por `position` e `cancelled`

## Bridge legado mantido

Bridge legado mantido: `window.Android.openPlayer`.

- Wrapper web: `utils/tvModernoBridge.ts`
- Bridge Android: `android/app/src/main/java/com/redx/tvbox/MainActivity.java`

Ele permanece por compatibilidade durante a estabilizacao e para mapear corretamente a fronteira com a versao Android antiga/WebView. Nada foi removido nesta etapa.

## Uso atual mapeado

### VOD

- `pages/Player.tsx` usa `NativeVodPlayer` em build TV nativo.
- `NativeVodPlayer` chama `useNativePlayerGate(...)`.
- `useNativePlayerGate(...)` chama `playNative(...)` e repassa `year`.
- `playNative(...)` chama `NativePlayerPlugin.play(...)`.
- `PlayerImpl` com HTML5/HLS.js permanece apenas como fallback web/desktop.
- VOD nao chama mais `window.Android.openPlayer` neste projeto moderno.

### LiveTV

- `pages/LiveTV.tsx` usa `playNative(...)` em build TV nativo.
- `playNative(...)` chama `NativePlayerPlugin.play(...)` com `type: 'live'`.
- `ExoPlayerActivity` devolve `action: channelUp | channelDown` para zapping por teclas ChannelUp/Down.
- `PlayerImpl` HTML5/HLS.js de LiveTV permanece apenas como fallback web/legacy.

### Adulto

- `pages/AdultoPage.tsx` chama `openNativePlayer(...)` via bridge legado.
- Branch YouTube por iframe foi desativado e substituido por placeholder estatico.
- Com player fullscreen aberto, qualquer tecla fecha a Activity e reabre a UI React.
- Na UI Adulto, `ArrowRight`/`ChannelUp` troca para o proximo canal e `ArrowLeft`/`ChannelDown` troca para o anterior.

### Trailers/previews

- App moderno nao possui pipeline de trailer ativo.
- `contexts/TrailerContext.tsx` foi removido.
- `components/TrailerBanner.tsx` usa apenas backdrop estatico.
- `pages/Details.tsx` nao mostra botao Trailer, player inline nem Outros Videos.
- `pages/MovieDetails.tsx` nao monta iframe de trailer.
- `App.tsx` bloqueia `/hls-test` no build TV antes de importar o debug HLS.
- `pages/HLSTestPlayer.tsx` permanece apenas para web/legacy.
- `pages/livetv/LivePlayerArea.tsx` e `pages/AdultoPage.tsx` nao montam iframe YouTube.

### Vinheta e preenchimento de detalhes

- `components/VinhetaGate.tsx` usa `hasNativePlayer()` para nao montar video HTML5 quando ha player nativo.
- `components/DetailsVinhetaFill.tsx` usa `hasNativePlayer()` com a mesma finalidade.
- Mantidos intocados na Etapa 1.

## Nao-objetivos historicos da Etapa 1

- Nao remover `window.Android.openPlayer`.
- Nao remover HLS.js, iframe, trailer ou HTML5 video naquela etapa inicial.
- Nao alterar canais adultos naquela etapa inicial.
- Nao alterar D-pad, Back, foco, PIN, busca ou modais.
- Nao alterar Supabase, localStorage, sessionStorage, IndexedDB ou cookies.
- Nao mudar o comportamento runtime do player; apenas congelar contratos e flags.

Estado atual apos Etapa 4: trailers/iframe/YouTube/autoplay foram removidos dos fluxos do app moderno; `/hls-test` ficou isolado fora do APK TV.

## Etapa 2 - VOD consolidado

Pipeline VOD Android TV moderno:

React `Player`
-> `NativeVodPlayer`
-> `useNativePlayerGate`
-> `services/nativePlayerService.playNative`
-> `NativePlayerPlugin.play`
-> `ExoPlayerActivity`
-> retorno `{ position, cancelled }`
-> `userService.saveProgress`
-> `onClose`

Garantias da Etapa 2:

- Filmes, series e episodios em build TV nativo usam `NativePlayerPlugin`.
- O retorno da Activity e usado para persistir progresso.
- A posicao inicial vem de `userService.getProgress`.
- A vinheta VOD e enviada como `introUrl` nativo (`asset:///public/vinheta-tv.mp4` ou intro dedicada convertida para asset quando vier de `/...`).
- O fallback HTML5/HLS.js continua disponivel para web/desktop.
- LiveTV, adulto, trailers, D-pad global e storage/login seguem fora do escopo.

Fluxos VOD removidos do legado:

- Import/chamada de `openNativePlayer(...)` em `pages/Player.tsx`.
- Chamada VOD para `window.Android.openPlayer`.
- Fechamento antecipado da tela VOD por `setTimeout(onClose, 100)`.
- Abertura/progresso/retorno VOD baseados em `<video>`, `HTMLVideoElement`, `readyState`, `onLoadedData`, `onCanPlay`, `video.play()` ou HLS.js no APK TV moderno.
- Vinheta VOD via `<video>` no APK TV moderno.

Fronteira apos Etapa 2:

- `Player.tsx` ainda contem `PlayerImpl` HTML5/HLS.js por necessidade de fallback web/desktop.
- Em APK TV moderno, `Player` retorna `NativeVodPlayer` antes de montar `PlayerImpl`.
- Portanto o VOD TV nao monta `<video>` apesar do fallback existir no arquivo.

## Etapa 3 - LiveTV consolidado incremental

Pipeline LiveTV Android TV moderno:

React `LiveTV`
-> `services/nativePlayerService.playNative({ type: 'live' })`
-> `NativePlayerPlugin.play`
-> `ExoPlayerActivity`
-> retorno `{ action?: 'channelUp' | 'channelDown' }`
-> React seleciona canal adjacente
-> nova chamada nativa para o canal escolhido

Garantias da Etapa 3:

- LiveTV em build TV nativo nao chama mais `window.Android.openPlayer`.
- LiveTV em build TV nativo nao monta `<video>`.
- Zapping por ChannelUp/ChannelDown e tratado pela Activity live e devolvido ao React.
- Back/Menu na Activity live retorna ao guia LiveTV.
- Fallback HTML5/HLS.js continua apenas para web/legacy.
- VOD, adulto, trailers, login/storage e D-pad global nao foram alterados.

## Etapa 4 - Trailers/previews/autoplay removidos

Contrato Android TV moderno:

React detalhes/cards
-> imagem/placeholder estatico
-> nenhum iframe YouTube
-> nenhum autoplay HTML5
-> nenhum `/hls-test` com HLS.js/video

Contrato web/legacy:

React `/hls-test`
-> fallback HTML5/HLS.js de debug permanece disponivel fora do build TV

Garantias da Etapa 4:

- App moderno nao monta iframe de trailer em `Details`.
- App moderno nao monta iframe de trailer em `MovieDetails`.
- App moderno nao possui `TrailerContext`.
- App moderno nao dispara autoplay tardio em `TrailerBanner`.
- App moderno nao monta iframe YouTube em `LivePlayerArea`/`AdultoPage`.
- APK TV moderno nao monta `<video>`/HLS.js na rota `/hls-test`.
- HLS debug permanece apenas web/legacy.
- VOD, LiveTV principal, login/storage e D-pad global nao foram alterados; Adulto recebeu apenas bloqueio de iframe YouTube.
- Etapa 4 oficialmente encerrada: iframe/YouTube/trailer/autoplay nao devem voltar sem pipeline nativo dedicado e nova autorizacao.

Fronteira apos Etapa 4:

- Adulto ainda usa legado e sera etapa propria, mas sem iframe YouTube.
- VOD e LiveTV continuam nos pipelines nativos ja estabilizados.
- Trailer nativo futuro ainda nao foi implementado; trailers ficam desativados/estaticos.

## Etapa 5 - Hardening e limpeza segura

Limpezas aplicadas:

- Removido `components/TrailerBanner.tsx`, componente orfao apos remocao de trailers.
- Removidas classes CSS orfas `.trailerWrap` e `.trailerIframe` de `components/MovieRow.module.css`.
- Comentario de preload em `components/MediaCard.tsx` nao referencia mais trailer.
- `contexts/ToastContext.tsx` limpa timer secundario de remocao de toast.
- `contexts/ConfigContext.tsx` cancela `requestIdleCallback`/`setTimeout` pendente.
- Fallbacks web/legacy de `pages/AdultoPage.tsx` e `pages/LiveTV.tsx` removem listener `loadedmetadata` no cleanup.

Garantias da Etapa 5:

- Nenhuma mudanca no contrato VOD.
- Nenhuma mudanca no contrato LiveTV nativo.
- Nenhuma mudanca em `NativePlayerPlugin`.
- Nenhuma mudanca em login/storage/Supabase.
- Nenhuma reescrita de D-pad global.
- Validacao final OK: `npx tsc --noEmit`, `npm run build`, `npm run build:apk:debug`.
- APK debug gerado em `redflix-tvmoderno.apk`.

## Hotfix FireStick - PlayerView ANR

Causa real do travamento:

- `android/app/src/main/res/layout/exo_player_view.xml`
- `android/app/src/main/res/layout/exo_player_view_texture.xml`

Esses nomes colidiam com o recurso interno `exo_player_view` da biblioteca Media3. Ao inflar `androidx.media3.ui.PlayerView`, o Media3 procurava seu layout interno e recebia o layout do app, cuja raiz tambem era `PlayerView`, gerando recursao no inflate, ANR e morte do processo.

Correcao aplicada:

- Layouts renomeados para `redx_player_view_surface.xml` e `redx_player_view_texture.xml`.
- `ExoPlayerActivity` referencia apenas os layouts `redx_*`.
- Banner visual/toasts de diagnostico removidos; logs ficam somente no logcat.
- Validado por ADB: VOD chegou a `READY item=1 1280x720 avc1.4D401F`.
- Canais/LiveTV ainda requerem reteste real com APK atualizado; se falhar, investigar stream/headers/rede/fluxo LiveTV, pois o ANR de inflate foi corrigido.
- Varredura final OK: `dist/index.html` e `android/app/src/main/assets/public/index.html` sem referencia a HLS debug, iframe, YouTube embed, autoplay de trailer, `TrailerBanner` ou `TrailerContext`.

## Hotfix pos-teste real - NativePlayerPlugin bridge

Correcao pontual, sem mudar pipeline:

- `NativePlayerPlugin.play` agora usa `getActivity()` como contexto da `ExoPlayerActivity`.
- O bridge pausa media HTML5 residual, mas nao deixa mais o WebView invisivel antes do launch.
- `restoreWebViewVisibility()` garante retorno visual se o launch falhar ou a Activity retornar.
- Removidas flags `FLAG_ACTIVITY_REORDER_TO_FRONT` e `FLAG_ACTIVITY_BROUGHT_TO_FRONT`; elas podiam trazer Activity antiga/stale e impedir um launch limpo.
- Removido `android:launchMode="singleTop"` da `ExoPlayerActivity`; a Activity do player agora usa launch padrao para receber sempre extras novos.
- Mantido `startActivityForResult(call, intent, "playerActivityResult")` para preservar retorno de progresso/zapping.
- Validacao local OK: `npx tsc --noEmit`, `:app:processDebugMainManifest`, `:app:compileDebugJavaWithJavac`, `npm run build:apk:debug`.

## Hotfix pos-teste real - FireStick/Android TV

Correcao pontual, sem trocar arquitetura:

- FireStick/Amazon/AFT agora usa `TextureView` por padrao em `ExoPlayerActivity`.
- `ExoPlayerActivity` passou a registrar logs nativos claros para launch, extras, layout, player, prepare e lifecycle.
- Fundos temporarios de diagnostico amarelo/azul foram removidos; Activity e `PlayerView` ficam pretos.
- `NativePlayerPlugin` inicia a Activity pela UI thread e loga antes/depois de `startActivityForResult`.

## Hotfix pos-teste real - HUD/card nativo

Contrato atual:

- VOD/LiveTV/Adulto fullscreen exibem card nativo em `ExoPlayerActivity`.
- O controller padrao do Media3 fica desligado para nao aparecer visual generico.
- VOD: esquerda/direita navegam entre botoes; OK/Enter aciona o controle focado; Back/Menu retorna salvando posicao.
- VOD: HUD aparece na abertura e em qualquer tecla; some apos 5s sem input.
- LiveTV/Adulto: qualquer tecla com o player aberto fecha a Activity e devolve ao menu/grade React.
- Adulto: seta direita troca canal diretamente; a Activity reabre com o canal novo.
- `NativePlayerPlugin` nao mostra mais toasts de diagnostico; somente logcat.
- `year` e `logo` foram adicionados ao contrato `NativePlayerOptions -> NativePlayerPlugin -> ExoPlayerActivity`.
- Adulto recebeu ajuste local de D-pad: cima/baixo tambem trocam canais.
- PIN adulto recebeu fallback de persistencia em sessionStorage/memoria alem de localStorage.
- Validacao local OK: `npx tsc --noEmit`, `:app:compileDebugJavaWithJavac`, `npm run build:apk:debug`.

## Sprint 3 parcial v3 - Icones do card VOD replicam sitepronto-novo (2026-05-13 07:35)

Mapeamento icone -> acao (VOD):

| sitepronto-novo (lucide) | ExoPlayerActivity (Java HUD) | Acao |
|---|---|---|
| ArrowLeft (`<`) | `‹` | `returnResultAndFinish()` salva posicao |
| Rewind | `⏪` | `seekBy(-30_000L)` (SEEK_STEP=30s) |
| Play/Pause | `⏸` / `▶` (large) | `togglePlayPause()` |
| FastForward | `⏩` | `seekBy(30_000L)` |
| Speed `1×` | `1×` (texto) | `cycleSpeed()` ciclo [0.5,0.75,1,1.25,1.5,2] |
| Volume2/X | `🔊` / `🔇` | `toggleMute()` |

Removidos (sem equivalente nativo puro):

- Episodes (List), Cast (Users), Quality (Settings) — abrem paineis React no antigo; manter botao no-op so confunde. Reabilitar futuramente exigiria contrato Activity->React para sinalizar painel.

Live: sem botoes (decidido na v2). Card simples logo+titulo, some em 6s.

## Sprint 3 parcial v2 - HUD: card pos vinheta, logo, Live sem controles (2026-05-13)

Contrato show/hide HUD nativo:

VOD:

- HUD inicia GONE. Nao aparece sobre a vinheta.
- `onMediaItemTransition` para o main stream (apos vinheta) -> `showHud()`.
- `onIsPlayingChanged(true)` -> `showHud()` (so se `hudAllowed`).
- `onIsPlayingChanged(false)` -> HUD visivel, sem timer (pausa permanente).
- `dispatchKeyEvent` (qualquer tecla) -> `showHud()` reagenda 6s.
- Auto-hide: 6s (HUD_AUTO_HIDE_MS).
- Conteudo: cabecalho (logo OU titulo) + chip ASSISTIDO + timeline + seekbar + botoes Voltar/Rew/Play/FF/LIST/INFO/SET/Speed/Volume.
- Quando o logo do conteudo carrega via `loadImageIntoAsync`, `hudTitle` e escondido — exibe apenas o logo.

Live:

- HUD inicia GONE.
- `onIsPlayingChanged(true)` -> `showHud()` revela e agenda hide em 6s.
- Sem botoes de controle: card mostra so logo do canal + nome/chip MENU; sem timeline, sem seekbar, sem botoes.
- Qualquer tecla volta para a grade React (contrato Etapa 3).
- HUD reaparece apenas em nova chamada `playNative({type:'live'})`.

Bloqueios e null-safety:

- `hudAllowed()` checa intro queued vs `currentMediaItemIndex >= 1` para VOD.
- `updateHud()`, `dispatchKeyEvent`, `focusHudButton` ja tratam refs `null`/lista vazia — Live monta menos views sem regressao.

Nao alterado:

- NativePlayerPlugin, layouts `redx_player_view_*`, Media3 pipeline, fluxo VOD/Live React.

## Sprint 1 - Polimento UX rapido (2026-05-13)

Contrato visual:

- Player nao mostra mais URL/fonte tecnica antes do conteudo. Overlay "Iniciando" -> "Carregando..." apenas.
- Tela de erro de stream nao mostra mais URL truncada.
- PIN adulto persiste entre sessoes via Capacitor Preferences (SharedPreferences). TTL 30d preservado.
- Foco duplicado em Ver todo conteudo (Home) removido — wrapper de card agora nao concorre com o MediaCard interno.

Sprint 1 nao altera:

- Pipeline NativePlayerPlugin / ExoPlayerActivity / Media3.
- Layout `redx_player_view_surface.xml` / `redx_player_view_texture.xml`.
- Login por codigo de acesso (ja persistia via Capacitor Preferences).
- D-pad global, login/storage Supabase, trailers, adulto bridge.

## Proximos riscos restantes

- Adulto ainda usa `window.Android.openPlayer` e deve migrar para `NativePlayerPlugin` em etapa propria.
- LiveTV ainda relanca Activity por troca de canal; zapping persistente nativo segue futuro.
- D-pad/foco/back ainda precisam auditoria dedicada.
- Login/storage/lifecycle ainda precisam auditoria dedicada.
- `PlayerImpl` e HLS.js seguem no projeto para web/legacy; garantir que nao sejam importados no fluxo TV.
- `vendor-hls` ainda pode ser copiado como asset nao referenciado no APK por `cap sync`; reduzir/remover na etapa de limpeza legacy/bundle.
- TextureView fallback nao pode ser removido.

## Proximos passos sugeridos

1. Etapa 6: D-pad/foco/back.
2. Etapa 7: login/session/storage/lifecycle.
3. Etapa 8: Adulto/PIN/pipeline nativo.
4. Etapa 9: limpeza legacy/debug e reducao de bundle TV.
5. Futuro LiveTV: player persistente/playlist nativa para zapping in-place.

## O que ainda usa legacy

- Adulto: `pages/AdultoPage.tsx -> openNativePlayer -> window.Android.openPlayer`.
- MainActivity ainda expoe `window.Android.openPlayer`.
- Vinheta gates consultam `hasNativePlayer` para bloquear `<video>` no TV.
- `PlayerImpl`/`pages/player/*` mantem HTML5/HLS.js apenas para web/legacy.
- `/hls-test` permanece apenas web/legacy e nao deve ser importado no build TV.

## Checklist obrigatorio antes de release

- `npx tsc --noEmit`.
- `npm run build`.
- `npm run build:apk:debug`.
- Validar VOD filme/serie/episodio com progresso.
- Validar LiveTV, Back/Menu e ChannelUp/ChannelDown.
- Validar que `/hls-test` nao carrega player HLS no APK TV.
- Rodar `rg` para `youtube.com/embed`, `<iframe`, `autoplay=1`, `TrailerContext`, `details-trailer`.
- Testar em TCL/Google TV, Chromecast Google TV e FireStick.
- Confirmar APK em `redflix-tvmoderno.apk`.
